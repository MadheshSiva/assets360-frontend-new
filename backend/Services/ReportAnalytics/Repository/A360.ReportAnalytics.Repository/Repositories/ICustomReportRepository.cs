using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface ICustomReportRepository : IMongoRepository<CustomReport>
{
    Task<CustomReport?> GetByReportIdAsync(string reportId, CancellationToken cancellationToken = default);

    Task<CustomReportQueryResult> QueryAsync(CustomReportQuery query, CancellationToken cancellationToken = default);

    /// <summary>Report count per status among the reports the viewer can see.</summary>
    Task<IReadOnlyDictionary<string, long>> CountByStatusAsync(CustomReportScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<CustomReportOwner>> GetOwnersAsync(CustomReportScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<CustomReport>> GetByReportIdsAsync(IReadOnlyCollection<string> reportIds, CancellationToken cancellationToken = default);

    /// <summary>Stars or un-stars the report for one user without rewriting the document.</summary>
    Task<bool> SetFavoriteAsync(string id, string userId, bool isFavorite, CancellationToken cancellationToken = default);
}

/// <summary>
/// Who is looking: a viewer sees their own reports and everyone's non-private ones.
/// Without a viewer only non-private reports are visible.
/// </summary>
public sealed record CustomReportScope(string? ViewerId, string? TenantId, string? ClientId);

/// <summary>Custom Report Library. UpdatedSince is the "Last Updated" filter; PageSize 0 returns every row.</summary>
public sealed record CustomReportQuery(
    CustomReportScope Scope,
    string? Search,
    string? OwnerId,
    string? Module,
    string? Status,
    DateTime? UpdatedSince,
    bool FavoritesOnly,
    string? SortBy,
    bool SortDescending,
    int Page,
    int PageSize);

public sealed record CustomReportQueryResult(
    IReadOnlyCollection<CustomReport> Items,
    long TotalCount);

public sealed record CustomReportOwner(string OwnerId, string? OwnerName);
