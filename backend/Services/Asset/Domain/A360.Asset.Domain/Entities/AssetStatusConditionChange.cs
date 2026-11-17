using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.Asset.Domain.Entities;

/// <summary>
/// A request to change the operational status and / or physical condition of one registered asset,
/// from the Update Asset Status &amp; Condition page.
/// </summary>
/// <remarks>
/// Drafts can be edited; a submitted change goes through the approval levels and, once every level has
/// approved, the new status and condition are written to the asset registration (<see cref="State"/> = Approved).
/// A change that moves neither status nor condition (a re-assessment) is approved on submit.
/// </remarks>
[BsonIgnoreExtraElements]
public sealed class AssetStatusConditionChange : BaseEntity
{
    // e.g. "SCC-2026-00001".
    [BsonElement("change_number")]
    public string ChangeNumber { get; set; } = string.Empty;

    [BsonElement("asset_registration_id")]
    public string AssetRegistrationId { get; set; } = string.Empty;

    // Copied from the asset so lists can be shown without loading assets.
    [BsonElement("asset_tag")]
    public string? AssetTag { get; set; }

    [BsonElement("asset_name")]
    public string? AssetName { get; set; }

    [BsonElement("site_name")]
    public string? SiteName { get; set; }

    // ===== Operational status =====
    [BsonElement("previous_status")]
    public string? PreviousStatus { get; set; }

    // "Active", "Under Maintenance" or "Out of Service".
    [BsonElement("new_status")]
    public string NewStatus { get; set; } = string.Empty;

    [BsonElement("status_effective_from")]
    public DateTime? StatusEffectiveFrom { get; set; }

    // ===== Physical condition =====
    [BsonElement("previous_condition")]
    public string? PreviousCondition { get; set; }

    // "Excellent", "Good", "Fair", "Poor" or "Critical".
    [BsonElement("new_condition")]
    public string NewCondition { get; set; } = string.Empty;

    [BsonElement("condition_assessment_date")]
    public DateTime? ConditionAssessmentDate { get; set; }

    // ===== Assessment details =====
    [BsonElement("reason_code")]
    public string? ReasonCode { get; set; }

    [BsonElement("assessment_method")]
    public string? AssessmentMethod { get; set; }

    // Inspection, Maintenance, Manual, IoT Alert, Audit or Operator Report.
    [BsonElement("assessment_source")]
    public string? AssessmentSource { get; set; }

    [BsonElement("assessed_by")]
    public string? AssessedBy { get; set; }

    [BsonElement("next_assessment_due")]
    public DateTime? NextAssessmentDue { get; set; }

    [BsonElement("remarks")]
    public string? Remarks { get; set; }

    // ===== Impact & additional information =====
    [BsonElement("operational_impact")]
    public string? OperationalImpact { get; set; }

    [BsonElement("related_work_order")]
    public string? RelatedWorkOrder { get; set; }

    [BsonElement("related_inspection")]
    public string? RelatedInspection { get; set; }

    [BsonElement("downtime_estimate")]
    public decimal? DowntimeEstimate { get; set; }

    // Hours or Days.
    [BsonElement("downtime_unit")]
    public string? DowntimeUnit { get; set; }

    // ===== Evidence =====
    [BsonElement("evidence")]
    public List<AssetStatusConditionEvidence> Evidence { get; set; } = [];

    // ===== Workflow =====
    // "Draft", "Pending Approval", "Approved" or "Rejected".
    [BsonElement("state")]
    public string State { get; set; } = string.Empty;

    [BsonElement("submitted_by")]
    public string? SubmittedBy { get; set; }

    [BsonElement("submitted_at")]
    public DateTime? SubmittedAt { get; set; }

    [BsonElement("approvals")]
    public List<AssetStatusConditionApproval> Approvals { get; set; } = [];

    // When the new status and condition were written to the asset registration.
    [BsonElement("applied_at")]
    public DateTime? AppliedAt { get; set; }
}

/// <summary>A file or link attached as supporting evidence.</summary>
public sealed class AssetStatusConditionEvidence
{
    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("url")]
    public string? Url { get; set; }

    // "File" or "Link".
    [BsonElement("kind")]
    public string Kind { get; set; } = "File";

    [BsonElement("size_bytes")]
    public long? SizeBytes { get; set; }

    [BsonElement("added_by")]
    public string? AddedBy { get; set; }

    [BsonElement("added_at")]
    public DateTime AddedAt { get; set; }
}

/// <summary>One approval level of a submitted change.</summary>
public sealed class AssetStatusConditionApproval
{
    [BsonElement("level")]
    public int Level { get; set; }

    // e.g. "Maintenance Manager".
    [BsonElement("role")]
    public string Role { get; set; } = string.Empty;

    // Person asked to approve; anyone may act when empty.
    [BsonElement("approver")]
    public string? Approver { get; set; }

    // "Not Started", "Pending", "Approved", "Rejected" or "Skipped".
    [BsonElement("status")]
    public string Status { get; set; } = string.Empty;

    [BsonElement("acted_by")]
    public string? ActedBy { get; set; }

    [BsonElement("acted_at")]
    public DateTime? ActedAt { get; set; }

    [BsonElement("comments")]
    public string? Comments { get; set; }
}
