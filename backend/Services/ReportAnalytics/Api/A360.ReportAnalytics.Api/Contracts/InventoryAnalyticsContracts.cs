using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class InventoryAnalyticsOptions
{
    public const string AllInventoryViewId = "all-inventory";
    public const string AllInventoryViewName = "All Inventory";
    public const string DefaultDatePreset = "This year";

    public const int DefaultSlowMovingDays = 180;
    public const int MaxSlowMovingDays = 3650;
    public const int DefaultUsageWindowDays = 90;
    public const int MaxUsageWindowDays = 365;
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 500;
    public const int DefaultOverviewRows = 500;

    public const string PurchaseRequestType = "Purchase Request";
    public const string ActionPlanType = "Action Plan";
    public const string OpenStatus = "Open";

    public static readonly OptionList StockStatuses = new(InventoryAnalyticsCalculator.StockStatuses.ToArray());

    public static readonly OptionList Risks = new(InventoryAnalyticsCalculator.Risks.ToArray());

    public static readonly OptionList ReorderSortFields = new("risk", "code", "name", "category", "warehouseName", "available", "reorderLevel", "daysCover", "supplier");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");

    public static readonly OptionList RequestTypes = new(PurchaseRequestType, ActionPlanType);

    public static readonly OptionList RequestPriorities = new("High", "Medium", "Low");

    public static readonly OptionList RequestStatuses = new(OpenStatus, "In Progress", "Completed", "Cancelled");
}

/// <summary>
/// The filter bar shared by every Inventory Analytics data endpoint. viewId (from /views) supplies saved values; the other query values
/// override them ("all" clears one). warehouse / store are names or codes (from /filters), category an item category, stockStatus one of
/// /options stockStatuses. from / to (yyyy-MM-dd) without a preset mean Custom.
/// </summary>
public sealed class InventoryAnalyticsRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Warehouse { get; init; }

    public string? Store { get; init; }

    public string? Category { get; init; }

    public string? StockStatus { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public int? SlowMovingDays { get; init; }

    public int? UsageWindowDays { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IInventoryAnalyticsDataRepository DataRepository { get; init; } = null!;

    public IInventoryAnalyticsViewRepository ViewRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

public sealed record InventoryAnalyticsFiltersRequest(
    string? Organization,
    string? Location,
    string? Warehouse,
    string? Store,
    string? Category,
    string? StockStatus,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Save View.</summary>
public sealed record SaveInventoryAnalyticsViewRequest(
    string? ViewName,
    bool? IsDefault,
    InventoryAnalyticsFiltersRequest? Filters,
    string? TenantId,
    string? ClientId);

public sealed record InventoryAnalyticsFiltersResponse(
    string? Organization,
    string? Location,
    string? Warehouse,
    string? Store,
    string? Category,
    string? StockStatus,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static InventoryAnalyticsFiltersResponse FromEntity(InventoryAnalyticsFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.Warehouse,
        filters.Store,
        filters.Category,
        filters.StockStatus,
        filters.DatePreset ?? InventoryAnalyticsOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record InventoryAnalyticsViewResponse(
    string ViewId,
    string ViewName,
    bool IsBuiltIn,
    bool IsDefault,
    InventoryAnalyticsFiltersResponse Filters,
    DateTime? UpdatedAt)
{
    public static InventoryAnalyticsViewResponse FromEntity(InventoryAnalyticsView view) => new(
        view.ViewId,
        view.ViewName,
        false,
        view.IsDefault,
        InventoryAnalyticsFiltersResponse.FromEntity(view.Filters),
        view.UpdatedAt ?? view.CreatedAt);

    public static InventoryAnalyticsViewResponse AllInventory(bool isDefault) => new(
        InventoryAnalyticsOptions.AllInventoryViewId,
        InventoryAnalyticsOptions.AllInventoryViewName,
        true,
        isDefault,
        InventoryAnalyticsFiltersResponse.FromEntity(new InventoryAnalyticsFilters()),
        null);
}

public sealed record InventoryAnalyticsAppliedFilters(
    string? ViewId,
    string? Organization,
    string? Location,
    string? Warehouse,
    string? Store,
    string? Category,
    string? StockStatus,
    int SlowMovingDays,
    int UsageWindowDays);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record InventoryAnalyticsSection<T>(DateTime GeneratedAt, InventoryAnalyticsAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>Everything on the page in one call. Reorder and slow-moving lists are capped by reorderSize / slowSize; the totals are not.</summary>
public sealed record InventoryAnalyticsOverviewResponse(
    DateTime GeneratedAt,
    InventoryAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    InventorySummary Summary,
    InventoryValueTrend ValueTrend,
    InventoryStockByCategory StockByCategory,
    CountBreakdown StockStatus,
    InventoryConsumptionTrend ConsumptionTrend,
    IReadOnlyList<InventoryWarehouseRow> Warehouses,
    IReadOnlyList<InventoryReorderRow> Reorder,
    int ReorderTotal,
    IReadOnlyList<InventoryReorderRow> CriticalAtRisk,
    InventorySlowMoving SlowMoving,
    IReadOnlyList<InventorySupplierRow> Suppliers);

public sealed record InventoryReorderResponse(
    DateTime GeneratedAt,
    InventoryAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<InventoryReorderRow> Items,
    int TotalCount,
    int Page,
    int PageSize);

public sealed record InventoryPeriodComparisonResponse(
    DateTime GeneratedAt,
    InventoryAnalyticsAppliedFilters Filters,
    DashboardPeriodResponse Period,
    DashboardPeriodResponse ComparePeriod,
    IReadOnlyList<PeriodComparisonItem> Metrics,
    PerformanceSeries ValueTrend,
    PerformanceSeries CompareValueTrend);

/// <summary>/filters: the dropdown values. Warehouses and stores are limited to the organization / location / warehouse given.</summary>
public sealed record InventoryAnalyticsFilterOptionsResponse(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<DashboardOption> Locations,
    IReadOnlyList<InventoryWarehouseOption> Warehouses,
    IReadOnlyList<InventoryStoreOption> Stores,
    IReadOnlyList<DashboardOption> Categories,
    IReadOnlyList<string> StockStatuses);

public sealed record InventoryWarehouseOption(string Value, string Label, string Code, string? Site);

public sealed record InventoryStoreOption(string Value, string Label, string Code, string? Warehouse);

public sealed record InventoryAnalyticsOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> StockStatuses,
    IReadOnlyList<string> Risks,
    IReadOnlyList<string> ReorderSortFields,
    IReadOnlyList<string> ExportFormats,
    IReadOnlyList<string> RequestTypes,
    IReadOnlyList<string> RequestPriorities,
    IReadOnlyList<string> RequestStatuses,
    int DefaultSlowMovingDays,
    int DefaultUsageWindowDays);

/// <summary>Create Purchase Request / Create Action Plan, and their edits. Quantity is required for purchase requests, Assignee and Notes for action plans.</summary>
public sealed record SaveInventoryActionRequest(
    string? RequestType,
    string? Title,
    IReadOnlyList<string>? ItemCodes,
    double? Quantity,
    string? Supplier,
    DateOnly? DueDate,
    string? Priority,
    string? Assignee,
    string? Notes,
    string? Source,
    string? Warehouse,
    string? Status,
    string? TenantId,
    string? ClientId);

public sealed record InventoryActionRequestResponse(
    string RequestId,
    string RequestType,
    string Title,
    IReadOnlyList<string> ItemCodes,
    double? Quantity,
    string? Supplier,
    DateOnly? DueDate,
    string Priority,
    string? Assignee,
    string? Notes,
    string? Source,
    string? Warehouse,
    string Status,
    string? OwnerName,
    DateTime? CreatedAt,
    DateTime? UpdatedAt)
{
    public static InventoryActionRequestResponse FromEntity(InventoryAnalyticsActionRequest request) => new(
        request.RequestId,
        request.RequestType,
        request.Title,
        request.ItemCodes,
        request.Quantity,
        request.Supplier,
        request.DueDate is null ? null : DateOnly.FromDateTime(request.DueDate.Value),
        request.Priority,
        request.Assignee,
        request.Notes,
        request.Source,
        request.Warehouse,
        request.Status ?? InventoryAnalyticsOptions.OpenStatus,
        request.OwnerName,
        request.CreatedAt,
        request.UpdatedAt);
}
