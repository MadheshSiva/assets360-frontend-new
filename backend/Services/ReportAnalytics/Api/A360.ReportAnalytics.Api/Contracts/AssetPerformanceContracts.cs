using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Contracts;

public static class AssetPerformanceOptions
{
    public const string AllAssetsViewId = "all-assets";
    public const string AllAssetsViewName = "All Assets";
    public const string DefaultDatePreset = "This year";

    public const double DefaultHealthThreshold = 60;
    public const double DefaultUtilizationTarget = 60;
    public const int DefaultTopCount = 3;
    public const int DefaultBottomCount = 2;
    public const int MaxTopBottom = 25;
    public const int MinCompareAssets = 2;
    public const int MaxCompareAssets = 5;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 200;

    public static readonly OptionList Statuses = new(
        AssetPerformanceCalculator.TopPerformer,
        AssetPerformanceCalculator.OnTrack,
        AssetPerformanceCalculator.Underperforming,
        AssetPerformanceCalculator.NotRated);

    public static readonly OptionList ScoreBands = new(AssetPerformanceCalculator.Bands.Select(band => band.Band).ToArray());

    public static readonly OptionList AssetSortFields = new(
        "performanceScore", "healthScore", "utilization", "availability", "downtimeHours", "failures", "mtbfHours", "assetId", "assetName", "location");

    public static readonly OptionList LocationSortFields = new(
        "averageHealthScore", "utilization", "availability", "performanceScore", "assetCount", "location");

    public static readonly OptionList ExportFormats = new("xlsx");
}

/// <summary>
/// The filter bar shared by every Asset Performance endpoint. viewId (from /views) supplies saved values; the other query values override them
/// ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom.
/// </summary>
public sealed record AssetPerformanceQuery(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? DatePreset,
    DateOnly? From,
    DateOnly? To,
    string? TimeZone,
    double? HealthThreshold,
    double? UtilizationTarget,
    string? TenantId,
    string? ClientId);

public sealed record AssetPerformanceFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveAssetPerformanceViewRequest(
    string? ViewName,
    bool? IsDefault,
    AssetPerformanceFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

/// <summary>Compare Assets: 2 to 5 assets by asset id (e.g. A360-1042) or record id, measured over the filter bar's period.</summary>
public sealed record CompareAssetsRequest(IReadOnlyList<string>? AssetIds);

public sealed record AssetPerformanceFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static AssetPerformanceFiltersResponse FromEntity(AssetPerformanceFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.AssetType,
        filters.DatePreset ?? AssetPerformanceOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record AssetPerformanceViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    AssetPerformanceFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static AssetPerformanceViewResponse FromEntity(AssetPerformanceView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        AssetPerformanceFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static AssetPerformanceViewResponse AllAssets(bool isDefault) => new(
        AssetPerformanceOptions.AllAssetsViewId,
        AssetPerformanceOptions.AllAssetsViewName,
        true,
        isDefault,
        AssetPerformanceFiltersResponse.FromEntity(new AssetPerformanceFilters()),
        null);
}

public sealed record AssetPerformanceAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    double HealthThreshold,
    double UtilizationTarget);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record AssetPerformanceSection<T>(DateTime GeneratedAt, AssetPerformanceAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call.</summary>
public sealed record AssetPerformanceOverviewResponse(
    DateTime GeneratedAt,
    AssetPerformanceAppliedFilters Filters,
    DashboardPeriodResponse Period,
    AssetPerformanceSummary Summary,
    PerformanceSeries HealthTrend,
    IReadOnlyList<CategoryUtilization> UtilizationByCategory,
    IReadOnlyList<PerformanceInsight> Insights,
    ScoreDistribution ScoreDistribution,
    ReliabilitySummary Reliability,
    DowntimeSummary Downtime,
    TopBottomAssets TopBottom,
    IReadOnlyList<LocationPerformanceRow> Locations);

public sealed record AssetPerformanceListResponse(
    DateTime GeneratedAt,
    AssetPerformanceAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<AssetPerformanceRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record AssetComparisonResponse(
    DateTime GeneratedAt,
    AssetPerformanceAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<AssetComparison> Assets,
    IReadOnlyList<string> NotFound);

public sealed record AssetPerformanceBandOption(string Band, double Min, double Max);

public sealed record AssetPerformanceOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<AssetPerformanceBandOption> ScoreBands,
    IReadOnlyList<string> AssetSortFields,
    IReadOnlyList<string> LocationSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultHealthThreshold,
    double DefaultUtilizationTarget,
    int MinCompareAssets,
    int MaxCompareAssets);
