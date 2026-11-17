using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

public interface IStandardReportRepository : IMongoRepository<StandardReport>
{
    Task<StandardReport?> GetByReportIdAsync(string reportId, CancellationToken cancellationToken = default);

    Task<StandardReportQueryResult> QueryAsync(StandardReportQuery query, CancellationToken cancellationToken = default);

    Task<StandardReportSummary> GetSummaryAsync(
        string? tenantId,
        string? clientId,
        DateTime monthStartUtc,
        DateTime monthEndUtc,
        CancellationToken cancellationToken = default);

    /// <summary>Reports with a generated, next scheduled or review due date in [fromUtc, toUtc).</summary>
    Task<IReadOnlyCollection<StandardReport>> GetCalendarReportsAsync(
        string? tenantId,
        string? clientId,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(
        string reportName,
        string? tenantId,
        string? clientId,
        string? excludeId,
        CancellationToken cancellationToken = default);
}

/// <summary>All Standard Reports table. PeriodFrom/PeriodTo keep reports whose period overlaps the range; PageSize 0 returns every row.</summary>
public sealed record StandardReportQuery(
    string? Search,
    string? Category,
    string? Frequency,
    string? Status,
    DateTime? PeriodFrom,
    DateTime? PeriodTo,
    string? TenantId,
    string? ClientId,
    string? SortBy,
    bool SortDescending,
    int Page,
    int PageSize);

public sealed record StandardReportQueryResult(
    IReadOnlyCollection<StandardReport> Items,
    long TotalCount);

public sealed record StandardReportSummary(
    long TotalReports,
    long WithDateFilters,
    long Scheduled,
    long UpdatedThisMonth);
