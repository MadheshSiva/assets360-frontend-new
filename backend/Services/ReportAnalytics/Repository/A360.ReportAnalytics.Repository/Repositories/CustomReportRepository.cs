using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public sealed class CustomReportRepository
    : MongoRepository<CustomReport>, ICustomReportRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "CustomReport";

    public const string PrivateVisibility = "Private";

    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;

    public static readonly IReadOnlyDictionary<string, string> SortFields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        ["updatedAt"] = "updated_at",
        ["reportName"] = "report_name",
        ["module"] = "module",
        ["owner"] = "owner_name",
        ["status"] = "status"
    };

    private static readonly Collation CaseInsensitive = new("en", strength: CollationStrength.Secondary);

    public CustomReportRepository(IMongoDatabase database)
        : base(database.GetCollection<CustomReport>(CollectionName))
    {
    }

    public async Task<CustomReport?> GetByReportIdAsync(string reportId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reportId))
        {
            return null;
        }

        return await Collection
            .Find(report => report.ReportId == reportId.Trim() && !report.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<CustomReport>> GetByReportIdsAsync(
        IReadOnlyCollection<string> reportIds,
        CancellationToken cancellationToken = default)
    {
        return await Collection
            .Find(Builders<CustomReport>.Filter.And(
                Builders<CustomReport>.Filter.In(report => report.ReportId, reportIds),
                Builders<CustomReport>.Filter.Eq(report => report.IsDeleted, false)))
            .ToListAsync(cancellationToken);
    }

    public async Task<CustomReportQueryResult> QueryAsync(CustomReportQuery query, CancellationToken cancellationToken = default)
    {
        var builder = Builders<CustomReport>.Filter;
        var filters = new List<FilterDefinition<CustomReport>> { ScopeFilter(query.Scope) };

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filters.Add(builder.Or(
                builder.Regex(report => report.ReportName, pattern),
                builder.Regex(report => report.ReportId, pattern),
                builder.Regex(report => report.Description, pattern),
                builder.Regex(report => report.OwnerName, pattern)));
        }

        if (!string.IsNullOrWhiteSpace(query.OwnerId))
        {
            filters.Add(builder.Eq(report => report.OwnerId, query.OwnerId.Trim()));
        }

        AddExactMatch(filters, "module", query.Module);
        AddExactMatch(filters, "status", query.Status);

        if (query.UpdatedSince is not null)
        {
            filters.Add(builder.Gte(report => report.UpdatedAt, query.UpdatedSince));
        }

        if (query.FavoritesOnly)
        {
            // No viewer means no favourites to show.
            filters.Add(string.IsNullOrWhiteSpace(query.Scope.ViewerId)
                ? builder.Eq(report => report.Id, ObjectId.Empty.ToString())
                : builder.AnyEq(report => report.FavoritedBy, query.Scope.ViewerId));
        }

        var filter = builder.And(filters);

        var sortField = query.SortBy is not null && SortFields.TryGetValue(query.SortBy, out var field) ? field : "updated_at";
        var descending = query.SortDescending;
        var sortBuilder = Builders<CustomReport>.Sort;
        var sort = sortBuilder.Combine(
            descending ? sortBuilder.Descending(sortField) : sortBuilder.Ascending(sortField),
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

        return new CustomReportQueryResult(items, totalCount);
    }

    public async Task<IReadOnlyDictionary<string, long>> CountByStatusAsync(CustomReportScope scope, CancellationToken cancellationToken = default)
    {
        var groups = await Collection
            .Aggregate()
            .Match(ScopeFilter(scope))
            .Group(report => report.Status, group => new { Status = group.Key, Count = group.LongCount() })
            .ToListAsync(cancellationToken);

        return groups.ToDictionary(group => group.Status ?? string.Empty, group => group.Count);
    }

    public async Task<IReadOnlyCollection<CustomReportOwner>> GetOwnersAsync(CustomReportScope scope, CancellationToken cancellationToken = default)
    {
        var owners = await Collection
            .Aggregate()
            .Match(Builders<CustomReport>.Filter.And(ScopeFilter(scope), Builders<CustomReport>.Filter.Ne(report => report.OwnerId, null)))
            .Group(report => report.OwnerId, group => new { OwnerId = group.Key, OwnerName = group.Max(report => report.OwnerName) })
            .ToListAsync(cancellationToken);

        return owners
            .Select(owner => new CustomReportOwner(owner.OwnerId!, owner.OwnerName))
            .OrderBy(owner => owner.OwnerName ?? owner.OwnerId, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<bool> SetFavoriteAsync(string id, string userId, bool isFavorite, CancellationToken cancellationToken = default)
    {
        var update = isFavorite
            ? Builders<CustomReport>.Update.AddToSet(report => report.FavoritedBy, userId)
            : Builders<CustomReport>.Update.Pull(report => report.FavoritedBy, userId);

        var result = await Collection.UpdateOneAsync(report => report.Id == id, update, cancellationToken: cancellationToken);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<CustomReport>(
                Builders<CustomReport>.IndexKeys.Ascending(report => report.ReportId),
                new CreateIndexOptions { Name = "ux_custom_report_report_id", Unique = true }),
            new CreateIndexModel<CustomReport>(
                Builders<CustomReport>.IndexKeys
                    .Ascending(report => report.TenantId)
                    .Ascending(report => report.ClientId)
                    .Descending(report => report.UpdatedAt),
                new CreateIndexOptions { Name = "ix_custom_report_tenant_id_client_id_updated_at" }),
            new CreateIndexModel<CustomReport>(
                Builders<CustomReport>.IndexKeys.Ascending(report => report.OwnerId),
                new CreateIndexOptions { Name = "ix_custom_report_owner_id" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<CustomReport> ScopeFilter(CustomReportScope scope)
    {
        var builder = Builders<CustomReport>.Filter;
        var filter = builder.Eq(report => report.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(scope.TenantId))
        {
            filter &= builder.Eq(report => report.TenantId, scope.TenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(scope.ClientId))
        {
            filter &= builder.Eq(report => report.ClientId, scope.ClientId.Trim());
        }

        var visible = builder.Ne(report => report.Visibility, PrivateVisibility);
        if (!string.IsNullOrWhiteSpace(scope.ViewerId))
        {
            visible = builder.Or(visible, builder.Eq(report => report.OwnerId, scope.ViewerId));
        }

        return filter & visible;
    }

    private static void AddExactMatch(List<FilterDefinition<CustomReport>> filters, string field, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            filters.Add(Builders<CustomReport>.Filter.Regex(field, new BsonRegularExpression($"^{Regex.Escape(value.Trim())}$", "i")));
        }
    }
}
