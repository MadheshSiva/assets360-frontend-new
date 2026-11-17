using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// "Create action plan" on an IoT &amp; Utilization insight (e.g. IAP-0001: resolve 12 active IoT alerts, owned by a technician, due 15 Nov).
/// The workflow state (Open, In Progress, Completed, Cancelled) is kept in BaseEntity.Status.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class IotUtilizationAnalyticsActionPlan : BaseEntity
{
    // Business identifier exposed to clients (e.g. IAP-0001); kept separate from the Mongo _id.
    [BsonElement("plan_id")]
    public string PlanId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("owner")]
    public string Owner { get; set; } = string.Empty;

    [BsonElement("due_date")]
    public DateTime DueDate { get; set; }

    // Critical, High, Medium or Low.
    [BsonElement("priority")]
    public string Priority { get; set; } = string.Empty;

    [BsonElement("notes")]
    public string? Notes { get; set; }

    // The insight the plan was raised from: alerts, below_target, abnormal_vibration or offline_devices; null when raised by hand.
    [BsonElement("insight_key")]
    public string? InsightKey { get; set; }

    // The insight text at the time the plan was raised.
    [BsonElement("context")]
    public string? Context { get; set; }

    // Device ids / asset ids the insight named, so the plan keeps its scope after the data moves on.
    [BsonElement("device_ids")]
    public List<string> DeviceIds { get; set; } = [];

    [BsonElement("created_by_id")]
    public string? CreatedById { get; set; }
}
