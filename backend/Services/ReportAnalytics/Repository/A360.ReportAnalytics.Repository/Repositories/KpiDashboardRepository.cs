using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>KPI Dashboard library: custom KPIs and the changes made to built-in KPIs, shared by the tenant.</summary>
public interface IKpiDashboardKpiRepository : IMongoRepository<KpiDashboardKpi>
{
    Task<IReadOnlyList<KpiDashboardKpi>> GetAllAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<KpiDashboardKpi?> GetByKpiIdAsync(string kpiId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

/// <summary>KPI Dashboard views of one user: layout changes to built-in views and custom views.</summary>
public interface IKpiDashboardLayoutRepository : IMongoRepository<KpiDashboardLayout>
{
    Task<IReadOnlyList<KpiDashboardLayout>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<KpiDashboardLayout?> GetByViewKeyAsync(string viewKey, string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class KpiDashboardKpiRepository : MongoRepository<KpiDashboardKpi>, IKpiDashboardKpiRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "KpiDashboardKpi";

    public KpiDashboardKpiRepository(IMongoDatabase database)
        : base(database.GetCollection<KpiDashboardKpi>(CollectionName))
    {
    }

    public async Task<IReadOnlyList<KpiDashboardKpi>> GetAllAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await Collection
            .Find(TenantFilter(tenantId, clientId))
            .Sort(Builders<KpiDashboardKpi>.Sort.Ascending(kpi => kpi.CreatedAt))
            .ToListAsync(cancellationToken);

    public async Task<KpiDashboardKpi?> GetByKpiIdAsync(string kpiId, string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(kpiId))
        {
            return null;
        }

        return await Collection
            .Find(TenantFilter(tenantId, clientId) & Builders<KpiDashboardKpi>.Filter.Eq(kpi => kpi.KpiId, kpiId.Trim()))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<KpiDashboardKpi>(
                Builders<KpiDashboardKpi>.IndexKeys.Ascending(kpi => kpi.TenantId).Ascending(kpi => kpi.ClientId).Ascending(kpi => kpi.KpiId),
                new CreateIndexOptions { Name = "ix_kpi_dashboard_kpi_tenant_id_client_id_kpi_id" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<KpiDashboardKpi> TenantFilter(string? tenantId, string? clientId)
    {
        var builder = Builders<KpiDashboardKpi>.Filter;
        var filter = builder.Eq(kpi => kpi.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(kpi => kpi.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(kpi => kpi.ClientId, clientId.Trim());
        }

        return filter;
    }
}

public sealed class KpiDashboardLayoutRepository : MongoRepository<KpiDashboardLayout>, IKpiDashboardLayoutRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "KpiDashboardLayout";

    public KpiDashboardLayoutRepository(IMongoDatabase database)
        : base(database.GetCollection<KpiDashboardLayout>(CollectionName))
    {
    }

    public async Task<IReadOnlyList<KpiDashboardLayout>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await Collection
            .Find(OwnedFilter(ownerId, tenantId, clientId))
            .Sort(Builders<KpiDashboardLayout>.Sort.Ascending(layout => layout.CreatedAt))
            .ToListAsync(cancellationToken);

    public async Task<KpiDashboardLayout?> GetByViewKeyAsync(
        string viewKey,
        string? ownerId,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewKey))
        {
            return null;
        }

        return await Collection
            .Find(OwnedFilter(ownerId, tenantId, clientId) & Builders<KpiDashboardLayout>.Filter.Eq(layout => layout.ViewKey, viewKey.Trim()))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<KpiDashboardLayout>(
                Builders<KpiDashboardLayout>.IndexKeys
                    .Ascending(layout => layout.TenantId)
                    .Ascending(layout => layout.OwnerId)
                    .Ascending(layout => layout.ViewKey),
                new CreateIndexOptions { Name = "ix_kpi_dashboard_layout_tenant_id_owner_id_view_key" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<KpiDashboardLayout> OwnedFilter(string? ownerId, string? tenantId, string? clientId)
    {
        var builder = Builders<KpiDashboardLayout>.Filter;
        var filter = builder.Eq(layout => layout.IsDeleted, false) & builder.Eq(layout => layout.OwnerId, ownerId);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(layout => layout.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(layout => layout.ClientId, clientId.Trim());
        }

        return filter;
    }
}
