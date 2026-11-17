using System.Globalization;
using MongoDB.Bson;
using MongoDB.Driver;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>A Tracking service IoTDevice. Health is its status (Good, Warning or Critical).</summary>
public sealed record IotDeviceRecord(
    string MongoId,
    string? DeviceId,
    string? DeviceName,
    string? DeviceType,
    string? Model,
    string? Connectivity,
    string? Health,
    string? AssetRegistrationId,
    string? AssetName,
    string? PowerSource,
    double? BatteryLevel,
    DateTime? LastSeenAt,
    DateTime? CreatedAt);

/// <summary>A Tracking service DeviceHealth record: the latest connectivity, signal and health (Healthy, Attention, Critical or Maintenance).</summary>
public sealed record IotDeviceHealthRecord(
    string? DeviceId,
    string? AssetRegistrationId,
    string? SiteName,
    string? Connectivity,
    double? SignalStrengthDbm,
    string? Health,
    DateTime? LastSeenAt);

/// <summary>A Tracking service Sensor. Status is Active, Offline, Attention or Inactive.</summary>
public sealed record IotSensorRecord(
    string? SensorId,
    string? SensorType,
    string? MeasuredParameter,
    string? Unit,
    string? DeviceId,
    string? AssetRegistrationId,
    string? Status);

public sealed record IotSensorAnomaly(DateTime DetectedAt, string? Metric, double? Value, string? Severity);

/// <summary>A sensor alert from predictive_maintenance_alerts: the reading of one device against its threshold.</summary>
public sealed record IotSensorAlertRecord(
    string MongoId,
    string? AssetId,
    string? AssetName,
    string? Location,
    string? SensorType,
    double? ThresholdValue,
    string? AlertCondition,
    string? DeviceId,
    double? LastReading,
    DateTime? LastReadingAt,
    string? RiskLevel,
    string? Status,
    DateTime? CreatedAt,
    DateTime? UpdatedAt,
    IReadOnlyList<IotSensorAnomaly> Anomalies);

/// <summary>A Tracking service LocationEvent (Entered Zone, Departed Zone, Geofence Alert or Dwell Exceeded).</summary>
public sealed record IotLocationEventRecord(string? EventId, DateTime EventTime, string? AssetId, string? EventType, string? ZoneName);

/// <summary>A master data site with its coordinates (null when not recorded).</summary>
public sealed record IotSiteRecord(string MongoId, string? Name, string? Code, string? Organization, double? Latitude, double? Longitude);

/// <summary>
/// Reads what IoT &amp; Utilization Analytics needs beyond the asset register: the Tracking service's devices, device health, sensors and
/// location events, sensor alerts (predictive_maintenance_alerts) and site coordinates (master_sites). Nothing is written.
/// </summary>
public interface IIotUtilizationAnalyticsDataRepository
{
    Task<IReadOnlyList<IotDeviceRecord>> GetDevicesAsync(string? tenantId, string? clientId, string? deviceType, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<IotDeviceHealthRecord>> GetDeviceHealthAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<IotSensorRecord>> GetSensorsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<IotSensorAlertRecord>> GetSensorAlertsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Location events in [fromUtc, toUtc).</summary>
    Task<IReadOnlyList<IotLocationEventRecord>> GetLocationEventsAsync(
        string? tenantId,
        string? clientId,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<IotSiteRecord>> GetSitesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Device Type filter values: the distinct IoTDevice device types.</summary>
    Task<IReadOnlyList<string>> GetDeviceTypesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class IotUtilizationAnalyticsDataRepository : IIotUtilizationAnalyticsDataRepository
{
    public const string DeviceCollection = "IoTDevice";
    public const string DeviceHealthCollection = "DeviceHealth";
    public const string SensorCollection = "Sensor";
    public const string LocationEventCollection = "LocationEvent";
    public const string SensorAlertCollection = "predictive_maintenance_alerts";
    public const string SiteCollection = "master_sites";

    private readonly IMongoDatabase _database;

    public IotUtilizationAnalyticsDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<IReadOnlyList<IotDeviceRecord>> GetDevicesAsync(
        string? tenantId,
        string? clientId,
        string? deviceType,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(tenantId, clientId);
        if (!string.IsNullOrWhiteSpace(deviceType))
        {
            match["device_type"] = new BsonRegularExpression($"^{System.Text.RegularExpressions.Regex.Escape(deviceType.Trim())}$", "i");
        }

        var documents = await _database.GetCollection<BsonDocument>(DeviceCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "device_id", 1 }, { "device_name", 1 }, { "device_type", 1 }, { "model", 1 }, { "connectivity", 1 }, { "status", 1 },
                { "asset_registration_id", 1 }, { "asset_name", 1 }, { "power_source", 1 }, { "battery_level", 1 }, { "last_seen_at", 1 }, { "created_at", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new IotDeviceRecord(
            document["_id"].ToString()!,
            Text(document, "device_id"),
            Text(document, "device_name"),
            Text(document, "device_type"),
            Text(document, "model"),
            Text(document, "connectivity"),
            Text(document, "status"),
            Text(document, "asset_registration_id"),
            Text(document, "asset_name"),
            Text(document, "power_source"),
            Number(document, "battery_level"),
            Date(document, "last_seen_at"),
            Date(document, "created_at"))).ToList();
    }

    public async Task<IReadOnlyList<IotDeviceHealthRecord>> GetDeviceHealthAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(DeviceHealthCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument
            {
                { "device_id", 1 }, { "asset_registration_id", 1 }, { "site_name", 1 }, { "connectivity", 1 }, { "signal_strength_dbm", 1 },
                { "status", 1 }, { "last_seen_at", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new IotDeviceHealthRecord(
            Text(document, "device_id"),
            Text(document, "asset_registration_id"),
            Text(document, "site_name"),
            Text(document, "connectivity"),
            Number(document, "signal_strength_dbm"),
            Text(document, "status"),
            Date(document, "last_seen_at"))).ToList();
    }

    public async Task<IReadOnlyList<IotSensorRecord>> GetSensorsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SensorCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument
            {
                { "sensor_id", 1 }, { "sensor_type", 1 }, { "measured_parameter", 1 }, { "unit", 1 }, { "device_id", 1 }, { "asset_registration_id", 1 }, { "status", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new IotSensorRecord(
            Text(document, "sensor_id"),
            Text(document, "sensor_type"),
            Text(document, "measured_parameter"),
            Text(document, "unit"),
            Text(document, "device_id"),
            Text(document, "asset_registration_id"),
            Text(document, "status"))).ToList();
    }

    public async Task<IReadOnlyList<IotSensorAlertRecord>> GetSensorAlertsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SensorAlertCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument
            {
                { "asset_id", 1 }, { "asset_name", 1 }, { "location", 1 }, { "sensor_type", 1 }, { "threshold_value", 1 }, { "alert_condition", 1 },
                { "data_source_device_id", 1 }, { "last_reading", 1 }, { "last_reading_at", 1 }, { "risk_level", 1 }, { "status", 1 },
                { "created_at", 1 }, { "updated_at", 1 }, { "anomalies", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document =>
        {
            var anomalies = new List<IotSensorAnomaly>();
            if (document.TryGetValue("anomalies", out var list) && list.IsBsonArray)
            {
                foreach (var anomaly in list.AsBsonArray.OfType<BsonDocument>())
                {
                    if (Date(anomaly, "detected_at") is { } detectedAt)
                    {
                        anomalies.Add(new IotSensorAnomaly(detectedAt, Text(anomaly, "metric"), Number(anomaly, "value"), Text(anomaly, "severity")));
                    }
                }
            }

            return new IotSensorAlertRecord(
                document["_id"].ToString()!,
                Text(document, "asset_id"),
                Text(document, "asset_name"),
                Text(document, "location"),
                Text(document, "sensor_type"),
                Number(document, "threshold_value"),
                Text(document, "alert_condition"),
                Text(document, "data_source_device_id"),
                Number(document, "last_reading"),
                Date(document, "last_reading_at"),
                Text(document, "risk_level"),
                Text(document, "status"),
                Date(document, "created_at"),
                Date(document, "updated_at"),
                anomalies);
        }).ToList();
    }

    public async Task<IReadOnlyList<IotLocationEventRecord>> GetLocationEventsAsync(
        string? tenantId,
        string? clientId,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(tenantId, clientId);
        match["event_time"] = new BsonDocument { { "$gte", fromUtc }, { "$lt", toUtc } };

        var documents = await _database.GetCollection<BsonDocument>(LocationEventCollection)
            .Find(match)
            .Project(new BsonDocument { { "event_id", 1 }, { "event_time", 1 }, { "asset_id", 1 }, { "event_type", 1 }, { "zone_name", 1 } })
            .ToListAsync(cancellationToken);

        return documents
            .Where(document => Date(document, "event_time") is not null)
            .Select(document => new IotLocationEventRecord(
                Text(document, "event_id"),
                Date(document, "event_time")!.Value,
                Text(document, "asset_id"),
                Text(document, "event_type"),
                Text(document, "zone_name")))
            .ToList();
    }

    public async Task<IReadOnlyList<IotSiteRecord>> GetSitesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SiteCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument { { "site_name", 1 }, { "code", 1 }, { "organization", 1 }, { "latitude", 1 }, { "longitude", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new IotSiteRecord(
            document["_id"].ToString()!,
            Text(document, "site_name"),
            Text(document, "code"),
            Text(document, "organization.name") ?? (Value(document, "organization") is { IsString: true } organization ? organization.AsString : null),
            Number(document, "latitude"),
            Number(document, "longitude"))).ToList();
    }

    public async Task<IReadOnlyList<string>> GetDeviceTypesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var values = await (await _database.GetCollection<BsonDocument>(DeviceCollection)
                .DistinctAsync<BsonValue>("device_type", TenantMatch(tenantId, clientId), cancellationToken: cancellationToken))
            .ToListAsync(cancellationToken);

        return values
            .Where(value => value.IsString && !string.IsNullOrWhiteSpace(value.AsString))
            .Select(value => value.AsString.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static BsonDocument TenantMatch(string? tenantId, string? clientId)
    {
        var match = new BsonDocument("is_deleted", new BsonDocument("$ne", true));
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            match["tenant_id"] = tenantId.Trim();
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            match["client_id"] = clientId.Trim();
        }

        return match;
    }

    private static BsonValue? Value(BsonDocument document, string path)
    {
        BsonValue current = document;
        foreach (var part in path.Split('.'))
        {
            if (!current.IsBsonDocument || !current.AsBsonDocument.TryGetValue(part, out current!))
            {
                return null;
            }
        }

        return current;
    }

    private static string? Text(BsonDocument document, string path) =>
        Value(document, path) is { } value && !value.IsBsonNull && !value.IsBsonDocument && !value.IsBsonArray
            && value.ToString() is { Length: > 0 } text && !string.IsNullOrWhiteSpace(text)
            ? (value.IsString ? value.AsString.Trim() : text)
            : null;

    private static DateTime? Date(BsonDocument document, string path) =>
        Value(document, path) is { } value && value.IsValidDateTime ? value.ToUniversalTime() : null;

    private static double? Number(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsNumeric: true } value => value.ToDouble(),
        { IsString: true } value when double.TryParse(value.AsString, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };
}
