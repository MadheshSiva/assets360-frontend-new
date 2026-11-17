using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IPredictiveAnalyticsViewRepository : IMongoRepository<PredictiveAnalyticsView>
{
    Task<PredictiveAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default);

    /// <summary>The owner's views in the tenant, default first then by name.</summary>
    Task<IReadOnlyList<PredictiveAnalyticsView>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Clears the default flag on the owner's other views.</summary>
    Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default);
}

/// <summary>Predictive Analytics saved views. They live in their own collection because they also keep the Risk Level filter.</summary>
public sealed class PredictiveAnalyticsViewRepository
    : MongoRepository<PredictiveAnalyticsView>, IPredictiveAnalyticsViewRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "PredictiveAnalyticsView";

    public PredictiveAnalyticsViewRepository(IMongoDatabase database)
        : base(database.GetCollection<PredictiveAnalyticsView>(CollectionName))
    {
    }

    public async Task<PredictiveAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewId))
        {
            return null;
        }

        return await Collection
            .Find(view => view.ViewId == viewId.Trim() && !view.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<PredictiveAnalyticsView>> GetOwnedAsync(
        string? ownerId,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken = default)
    {
        return await Collection
            .Find(OwnedFilter(ownerId, tenantId, clientId))
            .Sort(Builders<PredictiveAnalyticsView>.Sort.Descending(view => view.IsDefault).Ascending(view => view.ViewName))
            .ToListAsync(cancellationToken);
    }

    public async Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default)
    {
        var filter = OwnedFilter(ownerId, tenantId, clientId) & Builders<PredictiveAnalyticsView>.Filter.Ne(view => view.Id, exceptId);
        await Collection.UpdateManyAsync(filter, Builders<PredictiveAnalyticsView>.Update.Set(view => view.IsDefault, false), cancellationToken: cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<PredictiveAnalyticsView>(
                Builders<PredictiveAnalyticsView>.IndexKeys.Ascending(view => view.ViewId),
                new CreateIndexOptions { Name = "ux_predictive_analytics_view_view_id", Unique = true }),
            new CreateIndexModel<PredictiveAnalyticsView>(
                Builders<PredictiveAnalyticsView>.IndexKeys
                    .Ascending(view => view.TenantId)
                    .Ascending(view => view.OwnerId)
                    .Ascending(view => view.ViewName),
                new CreateIndexOptions { Name = "ix_predictive_analytics_view_tenant_id_owner_id_view_name" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<PredictiveAnalyticsView> OwnedFilter(string? ownerId, string? tenantId, string? clientId)
    {
        var builder = Builders<PredictiveAnalyticsView>.Filter;
        var filter = builder.Eq(view => view.IsDeleted, false) & builder.Eq(view => view.OwnerId, ownerId);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(view => view.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(view => view.ClientId, clientId.Trim());
        }

        return filter;
    }
}
