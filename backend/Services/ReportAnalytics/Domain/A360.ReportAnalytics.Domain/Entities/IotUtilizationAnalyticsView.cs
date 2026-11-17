using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// A saved filter set (Save View) on Reports &amp; Analytics / IoT &amp; Utilization Analytics. Views are private to their owner.
/// Kept in their own collection because the filter bar has Device Type and Connectivity, which the shared AssetPerformanceView filters do not.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class IotUtilizationAnalyticsView : BaseEntity
{
    // Business identifier exposed to clients (e.g. IUV-0001); kept separate from the Mongo _id.
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
    public IotUtilizationAnalyticsFilters Filters { get; set; } = new();
}

/// <summary>Organization, Location, Asset Category, Device Type, Connectivity Status and the date range on the filter bar.</summary>
[BsonIgnoreExtraElements]
public sealed class IotUtilizationAnalyticsFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("asset_category")]
    public string? AssetCategory { get; set; }

    [BsonElement("device_type")]
    public string? DeviceType { get; set; }

    // Online, Intermittent, Offline or Never Connected.
    [BsonElement("connectivity")]
    public string? Connectivity { get; set; }

    [BsonElement("date_preset")]
    public string? DatePreset { get; set; }

    [BsonElement("date_from")]
    public DateTime? DateFrom { get; set; }

    [BsonElement("date_to")]
    public DateTime? DateTo { get; set; }

    [BsonElement("time_zone")]
    public string? TimeZone { get; set; }
}
