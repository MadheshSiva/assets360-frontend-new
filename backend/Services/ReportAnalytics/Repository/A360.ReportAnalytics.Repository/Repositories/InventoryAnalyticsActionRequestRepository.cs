using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IInventoryAnalyticsActionRequestRepository : IMongoRepository<InventoryAnalyticsActionRequest>
{
    Task<InventoryAnalyticsActionRequest?> GetByRequestIdAsync(string requestId, CancellationToken cancellationToken = default);

    /// <summary>Requests in the tenant, newest first. Type and status are exact values (null means all).</summary>
    Task<IReadOnlyList<InventoryAnalyticsActionRequest>> GetListAsync(
        string? tenantId,
        string? clientId,
        string? requestType,
        string? status,
        CancellationToken cancellationToken = default);
}

/// <summary>Purchase requests and action plans raised from Inventory Analytics.</summary>
public sealed class InventoryAnalyticsActionRequestRepository
    : MongoRepository<InventoryAnalyticsActionRequest>, IInventoryAnalyticsActionRequestRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "InventoryAnalyticsActionRequest";

    public InventoryAnalyticsActionRequestRepository(IMongoDatabase database)
        : base(database.GetCollection<InventoryAnalyticsActionRequest>(CollectionName))
    {
    }

    public async Task<InventoryAnalyticsActionRequest?> GetByRequestIdAsync(string requestId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(requestId))
        {
            return null;
        }

        return await Collection
            .Find(request => request.RequestId == requestId.Trim() && !request.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<InventoryAnalyticsActionRequest>> GetListAsync(
        string? tenantId,
        string? clientId,
        string? requestType,
        string? status,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<InventoryAnalyticsActionRequest>.Filter;
        var filter = builder.Eq(request => request.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(request => request.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(request => request.ClientId, clientId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(requestType))
        {
            filter &= builder.Eq(request => request.RequestType, requestType);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            filter &= builder.Eq(request => request.Status, status);
        }

        return await Collection
            .Find(filter)
            .Sort(Builders<InventoryAnalyticsActionRequest>.Sort.Descending(request => request.CreatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<InventoryAnalyticsActionRequest>(
                Builders<InventoryAnalyticsActionRequest>.IndexKeys.Ascending(request => request.RequestId),
                new CreateIndexOptions { Name = "ux_inventory_analytics_action_request_request_id", Unique = true }),
            new CreateIndexModel<InventoryAnalyticsActionRequest>(
                Builders<InventoryAnalyticsActionRequest>.IndexKeys
                    .Ascending(request => request.TenantId)
                    .Ascending(request => request.RequestType)
                    .Descending(request => request.CreatedAt),
                new CreateIndexOptions { Name = "ix_inventory_analytics_action_request_tenant_id_request_type_created_at" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }
}
