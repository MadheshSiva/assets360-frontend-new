using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// A KPI in the KPI Dashboard library, shared by the tenant. Custom KPIs (IsBuiltIn false) are created by users; a document with
/// IsBuiltIn true and the id of a built-in KPI holds the user changes (name, target, direction, owner, review date) to that KPI.
/// Metric names the figure worked out from live records; without one the KPI shows ManualValue.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class KpiDashboardKpi : BaseEntity
{
    // Business identifier exposed to clients: a built-in id (e.g. "health") or KPI-0001 for a custom KPI.
    [BsonElement("kpi_id")]
    public string KpiId { get; set; } = string.Empty;

    [BsonElement("is_built_in")]
    public bool IsBuiltIn { get; set; }

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    // Asset, Maintenance, Inspection, Inventory, Operations, Compliance or Financial.
    [BsonElement("module")]
    public string Module { get; set; } = string.Empty;

    // %, count, AED, x or hrs.
    [BsonElement("unit")]
    public string Unit { get; set; } = string.Empty;

    // higher or lower (which way is better).
    [BsonElement("direction")]
    public string Direction { get; set; } = "higher";

    [BsonElement("target")]
    public double? Target { get; set; }

    [BsonElement("owner")]
    public string? Owner { get; set; }

    [BsonElement("info")]
    public string? Info { get; set; }

    // A metric key from the KPI catalogue; null for a manually reported KPI.
    [BsonElement("metric")]
    public string? Metric { get; set; }

    [BsonElement("manual_value")]
    public double? ManualValue { get; set; }

    // The owner's next review / action date (date only, stored as UTC midnight).
    [BsonElement("review_due_date")]
    public DateTime? ReviewDueDate { get; set; }
}

/// <summary>
/// A KPI Dashboard view for one user: the tiles shown and their order. Built-in views (Executive, Operations, …) only get a document
/// once the user changes their layout; custom views are created with "Save current tiles as a custom view".
/// </summary>
[BsonIgnoreExtraElements]
public sealed class KpiDashboardLayout : BaseEntity
{
    // A built-in view key (executive, operations, maintenance, finance) or KDV-0001 for a custom view.
    [BsonElement("view_key")]
    public string ViewKey { get; set; } = string.Empty;

    [BsonElement("is_custom")]
    public bool IsCustom { get; set; }

    [BsonElement("label")]
    public string Label { get; set; } = string.Empty;

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    [BsonElement("items")]
    public List<KpiDashboardLayoutItem> Items { get; set; } = [];

    // The tiles a custom view was saved with ("Reset to default").
    [BsonElement("default_items")]
    public List<KpiDashboardLayoutItem> DefaultItems { get; set; } = [];
}

public sealed class KpiDashboardLayoutItem
{
    [BsonElement("kpi_id")]
    public string KpiId { get; set; } = string.Empty;

    [BsonElement("visible")]
    public bool Visible { get; set; } = true;
}
