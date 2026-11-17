using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class IotUtilizationAnalyticsOptions
{
    public const string AllAssetsViewId = "all-iot-assets";
    public const string AllAssetsViewName = "All Connected Assets";
    public const string DefaultDatePreset = "Last 30 days";

    public const double DefaultUtilizationTarget = AssetPerformanceOptions.DefaultUtilizationTarget;
    public const int DefaultVarianceLimit = 8;
    public const int MaxVarianceLimit = 500;
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 5000;
    public const int MaxNameLength = 100;
    public const int HistoryWeeks = 12;
    public const int AutoRefreshSeconds = 30;

    public static readonly OptionList ConnectivityStatuses = new(IotUtilizationAnalyticsCalculator.ConnectivityStatuses.ToArray());

    public static readonly OptionList AlertSeverities = new(IotUtilizationAnalyticsCalculator.Severities.ToArray());

    public static readonly OptionList AssetSortFields = new(
        "variance", "utilization", "assetId", "assetName", "location", "lastSeen", "connectivity", "deviceType", "availability");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");

    // Action plans
    public const string OpenPlanStatus = "Open";
    public const int MaxTitleLength = 120;
    public const int MaxOwnerLength = 100;
    public const int MaxNotesLength = 1000;
    public const int MaxContextLength = 1000;

    public static readonly OptionList PlanPriorities = new("Critical", "High", "Medium", "Low");

    public static readonly OptionList PlanStatuses = new(OpenPlanStatus, "In Progress", "Completed", "Cancelled");

    public static readonly OptionList InsightKeys = new("alerts", "below_target", "abnormal_vibration", "offline_devices");
}

/// <summary>
/// The filter bar shared by every IoT &amp; Utilization data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. deviceType is one of /filters deviceTypes,
/// connectivity one of /options connectivityStatuses, utilizationTarget a percentage.
/// </summary>
public sealed class IotUtilizationAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? DeviceType { get; init; }

    public string? Connectivity { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? UtilizationTarget { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IIotUtilizationAnalyticsDataRepository IotRepository { get; init; } = null!;

    public IIotUtilizationAnalyticsViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record IotUtilizationAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? DeviceType,
    string? Connectivity,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveIotUtilizationAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    IotUtilizationAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record IotUtilizationAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string? DeviceType,
    string? Connectivity,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static IotUtilizationAnalyticsFiltersResponse FromEntity(IotUtilizationAnalyticsFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.DeviceType,
        filters.Connectivity,
        filters.DatePreset ?? IotUtilizationAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record IotUtilizationAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    IotUtilizationAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static IotUtilizationAnalyticsViewResponse FromEntity(IotUtilizationAnalyticsView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        IotUtilizationAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static IotUtilizationAnalyticsViewResponse AllAssets(bool isDefault) => new(
        IotUtilizationAnalyticsOptions.AllAssetsViewId,
        IotUtilizationAnalyticsOptions.AllAssetsViewName,
        true,
        isDefault,
        IotUtilizationAnalyticsFiltersResponse.FromEntity(new IotUtilizationAnalyticsFilters()),
        null);
}

public sealed record IotUtilizationAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? DeviceType,
    string? Connectivity,
    double UtilizationTarget);

/// <summary>One page section with its context; GeneratedAt drives "Updated n sec ago".</summary>
public sealed record IotUtilizationAnalyticsSection<T>(DateTime GeneratedAt, IotUtilizationAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call. Assets holds every connected asset in scope (up to assetLimit) so the tables sort in the browser.</summary>
public sealed record IotUtilizationAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    IotUtilizationAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IotSummary Summary,
    IotUtilizationTrend UtilizationTrend,
    IotTelemetryOverview Telemetry,
    CountBreakdown Connectivity,
    IReadOnlyList<IotCategoryUtilization> CategoryUtilization,
    IotSensorHealthSummary SensorHealth,
    IotEventsTrend Events,
    IReadOnlyList<IotSiteSummary> Locations,
    IReadOnlyList<IotAssetRow> Variance,
    IReadOnlyList<IotDevicePerformanceRow> Devices,
    IReadOnlyList<IotInsight> Insights,
    IReadOnlyList<IotAlertRow> Alerts,
    IReadOnlyList<IotAssetRow> Assets,
    int AssetTotal);

public sealed record IotAssetListResponse(
    DateTime GeneratedAt,
    IotUtilizationAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<IotAssetRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record IotUtilizationHistoryResponse(DateTime GeneratedAt, string AssetRowId, DashboardPeriodResponse Period, PerformanceSeries History);

public sealed record IotPeriodComparisonResponse(
    DateTime GeneratedAt,
    IotUtilizationAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    DashboardPeriodResponse ComparePeriod,
    IReadOnlyList<PeriodComparisonItem> Metrics,
    PerformanceSeries UtilizationTrend,
    PerformanceSeries CompareUtilizationTrend);

public sealed record IotUtilizationAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> ConnectivityStatuses,
    IReadOnlyList<string> SensorHealthStatuses,
    IReadOnlyList<string> AlertSeverities,
    IReadOnlyList<string> EventSeverities,
    IReadOnlyList<string> AssetSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultUtilizationTarget,
    double SensorHealthTarget,
    int OfflineInsightHours,
    int AutoRefreshSeconds,
    IReadOnlyList<string> ActionPlanPriorities,
    IReadOnlyList<string> ActionPlanStatuses,
    IReadOnlyList<string> InsightKeys);

/// <summary>/filters: Organization, Location and Asset Category (asset register), Device Type (IoT devices) and action plan owners (technicians).</summary>
public sealed record IotUtilizationAnalyticsFilterOptionsResponse(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<DashboardOption> Locations,
    IReadOnlyList<DashboardOption> AssetCategories,
    IReadOnlyList<DashboardOption> DeviceTypes,
    IReadOnlyList<string> Owners);

// ----- Action plans -----

/// <summary>Create action plan. DueDate is yyyy-MM-dd and may not be in the past; Status defaults to Open.</summary>
public sealed record SaveIotUtilizationActionPlanRequest(
    string? Title,
    string? Owner,
    DateOnly? DueDate,
    string? Priority,
    string? Notes,
    string? Status,
    string? InsightKey,
    string? Context,
    IReadOnlyList<string>? DeviceIds,
    string? TenantId,
    string? ClientId);

public sealed record IotUtilizationActionPlanResponse(
    string PlanId,
    string Title,
    string Owner,
    DateOnly DueDate,
    string Priority,
    string? Notes,
    string Status,
    string? InsightKey,
    string? Context,
    IReadOnlyList<string> DeviceIds,
    string? CreatedBy,
    DateTime? CreatedAt,
    DateTime? UpdatedAt)
{
    public static IotUtilizationActionPlanResponse FromEntity(IotUtilizationAnalyticsActionPlan plan) => new(
        plan.PlanId,
        plan.Title,
        plan.Owner,
        DateOnly.FromDateTime(plan.DueDate),
        plan.Priority,
        plan.Notes,
        plan.Status ?? IotUtilizationAnalyticsOptions.OpenPlanStatus,
        plan.InsightKey,
        plan.Context,
        plan.DeviceIds,
        plan.CreatedBy,
        plan.CreatedAt,
        plan.UpdatedAt);
}

public sealed record IotUtilizationActionPlanListResponse(IReadOnlyList<IotUtilizationActionPlanResponse> Items, long TotalCount, int Page, int PageSize);
