using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;

namespace A360.Asset.Repository.Repositories;

/// <summary>Records of other services shown as choices on the Update Asset Status &amp; Condition page.</summary>
public interface IStatusConditionLookupRepository
{
    /// <summary>Maintenance work orders of the asset, latest scheduled first.</summary>
    /// <param name="assetKeys">The asset's registration id and tag (work orders may store either).</param>
    Task<IReadOnlyCollection<StatusConditionWorkOrderLookup>> FindWorkOrdersAsync(IReadOnlyCollection<string> assetKeys, int limit, CancellationToken cancellationToken = default);

    /// <summary>Inspection types and inspection tasks set up for the asset.</summary>
    Task<IReadOnlyCollection<StatusConditionInspectionLookup>> FindInspectionsAsync(IReadOnlyCollection<string> assetKeys, int limit, CancellationToken cancellationToken = default);

    /// <summary>Active failure reasons of the Inspection master data.</summary>
    Task<IReadOnlyCollection<StatusConditionFailureReasonLookup>> FindFailureReasonsAsync(int limit, CancellationToken cancellationToken = default);
}

/// <summary>
/// Read-only view of the Maintenance (work_orders) and Inspection (inspection_types, inspection_tasks,
/// failure_reasons) collections, which share this service's database. Deleted and inactive records are left out.
/// </summary>
public sealed class StatusConditionLookupRepository(IMongoDatabase database) : IStatusConditionLookupRepository
{
    private static readonly Collation CaseInsensitive = new("en", strength: CollationStrength.Secondary);

    public async Task<IReadOnlyCollection<StatusConditionWorkOrderLookup>> FindWorkOrdersAsync(
        IReadOnlyCollection<string> assetKeys, int limit, CancellationToken cancellationToken = default)
    {
        if (assetKeys.Count == 0)
        {
            return [];
        }

        var builder = Builders<StatusConditionWorkOrderLookup>.Filter;
        return await database.GetCollection<StatusConditionWorkOrderLookup>("work_orders")
            .Find(builder.And(builder.Ne("is_deleted", true), builder.In("asset_id", assetKeys)), new FindOptions { Collation = CaseInsensitive })
            .Sort(Builders<StatusConditionWorkOrderLookup>.Sort.Descending("scheduled_date").Descending("created_at"))
            .Limit(limit)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<StatusConditionInspectionLookup>> FindInspectionsAsync(
        IReadOnlyCollection<string> assetKeys, int limit, CancellationToken cancellationToken = default)
    {
        if (assetKeys.Count == 0)
        {
            return [];
        }

        var filter = new BsonDocument
        {
            { "is_deleted", new BsonDocument("$ne", true) },
            { "is_active", new BsonDocument("$ne", false) },
            { "asset_id", new BsonDocument("$in", new BsonArray(assetKeys)) }
        };
        var options = new FindOptions { Collation = CaseInsensitive };

        var types = await database.GetCollection<BsonDocument>("inspection_types")
            .Find(filter, options).Limit(limit).ToListAsync(cancellationToken);
        var tasks = await database.GetCollection<BsonDocument>("inspection_tasks")
            .Find(filter, options).Limit(limit).ToListAsync(cancellationToken);

        return types.Select(d => new StatusConditionInspectionLookup(Text(d, "inspection_type_code"), Text(d, "inspection_type_name"), "Inspection Type"))
            .Concat(tasks.Select(d => new StatusConditionInspectionLookup(Text(d, "task_code"), Text(d, "task_title"), "Inspection Task")))
            .Where(i => !string.IsNullOrWhiteSpace(i.Code))
            .Take(limit)
            .ToList();
    }

    public async Task<IReadOnlyCollection<StatusConditionFailureReasonLookup>> FindFailureReasonsAsync(int limit, CancellationToken cancellationToken = default)
    {
        var filter = new BsonDocument
        {
            { "is_deleted", new BsonDocument("$ne", true) },
            { "is_active", new BsonDocument("$ne", false) }
        };
        var docs = await database.GetCollection<BsonDocument>("failure_reasons")
            .Find(filter).Sort(new BsonDocument("failure_reason_name", 1)).Limit(limit).ToListAsync(cancellationToken);

        return docs
            .Select(d => new StatusConditionFailureReasonLookup(
                Text(d, "failure_reason_code"), Text(d, "failure_reason_name"), Text(d, "failure_category"), Text(d, "severity")))
            .Where(r => !string.IsNullOrWhiteSpace(r.Name))
            .ToList();
    }

    private static string Text(BsonDocument doc, string field) =>
        doc.TryGetValue(field, out var value) && value.IsString ? value.AsString.Trim() : string.Empty;
}

[BsonIgnoreExtraElements]
public sealed class StatusConditionWorkOrderLookup
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string Id { get; set; } = string.Empty;

    [BsonElement("work_order_id")]
    public string WorkOrderId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string? Title { get; set; }

    [BsonElement("work_type")]
    public string? WorkType { get; set; }

    [BsonElement("priority")]
    public string? Priority { get; set; }

    [BsonElement("status")]
    public string? Status { get; set; }

    [BsonElement("scheduled_date")]
    public DateTime? ScheduledDate { get; set; }
}

public sealed record StatusConditionInspectionLookup(string Code, string Name, string Kind);

public sealed record StatusConditionFailureReasonLookup(string Code, string Name, string Category, string Severity);
