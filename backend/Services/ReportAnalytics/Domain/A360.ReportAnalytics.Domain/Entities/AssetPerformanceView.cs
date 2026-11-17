using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// A saved filter set (Save View) on a Reports &amp; Analytics page: Asset Performance, Maintenance, Inspection or WIP / Production Analytics.
/// Views are private to their owner.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class AssetPerformanceView : BaseEntity
{
    // Business identifier exposed to clients (e.g. APV-0001); kept separate from the Mongo _id.
    [BsonElement("view_id")]
    public string ViewId { get; set; } = string.Empty;

    // asset-performance, maintenance-analytics, inspection-analytics or production-analytics; missing on views saved before Maintenance Analytics existed.
    [BsonElement("page")]
    public string? Page { get; set; }

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
    public AssetPerformanceFilters Filters { get; set; } = new();
}

/// <summary>Organization, Location, Category, Asset Type, Maintenance Type or Inspection Type / Inspector and the date range on the filter bar.</summary>
public sealed class AssetPerformanceFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("asset_category")]
    public string? AssetCategory { get; set; }

    [BsonElement("asset_type")]
    public string? AssetType { get; set; }

    // Maintenance Analytics only: Preventive, Corrective, Emergency or Inspection.
    [BsonElement("maintenance_type")]
    public string? MaintenanceType { get; set; }

    // Inspection Analytics only.
    [BsonElement("inspection_type")]
    public string? InspectionType { get; set; }

    [BsonElement("inspector")]
    public string? Inspector { get; set; }

    // WIP / Production Analytics only.
    [BsonElement("production_line")]
    public string? ProductionLine { get; set; }

    [BsonElement("work_center")]
    public string? WorkCenter { get; set; }

    [BsonElement("product")]
    public string? Product { get; set; }

    [BsonElement("date_preset")]
    public string? DatePreset { get; set; }

    [BsonElement("date_from")]
    public DateTime? DateFrom { get; set; }

    [BsonElement("date_to")]
    public DateTime? DateTo { get; set; }

    [BsonElement("time_zone")]
    public string? TimeZone { get; set; }
}
