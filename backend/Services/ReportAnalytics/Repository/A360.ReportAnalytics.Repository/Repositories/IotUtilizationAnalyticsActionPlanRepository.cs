using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>The action plan list's filters: tenant, then optional status, priority, insight, owner and a free-text search.</summary>
public sealed record IotUtilizationAnalyticsActionPlanQuery(
    string? TenantId,
    string? ClientId,
    string? Status,
    string? Priority,
    string? InsightKey,
    string? Owner,
    string? Search,
    int Page,
    int PageSize);

public sealed record IotUtilizationAnalyticsActionPlanQueryResult(IReadOnlyList<IotUtilizationAnalyticsActionPlan> Items, long TotalCount);

public interface IIotUtilizationAnalyticsActionPlanRepository : IMongoRepository<IotUtilizationAnalyticsActionPlan>
{
    Task<IotUtilizationAnalyticsActionPlan?> GetByPlanIdAsync(string planId, CancellationToken cancellationToken = default);

    /// <summary>Plans in the tenant, soonest due first.</summary>
    Task<IotUtilizationAnalyticsActionPlanQueryResult> QueryAsync(IotUtilizationAnalyticsActionPlanQuery query, CancellationToken cancellationToken = default);
}

/// <summary>Action plans raised from IoT &amp; Utilization insights.</summary>
public sealed class IotUtilizationAnalyticsActionPlanRepository
    : MongoRepository<IotUtilizationAnalyticsActionPlan>, IIotUtilizationAnalyticsActionPlanRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "IotUtilizationAnalyticsActionPlan";

    public IotUtilizationAnalyticsActionPlanRepository(IMongoDatabase database)
        : base(database.GetCollection<IotUtilizationAnalyticsActionPlan>(CollectionName))
    {
    }

    public async Task<IotUtilizationAnalyticsActionPlan?> GetByPlanIdAsync(string planId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(planId))
        {
            return null;
        }

        return await Collection
            .Find(plan => plan.PlanId == planId.Trim() && !plan.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IotUtilizationAnalyticsActionPlanQueryResult> QueryAsync(
        IotUtilizationAnalyticsActionPlanQuery query,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<IotUtilizationAnalyticsActionPlan>.Filter;
        var filter = builder.Eq(plan => plan.IsDeleted, false);

        if (!string.IsNullOrWhiteSpace(query.TenantId))
        {
            filter &= builder.Eq(plan => plan.TenantId, query.TenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.ClientId))
        {
            filter &= builder.Eq(plan => plan.ClientId, query.ClientId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            filter &= builder.Eq(plan => plan.Status, query.Status.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Priority))
        {
            filter &= builder.Eq(plan => plan.Priority, query.Priority.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.InsightKey))
        {
            filter &= builder.Eq(plan => plan.InsightKey, query.InsightKey.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Owner))
        {
            filter &= builder.Regex(plan => plan.Owner, new BsonRegularExpression($"^{Regex.Escape(query.Owner.Trim())}$", "i"));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filter &= builder.Or(
                builder.Regex(plan => plan.PlanId, pattern),
                builder.Regex(plan => plan.Title, pattern),
                builder.Regex(plan => plan.Owner, pattern),
                builder.Regex(plan => plan.Notes, pattern));
        }

        var page = query.Page < 1 ? 1 : query.Page;
        var items = await Collection
            .Find(filter)
            .Sort(Builders<IotUtilizationAnalyticsActionPlan>.Sort.Ascending(plan => plan.DueDate).Ascending(plan => plan.PlanId))
            .Skip((page - 1) * query.PageSize)
            .Limit(query.PageSize)
            .ToListAsync(cancellationToken);
        var total = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);

        return new IotUtilizationAnalyticsActionPlanQueryResult(items, total);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<IotUtilizationAnalyticsActionPlan>(
                Builders<IotUtilizationAnalyticsActionPlan>.IndexKeys.Ascending(plan => plan.PlanId),
                new CreateIndexOptions { Name = "ux_iot_utilization_analytics_action_plan_plan_id", Unique = true }),
            new CreateIndexModel<IotUtilizationAnalyticsActionPlan>(
                Builders<IotUtilizationAnalyticsActionPlan>.IndexKeys
                    .Ascending(plan => plan.TenantId)
                    .Ascending(plan => plan.ClientId)
                    .Ascending(plan => plan.DueDate),
                new CreateIndexOptions { Name = "ix_iot_utilization_analytics_action_plan_tenant_id_client_id_due_date" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }
}
