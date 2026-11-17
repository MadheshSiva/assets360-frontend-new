using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IInteractiveDashboardRepository : IMongoRepository<InteractiveDashboard>
{
    Task<InteractiveDashboard?> GetByDashboardIdAsync(string dashboardId, CancellationToken cancellationToken = default);

    Task<InteractiveDashboardQueryResult> QueryAsync(InteractiveDashboardQuery query, CancellationToken cancellationToken = default);

    /// <summary>Stars or un-stars the dashboard for one user without rewriting the document.</summary>
    Task<bool> SetFavoriteAsync(string id, string userId, bool isFavorite, CancellationToken cancellationToken = default);
}

/// <summary>
/// Who is looking: a viewer sees their own dashboards, Organization dashboards and Shared dashboards that name them.
/// Without a viewer only Organization dashboards are visible.
/// </summary>
public sealed record InteractiveDashboardScope(string? ViewerId, string? TenantId, string? ClientId);

/// <summary>View is all, my (owned by the viewer), shared (shared with the viewer by someone else) or favorites.</summary>
public sealed record InteractiveDashboardQuery(
    InteractiveDashboardScope Scope,
    string View,
    string? Search,
    int Page,
    int PageSize);

public sealed record InteractiveDashboardQueryResult(
    IReadOnlyCollection<InteractiveDashboard> Items,
    long TotalCount);
