using System.Globalization;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>Row count, newest record and approximate size of a dataset for the tenant / client.</summary>
public sealed record DataExportDatasetStats(long Rows, DateTime? RefreshedAt, long? SizeBytes);

/// <summary>Rows read for an export or preview. Values are string, double, DateTime (UTC) or null, in the order of the fields asked for.</summary>
public sealed record DataExportRows(IReadOnlyList<DataExportDatasetField> Fields, IReadOnlyList<object?[]> Rows, bool Truncated);

public interface IDataExportDataRepository
{
    Task<DataExportDatasetStats> GetStatsAsync(DataExportDataset dataset, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>At most limit rows matching every filter (already built with DataExportFilterBuilder), newest first.</summary>
    Task<DataExportRows> ReadAsync(
        DataExportDataset dataset,
        IReadOnlyList<DataExportDatasetField> fields,
        IReadOnlyList<BsonDocument> filters,
        string? tenantId,
        string? clientId,
        int limit,
        CancellationToken cancellationToken = default);
}

/// <summary>Read-only access to the collections behind the Data Export datasets (see DataExportDatasetCatalog).</summary>
public sealed class DataExportDataRepository : IDataExportDataRepository
{
    private readonly IMongoDatabase _database;

    public DataExportDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<DataExportDatasetStats> GetStatsAsync(
        DataExportDataset dataset,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken = default)
    {
        var collection = _database.GetCollection<BsonDocument>(dataset.Collection);
        var match = ScopeMatch(tenantId, clientId);
        var rows = await collection.CountDocumentsAsync(match, cancellationToken: cancellationToken);
        if (rows == 0)
        {
            return new DataExportDatasetStats(0, null, 0);
        }

        DateTime? refreshed = null;
        foreach (var field in new[] { "updated_at", "created_at" })
        {
            var latest = await collection
                .Find(new BsonDocument(match) { { field, new BsonDocument("$type", "date") } })
                .Sort(new BsonDocument(field, -1))
                .Project(new BsonDocument(field, 1))
                .FirstOrDefaultAsync(cancellationToken);
            if (latest is not null && latest.TryGetValue(field, out var value) && value.IsValidDateTime)
            {
                var at = value.ToUniversalTime();
                refreshed = refreshed is null || at > refreshed ? at : refreshed;
            }
        }

        long? size = null;
        try
        {
            var stats = await _database.RunCommandAsync<BsonDocument>(new BsonDocument("collStats", dataset.Collection), cancellationToken: cancellationToken);
            if (stats.TryGetValue("avgObjSize", out var average) && average.IsNumeric)
            {
                size = (long)Math.Round(average.ToDouble() * rows);
            }
        }
        catch (MongoException)
        {
            // collStats is not allowed or not available; the size is left unknown.
        }

        return new DataExportDatasetStats(rows, refreshed, size);
    }

    public async Task<DataExportRows> ReadAsync(
        DataExportDataset dataset,
        IReadOnlyList<DataExportDatasetField> fields,
        IReadOnlyList<BsonDocument> filters,
        string? tenantId,
        string? clientId,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var match = ScopeMatch(tenantId, clientId);
        if (filters.Count > 0)
        {
            match.Add("$and", new BsonArray(filters));
        }

        var projection = new BsonDocument();
        foreach (var path in fields.SelectMany(field => field.Paths).Distinct())
        {
            projection[path] = 1;
        }

        var documents = await _database.GetCollection<BsonDocument>(dataset.Collection)
            .Find(match)
            .Sort(new BsonDocument { { "created_at", -1 }, { "_id", 1 } })
            .Project(projection)
            .Limit(limit + 1)
            .ToListAsync(cancellationToken);

        var rows = documents
            .Take(limit)
            .Select(document => fields.Select(field => Read(document, field)).ToArray())
            .ToList();

        return new DataExportRows(fields, rows, documents.Count > limit);
    }

    private static BsonDocument ScopeMatch(string? tenantId, string? clientId)
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

    private static object? Read(BsonDocument document, DataExportDatasetField field)
    {
        foreach (var path in field.Paths)
        {
            var value = Value(document, path);
            if (value is null || value.IsBsonNull || value.IsString && string.IsNullOrWhiteSpace(value.AsString))
            {
                continue;
            }

            return field.Type switch
            {
                DataExportFieldTypes.Date => AsDate(value) ?? (object?)Text(value),
                _ when DataExportFieldTypes.IsNumeric(field.Type) => AsNumber(value) ?? (object?)Text(value),
                _ => Text(value)
            };
        }

        return null;
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

    private static DateTime? AsDate(BsonValue value)
    {
        if (value.IsValidDateTime)
        {
            return value.ToUniversalTime();
        }

        return value.IsString && DateTime.TryParse(value.AsString, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed)
            ? parsed
            : null;
    }

    private static double? AsNumber(BsonValue value) => value switch
    {
        { IsNumeric: true } => value.ToDouble(),
        { IsString: true } when double.TryParse(value.AsString, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };

    private static string? Text(BsonValue value) => value switch
    {
        { IsString: true } => value.AsString.Trim(),
        { IsBoolean: true } => value.AsBoolean ? "Yes" : "No",
        { IsBsonArray: true } => string.Join(", ", value.AsBsonArray.Where(item => !item.IsBsonDocument && !item.IsBsonNull).Select(item => Text(item))),
        { IsBsonDocument: true } => value.AsBsonDocument.ToJson(),
        { IsValidDateTime: true } => value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture),
        { IsNumeric: true } => value.ToDouble().ToString(CultureInfo.InvariantCulture),
        _ => value.ToString()
    };
}
