using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class ProductionAnalyticsOptions
{
    public const string AllProductionViewId = "all-production";
    public const string AllProductionViewName = "All Production";
    public const string DefaultDatePreset = "This year";

    public const double DefaultUtilizationTarget = 85;
    public const double DefaultAtRiskGap = 15;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;
    public const int DefaultBottleneckLimit = 5;
    public const int MaxBottleneckLimit = 100;

    public static readonly OptionList Statuses = new(ProductionAnalyticsCalculator.Statuses.ToArray());

    public static readonly OptionList Stages = new(ProductionAnalyticsCalculator.Stages.ToArray());

    public static readonly OptionList Schedules = new(ProductionAnalyticsCalculator.Schedules.ToArray());

    public static readonly OptionList Risks = new(ProductionAnalyticsCalculator.Risks.ToArray());

    public static readonly OptionList OrderSortFields = new("schedule", "dueDate", "orderNo", "product", "line", "progress", "wipQty", "wipValue", "status");

    public static readonly OptionList ExportFormats = new("xlsx");
}

/// <summary>
/// The filter bar shared by every WIP / Production Analytics data endpoint. viewId (from /views) supplies saved values; the other query
/// values override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. utilizationTarget is in percent (default
/// 85); outputTarget adds a monthly Target line to the output trend; atRiskGap is how many progress points behind schedule makes an order
/// At Risk (default 15).
/// </summary>
public sealed class ProductionAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Plant { get; init; }

    public string? ProductionLine { get; init; }

    public string? WorkCenter { get; init; }

    public string? Product { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? UtilizationTarget { get; init; }

    public double? OutputTarget { get; init; }

    public double? AtRiskGap { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IAssetPerformanceViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record ProductionAnalyticsFiltersRequest(
    string? Organization,
    string? Plant,
    string? ProductionLine,
    string? WorkCenter,
    string? Product,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveProductionAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    ProductionAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record ProductionAnalyticsFiltersResponse(
    string? Organization,
    string? Plant,
    string? ProductionLine,
    string? WorkCenter,
    string? Product,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    // The plant is kept in the shared Location filter of the saved view.
    public static ProductionAnalyticsFiltersResponse FromEntity(AssetPerformanceFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.ProductionLine,
        filters.WorkCenter,
        filters.Product,
        filters.DatePreset ?? ProductionAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record ProductionAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    ProductionAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static ProductionAnalyticsViewResponse FromEntity(AssetPerformanceView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        ProductionAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static ProductionAnalyticsViewResponse AllProduction(bool isDefault) => new(
        ProductionAnalyticsOptions.AllProductionViewId,
        ProductionAnalyticsOptions.AllProductionViewName,
        true,
        isDefault,
        ProductionAnalyticsFiltersResponse.FromEntity(new AssetPerformanceFilters()),
        null);
}

public sealed record ProductionAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Plant,
    string? ProductionLine,
    string? WorkCenter,
    string? Product,
    double UtilizationTarget,
    double? OutputTarget,
    double AtRiskGap);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record ProductionAnalyticsSection<T>(DateTime GeneratedAt, ProductionAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call.</summary>
public sealed record ProductionAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    ProductionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    ProductionSummary Summary,
    PerformanceSeries OutputTrend,
    WipByStage WipByStage,
    CountBreakdown WorkOrderStatus,
    IReadOnlyList<LineUtilization> UtilizationByLine,
    IReadOnlyList<ProductionInsight> Insights,
    ProductionDowntime DowntimeByCause,
    PerformanceSeries EfficiencyTrend,
    IReadOnlyList<ProductionOrderRow> ActiveOrders,
    int ActiveOrdersTotal,
    IReadOnlyList<BottleneckRow> Bottlenecks);

public sealed record ProductionOrdersResponse(
    DateTime GeneratedAt,
    ProductionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<ProductionOrderRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record ProductionPeriodComparisonResponse(
    DateTime GeneratedAt,
    ProductionAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    DashboardPeriodResponse ComparePeriod,
    string OutputUnit,
    IReadOnlyList<PeriodComparisonItem> Metrics,
    PerformanceSeries OutputTrend,
    PerformanceSeries CompareOutputTrend);

public sealed record ProductionAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> Stages,
    IReadOnlyList<string> Schedules,
    IReadOnlyList<string> DowntimeCauses,
    IReadOnlyList<string> Risks,
    IReadOnlyList<string> OrderSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultUtilizationTarget,
    double DefaultAtRiskGap);
