using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// RiskLevel narrows the monitored assets to one current risk level (Critical, High, Medium or Low). AccuracyTarget is in percent.
/// Predictions below ReviewConfidence (%) go to an engineer. FailureWindowDays is the horizon of "predicted failures" and of a healthy
/// prediction; ToleranceDays is how far from the predicted date a recorded failure still confirms the prediction. HighRiskScore is the
/// risk score (0–100) drawn as the high-risk threshold.
/// </summary>
public sealed record PredictiveAnalyticsSettings(
    string? RiskLevel,
    double AccuracyTarget,
    double ReviewConfidence,
    int FailureWindowDays,
    int ToleranceDays,
    double HighRiskScore);

/// <summary>
/// The current prediction for one monitored asset. RiskScore is 100 minus the model's health score; FailureWindowDays and
/// RemainingUsefulLifeHours run to the predicted failure date and are null once the prediction is resolved or has no date.
/// Owner is the technician on the asset's latest open work order.
/// </summary>
public sealed record AssetPrediction(
    string Key,
    string AssetId,
    string AssetName,
    string? Location,
    string? Category,
    string? AssetType,
    string RiskLevel,
    double? RiskScore,
    double? HealthScore,
    double? Confidence,
    int? FailureWindowDays,
    double? RemainingUsefulLifeHours,
    DateTime? PredictedFailureDate,
    string? PredictedIssue,
    string? ModelName,
    string? SensorType,
    string RecommendedAction,
    bool VibrationAnomaly,
    int RecentAnomalies,
    string? Owner,
    string? AlertStatus,
    bool Resolved,
    DateTime? PredictedAt,
    string AlertId);

public sealed record PredictiveSummary(
    KpiWidgetData AssetsMonitored,
    KpiWidgetData HighRiskAssets,
    KpiWidgetData PredictedFailures,
    KpiWidgetData PredictionAccuracy);

/// <summary>Average risk score per risk band at each month end.</summary>
public sealed record FailureRiskTrend(PerformanceSeries Trend, double HighRiskThreshold);

/// <summary>Average remaining useful life (hours) at each month end, with the confidence band of the high-risk assets.</summary>
public sealed record RemainingLifeForecast(PerformanceSeries Forecast, double? CurrentHighRiskHours);

public sealed record RiskDistribution(int Total, IReadOnlyList<CountItem> Items);

/// <summary>Sensor anomalies detected per month, by metric.</summary>
public sealed record AnomalyEvents(int Total, PerformanceSeries Trend);

/// <summary>
/// Predictions whose date (or horizon) fell in the period, checked against recorded failures. A prediction with a failure date is a
/// true positive when a failure was recorded within ToleranceDays of it or it was resolved by maintenance before failing; otherwise a
/// false positive. A prediction without a failure date is a true negative when no failure followed within the horizon. A failure
/// (downtime record, corrective or emergency work order) with no failure prediction in the FailureWindowDays before it is a false negative.
/// </summary>
public sealed record PredictionAccuracy(
    double? Accuracy,
    double? Precision,
    double? Recall,
    double? FalsePositiveRate,
    double Target,
    bool? MeetsTarget,
    int Evaluated,
    int TruePositives,
    int FalsePositives,
    int TrueNegatives,
    int FalseNegatives,
    int PreventedFailures,
    int ToleranceDays);

/// <summary>
/// Preventive and corrective spend per month from cost records, and the downtime cost avoided: failures prevented by acting on
/// predictions times the average corrective cost record (0 when no corrective cost is recorded).
/// </summary>
public sealed record PredictiveMaintenanceCost(
    PerformanceSeries Trend,
    double Preventive,
    double Corrective,
    double Other,
    double AvoidedCost,
    int PreventedFailures,
    double? AverageCorrectiveCost);

/// <summary>Status is Online when an alert was scored for the asset type in the last 30 days, else Inactive.</summary>
public sealed record ModelPerformanceRow(
    string AssetType,
    int Monitored,
    double? Accuracy,
    double? Precision,
    double? Recall,
    int Evaluated,
    string Status,
    IReadOnlyList<string> Models,
    DateTime? LastScoredAt);

/// <summary>A Predictive Insights card; AssetIds are the assets behind it, Amount the cost for the avoided-cost card.</summary>
public sealed record PredictiveInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    double? Amount,
    IReadOnlyList<string> AssetIds,
    IReadOnlyList<string> Actions);

/// <summary>
/// Predictive Analytics for one filter bar and date range, worked out from predictive_maintenance_alerts (each asset's latest alert is its
/// current prediction), the asset register, work orders, downtime records and cost records. Assets that are not in the asset register are
/// placed by the location and asset type recorded on their alerts.
/// </summary>
public sealed class PredictiveAnalyticsCalculator
{
    public const string Critical = "Critical";
    public const string High = "High";
    public const string Medium = "Medium";
    public const string Low = "Low";
    public const string Online = "Online";
    public const string Inactive = "Inactive";

    public static readonly IReadOnlyList<string> RiskLevels = [Critical, High, Medium, Low];
    public static readonly IReadOnlyList<string> PredictionLists = ["all", "high-risk", "failures", "vibration", "review"];

    private const int ModelOnlineDays = 30;
    private const int AnomalyDays = 7;

    private sealed record AssetInfo(string Key, string AssetId, string AssetName, string? Location, string? Category, string? AssetType, IReadOnlyList<PredictiveAlertRecord> Alerts);

    private sealed record FailureEvent(string AssetKey, DateTime At);

    private readonly DashboardPeriod _period;
    private readonly PredictiveAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly DateTime _asOf;
    private readonly IReadOnlyList<AssetInfo> _assets;
    private readonly IReadOnlyList<FailureEvent> _failures;
    private readonly IReadOnlyList<(DateTime At, string Type, double Amount)> _costs;
    private readonly Dictionary<string, string> _owners;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;
    private readonly IReadOnlyList<AssetPrediction> _current;

    private PredictiveAnalyticsCalculator(
        DashboardPeriod period,
        PredictiveAnalyticsSettings settings,
        DateTime utcNow,
        IReadOnlyList<AssetInfo> assets,
        IReadOnlyList<FailureEvent> failures,
        IReadOnlyList<(DateTime At, string Type, double Amount)> costs,
        Dictionary<string, string> owners)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _asOf = period.ToUtc < utcNow ? period.ToUtc : utcNow;
        _failures = failures;
        _costs = costs;
        _owners = owners;
        _months = AssetPerformanceCalculator.Months(period, utcNow);

        // The Risk Level filter keeps the assets currently at that level; every section then works on those assets.
        var current = assets.Select(asset => (Asset: asset, Prediction: PredictionAt(asset, _asOf))).Where(item => item.Prediction is not null).ToList();
        if (settings.RiskLevel is { } risk)
        {
            current = current.Where(item => item.Prediction!.RiskLevel == risk).ToList();
        }

        _assets = current.Select(item => item.Asset).ToList();
        _current = current.Select(item => item.Prediction!).OrderByDescending(prediction => prediction.RiskScore ?? -1).ThenBy(prediction => prediction.AssetId).ToList();
    }

    public DashboardPeriod Period => _period;

    public PredictiveAnalyticsSettings Settings => _settings;

    public static async Task<PredictiveAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository dataRepository,
        IPredictiveAnalyticsDataRepository predictiveRepository,
        DashboardDataScope scope,
        DashboardPeriod period,
        PredictiveAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var tenantScope = new DashboardDataScope(scope.TenantId, scope.ClientId, null, null, null);

        // The register says where an asset is; scoped assets are the ones the filter bar keeps.
        var registered = new Dictionary<string, DashboardAsset>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in await dataRepository.GetAssetsAsync(tenantScope, cancellationToken))
        {
            foreach (var key in asset.Keys())
            {
                registered.TryAdd(key, asset);
            }
        }

        HashSet<string>? scoped = null;
        if (scope.FiltersAssets)
        {
            scoped = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var asset in await dataRepository.GetAssetsAsync(scope, cancellationToken))
            {
                scoped.UnionWith(asset.Keys());
            }
        }

        var alerts = await predictiveRepository.GetAlertsAsync(scope.TenantId, scope.ClientId, null, cancellationToken);
        var assets = alerts
            .Where(alert => !string.IsNullOrWhiteSpace(alert.AssetId))
            .GroupBy(alert => registered.TryGetValue(alert.AssetId!, out var asset) ? asset.MongoId : alert.AssetId!, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var latest = group.OrderByDescending(Stamp).First();
                registered.TryGetValue(latest.AssetId!, out var asset);
                return new AssetInfo(
                    group.Key,
                    asset?.AssetId ?? latest.AssetId!,
                    asset?.AssetName ?? group.Select(alert => alert.AssetName).FirstOrDefault(name => name is not null) ?? latest.AssetId!,
                    asset?.Location ?? latest.Location,
                    asset?.Category,
                    asset?.AssetType ?? latest.AssetType,
                    group.OrderBy(Stamp).ToList());
            })
            .Where(asset => InScope(asset, scope, scoped, registered.ContainsKey(asset.Alerts[0].AssetId!)))
            .ToList();

        // Every value other services may use for these assets, mapped back to the asset.
        var keyToAsset = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in assets)
        {
            keyToAsset.TryAdd(asset.Key, asset.Key);
            keyToAsset.TryAdd(asset.AssetId, asset.Key);
            foreach (var alert in asset.Alerts)
            {
                keyToAsset.TryAdd(alert.AssetId!, asset.Key);
            }
        }

        var failures = new List<FailureEvent>();
        var costs = new List<(DateTime, string, double)>();
        var owners = new Dictionary<string, string>();
        if (keyToAsset.Count > 0)
        {
            var keys = keyToAsset.Keys.ToList();
            var months = AssetPerformanceCalculator.Months(period, utcNow);
            var loadFrom = months.Count > 0 && months[0].StartUtc < period.PreviousFromUtc ? months[0].StartUtc : period.PreviousFromUtc;

            var workOrders = await dataRepository.GetWorkOrdersAsync(tenantScope, keys, null, null, openOnly: false, cancellationToken);
            foreach (var workOrder in workOrders)
            {
                if (workOrder.AssetId is null || !keyToAsset.TryGetValue(workOrder.AssetId, out var assetKey))
                {
                    continue;
                }

                if (IsFailureWork(workOrder.WorkType) && !IsCancelled(workOrder.Status) && (workOrder.CreatedAt ?? workOrder.ScheduledDate) is { } at)
                {
                    failures.Add(new FailureEvent(assetKey, at));
                }
            }

            foreach (var group in workOrders
                .Where(workOrder => workOrder.AssetId is not null && keyToAsset.ContainsKey(workOrder.AssetId) && !IsClosed(workOrder.Status)
                    && !string.IsNullOrWhiteSpace(workOrder.AssignedTechnician))
                .GroupBy(workOrder => keyToAsset[workOrder.AssetId!]))
            {
                owners[group.Key] = group.OrderByDescending(workOrder => workOrder.CreatedAt ?? workOrder.ScheduledDate ?? DateTime.MinValue).First().AssignedTechnician!;
            }

            var downtime = await dataRepository.GetDowntimeAsync(tenantScope, keys, loadFrom.AddDays(-settings.FailureWindowDays), period.ToUtc, cancellationToken);
            failures.AddRange(downtime
                .Where(record => record.AssetId is not null && keyToAsset.ContainsKey(record.AssetId))
                .Select(record => new FailureEvent(keyToAsset[record.AssetId!], record.Start)));

            var workTypes = workOrders
                .Where(workOrder => !string.IsNullOrWhiteSpace(workOrder.WorkOrderId))
                .GroupBy(workOrder => workOrder.WorkOrderId!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.First().WorkType, StringComparer.OrdinalIgnoreCase);
            foreach (var record in await dataRepository.GetCostRecordsAsync(tenantScope, keys, loadFrom, period.ToUtc, cancellationToken))
            {
                if (record.CreatedAt is not { } at || record.AssetId is null || !keyToAsset.ContainsKey(record.AssetId))
                {
                    continue;
                }

                var type = record.MaintenanceType
                    ?? (record.WorkOrderId is not null && workTypes.TryGetValue(record.WorkOrderId, out var workType) ? workType : null);
                costs.Add((at, CostType(type), record.Total));
            }
        }

        return new PredictiveAnalyticsCalculator(period, settings, utcNow, assets, failures, costs, owners);
    }

    // ----- Sections -----

    /// <summary>Every monitored asset's current prediction, highest risk score first.</summary>
    public IReadOnlyList<AssetPrediction> Predictions() => _current;

    /// <summary>Critical and high risk assets, highest risk score first.</summary>
    public IReadOnlyList<AssetPrediction> HighRisk() => _current.Where(IsElevated).ToList();

    /// <summary>Unresolved predictions failing within FailureWindowDays, soonest first.</summary>
    public IReadOnlyList<AssetPrediction> PredictedFailures() => FailuresOf(_current);

    public IReadOnlyList<AssetPrediction> Vibration() => _current.Where(prediction => prediction.VibrationAnomaly).ToList();

    /// <summary>Open failure predictions or elevated assets whose model confidence is below ReviewConfidence (or not recorded), lowest first.</summary>
    public IReadOnlyList<AssetPrediction> Review() => _current
        .Where(prediction => (prediction.FailureWindowDays is not null || IsElevated(prediction))
            && (prediction.Confidence is null || prediction.Confidence < _settings.ReviewConfidence))
        .OrderBy(prediction => prediction.Confidence ?? -1)
        .ToList();

    public IReadOnlyList<AssetPrediction> List(string? list) => list switch
    {
        "high-risk" => HighRisk(),
        "failures" => PredictedFailures(),
        "vibration" => Vibration(),
        "review" => Review(),
        _ => Predictions()
    };

    public PredictiveSummary Summary()
    {
        var previousAt = _period.PreviousToUtc < _utcNow ? _period.PreviousToUtc : _utcNow;
        var previous = _assets.Select(asset => PredictionAt(asset, previousAt)).OfType<AssetPrediction>().ToList();
        var accuracy = Accuracy(_assets, _period.FromUtc, _period.ToUtc).Accuracy;
        var previousAccuracy = Accuracy(_assets, _period.PreviousFromUtc, _period.PreviousToUtc).Accuracy;

        return new PredictiveSummary(
            DashboardWidgetCalculator.Kpi(_current.Count, previous.Count, "number", true),
            DashboardWidgetCalculator.Kpi(_current.Count(IsElevated), previous.Count(IsElevated), "number", true),
            DashboardWidgetCalculator.Kpi(FailuresOf(_current).Count, FailuresOf(previous).Count, "number", true),
            DashboardWidgetCalculator.Kpi(accuracy, previousAccuracy, "percent", false));
    }

    public FailureRiskTrend RiskTrend()
    {
        (string Name, Func<AssetPrediction, bool> InBand)[] bands =
        [
            ("High Risk", IsElevated),
            ("Medium Risk", prediction => prediction.RiskLevel == Medium),
            ("Low Risk", prediction => prediction.RiskLevel == Low)
        ];

        var states = _months.Select(month => MonthStates(month.EndUtc)).ToList();
        var lines = bands
            .Select(band => new PerformanceSeriesLine(band.Name, states.Select(list => Average(list.Where(band.InBand).Select(p => p.RiskScore))).ToList()))
            .Where(line => line.Values.Any(value => value is not null))
            .ToList();
        lines.Add(new PerformanceSeriesLine("High Risk Threshold", _months.Select(_ => (double?)_settings.HighRiskScore).ToList()));

        return new FailureRiskTrend(new PerformanceSeries(MonthLabels(), lines), _settings.HighRiskScore);
    }

    public RemainingLifeForecast RemainingLife()
    {
        var states = _months.Select(month => MonthStates(month.EndUtc).Where(p => p.RemainingUsefulLifeHours is not null).ToList()).ToList();
        double? Band(IEnumerable<AssetPrediction> list, int sign) => Average(list
            .Where(p => p.Confidence is not null)
            .Select(p => (double?)(p.RemainingUsefulLifeHours!.Value * (1 + sign * (100 - p.Confidence!.Value) / 100))), 0);

        var lines = new List<PerformanceSeriesLine>
        {
            new("High Risk Assets", states.Select(list => Average(list.Where(IsElevated).Select(p => p.RemainingUsefulLifeHours), 0)).ToList()),
            new("Medium Risk Assets", states.Select(list => Average(list.Where(p => p.RiskLevel == Medium).Select(p => p.RemainingUsefulLifeHours), 0)).ToList()),
            new("All Monitored", states.Select(list => Average(list.Select(p => p.RemainingUsefulLifeHours), 0)).ToList())
        };
        lines = lines.Where(line => line.Values.Any(value => value is not null)).ToList();
        if (lines.Count > 0 && lines[0].Name == "High Risk Assets")
        {
            lines.Add(new PerformanceSeriesLine("Confidence band (upper)", states.Select(list => Band(list.Where(IsElevated), 1)).ToList()));
            lines.Add(new PerformanceSeriesLine("Confidence band (lower)", states.Select(list => Band(list.Where(IsElevated), -1)).ToList()));
        }

        return new RemainingLifeForecast(
            new PerformanceSeries(MonthLabels(), lines),
            Average(_current.Where(IsElevated).Select(p => p.RemainingUsefulLifeHours), 0));
    }

    public RiskDistribution Distribution()
    {
        var total = _current.Count;
        return new RiskDistribution(total, RiskLevels
            .Select(level => (Level: level, Count: _current.Count(p => p.RiskLevel == level)))
            .Select(item => new CountItem(item.Level, item.Count, total == 0 ? 0 : Math.Round(100d * item.Count / total, 1)))
            .ToList());
    }

    public AnomalyEvents Anomalies()
    {
        var anomalies = _assets
            .SelectMany(asset => asset.Alerts.SelectMany(alert => alert.Anomalies))
            .Where(anomaly => anomaly.DetectedAt >= _period.FromUtc && anomaly.DetectedAt < _asOf)
            .ToList();
        var metrics = anomalies
            .GroupBy(anomaly => Title(anomaly.Metric), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .Select(group => new PerformanceSeriesLine(group.Key, _months
                .Select(month => (double?)group.Count(anomaly => anomaly.DetectedAt >= month.StartUtc && anomaly.DetectedAt < month.EndUtc))
                .ToList()))
            .ToList();

        return new AnomalyEvents(anomalies.Count, new PerformanceSeries(MonthLabels(), metrics));
    }

    public PredictionAccuracy Accuracy() => Accuracy(_assets, _period.FromUtc, _period.ToUtc);

    public PredictiveMaintenanceCost MaintenanceCost()
    {
        var corrective = _costs.Where(cost => cost.Type == MaintenanceAnalyticsCalculator.Corrective).ToList();
        double? average = corrective.Count == 0 ? null : Math.Round(corrective.Average(cost => cost.Amount), 2);
        var prevented = PreventedPredictions(_assets, _period.FromUtc, _period.ToUtc);
        var inPeriod = _costs.Where(cost => cost.At >= _period.FromUtc && cost.At < _period.ToUtc).ToList();

        double Sum(string type, DateTime from, DateTime to) =>
            Math.Round(_costs.Where(cost => cost.Type == type && cost.At >= from && cost.At < to).Sum(cost => cost.Amount), 2);

        var lines = new List<PerformanceSeriesLine>
        {
            new("Preventive", _months.Select(month => (double?)Sum(MaintenanceAnalyticsCalculator.Preventive, month.StartUtc, month.EndUtc)).ToList()),
            new("Corrective", _months.Select(month => (double?)Sum(MaintenanceAnalyticsCalculator.Corrective, month.StartUtc, month.EndUtc)).ToList())
        };
        if (inPeriod.Any(cost => cost.Type == MaintenanceAnalyticsCalculator.OtherType))
        {
            lines.Add(new("Other", _months.Select(month => (double?)Sum(MaintenanceAnalyticsCalculator.OtherType, month.StartUtc, month.EndUtc)).ToList()));
        }

        lines.Add(new("Avoided Cost", _months
            .Select(month => (double?)Math.Round(prevented.Count(p => p.PredictedFailureDate >= month.StartUtc && p.PredictedFailureDate < month.EndUtc) * (average ?? 0), 2))
            .ToList()));

        return new PredictiveMaintenanceCost(
            new PerformanceSeries(MonthLabels(), lines),
            Sum(MaintenanceAnalyticsCalculator.Preventive, _period.FromUtc, _period.ToUtc),
            Sum(MaintenanceAnalyticsCalculator.Corrective, _period.FromUtc, _period.ToUtc),
            Sum(MaintenanceAnalyticsCalculator.OtherType, _period.FromUtc, _period.ToUtc),
            Math.Round(prevented.Count * (average ?? 0), 2),
            prevented.Count,
            average);
    }

    public IReadOnlyList<ModelPerformanceRow> ModelPerformance() => _assets
        .GroupBy(asset => asset.AssetType ?? "Unspecified", StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var accuracy = Accuracy(group.ToList(), _period.FromUtc, _period.ToUtc);
            var alerts = group.SelectMany(asset => asset.Alerts).ToList();
            DateTime? scored = alerts.Count == 0 ? null : alerts.Max(alert => alert.LastReadingAt is { } reading && reading > Stamp(alert) ? reading : Stamp(alert));
            return new ModelPerformanceRow(
                group.Key,
                group.Count(),
                accuracy.Accuracy,
                accuracy.Precision,
                accuracy.Recall,
                accuracy.Evaluated,
                scored is { } at && at >= _utcNow.AddDays(-ModelOnlineDays) ? Online : Inactive,
                alerts.Select(alert => alert.ModelName).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(name => name).ToList(),
                scored == DateTime.MinValue ? null : scored);
        })
        .OrderByDescending(row => row.Monitored)
        .ThenBy(row => row.AssetType)
        .ToList();

    public IReadOnlyList<PredictiveInsight> Insights()
    {
        var failures = PredictedFailures();
        var vibration = Vibration();
        var review = Review();
        var cost = MaintenanceCost();
        var days = _settings.FailureWindowDays;

        return
        [
            new("predicted_failures", failures.Count > 0 ? "critical" : "success",
                $"{Plural(failures.Count, "predicted failure")} within {days} days",
                failures.Count > 0
                    ? $"{Plural(failures.Count, "asset")} {(failures.Count == 1 ? "has" : "have")} an open failure prediction dated within the next {days} days."
                    : $"No open failure prediction falls within the next {days} days.",
                failures.Count, null, failures.Select(p => p.Key).ToList(), ["view_predictions", "create_work_order"]),
            new("abnormal_vibration", vibration.Count > 0 ? "warning" : "success",
                $"{Plural(vibration.Count, "asset")} {(vibration.Count == 1 ? "shows" : "show")} abnormal vibration patterns",
                vibration.Count > 0
                    ? $"Vibration anomalies were detected on {Plural(vibration.Count, "asset")} in the last {AnomalyDays} days."
                    : $"No vibration anomaly was detected in the last {AnomalyDays} days.",
                vibration.Count, null, vibration.Select(p => p.Key).ToList(), ["view_assets", "create_work_order"]),
            new("downtime_cost_avoided", "success",
                $"{cost.AvoidedCost.ToString("N0", CultureInfo.InvariantCulture)} potential downtime cost avoided",
                cost.AverageCorrectiveCost is null
                    ? $"{Plural(cost.PreventedFailures, "predicted failure")} {(cost.PreventedFailures == 1 ? "was" : "were")} prevented by maintenance; no corrective cost is recorded to value them."
                    : $"{Plural(cost.PreventedFailures, "predicted failure")} prevented by maintenance, at an average corrective cost of {cost.AverageCorrectiveCost.Value.ToString("N0", CultureInfo.InvariantCulture)}.",
                cost.PreventedFailures, cost.AvoidedCost, [], ["view_details"]),
            new("engineer_review", review.Count > 0 ? "critical" : "success",
                $"{Plural(review.Count, "prediction")} {(review.Count == 1 ? "requires" : "require")} engineer review",
                review.Count > 0
                    ? $"{Plural(review.Count, "prediction")} {(review.Count == 1 ? "has" : "have")} model confidence below {_settings.ReviewConfidence}% (or none recorded)."
                    : $"Every open prediction has model confidence of {_settings.ReviewConfidence}% or more.",
                review.Count, null, review.Select(p => p.Key).ToList(), ["view_predictions", "view_assets"])
        ];
    }

    // ----- Workings -----

    private AssetPrediction? PredictionAt(AssetInfo asset, DateTime at)
    {
        var alert = asset.Alerts.LastOrDefault(item => Stamp(item) < at);
        if (alert is null)
        {
            return null;
        }

        var resolved = alert.ActualFailureDate is { } failed && failed <= at
            || IsResolvedStatus(alert.Status) && (alert.UpdatedAt ?? alert.PredictedFailureDate ?? Stamp(alert)) <= at;
        double? score = alert.HealthScore is { } health ? Math.Round(Math.Clamp(100 - health, 0, 100)) : null;
        var risk = Risk(alert.RiskLevel, score);
        int? window = null;
        double? life = null;
        if (!resolved && alert.PredictedFailureDate is { } predicted)
        {
            window = Math.Max(0, (int)Math.Ceiling((predicted - at).TotalDays));
            life = Math.Round(Math.Max(0, (predicted - at).TotalHours));
        }

        var recent = asset.Alerts
            .SelectMany(item => item.Anomalies)
            .Where(anomaly => anomaly.DetectedAt <= at && anomaly.DetectedAt > at.AddDays(-AnomalyDays))
            .ToList();
        var vibration = recent.Any(anomaly => anomaly.Metric.Contains("vibration", StringComparison.OrdinalIgnoreCase));
        var action = alert.RecommendedAction
            ?? (vibration ? "Inspect vibration"
                : window is <= 14 ? "Schedule maintenance"
                : risk == Critical ? "Inspect and service"
                : "Monitor closely");

        return new AssetPrediction(
            asset.Key,
            asset.AssetId,
            asset.AssetName,
            asset.Location,
            asset.Category,
            asset.AssetType,
            risk,
            score,
            alert.HealthScore,
            alert.Confidence,
            window,
            life,
            alert.PredictedFailureDate,
            alert.PredictedIssue,
            alert.ModelName,
            alert.SensorType,
            action,
            vibration,
            recent.Count,
            _owners.GetValueOrDefault(asset.Key),
            alert.Status,
            resolved,
            alert.CreatedAt,
            alert.Id);
    }

    private List<AssetPrediction> MonthStates(DateTime endUtc)
    {
        var at = endUtc < _utcNow ? endUtc : _utcNow;
        return _assets.Select(asset => PredictionAt(asset, at)).OfType<AssetPrediction>().ToList();
    }

    private List<AssetPrediction> FailuresOf(IEnumerable<AssetPrediction> list) => list
        .Where(p => p.FailureWindowDays is { } days && days <= _settings.FailureWindowDays)
        .OrderBy(p => p.FailureWindowDays)
        .ThenByDescending(p => p.RiskScore ?? -1)
        .ToList();

    private List<PredictiveAlertRecord> PreventedPredictions(IReadOnlyCollection<AssetInfo> assets, DateTime from, DateTime to)
    {
        var end = to < _utcNow ? to : _utcNow;
        return assets
            .SelectMany(asset => asset.Alerts)
            .Where(alert => alert.PredictedFailureDate is { } predicted && predicted >= from && predicted < end
                && alert.ActualFailureDate is null && IsResolvedStatus(alert.Status))
            .ToList();
    }

    private PredictionAccuracy Accuracy(IReadOnlyCollection<AssetInfo> assets, DateTime from, DateTime to)
    {
        var end = to < _utcNow ? to : _utcNow;
        var tolerance = TimeSpan.FromDays(_settings.ToleranceDays);
        var horizon = TimeSpan.FromDays(_settings.FailureWindowDays);
        int truePositives = 0, falsePositives = 0, trueNegatives = 0, prevented = 0;

        var keys = assets.Select(asset => asset.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var events = _failures.Where(item => keys.Contains(item.AssetKey)).ToList();

        foreach (var asset in assets)
        {
            var failures = events.Where(item => item.AssetKey == asset.Key).Select(item => item.At)
                .Concat(asset.Alerts.Select(alert => alert.ActualFailureDate).OfType<DateTime>())
                .ToList();

            foreach (var alert in asset.Alerts)
            {
                if (alert.PredictedFailureDate is { } predicted)
                {
                    if (predicted < from || predicted >= end)
                    {
                        continue;
                    }

                    if (alert.ActualFailureDate is { } failed)
                    {
                        if ((failed - predicted).Duration() <= tolerance)
                        {
                            truePositives++;
                        }
                        else
                        {
                            falsePositives++;
                        }
                    }
                    else if (IsResolvedStatus(alert.Status))
                    {
                        truePositives++;
                        prevented++;
                    }
                    else
                    {
                        falsePositives++;
                    }
                }
                else
                {
                    var stamp = Stamp(alert);
                    var closes = stamp + horizon;
                    if (stamp == DateTime.MinValue || closes < from || closes >= end)
                    {
                        continue;
                    }

                    if (!failures.Any(failed => failed > stamp && failed <= closes))
                    {
                        trueNegatives++;
                    }
                }
            }
        }

        // A failure nobody predicted in the horizon before it.
        var falseNegatives = events.Count(item => item.At >= from && item.At < end
            && !assets.First(asset => asset.Key == item.AssetKey).Alerts.Any(alert =>
                alert.PredictedFailureDate is not null && Stamp(alert) <= item.At && Stamp(alert) >= item.At - horizon));

        var evaluated = truePositives + falsePositives + trueNegatives + falseNegatives;
        double? Rate(int part, int whole) => whole == 0 ? null : Math.Round(100d * part / whole, 1);
        var accuracy = Rate(truePositives + trueNegatives, evaluated);

        return new PredictionAccuracy(
            accuracy,
            Rate(truePositives, truePositives + falsePositives),
            Rate(truePositives, truePositives + falseNegatives),
            Rate(falsePositives, falsePositives + trueNegatives),
            _settings.AccuracyTarget,
            accuracy is null ? null : accuracy >= _settings.AccuracyTarget,
            evaluated,
            truePositives,
            falsePositives,
            trueNegatives,
            falseNegatives,
            prevented,
            _settings.ToleranceDays);
    }

    private static bool InScope(AssetInfo asset, DashboardDataScope scope, HashSet<string>? scoped, bool registered)
    {
        if (scoped is null)
        {
            return true;
        }

        if (registered)
        {
            return scoped.Contains(asset.Key) || scoped.Contains(asset.AssetId);
        }

        // Not in the register: only the location and asset type on its alerts are known.
        return string.IsNullOrWhiteSpace(scope.Organization)
            && string.IsNullOrWhiteSpace(scope.AssetCategory)
            && (string.IsNullOrWhiteSpace(scope.Location) || string.Equals(asset.Location, scope.Location.Trim(), StringComparison.OrdinalIgnoreCase))
            && (string.IsNullOrWhiteSpace(scope.AssetType) || string.Equals(asset.AssetType, scope.AssetType.Trim(), StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Alert risk levels as the page shows them: Critical / Severe / Very High, High, Medium / At Risk / Moderate / Warning,
    /// Low / Healthy / Normal. Anything else is placed by risk score (80+, 60+, 30+).
    /// </summary>
    public static string Risk(string? value, double? score)
    {
        var text = value?.Trim().ToLowerInvariant();
        return text switch
        {
            "critical" or "severe" or "very high" => Critical,
            "high" => High,
            "medium" or "at risk" or "moderate" or "warning" => Medium,
            "low" or "healthy" or "normal" or "good" => Low,
            _ => score switch
            {
                >= 80 => Critical,
                >= 60 => High,
                >= 30 => Medium,
                _ => Low
            }
        };
    }

    private static bool IsElevated(AssetPrediction prediction) => prediction.RiskLevel is Critical or High;

    private static DateTime Stamp(PredictiveAlertRecord alert) => alert.CreatedAt ?? alert.LastReadingAt ?? DateTime.MinValue;

    private static bool IsResolvedStatus(string? status) =>
        status?.Trim().ToLowerInvariant() is "resolved" or "closed" or "completed" or "cleared";

    private static bool IsClosed(string? status) =>
        status?.Trim().ToLowerInvariant() is "completed" or "closed" or "cancelled" or "canceled";

    private static bool IsCancelled(string? status) => status?.Trim().ToLowerInvariant() is "cancelled" or "canceled";

    private static bool IsFailureWork(string? workType) =>
        workType?.Trim().ToLowerInvariant() is { } text && (text.Contains("corrective") || text.Contains("emergency") || text.Contains("breakdown"));

    private static string CostType(string? type)
    {
        var text = type?.Trim().ToLowerInvariant() ?? string.Empty;
        if (text.Contains("prevent") || text.Contains("inspect") || text.Contains("planned") || text.Contains("predict") || text == "pm")
        {
            return MaintenanceAnalyticsCalculator.Preventive;
        }

        return text.Contains("correct") || text.Contains("emerg") || text.Contains("breakdown") || text.Contains("repair") || text.Contains("reactive")
            ? MaintenanceAnalyticsCalculator.Corrective
            : MaintenanceAnalyticsCalculator.OtherType;
    }

    private static double? Average(IEnumerable<double?> values, int digits = 1)
    {
        var list = values.OfType<double>().ToList();
        return list.Count == 0 ? null : Math.Round(list.Average(), digits);
    }

    private static string Title(string value) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(value.Trim().ToLowerInvariant());

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";
}
