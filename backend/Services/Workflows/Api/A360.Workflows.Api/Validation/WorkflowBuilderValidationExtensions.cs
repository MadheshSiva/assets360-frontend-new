
using A360.Workflows.Api.Contracts;
using A360.Workflows.Domain.Entities;

namespace A360.Workflows.Api.Validation;

public static class WorkflowBuilderValidationExtensions
{
    public static Dictionary<string, string[]> Validate(
        this CreateWorkflowBuilderRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateDetails(errors, request.WorkflowName, request.WorkflowCode, request.Module, request.Status);
        ValidateGraph(errors, "Graph", request.Graph);
        ValidateVersions(errors, request.Versions);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(
        this UpdateWorkflowBuilderRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateDetails(errors, request.WorkflowName, request.WorkflowCode, request.Module, request.Status);
        ValidateGraph(errors, "Graph", request.Graph);
        ValidateVersions(errors, request.Versions);

        return errors;
    }

    private static void ValidateDetails(
        Dictionary<string, string[]> errors,
        string? workflowName,
        string? workflowCode,
        string? module,
        string? status)
    {
        if (string.IsNullOrWhiteSpace(workflowName))
        {
            errors["WorkflowName"] =
                ["WorkflowName is required"];
        }

        if (string.IsNullOrWhiteSpace(module))
        {
            errors["Module"] =
                ["Module is required"];
        }

        if (workflowCode is not null && workflowCode.Trim().Length is < 3 or > 20)
        {
            errors["WorkflowCode"] =
                ["WorkflowCode must be 3-20 characters"];
        }

        if (!string.IsNullOrWhiteSpace(status) && !WorkflowGraphRules.Statuses.Contains(status))
        {
            errors["Status"] =
                ["Status must be Active, Draft or Inactive"];
        }
    }

    private static void ValidateGraph(
        Dictionary<string, string[]> errors,
        string key,
        WorkflowGraph? graph)
    {
        if (graph is null)
        {
            return;
        }

        var problems = new List<string>();
        var nodeIds = new HashSet<string>();

        foreach (var node in graph.Nodes)
        {
            if (string.IsNullOrWhiteSpace(node.Id) || !nodeIds.Add(node.Id))
            {
                problems.Add("Every node needs a unique id");
            }

            if (!WorkflowGraphRules.NodeTypes.Contains(node.Type ?? string.Empty))
            {
                problems.Add($"Unknown node type '{node.Type}'");
            }
        }

        if (graph.Nodes.Count(n => n.Type == "trigger") > 1)
        {
            problems.Add("A workflow has at most one trigger");
        }

        if (graph.Edges.Any(e => !nodeIds.Contains(e.From ?? string.Empty) || !nodeIds.Contains(e.To ?? string.Empty)))
        {
            problems.Add("Every connector must join two nodes of the workflow");
        }

        if (problems.Count > 0)
        {
            errors[key] = problems.Distinct().ToArray();
        }
    }

    private static void ValidateVersions(
        Dictionary<string, string[]> errors,
        List<WorkflowVersionSnapshot>? versions)
    {
        if (versions is null)
        {
            return;
        }

        for (var i = 0; i < versions.Count; i++)
        {
            if (string.IsNullOrWhiteSpace(versions[i].Version))
            {
                errors[$"Versions[{i}]"] = ["Version is required"];
            }

            ValidateGraph(errors, $"Versions[{i}].Graph", versions[i].Graph);
        }
    }
}
