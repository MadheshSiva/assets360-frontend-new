using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>
/// Dates without an offset are read in TimeZone (default UTC). When IncludeTime is false the
/// report period is stored as whole days.
/// </summary>
public sealed record CreateStandardReportRequest(
    string? ReportName,
    string? Description,
    string? Category,
    DateTime? ReportPeriodFrom,
    DateTime? ReportPeriodTo,
    string? TimeZone,
    bool? IncludeTime,
    string? Frequency,
    DateTime? NextScheduledOn,
    DateTime? ReviewDueOn,
    string? Status,
    string? CreatedBy,
    string? TenantId,
    string? ClientId);

public sealed record UpdateStandardReportRequest(
    string? ReportName,
    string? Description,
    string? Category,
    DateTime? ReportPeriodFrom,
    DateTime? ReportPeriodTo,
    string? TimeZone,
    bool? IncludeTime,
    string? Frequency,
    DateTime? NextScheduledOn,
    DateTime? ReviewDueOn,
    string? Status,
    string? UpdatedBy);

/// <summary>Schedule action. On demand clears the next run.</summary>
public sealed record ScheduleStandardReportRequest(
    string? Frequency,
    DateTime? NextScheduledOn,
    string? TimeZone,
    string? UpdatedBy);

/// <summary>Reporting period card: applies one period to many reports at once (Apply Dates).</summary>
public sealed record ApplyReportPeriodRequest(
    IReadOnlyList<string>? ReportIds,
    DateTime? ReportPeriodFrom,
    DateTime? ReportPeriodTo,
    string? TimeZone,
    bool? IncludeTime,
    string? UpdatedBy);

public sealed record StandardReportResponse(
    string ReportId,
    string ReportName,
    string? Description,
    string Category,
    DateTime? ReportPeriodFrom,
    DateTime? ReportPeriodTo,
    string TimeZone,
    bool IncludeTime,
    bool HasDateFilter,
    DateTime? GeneratedOn,
    DateTime? NextScheduledOn,
    string Frequency,
    DateTime? ReviewDueOn,
    string? Status,
    string? CreatedBy,
    DateTime? CreatedAt,
    string? UpdatedBy,
    DateTime? UpdatedAt,
    string? TenantId,
    string? ClientId)
{
    public static StandardReportResponse FromEntity(StandardReport report)
    {
        return new StandardReportResponse(
            report.ReportId,
            report.ReportName,
            report.Description,
            report.Category,
            report.ReportPeriodFrom,
            report.ReportPeriodTo,
            report.TimeZone,
            report.IncludeTime,
            report.ReportPeriodFrom is not null && report.ReportPeriodTo is not null,
            report.GeneratedOn,
            report.NextScheduledOn,
            report.Frequency,
            report.ReviewDueOn,
            report.Status,
            report.CreatedBy,
            report.CreatedAt,
            report.UpdatedBy,
            report.UpdatedAt,
            report.TenantId,
            report.ClientId);
    }
}

public sealed record StandardReportListResponse(
    IReadOnlyCollection<StandardReportResponse> Items,
    long TotalCount,
    int Page,
    int PageSize);

/// <summary>The four cards at the top of the page.</summary>
public sealed record StandardReportSummaryResponse(
    long TotalReports,
    long WithDateFilters,
    long Scheduled,
    long UpdatedThisMonth);

/// <summary>A day on the calendar card with its Generated / Scheduled / Review due markers.</summary>
public sealed record StandardReportCalendarDay(
    DateOnly Date,
    int Generated,
    int Scheduled,
    int ReviewDue);

public sealed record StandardReportCalendarResponse(
    int Year,
    int Month,
    string TimeZone,
    IReadOnlyCollection<StandardReportCalendarDay> Days);

/// <summary>A quick period button resolved to dates in the requested zone.</summary>
public sealed record ReportPeriodResponse(
    string Preset,
    DateOnly From,
    DateOnly To,
    string TimeZone);

public sealed record ApplyReportPeriodResponse(
    int UpdatedCount,
    IReadOnlyCollection<string> NotFound);
