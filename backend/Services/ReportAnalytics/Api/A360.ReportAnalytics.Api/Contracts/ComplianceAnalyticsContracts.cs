using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class ComplianceAnalyticsOptions
{
    public const string AllComplianceViewId = "all-compliance";
    public const string AllComplianceViewName = "All Compliance";
    public const string DefaultDatePreset = "This year";

    public const double DefaultScoreTarget = 90;
    public const double DefaultCapaTarget = 90;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;
    public const int MaxRegulationLength = 200;

    public static readonly OptionList Areas = new(ComplianceAnalyticsCalculator.Areas.ToArray());

    public static readonly OptionList RiskLevels = new(ComplianceAnalyticsCalculator.RiskLevels.ToArray());

    public static readonly OptionList ExpiryTypes = new(ComplianceAnalyticsCalculator.ExpiryTypes.ToArray());

    public static readonly OptionList FindingSortFields = new("severity", "dueDate", "findingId", "requirement", "area", "location", "owner", "status");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");

    public static readonly OptionList ActionPlanPriorities = new("Critical", "High", "Medium", "Low");

    public static readonly OptionList ActionPlanStatuses = new("Open", "In Progress", "Completed", "Cancelled");

    public static readonly OptionList ActionPlanSources = new("finding", "insight", "location", "kpi", "other");
}

/// <summary>
/// The filter bar shared by every Compliance Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). area is a compliance area, regulation a regulation or reference standard (values from /filters),
/// riskLevel Critical / High / Medium / Low. from / to (yyyy-MM-dd) without a preset mean Custom. scoreTarget and capaTarget are percentages.
/// </summary>
public sealed class ComplianceAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Area { get; init; }

    public string? Regulation { get; init; }

    public string? RiskLevel { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? ScoreTarget { get; init; }

    public double? CapaTarget { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IComplianceAnalyticsDataRepository DataRepository { get; init; } = null!;

    public IDashboardDataRepository DashboardRepository { get; init; } = null!;

    public IComplianceAnalyticsViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record ComplianceAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Area,
    string? Regulation,
    string? RiskLevel,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveComplianceAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    ComplianceAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record ComplianceAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Area,
    string? Regulation,
    string? RiskLevel,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static ComplianceAnalyticsFiltersResponse FromEntity(ComplianceAnalyticsFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.ComplianceArea,
        filters.Regulation,
        filters.RiskLevel,
        filters.DatePreset ?? ComplianceAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record ComplianceAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    ComplianceAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static ComplianceAnalyticsViewResponse FromEntity(ComplianceAnalyticsView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        ComplianceAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static ComplianceAnalyticsViewResponse AllCompliance(bool isDefault) => new(
        ComplianceAnalyticsOptions.AllComplianceViewId,
        ComplianceAnalyticsOptions.AllComplianceViewName,
        true,
        isDefault,
        ComplianceAnalyticsFiltersResponse.FromEntity(new ComplianceAnalyticsFilters()),
        null);
}

public sealed record ComplianceAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Area,
    string? Regulation,
    string? RiskLevel,
    double ScoreTarget,
    double CapaTarget);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record ComplianceAnalyticsSection<T>(DateTime GeneratedAt, ComplianceAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call.</summary>
public sealed record ComplianceAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    ComplianceAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    ComplianceSummary Summary,
    ComplianceScoreTrend ScoreTrend,
    ComplianceSeverityTrend FindingsBySeverity,
    ComplianceStatusBreakdown ComplianceStatus,
    IReadOnlyList<ComplianceAreaCount> FindingsByArea,
    ComplianceCapaSummary Capa,
    ComplianceExpirySummary Expiry,
    IReadOnlyList<ComplianceFindingRow> Findings,
    int FindingsTotal,
    IReadOnlyList<ComplianceRiskRow> Risks,
    IReadOnlyList<ComplianceLocationRow> Locations,
    IReadOnlyList<ComplianceEnvironmentalRow> Environmental,
    IReadOnlyList<ComplianceInsight> Insights);

public sealed record ComplianceFindingsResponse(
    DateTime GeneratedAt,
    ComplianceAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<ComplianceFindingRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record ComplianceAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> ComplianceAreas,
    IReadOnlyList<string> RiskLevels,
    IReadOnlyList<string> ExpiryTypes,
    int ExpiryMonths,
    int ExpirySoonDays,
    IReadOnlyList<string> FindingSortFields,
    IReadOnlyList<string> ExportFormats,
    IReadOnlyList<string> ActionPlanPriorities,
    IReadOnlyList<string> ActionPlanStatuses,
    IReadOnlyList<string> ActionPlanSources,
    double DefaultScoreTarget,
    double DefaultCapaTarget);

/// <summary>/filters: Organization and Location from the asset register plus inspection sites, and the regulations.</summary>
public sealed record ComplianceAnalyticsFilterOptionsResponse(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<DashboardOption> Locations,
    IReadOnlyList<DashboardOption> Regulations);

// ----- Action plans -----

/// <summary>Create / update an action plan. dueDate is yyyy-MM-dd; status is only used on update.</summary>
public sealed record SaveComplianceActionPlanRequest(
    string? Title,
    string? Owner,
    DateOnly? DueDate,
    string? Priority,
    string? Notes,
    string? Context,
    string? SourceType,
    string? SourceId,
    string? Location,
    string? Regulation,
    string? Status,
    string? TenantId,
    string? ClientId);

public sealed record ComplianceActionPlanResponse(
    string ActionPlanId,
    string Title,
    string Owner,
    DateOnly DueDate,
    string Priority,
    string Status,
    string? Notes,
    string? Context,
    string? SourceType,
    string? SourceId,
    string? Location,
    string? Regulation,
    bool IsOverdue,
    string? CreatedBy,
    DateTime? CreatedAt,
    DateTime? UpdatedAt,
    DateTime? CompletedAt)
{
    public static ComplianceActionPlanResponse FromEntity(ComplianceActionPlan plan, DateTime utcNow) => new(
        plan.ActionPlanId,
        plan.Title,
        plan.Owner,
        DateOnly.FromDateTime(plan.DueDate),
        plan.Priority,
        plan.Status ?? "Open",
        plan.Notes,
        plan.Context,
        plan.SourceType,
        plan.SourceId,
        plan.Location,
        plan.Regulation,
        plan.Status is "Open" or "In Progress" && plan.DueDate.AddDays(1) <= utcNow,
        plan.CreatedBy,
        plan.CreatedAt,
        plan.UpdatedAt,
        plan.CompletedAt);
}

public sealed record ComplianceActionPlanListResponse(IReadOnlyList<ComplianceActionPlanResponse> Items, long TotalCount, int Page, int PageSize);
