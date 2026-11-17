using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A dashboard in Reports &amp; Analytics / Interactive Dashboards: its widgets, layout, default filters and sharing.</summary>
[BsonIgnoreExtraElements]
public sealed class InteractiveDashboard : BaseEntity
{
    // Business identifier exposed to clients (e.g. DSH-0001); kept separate from the Mongo _id.
    [BsonElement("dashboard_id")]
    public string DashboardId { get; set; } = string.Empty;

    [BsonElement("dashboard_name")]
    public string DashboardName { get; set; } = string.Empty;

    [BsonElement("description")]
    public string? Description { get; set; }

    // Dashboard Information "Role", e.g. Asset Manager: who the dashboard is meant for.
    [BsonElement("audience_role")]
    public string? AudienceRole { get; set; }

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    // Private, Shared (only the people in shared_with) or Organization.
    [BsonElement("visibility")]
    public string Visibility { get; set; } = string.Empty;

    [BsonElement("shared_with")]
    public DashboardSharing SharedWith { get; set; } = new();

    // User ids that starred the dashboard.
    [BsonElement("favorited_by")]
    public List<string> FavoritedBy { get; set; } = [];

    // Filter bar values the dashboard opens with.
    [BsonElement("default_filters")]
    public DashboardFilters DefaultFilters { get; set; } = new();

    [BsonElement("widgets")]
    public List<DashboardWidget> Widgets { get; set; } = [];
}

public sealed class DashboardSharing
{
    [BsonElement("users")]
    public List<DashboardShareEntry> Users { get; set; } = [];

    [BsonElement("groups")]
    public List<DashboardShareEntry> Groups { get; set; } = [];
}

public sealed class DashboardShareEntry
{
    [BsonElement("id")]
    public string Id { get; set; } = string.Empty;

    [BsonElement("name")]
    public string? Name { get; set; }

    // View or Edit.
    [BsonElement("permission")]
    public string Permission { get; set; } = string.Empty;
}

/// <summary>Organization, Location, Asset Category and the date range on the filter bar.</summary>
public sealed class DashboardFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("asset_category")]
    public string? AssetCategory { get; set; }

    // Today, Last 7 days, This month, ...; Custom uses date_from / date_to.
    [BsonElement("date_preset")]
    public string? DatePreset { get; set; }

    [BsonElement("date_from")]
    public DateTime? DateFrom { get; set; }

    [BsonElement("date_to")]
    public DateTime? DateTo { get; set; }

    [BsonElement("time_zone")]
    public string? TimeZone { get; set; }
}

public sealed class DashboardWidget
{
    // Stable within the dashboard (e.g. w-1a2b3c4d) so the client can move, edit or refresh one widget.
    [BsonElement("widget_id")]
    public string WidgetId { get; set; } = string.Empty;

    // kpi_card, line_chart, bar_chart, donut_chart, table, map or heatmap.
    [BsonElement("widget_type")]
    public string WidgetType { get; set; } = string.Empty;

    // What the widget shows, from the metric catalog (total_assets, maintenance_cost_by_category, ...).
    [BsonElement("metric")]
    public string Metric { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("position")]
    public DashboardWidgetPosition Position { get; set; } = new();

    [BsonElement("settings")]
    public DashboardWidgetSettings Settings { get; set; } = new();
}

/// <summary>Grid placement: column, row, width and height in grid cells (12 columns).</summary>
public sealed class DashboardWidgetPosition
{
    [BsonElement("x")]
    public int X { get; set; }

    [BsonElement("y")]
    public int Y { get; set; }

    [BsonElement("w")]
    public int W { get; set; }

    [BsonElement("h")]
    public int H { get; set; }
}

public sealed class DashboardWidgetSettings
{
    // Rows in a table or bars before the rest become "Other".
    [BsonElement("limit")]
    public int? Limit { get; set; }

    // Months shown by a trend.
    [BsonElement("months")]
    public int? Months { get; set; }

    // Show the change against the previous period of the same length.
    [BsonElement("show_comparison")]
    public bool ShowComparison { get; set; } = true;

    [BsonElement("orientation")]
    public string? Orientation { get; set; }
}
