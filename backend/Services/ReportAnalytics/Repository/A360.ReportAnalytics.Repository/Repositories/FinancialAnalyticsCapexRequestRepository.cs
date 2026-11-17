using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IFinancialAnalyticsCapexRequestRepository : IMongoRepository<FinancialAnalyticsCapexRequest>
{
    Task<FinancialAnalyticsCapexRequest?> GetByRequestIdAsync(string requestId, CancellationToken cancellationToken = default);

    /// <summary>The tenant's requests, newest first; statuses narrows them (null for all).</summary>
    Task<IReadOnlyList<FinancialAnalyticsCapexRequest>> ListAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? statuses,
        CancellationToken cancellationToken = default);
}

public sealed class FinancialAnalyticsCapexRequestRepository
    : MongoRepository<FinancialAnalyticsCapexRequest>, IFinancialAnalyticsCapexRequestRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "FinancialAnalyticsCapexRequest";

    public const string PendingStatus = "Pending";
    public const string MoreInfoStatus = "More Info Requested";
    public const string ApprovedStatus = "Approved";
    public const string RejectedStatus = "Rejected";

    public static readonly IReadOnlyList<string> Statuses = [PendingStatus, MoreInfoStatus, ApprovedStatus, RejectedStatus];

    /// <summary>Statuses still waiting for a final decision.</summary>
    public static readonly IReadOnlyList<string> OpenStatuses = [PendingStatus, MoreInfoStatus];

    public FinancialAnalyticsCapexRequestRepository(IMongoDatabase database)
        : base(database.GetCollection<FinancialAnalyticsCapexRequest>(CollectionName))
    {
    }

    public async Task<FinancialAnalyticsCapexRequest?> GetByRequestIdAsync(string requestId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(requestId))
        {
            return null;
        }

        return await Collection
            .Find(request => request.RequestId == requestId.Trim() && !request.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<FinancialAnalyticsCapexRequest>> ListAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? statuses,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<FinancialAnalyticsCapexRequest>.Filter;
        var filter = builder.Eq(request => request.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(request => request.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(request => request.ClientId, clientId.Trim());
        }

        if (statuses is { Count: > 0 })
        {
            filter &= builder.In(request => request.Status, statuses);
        }

        return await Collection
            .Find(filter)
            .Sort(Builders<FinancialAnalyticsCapexRequest>.Sort.Descending(request => request.SubmittedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<FinancialAnalyticsCapexRequest>(
                Builders<FinancialAnalyticsCapexRequest>.IndexKeys.Ascending(request => request.RequestId),
                new CreateIndexOptions { Name = "ux_financial_analytics_capex_request_request_id", Unique = true }),
            new CreateIndexModel<FinancialAnalyticsCapexRequest>(
                Builders<FinancialAnalyticsCapexRequest>.IndexKeys
                    .Ascending(request => request.TenantId)
                    .Ascending(request => request.ClientId)
                    .Ascending(request => request.Status)
                    .Descending(request => request.SubmittedAt),
                new CreateIndexOptions { Name = "ix_financial_analytics_capex_request_tenant_id_client_id_status_submitted_at" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }
}
