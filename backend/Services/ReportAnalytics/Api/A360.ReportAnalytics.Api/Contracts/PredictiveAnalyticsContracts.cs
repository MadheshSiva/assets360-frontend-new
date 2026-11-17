using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class PredictiveAnalyticsOptions
{
    public const string AllPredictionsViewId = "all-predictions";
    public const string AllPredictionsViewName = "All Predictions";
    public const string DefaultDatePreset = "This year";

    public const double DefaultAccuracyTarget = 90;
    public const double DefaultReviewConfidence = 70;
    public const int DefaultFailureWindowDays = 30;
    public const int MaxFailureWindowDays = 365;
    public const int DefaultToleranceDays = 7;
    public const int MaxToleranceDays = 90;
    public const double DefaultHighRiskScore = 60;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 500;

    public static readonly OptionList RiskLevels = new(PredictiveAnalyticsCalculator.RiskLevels.ToArray());

    public static readonly OptionList PredictionLists = new(PredictiveAnalyticsCalculator.PredictionLists.ToArray());

    public static readonly OptionList PredictionSortFields = new("riskScore", "assetId", "assetName", "location", "failureWindowDays", "remainingUsefulLifeHours", "confidence", "owner");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");
}

/// <summary>
/// The filter bar shared by every Predictive Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. riskLevel keeps the assets currently at that level.
/// accuracyTarget and reviewConfidence are percentages; failureWindowDays is the "predicted failures" horizon; toleranceDays how close a
/// recorded failure must be to the predicted date; highRiskScore the risk score drawn as the high-risk threshold.
/// </summary>
public sealed class PredictiveAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? AssetType { get; init; }

    public string? RiskLevel { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? AccuracyTarget { get; init; }

    public double? ReviewConfidence { get; init; }

    public int? FailureWindowDays { get; init; }

    public int? ToleranceDays { get; init; }

    public double? HighRiskScore { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IPredictiveAnalyticsDataRepository PredictiveRepository { get; init; } = null!;

    public IPredictiveAnalyticsViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record PredictiveAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? RiskLevel,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SavePredictiveAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    PredictiveAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record PredictiveAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? RiskLevel,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static PredictiveAnalyticsFiltersResponse FromEntity(PredictiveAnalyticsFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.AssetType,
        filters.RiskLevel,
        filters.DatePreset ?? PredictiveAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record PredictiveAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    PredictiveAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static PredictiveAnalyticsViewResponse FromEntity(PredictiveAnalyticsView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        PredictiveAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static PredictiveAnalyticsViewResponse AllPredictions(bool isDefault) => new(
        PredictiveAnalyticsOptions.AllPredictionsViewId,
        PredictiveAnalyticsOptions.AllPredictionsViewName,
        true,
        isDefault,
        PredictiveAnalyticsFiltersResponse.FromEntity(new PredictiveAnalyticsFilters()),
        null);
}

public sealed record PredictiveAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? AssetType,
    string? RiskLevel,
    double AccuracyTarget,
    double ReviewConfidence,
    int FailureWindowDays,
    int ToleranceDays,
    double HighRiskScore);

/// <summary>One page section with its context; GeneratedAt drives "updated n min ago".</summary>
public sealed record PredictiveAnalyticsSection<T>(DateTime GeneratedAt, PredictiveAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call. Predictions holds every monitored asset (capped by predictionLimit).</summary>
public sealed record PredictiveAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    PredictiveAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    PredictiveSummary Summary,
    FailureRiskTrend RiskTrend,
    RemainingLifeForecast RemainingLife,
    RiskDistribution RiskDistribution,
    AnomalyEvents Anomalies,
    PredictionAccuracy Accuracy,
    PredictiveMaintenanceCost MaintenanceCost,
    IReadOnlyList<ModelPerformanceRow> ModelPerformance,
    IReadOnlyList<PredictiveInsight> Insights,
    IReadOnlyList<AssetPrediction> Predictions,
    int PredictionTotal);

public sealed record PredictionListResponse(
    DateTime GeneratedAt,
    PredictiveAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    string List,
    IReadOnlyList<AssetPrediction> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record PredictiveAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> RiskLevels,
    IReadOnlyList<string> PredictionLists,
    IReadOnlyList<string> PredictionSortFields,
    IReadOnlyList<string> ExportFormats,
    double DefaultAccuracyTarget,
    double DefaultReviewConfidence,
    int DefaultFailureWindowDays,
    int DefaultToleranceDays,
    double DefaultHighRiskScore);
