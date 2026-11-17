using MongoDB.Bson;
using MongoDB.Driver;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IReportDataRepository
{
    Task<ReportDataResult> RunAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        int limit,
        CancellationToken cancellationToken = default);

    /// <summary>Y summed per X over all rows, biggest first (date axes in date order).</summary>
    Task<IReadOnlyList<ReportChartGroup>> GetChartGroupsAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        string xAxisField,
        string yAxisField,
        CancellationToken cancellationToken = default);
}

public sealed record ReportDataResult(
    IReadOnlyList<ReportColumn> Columns,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows,
    long TotalRows);

public sealed record ReportChartGroup(object? Label, double Value);

// Reads the Asset service's asset register and the Maintenance/Inspection records joined to it; none of it is written here.
public sealed class ReportDataRepository : IReportDataRepository
{
    private static readonly AggregateOptions Options = new() { AllowDiskUse = true, MaxTime = TimeSpan.FromSeconds(60) };

    private readonly IMongoCollection<BsonDocument> _assets;

    public ReportDataRepository(IMongoDatabase database)
    {
        _assets = database.GetCollection<BsonDocument>(ReportFieldCatalog.AssetCollection);
    }

    public async Task<ReportDataResult> RunAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        int limit,
        CancellationToken cancellationToken = default)
    {
        var builder = new ReportQueryBuilder(definition);
        if (builder.Columns.Count == 0)
        {
            return new ReportDataResult(builder.Columns, [], 0);
        }

        var documents = await (await _assets.AggregateAsync<BsonDocument>(builder.BuildRows(scope, limit), Options, cancellationToken))
            .ToListAsync(cancellationToken);

        var count = await (await _assets.AggregateAsync<BsonDocument>(builder.BuildCount(scope), Options, cancellationToken))
            .FirstOrDefaultAsync(cancellationToken);

        var rows = documents
            .Select(document => (IReadOnlyDictionary<string, object?>)builder.Columns.ToDictionary(
                column => column.Key,
                column => document.TryGetValue(column.Key, out var value) ? ToClrValue(value) : null))
            .ToList();

        return new ReportDataResult(builder.Columns, rows, count?["n"].ToInt64() ?? 0);
    }

    public async Task<IReadOnlyList<ReportChartGroup>> GetChartGroupsAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        string xAxisField,
        string yAxisField,
        CancellationToken cancellationToken = default)
    {
        var pipeline = new ReportQueryBuilder(definition).BuildChart(scope, xAxisField, yAxisField);
        var groups = await (await _assets.AggregateAsync<BsonDocument>(pipeline, Options, cancellationToken))
            .ToListAsync(cancellationToken);

        return groups
            .Select(group => new ReportChartGroup(ToClrValue(group["_id"]), group["value"].IsNumeric ? group["value"].ToDouble() : 0))
            .ToList();
    }

    private static object? ToClrValue(BsonValue value) => value.BsonType switch
    {
        BsonType.Null or BsonType.Undefined => null,
        BsonType.String => value.AsString,
        BsonType.Int32 => value.AsInt32,
        BsonType.Int64 => value.AsInt64,
        BsonType.Double => value.AsDouble,
        BsonType.Decimal128 => Decimal128.ToDecimal(value.AsDecimal128),
        BsonType.Boolean => value.AsBoolean,
        BsonType.DateTime => value.ToUniversalTime(),
        BsonType.Array => value.AsBsonArray.Select(ToClrValue).ToList(),
        _ => value.ToString()
    };
}
