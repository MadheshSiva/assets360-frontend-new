using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class MaintenanceAnalyticsOptions
{
    public const string AllMaintenanceViewId = "all-maintenance";
    public const string AllMaintenanceViewName = "All Maintenance";
    public const string DefaultDatePreset = "This year";

    public const double DefaultComplianceTarget = 90;
    public const double DefaultFailureHealthThreshold = 40;
    public const int DefaultTechnicianLimit = 5;
    public const int MaxTechnicianLimit = 100;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;

    public static readonly OptionList MaintenanceTypes = new(MaintenanceAnalyticsCalculator.WorkTypes.ToArray());

    public static readonly OptionList Statuses = new(MaintenanceAnalyticsCalculator.Statuses.ToArray());

    public static readonly OptionList BacklogSortFields = new("priority", "ageDays", "dueDate", "workOrderId", "status", "assignedTo", "assetName");

    public static readonly OptionList ExportFormats = new("xlsx");
}

/// <summary>
/// The filter bar shared by every Maintenance Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. complianceTarget is in percent,
/// emergencyCostTarget an amount (default: the previous period's emergency cost), failureHealthThreshold the health score below which an
/// asset is approaching failure.
/// </summary>
public sealed class MaintenanceAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? AssetType { get; init; }

    public string? MaintenanceType { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? ComplianceTarget { get; init; }

    public double? EmergencyCostTarget { get; init; }

    public double? FailureHealthThreshold { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IAssetPerformanceViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record MaintenanceAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? MaintenanceType,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveMaintenanceAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    MaintenanceAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record MaintenanceAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? MaintenanceType,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static MaintenanceAnalyticsFiltersResponse FromEntity(AssetPerformanceFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.AssetType,
        filters.MaintenanceType,
        filters.DatePreset ?? MaintenanceAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record MaintenanceAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    MaintenanceAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static MaintenanceAnalyticsViewResponse FromEntity(AssetPerformanceView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        MaintenanceAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static MaintenanceAnalyticsViewResponse AllMaintenance(bool isDefault) => new(
        MaintenanceAnalyticsOptions.AllMaintenanceViewId,
        MaintenanceAnalyticsOptions.AllMaintenanceViewName,
        true,
        isDefault,
        MaintenanceAnalyticsFiltersResponse.FromEntity(new AssetPerformanceFilters()),
        null);
}

public sealed record MaintenanceAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? MaintenanceType,
    double ComplianceTarget,
    double? EmergencyCostTarget,
    double FailureHealthThreshold);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record MaintenanceAnalyticsSection<T>(DateTime GeneratedAt, MaintenanceAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call.</summary>
public sealed record MaintenanceAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    MaintenanceAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    MaintenanceSummary Summary,
    MaintenanceCostTrend CostTrend,
    CountBreakdown WorkOrdersByType,
    CountBreakdown WorkOrderStatus,
    IReadOnlyList<MaintenanceInsight> Insights,
    PreventiveComplianceSummary PreventiveCompliance,
    ReliabilitySummary Reliability,
    DowntimeByCause DowntimeByCause,
    IReadOnlyList<BacklogRow> Backlog,
    int BacklogTotal,
    IReadOnlyList<TechnicianPerformanceRow> Technicians);

public sealed record MaintenanceBacklogResponse(
    DateTime GeneratedAt,
    MaintenanceAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<BacklogRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>A KPI in the selected period against the same KPI in the comparison period.</summary>
public sealed record PeriodComparisonItem(string Metric, string Format, double? Value, double? CompareValue, double? Change, string ChangeUnit, string Trend);

public sealed record MaintenancePeriodComparisonResponse(
    DateTime GeneratedAt,
    MaintenanceAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    DashboardPeriodResponse ComparePeriod,
    IReadOnlyList<PeriodComparisonItem> Metrics,
    PerformanceSeries CostTrend,
    PerformanceSeries CompareCostTrend);

public sealed record MaintenanceAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> MaintenanceTypes,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> Priorities,
    IReadOnlyList<string> DowntimeCauses,
    IReadOnlyList<string> BacklogSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultComplianceTarget,
    double DefaultFailureHealthThreshold);
