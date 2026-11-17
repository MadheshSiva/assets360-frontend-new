using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IInventoryAnalyticsViewRepository : IMongoRepository<InventoryAnalyticsView>
{
    Task<InventoryAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default);

    /// <summary>The owner's views in the tenant, default first then by name.</summary>
    Task<IReadOnlyList<InventoryAnalyticsView>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Clears the default flag on the owner's other views.</summary>
    Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default);
}

/// <summary>Saved views of Inventory Analytics (own collection: the shared AssetPerformanceView filters have no warehouse, store or stock status).</summary>
public sealed class InventoryAnalyticsViewRepository
    : MongoRepository<InventoryAnalyticsView>, IInventoryAnalyticsViewRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "InventoryAnalyticsView";

    public InventoryAnalyticsViewRepository(IMongoDatabase database)
        : base(database.GetCollection<InventoryAnalyticsView>(CollectionName))
    {
    }

    public async Task<InventoryAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewId))
        {
            return null;
        }

        return await Collection
            .Find(view => view.ViewId == viewId.Trim() && !view.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<InventoryAnalyticsView>> GetOwnedAsync(
        string? ownerId,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken = default)
    {
        return await Collection
            .Find(OwnedFilter(ownerId, tenantId, clientId))
            .Sort(Builders<InventoryAnalyticsView>.Sort.Descending(view => view.IsDefault).Ascending(view => view.ViewName))
            .ToListAsync(cancellationToken);
    }

    public async Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default)
    {
        var filter = OwnedFilter(ownerId, tenantId, clientId) & Builders<InventoryAnalyticsView>.Filter.Ne(view => view.Id, exceptId);
        await Collection.UpdateManyAsync(filter, Builders<InventoryAnalyticsView>.Update.Set(view => view.IsDefault, false), cancellationToken: cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<InventoryAnalyticsView>(
                Builders<InventoryAnalyticsView>.IndexKeys.Ascending(view => view.ViewId),
                new CreateIndexOptions { Name = "ux_inventory_analytics_view_view_id", Unique = true }),
            new CreateIndexModel<InventoryAnalyticsView>(
                Builders<InventoryAnalyticsView>.IndexKeys
                    .Ascending(view => view.TenantId)
                    .Ascending(view => view.OwnerId)
                    .Ascending(view => view.ViewName),
                new CreateIndexOptions { Name = "ix_inventory_analytics_view_tenant_id_owner_id_view_name" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<InventoryAnalyticsView> OwnedFilter(string? ownerId, string? tenantId, string? clientId)
    {
        var builder = Builders<InventoryAnalyticsView>.Filter;
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
