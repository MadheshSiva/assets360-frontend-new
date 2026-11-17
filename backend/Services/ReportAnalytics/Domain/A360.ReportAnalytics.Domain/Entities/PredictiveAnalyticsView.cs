using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A saved filter set (Save View) on Reports &amp; Analytics / Predictive Analytics. Views are private to their owner.</summary>
[BsonIgnoreExtraElements]
public sealed class PredictiveAnalyticsView : BaseEntity
{
    // Business identifier exposed to clients (e.g. PAV-0001); kept separate from the Mongo _id.
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
    public PredictiveAnalyticsFilters Filters { get; set; } = new();
}

/// <summary>Organization, Location, Asset Category, Asset Type, Risk Level and the date range on the filter bar.</summary>
[BsonIgnoreExtraElements]
public sealed class PredictiveAnalyticsFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("asset_category")]
    public string? AssetCategory { get; set; }

    [BsonElement("asset_type")]
    public string? AssetType { get; set; }

    // Critical, High, Medium or Low; null is every risk level.
    [BsonElement("risk_level")]
    public string? RiskLevel { get; set; }

    [BsonElement("date_preset")]
    public string? DatePreset { get; set; }

    [BsonElement("date_from")]
    public DateTime? DateFrom { get; set; }

    [BsonElement("date_to")]
    public DateTime? DateTo { get; set; }

    [BsonElement("time_zone")]
    public string? TimeZone { get; set; }
}
