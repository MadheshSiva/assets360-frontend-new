using MongoDB.Bson;
using MongoDB.Driver;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>One sensor anomaly recorded on a predictive alert (anomalies[]: detected_at, metric, value, severity).</summary>
public sealed record PredictiveAnomaly(DateTime DetectedAt, string Metric, double? Value, string? Severity);

/// <summary>
/// A prediction from the Maintenance service's predictive_maintenance_alerts. Health score, confidence, predicted / actual failure dates,
/// model, issue, recommended action, location, asset type and anomalies are read when a record carries them.
/// </summary>
public sealed record PredictiveAlertRecord(
    string Id,
    string? AssetId,
    string? AssetName,
    string? AssetType,
    string? Location,
    string? SensorType,
    string? ModelName,
    string? RiskLevel,
    string? Status,
    double? HealthScore,
    double? Confidence,
    string? PredictedIssue,
    DateTime? PredictedFailureDate,
    DateTime? ActualFailureDate,
    string? RecommendedAction,
    string? WorkOrderId,
    double? LastReading,
    double? ThresholdValue,
    DateTime? LastReadingAt,
    DateTime? CreatedAt,
    DateTime? UpdatedAt,
    IReadOnlyList<PredictiveAnomaly> Anomalies);

public interface IPredictiveAnalyticsDataRepository
{
    /// <summary>Every predictive alert in the tenant; assetKeys (business id or Mongo _id) narrows them when given.</summary>
    Task<IReadOnlyList<PredictiveAlertRecord>> GetAlertsAsync(
        string? tenantId, string? clientId, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    /// <summary>Locations and asset types recorded on the alerts, for assets that are not in the asset register.</summary>
    Task<(IReadOnlyList<string> Locations, IReadOnlyList<string> AssetTypes)> GetAlertFilterValuesAsync(
        string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

/// <summary>Read-only access to predictive_maintenance_alerts for Predictive Analytics. Nothing is written.</summary>
public sealed class PredictiveAnalyticsDataRepository : IPredictiveAnalyticsDataRepository
{
    public const string AlertCollection = "predictive_maintenance_alerts";

    private readonly IMongoDatabase _database;

    public PredictiveAnalyticsDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<IReadOnlyList<PredictiveAlertRecord>> GetAlertsAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(tenantId, clientId);
        if (assetKeys is not null)
        {
            match["asset_id"] = new BsonDocument("$in", new BsonArray(assetKeys));
        }

        var documents = await _database.GetCollection<BsonDocument>(AlertCollection)
            .Find(match)
            .ToListAsync(cancellationToken);

        return documents.Select(document => new PredictiveAlertRecord(
            document["_id"].ToString()!,
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "asset_type"),
            Text(document, "location"),
            Text(document, "sensor_type"),
            Text(document, "model_name"),
            Text(document, "risk_level"),
            Text(document, "status"),
            Number(document, "health_score"),
            Number(document, "confidence"),
            Text(document, "predicted_issue"),
            Date(document, "predicted_failure_date"),
            Date(document, "actual_failure_date"),
            Text(document, "recommended_action"),
            Text(document, "work_order_id"),
            Number(document, "last_reading"),
            Number(document, "threshold_value"),
            Date(document, "last_reading_at"),
            Date(document, "created_at"),
            Date(document, "updated_at"),
            Anomalies(document))).ToList();
    }

    public async Task<(IReadOnlyList<string> Locations, IReadOnlyList<string> AssetTypes)> GetAlertFilterValuesAsync(
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken = default)
    {
        var collection = _database.GetCollection<BsonDocument>(AlertCollection);
        return (await DistinctTextAsync(collection, "location", TenantMatch(tenantId, clientId), cancellationToken),
            await DistinctTextAsync(collection, "asset_type", TenantMatch(tenantId, clientId), cancellationToken));
    }

    private static IReadOnlyList<PredictiveAnomaly> Anomalies(BsonDocument document)
    {
        if (!document.TryGetValue("anomalies", out var value) || !value.IsBsonArray)
        {
            return [];
        }

        return value.AsBsonArray
            .OfType<BsonDocument>()
            .Select(item => (Detected: Date(item, "detected_at"), Metric: Text(item, "metric"), Value: Number(item, "value"), Severity: Text(item, "severity")))
            .Where(item => item.Detected is not null && item.Metric is not null)
            .Select(item => new PredictiveAnomaly(item.Detected!.Value, item.Metric!, item.Value, item.Severity))
            .ToList();
    }

    private static async Task<IReadOnlyList<string>> DistinctTextAsync(
        IMongoCollection<BsonDocument> collection,
        string field,
        BsonDocument match,
        CancellationToken cancellationToken)
    {
        var values = await (await collection.DistinctAsync<BsonValue>(field, match, cancellationToken: cancellationToken)).ToListAsync(cancellationToken);

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

    private static BsonValue? Value(BsonDocument document, string path) =>
        document.TryGetValue(path, out var value) && !value.IsBsonNull ? value : null;

    private static string? Text(BsonDocument document, string path) =>
        Value(document, path) is { } value && value.ToString() is { } text && !string.IsNullOrWhiteSpace(text)
            ? (value.IsString ? value.AsString.Trim() : text)
            : null;

    private static DateTime? Date(BsonDocument document, string path) =>
        Value(document, path) is { } value && value.IsValidDateTime ? value.ToUniversalTime() : null;

    private static double? Number(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsNumeric: true } value => value.ToDouble(),
        { IsString: true } value when double.TryParse(value.AsString, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };
}
