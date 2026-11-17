using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public sealed class InteractiveDashboardRepository
    : MongoRepository<InteractiveDashboard>, IInteractiveDashboardRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "InteractiveDashboard";

    public const string PrivateVisibility = "Private";
    public const string SharedVisibility = "Shared";
    public const string OrganizationVisibility = "Organization";

    public const string AllView = "all";
    public const string MyView = "my";
    public const string SharedView = "shared";
    public const string FavoritesView = "favorites";

    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 200;

    private static readonly Collation CaseInsensitive = new("en", strength: CollationStrength.Secondary);

    public InteractiveDashboardRepository(IMongoDatabase database)
        : base(database.GetCollection<InteractiveDashboard>(CollectionName))
    {
    }

    public async Task<InteractiveDashboard?> GetByDashboardIdAsync(string dashboardId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dashboardId))
        {
            return null;
        }

        return await Collection
            .Find(dashboard => dashboard.DashboardId == dashboardId.Trim() && !dashboard.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<InteractiveDashboardQueryResult> QueryAsync(InteractiveDashboardQuery query, CancellationToken cancellationToken = default)
    {
        var builder = Builders<InteractiveDashboard>.Filter;
        var viewerId = query.Scope.ViewerId;
        var filters = new List<FilterDefinition<InteractiveDashboard>> { ScopeFilter(query.Scope) };
        var nothing = builder.Eq(dashboard => dashboard.Id, ObjectId.Empty.ToString());

        switch (query.View)
        {
            case MyView:
                filters.Add(string.IsNullOrWhiteSpace(viewerId) ? nothing : builder.Eq(dashboard => dashboard.OwnerId, viewerId));
                break;
            case SharedView:
                filters.Add(string.IsNullOrWhiteSpace(viewerId)
                    ? nothing
                    : builder.And(
                        builder.Ne(dashboard => dashboard.OwnerId, viewerId),
                        builder.ElemMatch(dashboard => dashboard.SharedWith.Users, user => user.Id == viewerId)));
                break;
            case FavoritesView:
                filters.Add(string.IsNullOrWhiteSpace(viewerId) ? nothing : builder.AnyEq(dashboard => dashboard.FavoritedBy, viewerId));
                break;
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filters.Add(builder.Or(
                builder.Regex(dashboard => dashboard.DashboardName, pattern),
                builder.Regex(dashboard => dashboard.DashboardId, pattern),
                builder.Regex(dashboard => dashboard.Description, pattern)));
        }

        var filter = builder.And(filters);
        var find = Collection
            .Find(filter, new FindOptions { Collation = CaseInsensitive })
            .Sort(Builders<InteractiveDashboard>.Sort.Ascending(dashboard => dashboard.DashboardName).Ascending(dashboard => dashboard.Id));

        if (query.PageSize > 0)
        {
            var page = query.Page < 1 ? 1 : query.Page;
            find = find.Skip((page - 1) * query.PageSize).Limit(query.PageSize);
        }

        var items = await find.ToListAsync(cancellationToken);
        var totalCount = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);

        return new InteractiveDashboardQueryResult(items, totalCount);
    }

    public async Task<bool> SetFavoriteAsync(string id, string userId, bool isFavorite, CancellationToken cancellationToken = default)
    {
        var update = isFavorite
            ? Builders<InteractiveDashboard>.Update.AddToSet(dashboard => dashboard.FavoritedBy, userId)
            : Builders<InteractiveDashboard>.Update.Pull(dashboard => dashboard.FavoritedBy, userId);

        var result = await Collection.UpdateOneAsync(dashboard => dashboard.Id == id, update, cancellationToken: cancellationToken);
        return result.IsAcknowledged && result.MatchedCount > 0;
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<InteractiveDashboard>(
                Builders<InteractiveDashboard>.IndexKeys.Ascending(dashboard => dashboard.DashboardId),
                new CreateIndexOptions { Name = "ux_interactive_dashboard_dashboard_id", Unique = true }),
            new CreateIndexModel<InteractiveDashboard>(
                Builders<InteractiveDashboard>.IndexKeys
                    .Ascending(dashboard => dashboard.TenantId)
                    .Ascending(dashboard => dashboard.ClientId)
                    .Ascending(dashboard => dashboard.DashboardName),
                new CreateIndexOptions { Name = "ix_interactive_dashboard_tenant_id_client_id_dashboard_name" }),
            new CreateIndexModel<InteractiveDashboard>(
                Builders<InteractiveDashboard>.IndexKeys.Ascending(dashboard => dashboard.OwnerId),
                new CreateIndexOptions { Name = "ix_interactive_dashboard_owner_id" }),
            new CreateIndexModel<InteractiveDashboard>(
                Builders<InteractiveDashboard>.IndexKeys.Ascending("shared_with.users.id"),
                new CreateIndexOptions { Name = "ix_interactive_dashboard_shared_user_id" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<InteractiveDashboard> ScopeFilter(InteractiveDashboardScope scope)
    {
        var builder = Builders<InteractiveDashboard>.Filter;
        var filter = builder.Eq(dashboard => dashboard.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(scope.TenantId))
        {
            filter &= builder.Eq(dashboard => dashboard.TenantId, scope.TenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(scope.ClientId))
        {
            filter &= builder.Eq(dashboard => dashboard.ClientId, scope.ClientId.Trim());
        }

        var visible = builder.Eq(dashboard => dashboard.Visibility, OrganizationVisibility);
        if (!string.IsNullOrWhiteSpace(scope.ViewerId))
        {
            visible = builder.Or(
                visible,
                builder.Eq(dashboard => dashboard.OwnerId, scope.ViewerId),
                // Dashboards created without a signed-in user have no owner and stay open to everyone.
                builder.Eq(dashboard => dashboard.OwnerId, null),
                builder.And(
                    builder.Eq(dashboard => dashboard.Visibility, SharedVisibility),
                    builder.ElemMatch(dashboard => dashboard.SharedWith.Users, user => user.Id == scope.ViewerId)));
        }
        else
        {
            visible = builder.Or(visible, builder.Eq(dashboard => dashboard.OwnerId, null));
        }

        return filter & visible;
    }
}
