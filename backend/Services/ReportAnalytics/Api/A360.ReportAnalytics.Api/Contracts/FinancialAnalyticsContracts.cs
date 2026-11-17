using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class FinancialAnalyticsOptions
{
    public const string AllFinancialViewId = "all-financial";
    public const string AllFinancialViewName = "All Financials";
    public const string DefaultDatePreset = "This year";

    /// <summary>Amounts are reported as recorded in the asset register and Maintenance; no conversion is applied.</summary>
    public const string BaseCurrency = "AED";

    public const double DefaultBudgetTarget = 90;
    public const double DefaultUsefulLifeYears = 10;
    public const double DefaultMaintenanceRatioLimit = 50;
    public const double DefaultUtilizationThreshold = 25;
    public const int DefaultAssetLimit = 100;
    public const int MaxAssetLimit = 1000;

    public static readonly OptionList CapexDecisions = new("Approve", "Reject", "Request more information");

    public static readonly OptionList CapexStatuses = new(FinancialAnalyticsCapexRequestRepository.Statuses.ToArray());

    public static readonly OptionList ExportFormats = new("xlsx", "csv");
}

/// <summary>
/// The filter bar shared by every Financial Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom. costCenter is a cost center code (or "code name")
/// from /cost-centers. budgetTarget, maintenanceRatioLimit and utilizationThreshold are percentages; defaultUsefulLifeYears depreciates
/// assets that have no useful life in the register or Master Data.
/// </summary>
public sealed class FinancialAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? CostCenter { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? BudgetTarget { get; init; }

    public double? DefaultUsefulLifeYears { get; init; }

    public double? MaintenanceRatioLimit { get; init; }

    public double? UtilizationThreshold { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IFinancialAnalyticsDataRepository FinancialRepository { get; init; } = null!;

    public IFinancialAnalyticsCapexRequestRepository CapexRepository { get; init; } = null!;

    public IAssetPerformanceViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record FinancialAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Category,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View. The cost center and currency are not part of a saved view (the shared view store has no field for them).</summary>
public sealed record SaveFinancialAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    FinancialAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record FinancialAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Category,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static FinancialAnalyticsFiltersResponse FromEntity(AssetPerformanceFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.DatePreset ?? FinancialAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record FinancialAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    FinancialAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static FinancialAnalyticsViewResponse FromEntity(AssetPerformanceView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        FinancialAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static FinancialAnalyticsViewResponse AllFinancial(bool isDefault) => new(
        FinancialAnalyticsOptions.AllFinancialViewId,
        FinancialAnalyticsOptions.AllFinancialViewName,
        true,
        isDefault,
        FinancialAnalyticsFiltersResponse.FromEntity(new AssetPerformanceFilters()),
        null);
}

public sealed record FinancialAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Category,
    string? CostCenter,
    string Currency,
    double BudgetTarget,
    double DefaultUsefulLifeYears,
    double MaintenanceRatioLimit,
    double UtilizationThreshold);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record FinancialAnalyticsSection<T>(DateTime GeneratedAt, FinancialAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call. Assets holds the first assetLimit rows of AssetTotal, highest TCO first.</summary>
public sealed record FinancialAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    FinancialAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    FinancialSummary Summary,
    FinancialTcoTrend TcoTrend,
    FinancialCategoryCosts CategoryCosts,
    FinancialDepreciation Depreciation,
    IReadOnlyList<FinancialCostCenterRow> CostCenters,
    FinancialBudgetUtilization BudgetUtilization,
    IReadOnlyList<FinancialSiteMaintenance> SiteMaintenance,
    IReadOnlyList<FinancialAssetRow> Assets,
    int AssetTotal,
    IReadOnlyList<FinancialCapexRequestRow> CapexRequests,
    IReadOnlyList<FinancialDisposalCandidate> DisposalCandidates,
    IReadOnlyList<FinancialInsight> Insights);

public sealed record FinancialAssetsResponse(
    DateTime GeneratedAt,
    FinancialAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<FinancialAssetRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <summary>A cost center for the Cost Center dropdown: Master Data departments and the cost centers recorded on assets.</summary>
public sealed record FinancialCostCenterOption(string Value, string Label, double? AnnualBudget);

public sealed record FinancialAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    string BaseCurrency,
    IReadOnlyList<string> CostCenterStatuses,
    IReadOnlyList<string> CapexStatuses,
    IReadOnlyList<string> CapexDecisions,
    IReadOnlyList<string> ExportFormats,
    double DefaultBudgetTarget,
    double DefaultUsefulLifeYears,
    double DefaultMaintenanceRatioLimit,
    double DefaultUtilizationThreshold);

/// <summary>Create or update a CAPEX request. Amount is in the base currency unless Currency says otherwise.</summary>
public sealed record SaveFinancialCapexRequest(
    string? Title,
    string? AssetId,
    string? AssetName,
    string? Location,
    string? Category,
    string? CostCenter,
    double? Amount,
    string? Currency,
    string? Justification,
    string? RequestedBy,
    DateTime? SubmittedAt,
    string? TenantId,
    string? ClientId);

/// <summary>CAPEX Approvals: one decision applied to one or more pending requests.</summary>
public sealed record FinancialCapexDecisionRequest(
    IReadOnlyList<string>? RequestIds,
    string? Decision,
    string? Approver,
    string? Comments);

public sealed record FinancialCapexDecisionResponse(string Decision, string Status, IReadOnlyList<FinancialCapexRequestRow> Requests);
