
using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.Workflows.Domain.Entities;

[BsonIgnoreExtraElements]
public class WorkflowBuilder : BaseEntity
{
    [BsonElement("workflow_name")]
    public string WorkflowName { get; set; } = null!;

    [BsonElement("workflow_code")]
    public string? WorkflowCode { get; set; }

    [BsonElement("description")]
    public string? Description { get; set; }

    /// <summary>Workflow category shown in the builder (Asset Management, Maintenance, ...).</summary>
    [BsonElement("module")]
    public string? Module { get; set; }

    [BsonElement("owner")]
    public string? Owner { get; set; }

    [BsonElement("trigger_event")]
    public string? TriggerEvent { get; set; }

    [BsonElement("version")]
    public string? Version { get; set; }

    [BsonElement("start_from_template")]
    public bool StartFromTemplate { get; set; }

    [BsonElement("icon")]
    public string? Icon { get; set; }

    [BsonElement("tone")]
    public string? Tone { get; set; }

    /// <summary>The flow being edited: canvas nodes and the connectors between them.</summary>
    [BsonElement("graph")]
    public WorkflowGraph Graph { get; set; } = new();

    /// <summary>Published snapshots, newest first.</summary>
    [BsonElement("versions")]
    public List<WorkflowVersionSnapshot> Versions { get; set; } = [];
}

[BsonIgnoreExtraElements]
public class WorkflowGraph
{
    [BsonElement("nodes")]
    public List<WorkflowNode> Nodes { get; set; } = [];

    [BsonElement("edges")]
    public List<WorkflowEdge> Edges { get; set; } = [];
}

[BsonIgnoreExtraElements]
public class WorkflowNode
{
    [BsonElement("id")]
    public string Id { get; set; } = null!;

    /// <summary>trigger | condition | approval | action | notification | end</summary>
    [BsonElement("type")]
    public string Type { get; set; } = null!;

    [BsonElement("name")]
    public string Name { get; set; } = null!;

    [BsonElement("x")]
    public double X { get; set; }

    [BsonElement("y")]
    public double Y { get; set; }

    [BsonElement("config")]
    public WorkflowNodeConfig Config { get; set; } = new();
}

/// <summary>Every node keeps the full settings bag; only the fields for its type are used.</summary>
[BsonIgnoreExtraElements]
public class WorkflowNodeConfig
{
    // Trigger
    [BsonElement("trigger_event")]
    public string? TriggerEvent { get; set; }

    [BsonElement("trigger_module")]
    public string? TriggerModule { get; set; }

    // Condition
    [BsonElement("condition_field")]
    public string? ConditionField { get; set; }

    [BsonElement("operator")]
    public string? Operator { get; set; }

    [BsonElement("condition_value")]
    public string? ConditionValue { get; set; }

    // Approval
    [BsonElement("approval_type")]
    public string? ApprovalType { get; set; }

    [BsonElement("approver_source")]
    public string? ApproverSource { get; set; }

    [BsonElement("approver_role")]
    public string? ApproverRole { get; set; }

    [BsonElement("approver_user")]
    public string? ApproverUser { get; set; }

    [BsonElement("sla_hours")]
    public int? SlaHours { get; set; }

    [BsonElement("escalation_hours")]
    public int? EscalationHours { get; set; }

    [BsonElement("required_approvals")]
    public int? RequiredApprovals { get; set; }

    [BsonElement("allow_delegation")]
    public bool AllowDelegation { get; set; }

    [BsonElement("comments_required")]
    public bool CommentsRequired { get; set; }

    // Action
    [BsonElement("action_type")]
    public string? ActionType { get; set; }

    [BsonElement("action_target")]
    public string? ActionTarget { get; set; }

    [BsonElement("action_value")]
    public string? ActionValue { get; set; }

    // Notification
    [BsonElement("template")]
    public string? Template { get; set; }

    [BsonElement("channel")]
    public string? Channel { get; set; }

    [BsonElement("recipient")]
    public string? Recipient { get; set; }

    // End
    [BsonElement("outcome")]
    public string? Outcome { get; set; }

    [BsonElement("notify_requestor")]
    public bool NotifyRequestor { get; set; }
}

[BsonIgnoreExtraElements]
public class WorkflowEdge
{
    [BsonElement("id")]
    public string Id { get; set; } = null!;

    [BsonElement("from")]
    public string From { get; set; } = null!;

    [BsonElement("to")]
    public string To { get; set; } = null!;

    /// <summary>Empty, Yes, No or Rejected.</summary>
    [BsonElement("label")]
    public string? Label { get; set; }
}

[BsonIgnoreExtraElements]
public class WorkflowVersionSnapshot
{
    [BsonElement("version")]
    public string Version { get; set; } = null!;

    /// <summary>ISO date (yyyy-MM-dd) the version was published.</summary>
    [BsonElement("published_on")]
    public string? PublishedOn { get; set; }

    [BsonElement("graph")]
    public WorkflowGraph Graph { get; set; } = new();
}
