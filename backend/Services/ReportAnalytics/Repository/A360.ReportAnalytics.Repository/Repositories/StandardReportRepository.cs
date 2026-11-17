using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public sealed class StandardReportRepository
    : MongoRepository<StandardReport>, IStandardReportRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "StandardReport";

    public const string OnDemandFrequency = "On demand";

    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;

    // Sort keys accepted from the table headers, mapped to stored fields.
    public static readonly IReadOnlyDictionary<string, string> SortFields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["reportName"] = "report_name",
        ["category"] = "category",
        ["reportPeriod"] = "report_period_from",
        ["generatedOn"] = "generated_on",
        ["nextScheduled"] = "next_scheduled_on",
        ["frequency"] = "frequency",
        ["status"] = "status"
    };

    private static readonly Collation CaseInsensitive = new("en", strength: CollationStrength.Secondary);

    public StandardReportRepository(IMongoDatabase database)
        : base(database.GetCollection<StandardReport>(CollectionName))
    {
    }

    public async Task<StandardReport?> GetByReportIdAsync(string reportId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reportId))
        {
            return null;
        }

        return await Collection
            .Find(report => report.ReportId == reportId.Trim() && !report.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<StandardReportQueryResult> QueryAsync(StandardReportQuery query, CancellationToken cancellationToken = default)
    {
        var builder = Builders<StandardReport>.Filter;
        var filters = new List<FilterDefinition<StandardReport>> { ScopeFilter(query.TenantId, query.ClientId) };

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filters.Add(builder.Or(
                builder.Regex(report => report.ReportName, pattern),
                builder.Regex(report => report.ReportId, pattern),
                builder.Regex(report => report.Category, pattern)));
        }

        AddExactMatch(filters, "category", query.Category);
        AddExactMatch(filters, "frequency", query.Frequency);
        AddExactMatch(filters, "status", query.Status);

        if (query.PeriodFrom is not null)
        {
            filters.Add(builder.Gte(report => report.ReportPeriodTo, query.PeriodFrom));
        }

        if (query.PeriodTo is not null)
        {
            filters.Add(builder.Lte(report => report.ReportPeriodFrom, query.PeriodTo));
        }

        var filter = builder.And(filters);

        var sortField = query.SortBy is not null && SortFields.TryGetValue(query.SortBy, out var field) ? field : "report_name";
        var sortBuilder = Builders<StandardReport>.Sort;
        var sort = sortBuilder.Combine(
            query.SortDescending ? sortBuilder.Descending(sortField) : sortBuilder.Ascending(sortField),
            sortBuilder.Ascending(report => report.Id));

        var find = Collection
            .Find(filter, new FindOptions { Collation = CaseInsensitive })
            .Sort(sort);

        if (query.PageSize > 0)
        {
            var page = query.Page < 1 ? 1 : query.Page;
            var pageSize = query.PageSize > MaxPageSize ? DefaultPageSize : query.PageSize;
            find = find.Skip((page - 1) * pageSize).Limit(pageSize);
        }

        var items = await find.ToListAsync(cancellationToken);
        var totalCount = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);

        return new StandardReportQueryResult(items, totalCount);
    }

    public async Task<StandardReportSummary> GetSummaryAsync(
        string? tenantId,
        string? clientId,
        DateTime monthStartUtc,
        DateTime monthEndUtc,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<StandardReport>.Filter;
        var scope = ScopeFilter(tenantId, clientId);

        var withDateFilters = builder.And(
            scope,
            builder.Ne(report => report.ReportPeriodFrom, null),
            builder.Ne(report => report.ReportPeriodTo, null));

        var scheduled = builder.And(
            scope,
            builder.Ne(report => report.NextScheduledOn, null),
            builder.Ne(report => report.Frequency, OnDemandFrequency));

        // A report never edited since creation counts by its creation date.
        var updatedThisMonth = builder.And(
            scope,
            builder.Or(
                builder.And(builder.Gte(report => report.UpdatedAt, monthStartUtc), builder.Lt(report => report.UpdatedAt, monthEndUtc)),
                builder.And(
                    builder.Eq(report => report.UpdatedAt, null),
                    builder.Gte(report => report.CreatedAt, monthStartUtc),
                    builder.Lt(report => report.CreatedAt, monthEndUtc))));

        return new StandardReportSummary(
            await Collection.CountDocumentsAsync(scope, cancellationToken: cancellationToken),
            await Collection.CountDocumentsAsync(withDateFilters, cancellationToken: cancellationToken),
            await Collection.CountDocumentsAsync(scheduled, cancellationToken: cancellationToken),
            await Collection.CountDocumentsAsync(updatedThisMonth, cancellationToken: cancellationToken));
    }

    public async Task<IReadOnlyCollection<StandardReport>> GetCalendarReportsAsync(
        string? tenantId,
        string? clientId,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<StandardReport>.Filter;

        FilterDefinition<StandardReport> InRange(System.Linq.Expressions.Expression<Func<StandardReport, DateTime?>> field) =>
            builder.And(builder.Gte(field, fromUtc), builder.Lt(field, toUtc));

        var filter = builder.And(
            ScopeFilter(tenantId, clientId),
            builder.Or(
                InRange(report => report.GeneratedOn),
                InRange(report => report.NextScheduledOn),
                InRange(report => report.ReviewDueOn)));

        return await Collection
            .Find(filter)
            .Project(report => new StandardReport
            {
                Id = report.Id,
                GeneratedOn = report.GeneratedOn,
                NextScheduledOn = report.NextScheduledOn,
                ReviewDueOn = report.ReviewDueOn
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> NameExistsAsync(
        string reportName,
        string? tenantId,
        string? clientId,
        string? excludeId,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<StandardReport>.Filter;
        var filter = builder.And(
            builder.Eq(report => report.IsDeleted, false),
            builder.Eq(report => report.TenantId, tenantId),
            builder.Eq(report => report.ClientId, clientId),
            builder.Eq(report => report.ReportName, reportName.Trim()));

        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            filter &= builder.Ne(report => report.Id, excludeId);
        }

        return await Collection
            .Find(filter, new FindOptions { Collation = CaseInsensitive })
            .AnyAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<StandardReport>(
                Builders<StandardReport>.IndexKeys.Ascending(report => report.ReportId),
                new CreateIndexOptions { Name = "ux_standard_report_report_id", Unique = true }),
            new CreateIndexModel<StandardReport>(
                Builders<StandardReport>.IndexKeys
                    .Ascending(report => report.TenantId)
                    .Ascending(report => report.ClientId)
                    .Ascending(report => report.ReportName),
                new CreateIndexOptions { Name = "ix_standard_report_tenant_id_client_id_report_name", Collation = CaseInsensitive }),
            new CreateIndexModel<StandardReport>(
                Builders<StandardReport>.IndexKeys.Ascending(report => report.NextScheduledOn),
                new CreateIndexOptions { Name = "ix_standard_report_next_scheduled_on" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<StandardReport> ScopeFilter(string? tenantId, string? clientId)
    {
        var builder = Builders<StandardReport>.Filter;
        var filter = builder.Eq(report => report.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(report => report.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(report => report.ClientId, clientId.Trim());
        }

        return filter;
    }

    private static void AddExactMatch(
        List<FilterDefinition<StandardReport>> filters,
        string field,
        string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            filters.Add(Builders<StandardReport>.Filter.Regex(field, new BsonRegularExpression($"^{Regex.Escape(value.Trim())}$", "i")));
        }
    }
}
