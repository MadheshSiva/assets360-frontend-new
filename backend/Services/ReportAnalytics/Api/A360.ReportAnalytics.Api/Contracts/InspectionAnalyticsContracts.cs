using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class InspectionAnalyticsOptions
{
    public const string AllInspectionsViewId = "all-inspections";
    public const string AllInspectionsViewName = "All Inspections";
    public const string DefaultDatePreset = "This year";

    public const double DefaultComplianceTarget = 90;
    public const int DefaultDueWithinDays = 7;
    public const int DefaultRepeatWindowDays = 90;
    public const int MaxDays = 365;
    public const int DefaultInspectorLimit = 5;
    public const int MaxInspectorLimit = 100;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;

    public static readonly OptionList InspectionStatuses = new(InspectionAnalyticsCalculator.InspectionStatuses.ToArray());

    public static readonly OptionList FindingStatuses = new(InspectionAnalyticsCalculator.FindingStatuses.ToArray());

    public static readonly OptionList FindingSortFields = new("severity", "dueDate", "ageDays", "findingId", "assetName", "category", "owner", "status");

    public static readonly OptionList ExportFormats = new("xlsx");
}

/// <summary>
/// The filter bar shared by every Inspection Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. complianceTarget is in percent; dueWithinDays is
/// the corrective-action horizon (default 7); repeatWindowDays how close two findings must be to count as a repeat (default 90).
/// </summary>
public sealed class InspectionAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? AssetType { get; init; }

    public string? InspectionType { get; init; }

    public string? Inspector { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? ComplianceTarget { get; init; }

    public int? DueWithinDays { get; init; }

    public int? RepeatWindowDays { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IAssetPerformanceViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record InspectionAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? InspectionType,
    string? Inspector,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveInspectionAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    InspectionAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record InspectionAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? InspectionType,
    string? Inspector,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static InspectionAnalyticsFiltersResponse FromEntity(AssetPerformanceFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.AssetType,
        filters.InspectionType,
        filters.Inspector,
        filters.DatePreset ?? InspectionAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record InspectionAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    InspectionAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static InspectionAnalyticsViewResponse FromEntity(AssetPerformanceView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        InspectionAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static InspectionAnalyticsViewResponse AllInspections(bool isDefault) => new(
        InspectionAnalyticsOptions.AllInspectionsViewId,
        InspectionAnalyticsOptions.AllInspectionsViewName,
        true,
        isDefault,
        InspectionAnalyticsFiltersResponse.FromEntity(new AssetPerformanceFilters()),
        null);
}

/// <summary>The filter bar dropdowns: asset filters plus the inspection types and inspectors found in recorded inspections.</summary>
public sealed record InspectionAnalyticsFilterOptionsResponse(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<DashboardOption> Locations,
    IReadOnlyList<DashboardOption> AssetCategories,
    IReadOnlyList<DashboardOption> AssetTypes,
    IReadOnlyList<DashboardOption> InspectionTypes,
    IReadOnlyList<DashboardOption> Inspectors);

public sealed record InspectionAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? InspectionType,
    string? Inspector,
    double ComplianceTarget,
    int DueWithinDays,
    int RepeatWindowDays);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record InspectionAnalyticsSection<T>(DateTime GeneratedAt, InspectionAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call.</summary>
public sealed record InspectionAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    InspectionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    InspectionSummary Summary,
    PerformanceSeries CompletionTrend,
    PerformanceSeries FindingsBySeverity,
    CountBreakdown InspectionStatus,
    CountBreakdown FindingsByCategory,
    IReadOnlyList<InspectionInsight> Insights,
    InspectionComplianceSummary Compliance,
    PerformanceSeries RepeatFindingsTrend,
    IReadOnlyList<FindingRow> OpenFindings,
    int OpenFindingsTotal,
    IReadOnlyList<InspectorPerformanceRow> Inspectors);

public sealed record InspectionFindingsResponse(
    DateTime GeneratedAt,
    InspectionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<FindingRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record InspectionPeriodComparisonResponse(
    DateTime GeneratedAt,
    InspectionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    DashboardPeriodResponse ComparePeriod,
    IReadOnlyList<PeriodComparisonItem> Metrics,
    PerformanceSeries CompletionTrend,
    PerformanceSeries CompareCompletionTrend);

public sealed record InspectionAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> InspectionStatuses,
    IReadOnlyList<string> FindingStatuses,
    IReadOnlyList<string> Severities,
    IReadOnlyList<string> FindingSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultComplianceTarget,
    int DefaultDueWithinDays,
    int DefaultRepeatWindowDays);
