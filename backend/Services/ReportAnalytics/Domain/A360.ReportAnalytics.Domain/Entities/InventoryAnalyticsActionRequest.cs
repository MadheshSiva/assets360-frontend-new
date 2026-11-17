using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// A purchase request or action plan raised from Inventory Analytics (an insight, the reorder table or a slow-moving list).
/// Status (BaseEntity) is Open, In Progress, Completed or Cancelled.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class InventoryAnalyticsActionRequest : BaseEntity
{
    // Business identifier exposed to clients: PR-2026-00001 for purchase requests, AP-2026-00001 for action plans.
    [BsonElement("request_id")]
    public string RequestId { get; set; } = string.Empty;

    // Purchase Request or Action Plan.
    [BsonElement("request_type")]
    public string RequestType { get; set; } = string.Empty;

    // Item(s) for a purchase request, the action title for an action plan.
    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("item_codes")]
    public List<string> ItemCodes { get; set; } = [];

    [BsonElement("quantity")]
    public double? Quantity { get; set; }

    [BsonElement("supplier")]
    public string? Supplier { get; set; }

    // Needed by (purchase request) or due date (action plan).
    [BsonElement("due_date")]
    public DateTime? DueDate { get; set; }

    [BsonElement("priority")]
    public string Priority { get; set; } = "Medium";

    // Requested by (purchase request) or owner (action plan).
    [BsonElement("assignee")]
    public string? Assignee { get; set; }

    [BsonElement("notes")]
    public string? Notes { get; set; }

    // What raised it, e.g. insight:reorder, insight:slow or reorder-table.
    [BsonElement("source")]
    public string? Source { get; set; }

    [BsonElement("warehouse")]
    public string? Warehouse { get; set; }

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }
}
