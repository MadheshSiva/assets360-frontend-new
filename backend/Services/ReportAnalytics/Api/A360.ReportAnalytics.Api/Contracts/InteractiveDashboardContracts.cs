using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>Position is in grid cells on a 12-column grid; a missing position places the widget below the others at its default size.</summary>
public sealed record DashboardWidgetRequest(
    string? WidgetId,
    string? WidgetType,
    string? Metric,
    string? Title,
    DashboardWidgetPositionRequest? Position,
    DashboardWidgetSettingsRequest? Settings);

public sealed record DashboardWidgetPositionRequest(int? X, int? Y, int? W, int? H);

/// <summary>Limit: table rows or bars before "Other"; Months: trend length; Orientation: vertical or horizontal bars.</summary>
public sealed record DashboardWidgetSettingsRequest(int? Limit, int? Months, bool? ShowComparison, string? Orientation);

/// <summary>
/// The filter bar. Organization is an organization id or name, Location a site, AssetCategory a category (values from GET /filters);
/// empty means all. DatePreset Custom uses DateFrom and DateTo (whole days in TimeZone).
/// </summary>
public sealed record DashboardFiltersRequest(
    string? Organization,
    string? Location,
    string? AssetCategory,
    string? DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string? TimeZone);

/// <summary>Create Dashboard. TemplateKey (from /options) fills the widgets when none are given.</summary>
public sealed record CreateInteractiveDashboardRequest(
    string? DashboardName,
    string? Description,
    string? AudienceRole,
    string? Visibility,
    string? TemplateKey,
    DashboardFiltersRequest? DefaultFilters,
    IReadOnlyList<DashboardWidgetRequest>? Widgets,
    string? TenantId,
    string? ClientId);

/// <summary>Edit Dashboard: replaces the name, information, default filters and the whole widget list. Sharing is changed with PUT /share.</summary>
public sealed record UpdateInteractiveDashboardRequest(
    string? DashboardName,
    string? Description,
    string? AudienceRole,
    DashboardFiltersRequest? DefaultFilters,
    IReadOnlyList<DashboardWidgetRequest>? Widgets);

/// <summary>Drag and drop: new positions for the listed widgets; others keep theirs.</summary>
public sealed record DashboardLayoutRequest(IReadOnlyList<DashboardLayoutItemRequest>? Widgets);

public sealed record DashboardLayoutItemRequest(string? WidgetId, int? X, int? Y, int? W, int? H);

/// <summary>Share. Visibility Private, Shared (only the listed users and groups) or Organization. Permission is View (default) or Edit.</summary>
public sealed record ShareInteractiveDashboardRequest(
    string? Visibility,
    IReadOnlyList<DashboardShareRequest>? Users,
    IReadOnlyList<DashboardShareRequest>? Groups);

public sealed record DashboardShareRequest(string? Id, string? Name, string? Permission);

public sealed record FavoriteInteractiveDashboardRequest(bool IsFavorite);

public sealed record DuplicateInteractiveDashboardRequest(string? DashboardName);

/// <summary>Data for a widget that is not saved yet (Add Widget preview).</summary>
public sealed record DashboardWidgetPreviewRequest(DashboardWidgetRequest? Widget, DashboardFiltersRequest? Filters, string? TenantId, string? ClientId);

public sealed record InteractiveDashboardListItemResponse(
    string Id,
    string DashboardId,
    string DashboardName,
    string? Description,
    string? OwnerId,
    string? OwnerName,
    string Visibility,
    int WidgetCount,
    bool IsFavorite,
    string AccessRole,
    DateTime? UpdatedAt)
{
    public static InteractiveDashboardListItemResponse FromEntity(InteractiveDashboard dashboard, string? viewerId) => new(
        dashboard.Id,
        dashboard.DashboardId,
        dashboard.DashboardName,
        dashboard.Description,
        dashboard.OwnerId,
        dashboard.OwnerName,
        dashboard.Visibility,
        dashboard.Widgets.Count,
        viewerId is not null && dashboard.FavoritedBy.Contains(viewerId),
        InteractiveDashboardAccess.AccessRole(dashboard, viewerId),
        dashboard.UpdatedAt);
}

public sealed record InteractiveDashboardListResponse(
    IReadOnlyCollection<InteractiveDashboardListItemResponse> Items,
    long TotalCount,
    int Page,
    int PageSize);

public sealed record DashboardFiltersResponse(
    string? Organization,
    string? Location,
    string? AssetCategory,
    string DatePreset,
    DateOnly? DateFrom,
    DateOnly? DateTo,
    string TimeZone)
{
    public static DashboardFiltersResponse FromEntity(DashboardFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.DatePreset ?? InteractiveDashboardOptions.DefaultDatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone ?? ReportPeriods.DefaultTimeZone);
}

public sealed record DashboardInformationResponse(
    DateTime? LastUpdated,
    string? UpdatedBy,
    DateTime? CreatedAt,
    string? CreatedBy,
    int SharedUserCount,
    int SharedGroupCount,
    string SharedSummary,
    string? AudienceRole,
    string? Description);

public sealed record InteractiveDashboardResponse(
    string Id,
    string DashboardId,
    string DashboardName,
    string? Description,
    string? AudienceRole,
    string? OwnerId,
    string? OwnerName,
    string Visibility,
    DashboardSharing SharedWith,
    bool IsFavorite,
    string AccessRole,
    bool CanEdit,
    bool CanShare,
    DashboardFiltersResponse DefaultFilters,
    IReadOnlyList<DashboardWidget> Widgets,
    DashboardInformationResponse Information,
    string? TenantId,
    string? ClientId)
{
    public static InteractiveDashboardResponse FromEntity(InteractiveDashboard dashboard, string? viewerId) => new(
        dashboard.Id,
        dashboard.DashboardId,
        dashboard.DashboardName,
        dashboard.Description,
        dashboard.AudienceRole,
        dashboard.OwnerId,
        dashboard.OwnerName,
        dashboard.Visibility,
        dashboard.SharedWith,
        viewerId is not null && dashboard.FavoritedBy.Contains(viewerId),
        InteractiveDashboardAccess.AccessRole(dashboard, viewerId),
        InteractiveDashboardAccess.CanEdit(dashboard, viewerId),
        InteractiveDashboardAccess.CanManage(dashboard, viewerId),
        DashboardFiltersResponse.FromEntity(dashboard.DefaultFilters),
        dashboard.Widgets,
        new DashboardInformationResponse(
            dashboard.UpdatedAt ?? dashboard.CreatedAt,
            dashboard.UpdatedBy ?? dashboard.CreatedBy,
            dashboard.CreatedAt,
            dashboard.CreatedBy,
            dashboard.SharedWith.Users.Count,
            dashboard.SharedWith.Groups.Count,
            InteractiveDashboardMappings.SharedSummary(dashboard),
            dashboard.AudienceRole,
            dashboard.Description),
        dashboard.TenantId,
        dashboard.ClientId);
}

public sealed record DashboardShareResponse(string DashboardId, string Visibility, DashboardSharing SharedWith, string SharedSummary, string ShareUrl);

public sealed record DashboardWidgetDataResponse(
    string WidgetId,
    string WidgetType,
    string Metric,
    string Title,
    string Shape,
    object? Data,
    string? Error);

public sealed record DashboardPeriodResponse(
    string Preset,
    DateOnly From,
    DateOnly To,
    string TimeZone,
    DateTime FromUtc,
    DateTime ToUtc,
    DateTime PreviousFromUtc,
    DateTime PreviousToUtc)
{
    public static DashboardPeriodResponse FromPeriod(DashboardPeriod period) => new(
        period.Preset, period.From, period.To, period.TimeZone, period.FromUtc, period.ToUtc, period.PreviousFromUtc, period.PreviousToUtc);
}

public sealed record DashboardAppliedFilters(string? Organization, string? Location, string? AssetCategory);

/// <summary>GeneratedAt drives "Updated n min ago".</summary>
public sealed record DashboardDataResponse(
    string? DashboardId,
    string? DashboardName,
    DateTime GeneratedAt,
    DashboardAppliedFilters Filters,
    DashboardPeriodResponse Period,
    IReadOnlyList<DashboardWidgetDataResponse> Widgets);

public sealed record DashboardTemplateResponse(string Key, string Name, string Description, int WidgetCount);

public sealed record DashboardMetricOption(string Key, string Label, string Module);

public sealed record DashboardWidgetLibraryItem(
    string Key,
    string Label,
    string Description,
    string Icon,
    int DefaultWidth,
    int DefaultHeight,
    IReadOnlyList<DashboardMetricOption> Metrics);

public sealed record InteractiveDashboardOptionsResponse(
    IReadOnlyList<string> Views,
    IReadOnlyList<string> Visibilities,
    IReadOnlyList<string> Permissions,
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> ExportFormats,
    IReadOnlyList<string> Orientations,
    IReadOnlyList<DashboardWidgetType> WidgetTypes,
    IReadOnlyList<DashboardMetric> Metrics,
    IReadOnlyList<DashboardTemplateResponse> Templates,
    int GridColumns,
    int MaxWidgets);
