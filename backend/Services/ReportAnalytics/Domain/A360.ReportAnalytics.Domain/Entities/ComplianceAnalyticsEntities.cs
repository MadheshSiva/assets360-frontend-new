using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A saved filter set (Save View) on Reports &amp; Analytics / Compliance Analytics. Views are private to their owner.</summary>
[BsonIgnoreExtraElements]
public sealed class ComplianceAnalyticsView : BaseEntity
{
    // Business identifier exposed to clients (e.g. CAV-0001); kept separate from the Mongo _id.
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
    public ComplianceAnalyticsFilters Filters { get; set; } = new();
}

/// <summary>Organization, Location, Compliance Area, Regulation, Risk Level and the date range on the filter bar (null means all).</summary>
[BsonIgnoreExtraElements]
public sealed class ComplianceAnalyticsFilters
{
    [BsonElement("organization")]
    public string? Organization { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("compliance_area")]
    public string? ComplianceArea { get; set; }

    [BsonElement("regulation")]
    public string? Regulation { get; set; }

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

/// <summary>
/// "Create action plan" on Compliance Analytics: a corrective action planned for a finding, an insight or a location.
/// Status is Open, In Progress, Completed or Cancelled.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class ComplianceActionPlan : BaseEntity
{
    // Business identifier exposed to clients (e.g. CAP-0001).
    [BsonElement("action_plan_id")]
    public string ActionPlanId { get; set; } = string.Empty;

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("owner")]
    public string Owner { get; set; } = string.Empty;

    [BsonElement("due_date")]
    public DateTime DueDate { get; set; }

    // Critical, High, Medium or Low.
    [BsonElement("priority")]
    public string Priority { get; set; } = "High";

    [BsonElement("notes")]
    public string? Notes { get; set; }

    // What the plan was raised from: the dialog's context line.
    [BsonElement("context")]
    public string? Context { get; set; }

    // finding, insight, location or other.
    [BsonElement("source_type")]
    public string? SourceType { get; set; }

    // The finding code, insight key or location name.
    [BsonElement("source_id")]
    public string? SourceId { get; set; }

    [BsonElement("location")]
    public string? Location { get; set; }

    [BsonElement("regulation")]
    public string? Regulation { get; set; }

    [BsonElement("owner_id")]
    public string? CreatedById { get; set; }

    [BsonElement("completed_at")]
    public DateTime? CompletedAt { get; set; }
}
