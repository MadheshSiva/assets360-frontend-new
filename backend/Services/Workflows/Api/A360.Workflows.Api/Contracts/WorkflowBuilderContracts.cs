
using A360.Workflows.Domain.Entities;
using WorkflowBuilderEntity = A360.Workflows.Domain.Entities.WorkflowBuilder;

namespace A360.Workflows.Api.Contracts;

// The graph classes (WorkflowGraph, WorkflowNode, WorkflowEdge, WorkflowVersionSnapshot) are used as-is
// in the JSON contract; with the default camelCase naming they match the builder UI's model.

public sealed record CreateWorkflowBuilderRequest(
    string? WorkflowName,
    string? WorkflowCode,
    string? Description,
    string? Module,
    string? Owner,
    string? TriggerEvent,
    string? Version,
    bool StartFromTemplate,
    string? Icon,
    string? Tone,
    WorkflowGraph? Graph,
    List<WorkflowVersionSnapshot>? Versions,
    string? CreatedBy,
    string? ClientId,
    string? TenantId,
    string? Status)
{
    public WorkflowBuilderEntity ToEntity()
    {
        var graph = Graph ?? new WorkflowGraph();

        return new WorkflowBuilderEntity
        {
            WorkflowName = WorkflowName!.Trim(),
            WorkflowCode = WorkflowCode?.Trim().ToUpperInvariant(),
            Description = Description,
            Module = Module,
            Owner = Owner,
            TriggerEvent = TriggerEvent ?? WorkflowGraphRules.TriggerEventOf(graph),
            Version = Version ?? "v0.1",
            StartFromTemplate = StartFromTemplate,
            Icon = Icon,
            Tone = Tone,
            Graph = graph,
            Versions = Versions ?? [],

            CreatedBy = CreatedBy,
            ClientId = ClientId,
            TenantId = TenantId,
            Status = string.IsNullOrWhiteSpace(Status) ? "Draft" : Status,

            CreatedAt = DateTime.UtcNow,
            IsDeleted = false
        };
    }
}

/// <summary>Replaces the workflow. Graph and Versions are kept as stored when sent as null.</summary>
public sealed record UpdateWorkflowBuilderRequest(
    string? WorkflowName,
    string? WorkflowCode,
    string? Description,
    string? Module,
    string? Owner,
    string? TriggerEvent,
    string? Version,
    bool StartFromTemplate,
    string? Icon,
    string? Tone,
    WorkflowGraph? Graph,
    List<WorkflowVersionSnapshot>? Versions,
    string? UpdatedBy,
    string? Status)
{
    public void ApplyTo(WorkflowBuilderEntity workflowBuilder)
    {
        workflowBuilder.WorkflowName = WorkflowName?.Trim() ?? workflowBuilder.WorkflowName;
        workflowBuilder.WorkflowCode = WorkflowCode?.Trim().ToUpperInvariant() ?? workflowBuilder.WorkflowCode;
        workflowBuilder.Description = Description;
        workflowBuilder.Module = Module;
        workflowBuilder.Owner = Owner;
        workflowBuilder.Version = Version ?? workflowBuilder.Version;
        workflowBuilder.StartFromTemplate = StartFromTemplate;
        workflowBuilder.Icon = Icon ?? workflowBuilder.Icon;
        workflowBuilder.Tone = Tone ?? workflowBuilder.Tone;

        if (Graph is not null)
        {
            workflowBuilder.Graph = Graph;
        }

        if (Versions is not null)
        {
            workflowBuilder.Versions = Versions;
        }

        workflowBuilder.TriggerEvent = TriggerEvent ?? WorkflowGraphRules.TriggerEventOf(workflowBuilder.Graph);

        workflowBuilder.UpdatedBy = UpdatedBy;
        workflowBuilder.UpdatedAt = DateTime.UtcNow;

        if (!string.IsNullOrWhiteSpace(Status))
        {
            workflowBuilder.Status = Status;
        }
    }
}

public sealed record WorkflowBuilderResponse(
    string Id,
    string WorkflowName,
    string? WorkflowCode,
    string? Description,
    string? Module,
    string? Owner,
    string? TriggerEvent,
    string? Version,
    bool StartFromTemplate,
    string? Icon,
    string? Tone,
    WorkflowGraph Graph,
    List<WorkflowVersionSnapshot> Versions,
    string? Status,
    string? CreatedBy,
    DateTime? CreatedAt,
    string? UpdatedBy,
    DateTime? UpdatedAt,
    string? ClientId,
    string? TenantId,
    bool IsDeleted)
{
    public static WorkflowBuilderResponse FromEntity(WorkflowBuilderEntity workflowBuilder)
    {
        return new WorkflowBuilderResponse(
            workflowBuilder.Id ?? string.Empty,
            workflowBuilder.WorkflowName ?? string.Empty,
            workflowBuilder.WorkflowCode,
            workflowBuilder.Description,
            workflowBuilder.Module,
            workflowBuilder.Owner,
            workflowBuilder.TriggerEvent,
            workflowBuilder.Version,
            workflowBuilder.StartFromTemplate,
            workflowBuilder.Icon,
            workflowBuilder.Tone,
            workflowBuilder.Graph ?? new WorkflowGraph(),
            workflowBuilder.Versions ?? [],
            workflowBuilder.Status,

            workflowBuilder.CreatedBy,
            workflowBuilder.CreatedAt,
            workflowBuilder.UpdatedBy,
            workflowBuilder.UpdatedAt,

            workflowBuilder.ClientId,
            workflowBuilder.TenantId,
            workflowBuilder.IsDeleted
        );
    }
}

public static class WorkflowGraphRules
{
    public static readonly HashSet<string> NodeTypes =
        ["trigger", "condition", "approval", "action", "notification", "end"];

    public static readonly HashSet<string> Statuses = ["Active", "Draft", "Inactive"];

    public static string? TriggerEventOf(WorkflowGraph? graph) =>
        graph?.Nodes.FirstOrDefault(n => n.Type == "trigger")?.Config?.TriggerEvent;
}
