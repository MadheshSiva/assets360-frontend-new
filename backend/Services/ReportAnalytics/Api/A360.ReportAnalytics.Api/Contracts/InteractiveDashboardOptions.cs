using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>An entry in the Widget Library panel.</summary>
public sealed record DashboardWidgetType(string Key, string Label, string Description, string Icon, int DefaultWidth, int DefaultHeight);

/// <summary>
/// Something a widget can show. Shape is the form of its data (kpi, category, series, table, map or matrix);
/// WidgetTypes are the library entries that can draw it, the first being the default.
/// </summary>
public sealed record DashboardMetric(
    string Key,
    string Label,
    string Module,
    string Description,
    string Shape,
    IReadOnlyList<string> WidgetTypes,
    bool UsesDateRange);

public static class InteractiveDashboardOptions
{
    public const int MaxWidgets = 40;
    public const int GridColumns = 12;
    public const int MaxWidgetHeight = 20;
    public const int DefaultTopLimit = 5;
    public const int MaxLimit = 50;
    public const int DefaultTrendMonths = 10;
    public const int MaxTrendMonths = 24;

    public const string ViewPermission = "View";
    public const string EditPermission = "Edit";

    public const string KpiCard = "kpi_card";
    public const string LineChart = "line_chart";
    public const string BarChart = "bar_chart";
    public const string DonutChart = "donut_chart";
    public const string Table = "table";
    public const string Map = "map";
    public const string Heatmap = "heatmap";

    public const string KpiShape = "kpi";
    public const string CategoryShape = "category";
    public const string SeriesShape = "series";
    public const string TableShape = "table";
    public const string MapShape = "map";
    public const string MatrixShape = "matrix";

    public const string DefaultDatePreset = "This month";
    public const string CustomDatePreset = "Custom";

    public static readonly OptionList Visibilities = new(
        InteractiveDashboardRepository.PrivateVisibility,
        InteractiveDashboardRepository.SharedVisibility,
        InteractiveDashboardRepository.OrganizationVisibility);

    public static readonly OptionList Permissions = new(ViewPermission, EditPermission);

    // My Dashboards, Shared with me and Favorites on the selector bar; all is every dashboard the user can open.
    public static readonly OptionList Views = new(
        InteractiveDashboardRepository.AllView,
        InteractiveDashboardRepository.MyView,
        InteractiveDashboardRepository.SharedView,
        InteractiveDashboardRepository.FavoritesView);

    public static readonly OptionList DatePresets = new(
        "Today",
        "Last 7 days",
        "Last 30 days",
        "This month",
        "Last month",
        "This quarter",
        "This year",
        CustomDatePreset);

    public static readonly OptionList ExportFormats = new("xlsx");

    public static readonly OptionList Orientations = new("vertical", "horizontal");

    public static readonly IReadOnlyList<DashboardWidgetType> WidgetTypes =
    [
        new(KpiCard, "KPI Card", "A single figure with its change against the previous period", "kpi", 3, 2),
        new(LineChart, "Line Chart", "A trend over months", "line-chart", 7, 4),
        new(BarChart, "Bar Chart", "Values compared across categories", "bar-chart", 5, 4),
        new(DonutChart, "Donut Chart", "Share of a total by category", "donut-chart", 4, 4),
        new(Table, "Table", "Rows of records or values", "table", 12, 4),
        new(Map, "Map", "Assets by location", "map", 4, 4),
        new(Heatmap, "Heatmap", "Counts across two dimensions", "heatmap", 6, 4)
    ];

    public static readonly OptionList WidgetTypeKeys = new(WidgetTypes.Select(type => type.Key).ToArray());

    public static readonly IReadOnlyList<DashboardMetric> Metrics =
    [
        new("total_assets", "Total Assets", "Assets", "Assets registered by the end of the period", KpiShape, [KpiCard], true),
        new("active_work_orders", "Active Work Orders", "Maintenance", "Work orders in the period that are not completed, closed or cancelled", KpiShape, [KpiCard], true),
        new("preventive_compliance", "Preventive Compliance", "Maintenance", "Share of preventive work orders in the period that are completed (cancelled ones excluded)", KpiShape, [KpiCard], true),
        new("inventory_value", "Inventory Value", "Inventory", "Spare parts in stock × unit cost", KpiShape, [KpiCard], true),
        new("maintenance_cost", "Maintenance Cost", "Maintenance", "Maintenance cost recorded in the period", KpiShape, [KpiCard], true),
        new("asset_health_trend", "Asset Health Score Trend", "Assets", "Assets that are Healthy (70+), At Risk (40–69) or Critical (under 40) at each month end, from their latest condition assessment", SeriesShape, [LineChart, BarChart, Table], true),
        new("maintenance_cost_by_category", "Maintenance Cost by Category", "Maintenance", "Maintenance cost in the period by asset category", CategoryShape, [BarChart, DonutChart, Table], true),
        new("asset_status_distribution", "Asset Status Distribution", "Assets", "Assets by status", CategoryShape, [DonutChart, BarChart, Table], false),
        new("assets_by_category", "Assets by Category", "Assets", "Assets by asset category", CategoryShape, [BarChart, DonutChart, Table], false),
        new("open_work_orders_by_priority", "Open Work Orders by Priority", "Maintenance", "Work orders not yet completed, closed or cancelled, by priority", CategoryShape, [BarChart, DonutChart, Table], false),
        new("asset_locations", "Asset Locations", "Assets", "Assets per location with their worst state: Critical, Maintenance, Inspection or Active", MapShape, [Map, Table], false),
        new("asset_location_status_heatmap", "Assets by Location and Status", "Assets", "Asset count for each location and status", MatrixShape, [Heatmap, Table], false),
        new("assets_requiring_attention", "Top Assets Requiring Attention", "Assets", "Assets with the lowest health score or an open issue", TableShape, [Table], false)
    ];

    public static DashboardMetric? FindMetric(string? key) =>
        Metrics.FirstOrDefault(metric => string.Equals(metric.Key, key?.Trim(), StringComparison.OrdinalIgnoreCase));

    public static DashboardWidgetType? FindWidgetType(string? key) =>
        WidgetTypes.FirstOrDefault(type => string.Equals(type.Key, key?.Trim(), StringComparison.OrdinalIgnoreCase));

    public static IReadOnlyList<DashboardTemplate> Templates { get; } =
    [
        new("blank", "Blank dashboard", "Start with an empty canvas", []),
        new("executive-asset-overview", "Executive Asset Overview",
            "Executive view of asset performance, maintenance, inspections, inventory and operations.",
            [
                new(KpiCard, "total_assets", "Total Assets", 0, 0, 3, 2, null),
                new(KpiCard, "active_work_orders", "Active Work Orders", 3, 0, 3, 2, null),
                new(KpiCard, "preventive_compliance", "Preventive Compliance", 6, 0, 3, 2, null),
                new(KpiCard, "inventory_value", "Inventory Value", 9, 0, 3, 2, null),
                new(LineChart, "asset_health_trend", "Asset Health Score Trend", 0, 2, 7, 4, null),
                new(BarChart, "maintenance_cost_by_category", "Maintenance Cost by Category", 7, 2, 5, 4, null),
                new(DonutChart, "asset_status_distribution", "Asset Status Distribution", 0, 6, 4, 4, null),
                new(BarChart, "open_work_orders_by_priority", "Open Work Orders by Priority", 4, 6, 4, 4, "horizontal"),
                new(Map, "asset_locations", "Asset Locations", 8, 6, 4, 4, null),
                new(Table, "assets_requiring_attention", "Top 5 Assets Requiring Attention", 0, 10, 12, 4, null)
            ])
    ];

    public static DashboardTemplate? FindTemplate(string? key) =>
        Templates.FirstOrDefault(template => string.Equals(template.Key, key?.Trim(), StringComparison.OrdinalIgnoreCase));
}

public sealed record DashboardTemplate(string Key, string Name, string Description, IReadOnlyList<DashboardTemplateWidget> Widgets);

public sealed record DashboardTemplateWidget(string WidgetType, string Metric, string Title, int X, int Y, int W, int H, string? Orientation);

/// <summary>The resolved date range: [FromUtc, ToUtc) and the period of the same length just before it.</summary>
public sealed record DashboardPeriod(
    string Preset,
    DateOnly From,
    DateOnly To,
    string TimeZone,
    DateTime FromUtc,
    DateTime ToUtc,
    DateTime PreviousFromUtc,
    DateTime PreviousToUtc,
    TimeZoneInfo Zone);

public static class DashboardPeriods
{
    /// <summary>Whole days in the zone. Custom needs both dates; the other presets are worked out from today.</summary>
    public static DashboardPeriod Resolve(string preset, DateOnly? from, DateOnly? to, TimeZoneInfo zone, string timeZoneId, DateTime utcNow)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone));
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var quarterStart = new DateOnly(today.Year, (today.Month - 1) / 3 * 3 + 1, 1);

        var (start, end) = preset switch
        {
            "Today" => (today, today),
            "Last 7 days" => (today.AddDays(-6), today),
            "Last 30 days" => (today.AddDays(-29), today),
            "Last month" => (monthStart.AddMonths(-1), monthStart.AddDays(-1)),
            "This quarter" => (quarterStart, quarterStart.AddMonths(3).AddDays(-1)),
            "This year" => (new DateOnly(today.Year, 1, 1), new DateOnly(today.Year, 12, 31)),
            InteractiveDashboardOptions.CustomDatePreset => (from!.Value, to!.Value),
            _ => (monthStart, monthStart.AddMonths(1).AddDays(-1))
        };

        var fromUtc = StartOfDayUtc(start, zone);
        var toUtc = StartOfDayUtc(end.AddDays(1), zone);
        var days = end.DayNumber - start.DayNumber + 1;
        var previousFrom = StartOfDayUtc(start.AddDays(-days), zone);

        return new DashboardPeriod(preset, start, end, timeZoneId, fromUtc, toUtc, previousFrom, fromUtc, zone);
    }

    public static DateTime StartOfDayUtc(DateOnly date, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), zone);
}
