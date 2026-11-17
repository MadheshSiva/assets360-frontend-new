using A360.Asset.Domain.Entities;

namespace A360.Asset.Api.Contracts;

/// <summary>Choices of the Asset Status &amp; Condition pages; values are stored with these spellings.</summary>
public static class AssetStatusConditionOptions
{
    public const string StateDraft = "Draft";
    public const string StatePendingApproval = "Pending Approval";
    public const string StateApproved = "Approved";
    public const string StateRejected = "Rejected";

    public const string ApprovalNotStarted = "Not Started";
    public const string ApprovalPending = "Pending";
    public const string ApprovalApproved = "Approved";
    public const string ApprovalRejected = "Rejected";

    /// <summary>Statuses an asset can be moved to on this page.</summary>
    public static readonly OptionList Statuses = new("Active", "Under Maintenance", "Out of Service");

    public static readonly OptionList Conditions = new("Excellent", "Good", "Fair", "Poor", "Critical");

    public static readonly OptionList States = new(StateDraft, StatePendingApproval, StateApproved, StateRejected);

    public static readonly OptionList Reasons = new(
        "Performance Degradation", "Mechanical Failure", "Electrical Fault", "Abnormal Vibration", "Overheating",
        "Leakage", "Wear and Tear", "Damage / Accident", "Safety Concern", "Scheduled Maintenance",
        "Preventive Maintenance", "Repair Completed", "Overhaul Completed", "Inspection Finding",
        "Calibration Due", "Routine Assessment", "Other");

    public static readonly OptionList AssessmentMethods = new(
        "Visual Inspection", "Functional Test", "Performance Test", "Vibration Analysis", "Thermography",
        "Oil Analysis", "Ultrasonic Test", "Sensor Reading", "Other");

    public static readonly OptionList AssessmentSources = new(
        "Inspection", "Maintenance", "Manual", "IoT Alert", "Audit", "Operator Report");

    public static readonly OptionList OperationalImpacts = new(
        "No Impact", "Reduced Capacity", "Partial Shutdown", "Full Shutdown", "Safety Risk");

    public static readonly OptionList DowntimeUnits = new("Hours", "Days");

    /// <summary>Reasons offered for each new status (all reasons stay valid; this only narrows the dropdown).</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ReasonsByStatus = new Dictionary<string, IReadOnlyList<string>>
    {
        ["Active"] =
        [
            "Repair Completed", "Overhaul Completed", "Preventive Maintenance", "Routine Assessment", "Inspection Finding",
            "Calibration Due", "Wear and Tear", "Performance Degradation", "Other"
        ],
        ["Under Maintenance"] =
        [
            "Scheduled Maintenance", "Preventive Maintenance", "Performance Degradation", "Abnormal Vibration", "Overheating",
            "Leakage", "Wear and Tear", "Calibration Due", "Inspection Finding", "Mechanical Failure", "Electrical Fault", "Other"
        ],
        ["Out of Service"] =
        [
            "Mechanical Failure", "Electrical Fault", "Damage / Accident", "Safety Concern", "Leakage", "Overheating",
            "Abnormal Vibration", "Inspection Finding", "Other"
        ]
    };

    /// <summary>Operational impacts that fit each new status.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> ImpactsByStatus = new Dictionary<string, IReadOnlyList<string>>
    {
        ["Active"] = ["No Impact", "Reduced Capacity"],
        ["Under Maintenance"] = ["Reduced Capacity", "Partial Shutdown", "Full Shutdown", "Safety Risk"],
        ["Out of Service"] = ["Full Shutdown", "Partial Shutdown", "Safety Risk"]
    };

    /// <summary>Assessment methods that fit each assessment source.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> MethodsBySource = new Dictionary<string, IReadOnlyList<string>>
    {
        ["Inspection"] = ["Visual Inspection", "Functional Test", "Thermography", "Ultrasonic Test", "Vibration Analysis", "Oil Analysis", "Other"],
        ["Maintenance"] = ["Functional Test", "Performance Test", "Vibration Analysis", "Oil Analysis", "Thermography", "Visual Inspection", "Other"],
        ["Manual"] = ["Visual Inspection", "Functional Test", "Other"],
        ["IoT Alert"] = ["Sensor Reading", "Vibration Analysis", "Performance Test", "Other"],
        ["Audit"] = ["Visual Inspection", "Functional Test", "Other"],
        ["Operator Report"] = ["Visual Inspection", "Functional Test", "Performance Test", "Other"]
    };

    /// <summary>Approval levels a status or condition change goes through, in order.</summary>
    public static readonly IReadOnlyList<(int Level, string Role)> ApprovalLevels =
    [
        (1, "Maintenance Manager"),
        (2, "Asset Manager")
    ];

    /// <summary>Assets whose next assessment is due within this many days (or overdue) count as "due".</summary>
    public const int AssessmentDueWithinDays = 30;

    /// <summary>Health score recorded with a condition when no measured score is available.</summary>
    public static decimal HealthScoreFor(string? condition) => condition switch
    {
        "Excellent" => 95,
        "Good" => 82,
        "Fair" => 68,
        "Poor" => 45,
        "Critical" => 25,
        _ => 0
    };
}

/// <summary>Evidence & Links step: an uploaded file (Media service URL) or a web link.</summary>
public sealed record AssetStatusConditionEvidenceRequest(string? Name, string? Url, string? Kind, long? SizeBytes);

/// <summary>Save as Draft / Submit for Approval on the Update Asset Status &amp; Condition page.</summary>
/// <param name="Submit">False saves a draft (fields may be missing); true validates every field and starts the approval.</param>
/// <param name="Approvers">Optional approver name per level (index 0 = level 1).</param>
public sealed record SaveAssetStatusConditionChangeRequest(
    string? AssetRegistrationId,
    string? NewStatus,
    DateTime? StatusEffectiveFrom,
    string? NewCondition,
    DateTime? ConditionAssessmentDate,
    string? ReasonCode,
    string? AssessmentMethod,
    string? AssessmentSource,
    string? AssessedBy,
    DateTime? NextAssessmentDue,
    string? Remarks,
    string? OperationalImpact,
    string? RelatedWorkOrder,
    string? RelatedInspection,
    decimal? DowntimeEstimate,
    string? DowntimeUnit,
    IReadOnlyList<AssetStatusConditionEvidenceRequest>? Evidence,
    IReadOnlyList<string?>? Approvers,
    bool Submit);

/// <summary>Approve / Reject of the current approval level.</summary>
public sealed record AssetStatusConditionDecisionRequest(string? Comments);

public sealed record AssetStatusConditionEvidenceResponse(string Name, string? Url, string Kind, long? SizeBytes, string? AddedBy, DateTime AddedAt)
{
    public static AssetStatusConditionEvidenceResponse FromEntity(AssetStatusConditionEvidence e) =>
        new(e.Name, e.Url, e.Kind, e.SizeBytes, e.AddedBy, e.AddedAt);
}

public sealed record AssetStatusConditionApprovalResponse(
    int Level, string Role, string? Approver, string Status, string? ActedBy, DateTime? ActedAt, string? Comments)
{
    public static AssetStatusConditionApprovalResponse FromEntity(AssetStatusConditionApproval a) =>
        new(a.Level, a.Role, a.Approver, a.Status, a.ActedBy, a.ActedAt, a.Comments);
}

public sealed record AssetStatusConditionChangeResponse(
    string Id,
    string ChangeNumber,
    string AssetRegistrationId,
    string? AssetTag,
    string? AssetName,
    string? SiteName,
    string? PreviousStatus,
    string NewStatus,
    DateTime? StatusEffectiveFrom,
    string? PreviousCondition,
    string NewCondition,
    DateTime? ConditionAssessmentDate,
    string? ReasonCode,
    string? AssessmentMethod,
    string? AssessmentSource,
    string? AssessedBy,
    DateTime? NextAssessmentDue,
    string? Remarks,
    string? OperationalImpact,
    string? RelatedWorkOrder,
    string? RelatedInspection,
    decimal? DowntimeEstimate,
    string? DowntimeUnit,
    IReadOnlyCollection<AssetStatusConditionEvidenceResponse> Evidence,
    string State,
    string? SubmittedBy,
    DateTime? SubmittedAt,
    IReadOnlyCollection<AssetStatusConditionApprovalResponse> Approvals,
    DateTime? AppliedAt,
    string? CreatedBy,
    DateTime? CreatedAt,
    string? UpdatedBy,
    DateTime? UpdatedAt)
{
    public static AssetStatusConditionChangeResponse FromEntity(AssetStatusConditionChange c) => new(
        c.Id, c.ChangeNumber, c.AssetRegistrationId, c.AssetTag, c.AssetName, c.SiteName,
        c.PreviousStatus, c.NewStatus, c.StatusEffectiveFrom,
        c.PreviousCondition, c.NewCondition, c.ConditionAssessmentDate,
        c.ReasonCode, c.AssessmentMethod, c.AssessmentSource, c.AssessedBy, c.NextAssessmentDue, c.Remarks,
        c.OperationalImpact, c.RelatedWorkOrder, c.RelatedInspection, c.DowntimeEstimate, c.DowntimeUnit,
        c.Evidence.Select(AssetStatusConditionEvidenceResponse.FromEntity).ToList(),
        c.State, c.SubmittedBy, c.SubmittedAt,
        c.Approvals.OrderBy(a => a.Level).Select(AssetStatusConditionApprovalResponse.FromEntity).ToList(),
        c.AppliedAt, c.CreatedBy, c.CreatedAt, c.UpdatedBy, c.UpdatedAt);
}

public sealed record AssetStatusConditionChangeListResponse(
    IReadOnlyCollection<AssetStatusConditionChangeResponse> Items,
    long TotalCount,
    int Page,
    int PageSize);

/// <summary>Summary cards of the Asset Status &amp; Condition page.</summary>
public sealed record AssetStatusConditionSummaryResponse(
    long TotalAssets,
    long OperationalAssets,
    long UnderMaintenance,
    long OutOfService,
    long PoorOrCritical,
    long AssessmentsDue,
    long PendingApprovals,
    int AssessmentDueWithinDays);

/// <summary>One row of the Asset Summary tab and the asset part of the update page.</summary>
public sealed record AssetStatusConditionAssetResponse(
    string AssetRegistrationId,
    string? AssetTag,
    string? AssetName,
    string? Category,
    string? AssetType,
    string? SiteName,
    string? LocationPath,
    string? Criticality,
    string? ImageUrl,
    string? Manufacturer,
    string? Model,
    string? Status,
    string? Condition,
    decimal? HealthScore,
    DateTime? LastAssessmentDate,
    string? LastAssessmentSource,
    DateTime? NextAssessmentDue,
    string? PendingChangeId,
    string? PendingChangeNumber)
{
    public static AssetStatusConditionAssetResponse From(
        AssetRegistration asset,
        AssetStatusConditionChange? latest,
        AssetConditionAssessment? assessment,
        AssetStatusConditionChange? pending)
    {
        var info = asset.BasicInformation;
        var location = asset.LocationAssignment.Location;

        // Whichever is more recent: an approved change from this page or a condition assessment from the asset tab.
        DateTime? lastDate = latest?.ConditionAssessmentDate;
        string? lastSource = latest?.AssessmentSource;
        decimal? health = latest is null ? null : AssetStatusConditionOptions.HealthScoreFor(latest.NewCondition);
        if (assessment is not null && (lastDate is null || assessment.AssessmentDate >= lastDate))
        {
            lastDate = assessment.AssessmentDate;
            lastSource = "Condition Assessment";
            health = assessment.HealthScore;
        }
        if (health is null && !string.IsNullOrWhiteSpace(info.Condition))
        {
            health = AssetStatusConditionOptions.HealthScoreFor(AssetStatusConditionOptions.Conditions.Normalize(info.Condition));
        }

        return new AssetStatusConditionAssetResponse(
            asset.AssetRegistrationId,
            info.AssetTag,
            info.AssetName,
            asset.Classification.Category,
            asset.Classification.AssetType,
            location.SiteName,
            location.LocationPath,
            asset.Classification.Criticality ?? info.Criticality,
            info.Images.FirstOrDefault(),
            info.Manufacturer,
            info.Model,
            info.Status,
            info.Condition,
            health is > 0 ? health : null,
            lastDate,
            lastSource,
            latest?.NextAssessmentDue,
            pending?.Id,
            pending?.ChangeNumber);
    }
}

public sealed record AssetStatusConditionAssetListResponse(
    IReadOnlyCollection<AssetStatusConditionAssetResponse> Items,
    long TotalCount,
    int Page,
    int PageSize);

public sealed record AssetStatusConditionApprovalLevelOption(int Level, string Role);

public sealed record AssetStatusConditionOptionsResponse(
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> Conditions,
    IReadOnlyList<string> States,
    IReadOnlyList<string> Reasons,
    IReadOnlyList<string> AssessmentMethods,
    IReadOnlyList<string> AssessmentSources,
    IReadOnlyList<string> OperationalImpacts,
    IReadOnlyList<string> DowntimeUnits,
    IReadOnlyList<AssetStatusConditionApprovalLevelOption> ApprovalLevels,
    IReadOnlyDictionary<string, IReadOnlyList<string>> ReasonsByStatus,
    IReadOnlyDictionary<string, IReadOnlyList<string>> ImpactsByStatus,
    IReadOnlyDictionary<string, IReadOnlyList<string>> MethodsBySource);

/// <summary>Choices tied to one asset: its work orders and inspections, plus the failure reasons master data.</summary>
public sealed record AssetStatusConditionLookupsResponse(
    IReadOnlyCollection<AssetStatusConditionWorkOrderOption> WorkOrders,
    IReadOnlyCollection<AssetStatusConditionInspectionOption> Inspections,
    IReadOnlyCollection<AssetStatusConditionFailureReasonOption> FailureReasons);

public sealed record AssetStatusConditionWorkOrderOption(string WorkOrderId, string? Title, string? WorkType, string? Priority, string? Status, DateTime? ScheduledDate);

public sealed record AssetStatusConditionInspectionOption(string Code, string Name, string Kind);

public sealed record AssetStatusConditionFailureReasonOption(string Code, string Name, string Category, string Severity);
