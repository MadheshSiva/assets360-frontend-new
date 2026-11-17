using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A saved filter set (Save View) on Reports &amp; Analytics / Inventory Analytics. Views are private to their owner.</summary>
[BsonIgnoreExtraElements]
public sealed class InventoryAnalyticsView : BaseEntity
{
    // Business identifier exposed to clients (e.g. IAV-0001); kept separate from the Mongo _id.
    [BsonElement("view_id")]
    public string ViewId { get; set; } = string.Empty;

    [BsonElement("view_name")]
    public string ViewName { get; set; } = string.Empty;

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    // The view the page opens with for its owner.
    [BsonElement("is_default")]
    public bool IsDefault { get; set; }

    [BsonElement("filters")]
    public InventoryAnalyticsFilters Filters { get; set; } = new();
}

/// <summary>Organization, Location, Warehouse, Store / Bin, Item Category, Stock Status and the date range on the filter bar.</summary>
[BsonIgnoreExtraElements]
public sealed class InventoryAnalyticsFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("warehouse")]
    public string? Warehouse { get; set; }

    [BsonElement("store")]
    public string? Store { get; set; }

    [BsonElement("category")]
    public string? Category { get; set; }

    [BsonElement("stock_status")]
    public string? StockStatus { get; set; }

    [BsonElement("date_preset")]
    public string? DatePreset { get; set; }

    [BsonElement("date_from")]
    public DateTime? DateFrom { get; set; }

    [BsonElement("date_to")]
    public DateTime? DateTo { get; set; }

    [BsonElement("time_zone")]
    public string? TimeZone { get; set; }
}
