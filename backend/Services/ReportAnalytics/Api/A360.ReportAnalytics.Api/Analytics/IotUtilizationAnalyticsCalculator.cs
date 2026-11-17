using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>DeviceType and Connectivity narrow the devices; UtilizationTarget is the utilization every asset is measured against (percent).</summary>
public sealed record IotUtilizationAnalyticsSettings(string? DeviceType, string? Connectivity, double UtilizationTarget);

/// <summary>
/// One connected asset: an IoT device and the asset it is assigned to. Utilization and Variance are null when the asset has no planned
/// utilization (or no asset record); TelemetryAvailability is null for a device that never reported.
/// </summary>
public sealed record IotAssetRow(
    string Id,
    string? DeviceId,
    string? DeviceName,
    string DeviceType,
    string? AssetRecordId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? Location,
    string? Organization,
    string Connectivity,
    string? SensorHealth,
    double? Utilization,
    double Target,
    double? Variance,
    double? TelemetryAvailability,
    double? SignalDbm,
    double? BatteryLevel,
    DateTime? LastSeenAt,
    int? MinutesSinceLastSeen);

public sealed record IotSummary(
    KpiWidgetData ConnectedAssets,
    KpiWidgetData AverageUtilization,
    KpiWidgetData TelemetryAvailability,
    KpiWidgetData ActiveAlerts);

/// <summary>Production, Idle, Maintenance and Offline as a share of the hours in each bucket; Totals are over the whole period.</summary>
public sealed record IotUtilizationTrend(PerformanceSeries Trend, double? Production, double? Idle, double? Maintenance, double? Offline, string Granularity);

/// <summary>Sensor readings as a percentage of their alarm threshold, averaged per bucket, one line per sensor type (up to four).</summary>
public sealed record IotTelemetryOverview(PerformanceSeries Trend, int Readings, string Granularity);

public sealed record IotCategoryUtilization(string Category, int AssetCount, double Utilization, double Target);

/// <summary>Score = sensors returning usable readings (healthy or warning) out of all sensors whose health is known.</summary>
public sealed record IotSensorHealthSummary(int Total, int Healthy, int Warning, int Failed, double? Score, double Target);

public sealed record IotEventsTrend(PerformanceSeries Trend, int Critical, int Warning, int Informational, string Granularity);

public sealed record IotSiteSummary(
    string Location,
    string? Organization,
    double? Latitude,
    double? Longitude,
    int Connected,
    int Online,
    int Intermittent,
    int Offline,
    int NeverConnected,
    double? Utilization,
    double? TelemetryAvailability,
    int ActiveAlerts);

public sealed record IotDevicePerformanceRow(string DeviceType, int Connected, int Online, double? TelemetryAvailability, double? AvgSignalDbm, int FailedSensors);

/// <summary>An active sensor alert on a connected asset. AssetRowId is the IotAssetRow it belongs to.</summary>
public sealed record IotAlertRow(
    string Id,
    string AssetRowId,
    string? DeviceId,
    string? AssetId,
    string? AssetName,
    string? Location,
    string Type,
    string? SensorType,
    string Severity,
    string Reading,
    double? Value,
    double? Threshold,
    string? Unit,
    DateTime? RaisedAt,
    int? MinutesAgo,
    string? Status);

/// <summary>An IoT Insights card. AssetRowIds are the rows it names; Query is what "View …" passes to /assets or /alerts.</summary>
public sealed record IotInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    int AssetCount,
    IReadOnlyList<string> AssetRowIds,
    IReadOnlyList<string> Actions,
    string Query);

/// <summary>
/// IoT &amp; Utilization Analytics for one filter bar and date range.
/// A connected asset is a Tracking IoTDevice (with its DeviceHealth record and sensors) and the asset register entry it is assigned to.
/// Connectivity: no message ever is Never Connected; Online / Warning / Offline map to Online / Intermittent / Offline, otherwise by the age of the
/// last message. Utilization = the asset's planned utilization × the share of the hours it was not down (downtime_records); planned downtime is
/// Maintenance, unplanned downtime Offline. Telemetry availability = the share of the device's hours in the period up to its last message
/// (an Online device reports until now). Alerts are predictive_maintenance_alerts linked by device id or asset id; active means not resolved,
/// closed, cancelled or monitoring only.
/// </summary>
public sealed class IotUtilizationAnalyticsCalculator
{
    public const string Online = "Online";
    public const string Intermittent = "Intermittent";
    public const string Offline = "Offline";
    public const string NeverConnected = "Never Connected";

    public const string Healthy = "Healthy";
    public const string Warning = "Warning";
    public const string Failed = "Failed";

    public const string Critical = "Critical";
    public const string Informational = "Informational";

    public const string Production = "Production";
    public const string Idle = "Idle";
    public const string Maintenance = "Maintenance";

    public const string Weekly = "week";
    public const string Monthly = "month";

    public const string Unspecified = "Unspecified";
    public const string Uncategorised = "Uncategorised";
    public const string UnknownLocation = "Unknown location";

    public static readonly IReadOnlyList<string> ConnectivityStatuses = [Online, Intermittent, Offline, NeverConnected];
    public static readonly IReadOnlyList<string> HealthStatuses = [Healthy, Warning, Failed];
    public static readonly IReadOnlyList<string> Severities = [Critical, Warning];
    public static readonly IReadOnlyList<string> EventSeverities = [Critical, Warning, Informational];

    public const int OnlineWithinMinutes = 15;
    public const int IntermittentWithinMinutes = 60;
    public const int OfflineInsightHours = 24;
    public const double SensorHealthTarget = 95;
    private const int WeeklyUpToDays = 31;
    private const int MaxTelemetryChannels = 4;

    private readonly DashboardPeriod _period;
    private readonly IotUtilizationAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly List<Row> _rows;
    private readonly Dictionary<string, List<DashboardDowntime>> _downtime;
    private readonly List<IotSensorAlertRecord> _alertRecords;
    private readonly Dictionary<string, string> _alertRow;
    private readonly IReadOnlyList<IotLocationEventRecord> _events;
    private readonly Dictionary<string, IotSiteRecord> _sites;
    private readonly IReadOnlyList<(string Label, DateTime StartUtc, DateTime EndUtc)> _buckets;
    private readonly string _granularity;
    private List<IotAssetRow>? _assetRows;
    private List<IotAlertRow>? _activeAlerts;

    /// <summary>A device with everything known about it.</summary>
    private sealed record Row(
        IotDeviceRecord Device,
        IotDeviceHealthRecord? Health,
        DashboardAsset? Asset,
        IReadOnlyList<IotSensorRecord> Sensors,
        string Connectivity,
        string? SensorHealth,
        DateTime? LastSeenAt,
        string? Location);

    private IotUtilizationAnalyticsCalculator(
        DashboardPeriod period,
        IotUtilizationAnalyticsSettings settings,
        DateTime utcNow,
        List<Row> rows,
        Dictionary<string, List<DashboardDowntime>> downtime,
        List<IotSensorAlertRecord> alertRecords,
        Dictionary<string, string> alertRow,
        IReadOnlyList<IotLocationEventRecord> events,
        Dictionary<string, IotSiteRecord> sites,
        bool forceWeekly)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _rows = rows;
        _downtime = downtime;
        _alertRecords = alertRecords;
        _alertRow = alertRow;
        _events = events;
        _sites = sites;
        (_buckets, _granularity) = Buckets(period, utcNow, forceWeekly);
    }

    public DashboardPeriod Period => _period;

    public IotUtilizationAnalyticsSettings Settings => _settings;

    public static async Task<IotUtilizationAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository dataRepository,
        IIotUtilizationAnalyticsDataRepository iotRepository,
        DashboardDataScope scope,
        DashboardPeriod period,
        IotUtilizationAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken,
        bool forceWeekly = false)
    {
        var assets = await dataRepository.GetAssetsAsync(scope, cancellationToken);
        var assetsByKey = new Dictionary<string, DashboardAsset>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in assets)
        {
            foreach (var key in asset.Keys())
            {
                assetsByKey.TryAdd(key, asset);
            }
        }

        var devices = await iotRepository.GetDevicesAsync(scope.TenantId, scope.ClientId, settings.DeviceType, cancellationToken);
        var health = (await iotRepository.GetDeviceHealthAsync(scope.TenantId, scope.ClientId, cancellationToken))
            .Where(record => !string.IsNullOrWhiteSpace(record.DeviceId))
            .GroupBy(record => record.DeviceId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(record => record.LastSeenAt ?? DateTime.MinValue).First(), StringComparer.OrdinalIgnoreCase);
        var sensors = (await iotRepository.GetSensorsAsync(scope.TenantId, scope.ClientId, cancellationToken))
            .Where(sensor => !string.IsNullOrWhiteSpace(sensor.DeviceId))
            .GroupBy(sensor => sensor.DeviceId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<IotSensorRecord>)group.ToList(), StringComparer.OrdinalIgnoreCase);
        var sites = new Dictionary<string, IotSiteRecord>(StringComparer.OrdinalIgnoreCase);
        foreach (var site in await iotRepository.GetSitesAsync(scope.TenantId, scope.ClientId, cancellationToken))
        {
            if (site.Name is not null)
            {
                sites.TryAdd(site.Name, site);
            }

            if (site.Code is not null)
            {
                sites.TryAdd(site.Code, site);
            }
        }

        var connectivityFilter = settings.Connectivity;
        var rows = new List<Row>();
        foreach (var device in devices)
        {
            var record = device.DeviceId is not null ? health.GetValueOrDefault(device.DeviceId) : null;
            var assetKey = device.AssetRegistrationId ?? record?.AssetRegistrationId;
            var asset = assetKey is not null ? assetsByKey.GetValueOrDefault(assetKey) : null;

            // With Organization, Location or Category picked, only devices on an asset in scope count.
            if (asset is null && scope.FiltersAssets)
            {
                continue;
            }

            var lastSeen = Latest(device.LastSeenAt, record?.LastSeenAt);
            var connectivity = ConnectivityOf(record?.Connectivity ?? device.Connectivity, lastSeen, utcNow);
            if (connectivityFilter is not null && connectivity != connectivityFilter)
            {
                continue;
            }

            var deviceSensors = device.DeviceId is not null ? sensors.GetValueOrDefault(device.DeviceId) ?? [] : [];
            rows.Add(new Row(
                device,
                record,
                asset,
                deviceSensors,
                connectivity,
                HealthOf(record?.Health) ?? HealthOf(device.Health),
                lastSeen,
                asset?.Site ?? asset?.Location ?? record?.SiteName));
        }

        // Downtime of the assets that have a device in scope, from the earliest bucket or the previous period.
        var linked = rows.Where(row => row.Asset is not null).Select(row => row.Asset!).DistinctBy(asset => asset.MongoId).ToList();
        var keys = linked.SelectMany(asset => asset.Keys()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var (buckets, _) = Buckets(period, utcNow, forceWeekly);
        var loadFrom = buckets.Count > 0 && buckets[0].StartUtc < period.PreviousFromUtc ? buckets[0].StartUtc : period.PreviousFromUtc;
        var downtime = new Dictionary<string, List<DashboardDowntime>>();
        if (keys.Count > 0)
        {
            foreach (var item in await dataRepository.GetDowntimeAsync(scope, keys, loadFrom, period.ToUtc, cancellationToken))
            {
                if (item.AssetId is not null && assetsByKey.TryGetValue(item.AssetId, out var owner))
                {
                    if (!downtime.TryGetValue(owner.MongoId, out var list))
                    {
                        downtime[owner.MongoId] = list = [];
                    }

                    list.Add(item);
                }
            }
        }

        // Alerts belong to a row by device id, else by the asset's keys (first device of the asset).
        var rowByDevice = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var rowByAsset = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            if (row.Device.DeviceId is not null)
            {
                rowByDevice.TryAdd(row.Device.DeviceId, row.Device.MongoId);
            }

            foreach (var key in row.Asset?.Keys() ?? [])
            {
                rowByAsset.TryAdd(key, row.Device.MongoId);
            }
        }

        var alertRecords = new List<IotSensorAlertRecord>();
        var alertRow = new Dictionary<string, string>();
        foreach (var alert in await iotRepository.GetSensorAlertsAsync(scope.TenantId, scope.ClientId, cancellationToken))
        {
            var rowId = alert.DeviceId is not null && rowByDevice.TryGetValue(alert.DeviceId, out var byDevice)
                ? byDevice
                : alert.AssetId is not null && rowByAsset.TryGetValue(alert.AssetId, out var byAsset) ? byAsset : null;
            if (rowId is not null)
            {
                alertRecords.Add(alert);
                alertRow[alert.MongoId] = rowId;
            }
        }

        var assetIds = new HashSet<string>(rowByAsset.Keys, StringComparer.OrdinalIgnoreCase);
        var events = (await iotRepository.GetLocationEventsAsync(scope.TenantId, scope.ClientId, period.FromUtc, period.ToUtc, cancellationToken))
            .Where(item => item.AssetId is not null && assetIds.Contains(item.AssetId))
            .ToList();

        return new IotUtilizationAnalyticsCalculator(period, settings, utcNow, rows, downtime, alertRecords, alertRow, events, sites, forceWeekly);
    }

    // ----- Rows -----

    /// <summary>Every connected asset in scope, with its utilization and telemetry availability over the period.</summary>
    public IReadOnlyList<IotAssetRow> Assets() => _assetRows ??= _rows.Select(row =>
    {
        var utilization = Utilization(row, _period.FromUtc, _period.ToUtc);
        return new IotAssetRow(
            row.Device.MongoId,
            row.Device.DeviceId,
            row.Device.DeviceName,
            row.Device.DeviceType ?? Unspecified,
            row.Asset?.MongoId,
            row.Asset?.AssetId ?? row.Device.AssetRegistrationId,
            row.Asset?.AssetName ?? row.Device.AssetName,
            row.Asset?.Category,
            row.Location,
            OrganizationOf(row.Location),
            row.Connectivity,
            row.SensorHealth,
            utilization,
            _settings.UtilizationTarget,
            utilization is null ? null : Round(utilization.Value - _settings.UtilizationTarget),
            Availability(row, _period.FromUtc, _period.ToUtc),
            row.Health?.SignalStrengthDbm,
            row.Device.BatteryLevel,
            row.LastSeenAt,
            row.LastSeenAt is { } seen ? (int)Math.Max(0, (_utcNow - seen).TotalMinutes) : null);
    })
    .OrderBy(row => row.AssetId ?? row.DeviceId, StringComparer.OrdinalIgnoreCase)
    .ToList();

    /// <summary>Assets below the utilization target, largest shortfall first.</summary>
    public IReadOnlyList<IotAssetRow> BelowTarget() => Assets()
        .Where(row => row.Variance is < 0)
        .OrderBy(row => row.Variance)
        .ThenBy(row => row.AssetId, StringComparer.OrdinalIgnoreCase)
        .ToList();

    /// <summary>Devices offline for more than 24 hours, longest first.</summary>
    public IReadOnlyList<IotAssetRow> OfflineOver24Hours() => Assets()
        .Where(row => row.Connectivity == Offline && row.MinutesSinceLastSeen > OfflineInsightHours * 60)
        .OrderByDescending(row => row.MinutesSinceLastSeen)
        .ToList();

    /// <summary>Active sensor alerts on the connected assets, newest first.</summary>
    public IReadOnlyList<IotAlertRow> ActiveAlerts() => _activeAlerts ??= _alertRecords
        .Where(IsActive)
        .Select(ToAlertRow)
        .OrderBy(alert => alert.MinutesAgo ?? int.MaxValue)
        .ToList();

    // ----- Sections -----

    public IotSummary Summary()
    {
        var connected = _rows.Count;
        var previousConnected = _rows.Count(row => row.Device.CreatedAt is null || row.Device.CreatedAt < _period.PreviousToUtc);

        return new IotSummary(
            DashboardWidgetCalculator.Kpi(connected, previousConnected, "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(FleetUtilization(_period.FromUtc, _period.ToUtc), FleetUtilization(_period.PreviousFromUtc, _period.PreviousToUtc), "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(FleetAvailability(_period.FromUtc, _period.ToUtc), FleetAvailability(_period.PreviousFromUtc, _period.PreviousToUtc), "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(ActiveAlerts().Count, _alertRecords.Count(alert => WasOpenAt(alert, _period.PreviousToUtc)), "number", percentChange: true));
    }

    public IotUtilizationTrend UtilizationTrend()
    {
        var production = new List<double?>();
        var idle = new List<double?>();
        var maintenance = new List<double?>();
        var offline = new List<double?>();
        foreach (var bucket in _buckets)
        {
            var share = Shares(bucket.StartUtc, bucket.EndUtc);
            production.Add(share?.Production);
            idle.Add(share?.Idle);
            maintenance.Add(share?.Maintenance);
            offline.Add(share?.Offline);
        }

        var total = Shares(_period.FromUtc, _period.ToUtc);
        return new IotUtilizationTrend(
            new PerformanceSeries(Labels(), [new(Production, production), new(Idle, idle), new(Maintenance, maintenance), new(Offline, offline)]),
            total?.Production,
            total?.Idle,
            total?.Maintenance,
            total?.Offline,
            _granularity);
    }

    public IotTelemetryOverview Telemetry()
    {
        var points = new List<(string Channel, DateTime At, double Value)>();
        foreach (var alert in _alertRecords)
        {
            if (alert.ThresholdValue is not > 0)
            {
                continue;
            }

            var channel = Title(alert.SensorType) ?? Unspecified;
            foreach (var anomaly in alert.Anomalies)
            {
                if (anomaly.Value is { } value)
                {
                    points.Add((Title(anomaly.Metric) ?? channel, anomaly.DetectedAt, value / alert.ThresholdValue.Value * 100));
                }
            }

            if (alert.LastReading is { } reading && alert.LastReadingAt is { } at)
            {
                points.Add((channel, at, reading / alert.ThresholdValue.Value * 100));
            }
        }

        var inPeriod = points.Where(point => point.At >= _period.FromUtc && point.At < _period.ToUtc).ToList();
        var channels = inPeriod
            .GroupBy(point => point.Channel, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Take(MaxTelemetryChannels)
            .Select(group => group.Key)
            .ToList();

        var lines = channels.Select(channel => new PerformanceSeriesLine(channel, _buckets.Select(bucket =>
        {
            var values = inPeriod
                .Where(point => string.Equals(point.Channel, channel, StringComparison.OrdinalIgnoreCase) && point.At >= bucket.StartUtc && point.At < bucket.EndUtc)
                .Select(point => Math.Clamp(point.Value, 0, 100))
                .ToList();
            return values.Count == 0 ? (double?)null : Round(values.Average());
        }).ToList())).ToList();

        return new IotTelemetryOverview(new PerformanceSeries(Labels(), lines), inPeriod.Count, _granularity);
    }

    public CountBreakdown Connectivity()
    {
        var total = _rows.Count;
        return new CountBreakdown(total, ConnectivityStatuses
            .Select(status =>
            {
                var count = _rows.Count(row => row.Connectivity == status);
                return new CountItem(status, count, total == 0 ? 0 : Round(100.0 * count / total));
            })
            .ToList());
    }

    public IReadOnlyList<IotCategoryUtilization> CategoryUtilization() => Assets()
        .Where(row => row.Utilization is not null && row.AssetRecordId is not null)
        .DistinctBy(row => row.AssetRecordId)
        .GroupBy(row => row.Category ?? Uncategorised, StringComparer.OrdinalIgnoreCase)
        .Select(group => new IotCategoryUtilization(group.Key, group.Count(), Round(group.Average(row => row.Utilization!.Value)), _settings.UtilizationTarget))
        .OrderBy(item => item.Category, StringComparer.OrdinalIgnoreCase)
        .ToList();

    public IotSensorHealthSummary SensorHealth()
    {
        var counts = SensorHealthCounts(_rows);
        var total = counts.Healthy + counts.Warning + counts.Failed;
        return new IotSensorHealthSummary(
            total,
            counts.Healthy,
            counts.Warning,
            counts.Failed,
            total == 0 ? null : Round(100.0 * (counts.Healthy + counts.Warning) / total),
            SensorHealthTarget);
    }

    public IotEventsTrend Events()
    {
        var events = new List<(DateTime At, string Severity)>();
        foreach (var alert in _alertRecords)
        {
            if (alert.Anomalies.Count > 0)
            {
                events.AddRange(alert.Anomalies.Select(anomaly => (anomaly.DetectedAt, EventSeverity(anomaly.Severity))));
            }
            else if (alert.CreatedAt is { } created)
            {
                events.Add((created, AlertSeverity(alert.RiskLevel)));
            }
        }

        events.AddRange(_events.Select(item => (item.EventTime, item.EventType?.Trim().ToLowerInvariant() switch
        {
            "geofence alert" => Critical,
            "dwell exceeded" => Warning,
            _ => Informational
        })));

        var inPeriod = events.Where(item => item.At >= _period.FromUtc && item.At < _period.ToUtc).ToList();
        var lines = EventSeverities.Select(severity => new PerformanceSeriesLine(severity, _buckets
            .Select(bucket => (double?)inPeriod.Count(item => item.Severity == severity && item.At >= bucket.StartUtc && item.At < bucket.EndUtc))
            .ToList())).ToList();

        return new IotEventsTrend(
            new PerformanceSeries(Labels(), lines),
            inPeriod.Count(item => item.Severity == Critical),
            inPeriod.Count(item => item.Severity == Warning),
            inPeriod.Count(item => item.Severity == Informational),
            _granularity);
    }

    /// <summary>Connected assets per location with coordinates from master_sites (null when the site has none).</summary>
    public IReadOnlyList<IotSiteSummary> Locations()
    {
        var alerts = ActiveAlerts();
        return Assets()
            .GroupBy(row => row.Location ?? UnknownLocation, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var site = _sites.GetValueOrDefault(group.Key);
                var ids = group.Select(row => row.Id).ToHashSet();
                return new IotSiteSummary(
                    group.Key,
                    group.First().Organization,
                    site?.Latitude,
                    site?.Longitude,
                    group.Count(),
                    group.Count(row => row.Connectivity == Online),
                    group.Count(row => row.Connectivity == Intermittent),
                    group.Count(row => row.Connectivity == Offline),
                    group.Count(row => row.Connectivity == NeverConnected),
                    Average(group.Where(row => row.AssetRecordId is not null).DistinctBy(row => row.AssetRecordId).Select(row => row.Utilization)),
                    Average(group.Select(row => row.TelemetryAvailability)),
                    alerts.Count(alert => ids.Contains(alert.AssetRowId)));
            })
            .OrderByDescending(site => site.Connected)
            .ThenBy(site => site.Location, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public IReadOnlyList<IotDevicePerformanceRow> Devices()
    {
        var rows = Assets().ToDictionary(row => row.Id);
        return _rows
            .GroupBy(row => row.Device.DeviceType ?? Unspecified, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var list = group.Select(row => rows[row.Device.MongoId]).ToList();
                var signals = list.Where(row => row.SignalDbm is not null).Select(row => row.SignalDbm!.Value).ToList();
                return new IotDevicePerformanceRow(
                    group.Key,
                    list.Count,
                    list.Count(row => row.Connectivity == Online),
                    Average(list.Select(row => row.TelemetryAvailability)),
                    signals.Count == 0 ? null : Math.Round(signals.Average()),
                    SensorHealthCounts(group).Failed);
            })
            .OrderByDescending(row => row.Connected)
            .ThenBy(row => row.DeviceType, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public IReadOnlyList<IotInsight> Insights()
    {
        var insights = new List<IotInsight>();
        var alerts = ActiveAlerts();
        if (alerts.Count > 0)
        {
            var assets = alerts.Select(alert => alert.AssetRowId).Distinct().ToList();
            var types = alerts.GroupBy(alert => alert.Type, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(group => group.Count())
                .Take(3)
                .Select(group => group.Key.ToLowerInvariant())
                .ToList();
            insights.Add(new IotInsight(
                "alerts",
                alerts.Any(alert => alert.Severity == Critical) ? "critical" : "warning",
                $"{Plural(alerts.Count, "active IoT alert")} {(alerts.Count == 1 ? "requires" : "require")} review",
                $"{Plural(alerts.Count, "active alert")} across {Plural(assets.Count, "asset")}, including {Join(types)}.",
                alerts.Count,
                assets.Count,
                assets,
                ["view_alerts", "create_action_plan"],
                "kind=alerts"));
        }

        var below = BelowTarget();
        if (below.Count > 0)
        {
            var categories = below.Select(row => row.Category ?? Uncategorised).Distinct(StringComparer.OrdinalIgnoreCase).Count();
            insights.Add(new IotInsight(
                "below_target",
                "warning",
                $"{Plural(below.Count, "asset")} below utilization target",
                $"{Plural(below.Count, "asset")} {(below.Count == 1 ? "is" : "are")} operating below the {_settings.UtilizationTarget.ToString("0.#", CultureInfo.InvariantCulture)}% utilization target across {Plural(categories, "asset category", "asset categories")}.",
                below.Count,
                below.Count,
                below.Select(row => row.Id).ToList(),
                ["view_assets", "create_action_plan"],
                "belowTarget=true"));
        }

        var vibration = alerts.Where(alert => IsVibration(alert.SensorType)).ToList();
        if (vibration.Count > 0)
        {
            var assets = vibration.Select(alert => alert.AssetRowId).Distinct().ToList();
            var limits = vibration.Where(alert => alert.Threshold is not null).Select(alert => alert.Threshold!.Value).Distinct().ToList();
            var limitText = limits.Count == 1
                ? $"the {limits[0].ToString("0.##", CultureInfo.InvariantCulture)}{UnitSuffix(vibration[0].Unit)} alarm threshold"
                : "their alarm thresholds";
            insights.Add(new IotInsight(
                "abnormal_vibration",
                "critical",
                $"{Plural(vibration.Count, "sensor")} reporting abnormal vibration",
                $"{Plural(vibration.Count, "vibration reading")} across {Plural(assets.Count, "asset")} {(vibration.Count == 1 ? "is" : "are")} beyond {limitText}.",
                vibration.Count,
                assets.Count,
                assets,
                ["view_sensors", "create_action_plan"],
                "kind=alerts&sensorType=Vibration"));
        }

        var offline = OfflineOver24Hours();
        if (offline.Count > 0)
        {
            insights.Add(new IotInsight(
                "offline_devices",
                "warning",
                $"{Plural(offline.Count, "device")} offline for more than {OfflineInsightHours} hours",
                $"{Plural(offline.Count, "IoT device")} {(offline.Count == 1 ? "has" : "have")} been offline for more than {OfflineInsightHours} hours and may require investigation.",
                offline.Count,
                offline.Count,
                offline.Select(row => row.Id).ToList(),
                ["view_devices", "create_action_plan"],
                "offlineOver24h=true"));
        }

        return insights;
    }

    /// <summary>Utilization per bucket for one connected asset (the detail dialog's sparkline); null where there is nothing to measure.</summary>
    public PerformanceSeries? UtilizationHistory(string rowId)
    {
        var row = _rows.FirstOrDefault(item => item.Device.MongoId == rowId
            || string.Equals(item.Device.DeviceId, rowId, StringComparison.OrdinalIgnoreCase));
        if (row is null)
        {
            return null;
        }

        return new PerformanceSeries(Labels(), [new(Production, _buckets.Select(bucket => Utilization(row, bucket.StartUtc, bucket.EndUtc)).ToList())]);
    }

    public bool HasRow(string rowId) => _rows.Any(item => item.Device.MongoId == rowId
        || string.Equals(item.Device.DeviceId, rowId, StringComparison.OrdinalIgnoreCase));

    // ----- Measures -----

    /// <summary>The asset's planned utilization × its up time share in [fromUtc, toUtc); null without planned utilization.</summary>
    private double? Utilization(Row row, DateTime fromUtc, DateTime toUtc) => Window(row, fromUtc, toUtc)?.Production;

    private sealed record WindowShare(double Hours, double? Production, double Maintenance, double Offline);

    private WindowShare? Window(Row row, DateTime fromUtc, DateTime toUtc)
    {
        if (row.Asset is null)
        {
            return null;
        }

        var start = row.Asset.CreatedAt is { } created && created > fromUtc ? created : fromUtc;
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        if (end <= start)
        {
            return null;
        }

        var hours = (end - start).TotalHours;
        double planned = 0, unplanned = 0;
        foreach (var record in _downtime.GetValueOrDefault(row.Asset.MongoId) ?? [])
        {
            var recordEnd = record.End ?? _utcNow;
            var overlap = ((recordEnd < end ? recordEnd : end) - (record.Start > start ? record.Start : start)).TotalHours;
            if (overlap <= 0)
            {
                continue;
            }

            if (IsPlanned(record.Reason))
            {
                planned += overlap;
            }
            else
            {
                unplanned += overlap;
            }
        }

        // Overlapping records must not push downtime past the hours in the window.
        if (planned + unplanned > hours)
        {
            var scale = hours / (planned + unplanned);
            planned *= scale;
            unplanned *= scale;
        }

        var plannedUtilization = AssetPerformanceCalculator.PlannedUtilization(row.Asset);
        var up = hours - planned - unplanned;
        return new WindowShare(
            hours,
            plannedUtilization is null ? null : Round(plannedUtilization.Value * up / hours),
            100 * planned / hours,
            100 * unplanned / hours);
    }

    /// <summary>Production / Idle / Maintenance / Offline shares over the assets with planned utilization, weighted by their hours.</summary>
    private (double Production, double Idle, double Maintenance, double Offline)? Shares(DateTime fromUtc, DateTime toUtc)
    {
        var windows = _rows
            .Where(row => row.Asset is not null)
            .DistinctBy(row => row.Asset!.MongoId)
            .Select(row => Window(row, fromUtc, toUtc))
            .Where(window => window?.Production is not null)
            .Select(window => window!)
            .ToList();
        var hours = windows.Sum(window => window.Hours);
        if (hours <= 0)
        {
            return null;
        }

        var production = windows.Sum(window => window.Production!.Value * window.Hours) / hours;
        var maintenance = windows.Sum(window => window.Maintenance * window.Hours) / hours;
        var offline = windows.Sum(window => window.Offline * window.Hours) / hours;
        return (Round(production), Round(Math.Max(0, 100 - production - maintenance - offline)), Round(maintenance), Round(offline));
    }

    private double? FleetUtilization(DateTime fromUtc, DateTime toUtc) => Average(_rows
        .Where(row => row.Asset is not null)
        .DistinctBy(row => row.Asset!.MongoId)
        .Select(row => Utilization(row, fromUtc, toUtc)));

    private double? FleetAvailability(DateTime fromUtc, DateTime toUtc) => Average(_rows.Select(row => Availability(row, fromUtc, toUtc)));

    /// <summary>Share of the device's hours in [fromUtc, toUtc) up to its last message; an Online device reports until now.</summary>
    private double? Availability(Row row, DateTime fromUtc, DateTime toUtc)
    {
        if (row.LastSeenAt is null)
        {
            return null;
        }

        var start = row.Device.CreatedAt is { } created && created > fromUtc ? created : fromUtc;
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        if (end <= start)
        {
            return null;
        }

        var reportingUntil = row.Connectivity == Online ? end : row.LastSeenAt.Value;
        var covered = ((reportingUntil < end ? reportingUntil : end) - start).TotalHours;
        return Round(Math.Clamp(100 * covered / (end - start).TotalHours, 0, 100));
    }

    private static (int Healthy, int Warning, int Failed) SensorHealthCounts(IEnumerable<Row> rows)
    {
        int healthy = 0, warning = 0, failed = 0;
        foreach (var row in rows)
        {
            var states = row.Sensors.Count > 0
                ? row.Sensors.Select(sensor => SensorStatusHealth(sensor.Status)).Where(state => state is not null)
                : row.SensorHealth is null ? [] : [row.SensorHealth];
            foreach (var state in states)
            {
                switch (state)
                {
                    case Healthy: healthy++; break;
                    case Warning: warning++; break;
                    case Failed: failed++; break;
                }
            }
        }

        return (healthy, warning, failed);
    }

    // ----- Alerts -----

    private static bool IsActive(IotSensorAlertRecord alert) =>
        alert.Status?.Trim().ToLowerInvariant() is not ("resolved" or "closed" or "cancelled" or "canceled" or "monitoring");

    /// <summary>Raised before the cutoff and not resolved by then (a resolved alert's updated_at is taken as its resolution time).</summary>
    private static bool WasOpenAt(IotSensorAlertRecord alert, DateTime cutoffUtc)
    {
        if (alert.CreatedAt is not { } created || created >= cutoffUtc)
        {
            return false;
        }

        if (alert.Status?.Trim().ToLowerInvariant() == "monitoring")
        {
            return false;
        }

        return IsActive(alert) || alert.UpdatedAt is { } resolved && resolved >= cutoffUtc;
    }

    private IotAlertRow ToAlertRow(IotSensorAlertRecord alert)
    {
        var rowId = _alertRow[alert.MongoId];
        var row = _rows.First(item => item.Device.MongoId == rowId);
        var unit = UnitOf(row, alert.SensorType);
        var suffix = UnitSuffix(unit);
        var reading = alert.LastReading is { } value
            ? alert.ThresholdValue is { } limit
                ? $"{Format(value)}{suffix} (limit {Format(limit)}{suffix})"
                : $"{Format(value)}{suffix}"
            : alert.ThresholdValue is { } threshold ? $"Limit {Format(threshold)}{suffix}" : "No reading";
        var raised = alert.CreatedAt ?? alert.LastReadingAt;

        return new IotAlertRow(
            alert.MongoId,
            rowId,
            alert.DeviceId ?? row.Device.DeviceId,
            row.Asset?.AssetId ?? alert.AssetId,
            row.Asset?.AssetName ?? alert.AssetName ?? row.Device.AssetName,
            row.Location ?? alert.Location,
            AlertType(alert),
            alert.SensorType,
            AlertSeverity(alert.RiskLevel),
            reading,
            alert.LastReading,
            alert.ThresholdValue,
            unit,
            raised,
            raised is { } at ? (int)Math.Max(0, (_utcNow - at).TotalMinutes) : null,
            alert.Status);
    }

    private static string AlertType(IotSensorAlertRecord alert)
    {
        if (IsVibration(alert.SensorType))
        {
            return "Abnormal vibration";
        }

        if (string.IsNullOrWhiteSpace(alert.SensorType))
        {
            return "Sensor alert";
        }

        var below = alert.AlertCondition?.Contains("below", StringComparison.OrdinalIgnoreCase) == true;
        return $"{(below ? "Low" : "High")} {alert.SensorType.Trim().ToLowerInvariant()}";
    }

    private static string? UnitOf(Row row, string? sensorType)
    {
        if (string.IsNullOrWhiteSpace(sensorType))
        {
            return null;
        }

        return row.Sensors.FirstOrDefault(sensor =>
            sensor.SensorType?.Contains(sensorType, StringComparison.OrdinalIgnoreCase) == true
            || sensor.MeasuredParameter?.Contains(sensorType, StringComparison.OrdinalIgnoreCase) == true)?.Unit;
    }

    public static bool IsVibration(string? sensorType) => sensorType?.Contains("vibration", StringComparison.OrdinalIgnoreCase) == true;

    private static string AlertSeverity(string? riskLevel) =>
        riskLevel?.Trim().ToLowerInvariant() is "high" or "critical" or "very high" ? Critical : Warning;

    private static string EventSeverity(string? severity) => severity?.Trim().ToLowerInvariant() switch
    {
        "critical" or "high" or "very high" => Critical,
        "medium" or "warning" or "moderate" => Warning,
        _ => Informational
    };

    // ----- Mappings -----

    public static string ConnectivityOf(string? connectivity, DateTime? lastSeenAt, DateTime utcNow)
    {
        if (lastSeenAt is null)
        {
            return NeverConnected;
        }

        switch (connectivity?.Trim().ToLowerInvariant())
        {
            case "online": return Online;
            case "warning" or "intermittent": return Intermittent;
            case "offline": return Offline;
        }

        var minutes = (utcNow - lastSeenAt.Value).TotalMinutes;
        return minutes <= OnlineWithinMinutes ? Online : minutes <= IntermittentWithinMinutes ? Intermittent : Offline;
    }

    /// <summary>DeviceHealth (Healthy, Attention, Maintenance, Critical) or IoTDevice (Good, Warning, Critical) health; null when unknown.</summary>
    private static string? HealthOf(string? status) => status?.Trim().ToLowerInvariant() switch
    {
        "healthy" or "good" => Healthy,
        "attention" or "warning" or "maintenance" => Warning,
        "critical" or "failed" => Failed,
        _ => null
    };

    /// <summary>Sensor status Active, Attention or Offline; Inactive sensors are left out.</summary>
    private static string? SensorStatusHealth(string? status) => status?.Trim().ToLowerInvariant() switch
    {
        "active" => Healthy,
        "attention" => Warning,
        "offline" => Failed,
        _ => null
    };

    private string? OrganizationOf(string? location) => location is null ? null : _sites.GetValueOrDefault(location)?.Organization;

    private static bool IsPlanned(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return false;
        }

        var text = reason.ToLowerInvariant();
        return !text.Contains("unplanned") && !text.Contains("unscheduled")
            && (text.Contains("planned") || text.Contains("preventive") || text.Contains("scheduled"));
    }

    // ----- Buckets -----

    /// <summary>Weeks from the period start when it spans a month or less (or when asked), else calendar months; none past today.</summary>
    private static (IReadOnlyList<(string Label, DateTime StartUtc, DateTime EndUtc)> Buckets, string Granularity) Buckets(
        DashboardPeriod period,
        DateTime utcNow,
        bool forceWeekly)
    {
        var days = period.To.DayNumber - period.From.DayNumber + 1;
        if (!forceWeekly && days > WeeklyUpToDays)
        {
            return (AssetPerformanceCalculator.Months(period, utcNow)
                .Select(month => (month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture), month.StartUtc, month.EndUtc))
                .ToList(), Monthly);
        }

        var buckets = new List<(string, DateTime, DateTime)>();
        for (var day = period.From; day <= period.To; day = day.AddDays(7))
        {
            var start = DashboardPeriods.StartOfDayUtc(day, period.Zone);
            if (start >= utcNow)
            {
                break;
            }

            var next = DashboardPeriods.StartOfDayUtc(day.AddDays(7), period.Zone);
            buckets.Add((day.ToString("dd MMM", CultureInfo.InvariantCulture), start, next > period.ToUtc ? period.ToUtc : next));
        }

        return (buckets, Weekly);
    }

    private IReadOnlyList<string> Labels() => _buckets.Select(bucket => bucket.Label).ToList();

    // ----- Helpers -----

    private static DateTime? Latest(DateTime? first, DateTime? second) =>
        first is null ? second : second is null ? first : first > second ? first : second;

    private static double? Average(IEnumerable<double?> values)
    {
        var list = values.Where(value => value is not null).Select(value => value!.Value).ToList();
        return list.Count == 0 ? null : Round(list.Average());
    }

    private static double Round(double value) => Math.Round(value, 1, MidpointRounding.AwayFromZero);

    private static string Format(double value) => value.ToString("0.##", CultureInfo.InvariantCulture);

    private static string UnitSuffix(string? unit) => string.IsNullOrWhiteSpace(unit) ? string.Empty : $" {unit.Trim()}";

    private static string? Title(string? text) =>
        string.IsNullOrWhiteSpace(text) ? null : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(text.Trim().ToLowerInvariant());

    private static string Plural(int count, string singular, string? plural = null) =>
        $"{count.ToString("N0", CultureInfo.InvariantCulture)} {(count == 1 ? singular : plural ?? singular + "s")}";

    private static string Join(IReadOnlyList<string> items) => items.Count switch
    {
        0 => "sensor alerts",
        1 => items[0],
        _ => $"{string.Join(", ", items.Take(items.Count - 1))} and {items[^1]}"
    };
}
