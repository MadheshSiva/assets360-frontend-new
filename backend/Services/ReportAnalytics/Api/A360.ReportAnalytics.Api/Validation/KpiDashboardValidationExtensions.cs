using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class KpiDashboardValidationExtensions
{
    /// <summary>Create KPI (existing is null) or Edit KPI. Names must be unique in the library (ignoring case).</summary>
    public static Dictionary<string, string[]> Validate(
        this SaveKpiDashboardKpiRequest request,
        KpiDefinition? existing,
        IReadOnlyList<KpiDefinition> library)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim();

        if (string.IsNullOrWhiteSpace(name))
        {
            errors["Name"] = ["Name is required"];
        }
        else if (name.Length > KpiDashboardOptions.MaxNameLength)
        {
            errors["Name"] = [$"Name must be {KpiDashboardOptions.MaxNameLength} characters or fewer"];
        }
        else if (library.Any(kpi => kpi.Id != existing?.Id && string.Equals(kpi.Name, name, StringComparison.OrdinalIgnoreCase)))
        {
            errors["Name"] = ["A KPI with this name already exists"];
        }

        if (request.Target is null || !double.IsFinite(request.Target.Value) || request.Target <= 0)
        {
            errors["Target"] = ["Target must be greater than 0"];
        }

        if (!string.IsNullOrWhiteSpace(request.Direction) && !KpiDashboardOptions.Directions.IsValid(request.Direction))
        {
            errors["Direction"] = [$"Direction must be one of: {string.Join(", ", KpiDashboardOptions.Directions.All)}"];
        }

        if (string.IsNullOrWhiteSpace(request.Owner))
        {
            errors["Owner"] = ["Owner is required"];
        }
        else if (request.Owner.Trim().Length > KpiDashboardOptions.MaxOwnerLength)
        {
            errors["Owner"] = [$"Owner must be {KpiDashboardOptions.MaxOwnerLength} characters or fewer"];
        }

        if (request.Info?.Trim().Length > KpiDashboardOptions.MaxInfoLength)
        {
            errors["Info"] = [$"Info must be {KpiDashboardOptions.MaxInfoLength} characters or fewer"];
        }

        if (request.ReviewDueDate is { } due && (due.Year < 2000 || due.Year > 2100))
        {
            errors["ReviewDueDate"] = ["ReviewDueDate must be a date between 2000 and 2100"];
        }

        // Module, unit, metric and value belong to custom KPIs; built-in KPIs keep their definition.
        if (existing?.IsBuiltIn == true)
        {
            return errors;
        }

        if (existing is null && !KpiDashboardOptions.Modules.IsValid(request.Module))
        {
            errors["Module"] = [$"Module must be one of: {string.Join(", ", KpiDashboardOptions.Modules.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.Metric))
        {
            if (KpiDashboardCatalog.Find(request.Metric) is null)
            {
                errors["Metric"] = [$"Metric must be one of: {string.Join(", ", KpiDashboardCatalog.Items.Select(item => item.Id))}"];
            }
        }
        else
        {
            if (!KpiDashboardOptions.Units.IsValid(request.Unit))
            {
                errors["Unit"] = [$"Unit must be one of: {string.Join(", ", KpiDashboardOptions.Units.All)}"];
            }

            if (request.Value is null || !double.IsFinite(request.Value.Value) || request.Value < 0)
            {
                errors["Value"] = ["A KPI without a metric needs a current value of 0 or more"];
            }
        }

        return errors;
    }

    /// <summary>Layout items: known KPI ids (stored with the library's spelling), no repeats, at least one shown.</summary>
    public static Dictionary<string, string[]> Validate(
        this SaveKpiDashboardViewRequest request,
        bool labelRequired,
        IReadOnlyList<KpiDefinition> library,
        IReadOnlyList<string> takenLabels,
        out List<KpiDashboardLayoutItem> items)
    {
        var errors = new Dictionary<string, string[]>();
        var label = request.Label?.Trim();

        if (string.IsNullOrWhiteSpace(label))
        {
            if (labelRequired)
            {
                errors["Label"] = ["Label is required"];
            }
        }
        else if (label.Length > KpiDashboardOptions.MaxViewLabelLength)
        {
            errors["Label"] = [$"Label must be {KpiDashboardOptions.MaxViewLabelLength} characters or fewer"];
        }
        else if (takenLabels.Any(taken => string.Equals(taken, label, StringComparison.OrdinalIgnoreCase)))
        {
            errors["Label"] = ["A view with this name already exists"];
        }

        items = [];
        var requested = request.Items.ToDomain();
        if (requested.Count == 0)
        {
            errors["Items"] = ["Items must list at least one KPI"];
            return errors;
        }

        if (requested.Count > KpiDashboardOptions.MaxLayoutItems)
        {
            errors["Items"] = [$"Items can list at most {KpiDashboardOptions.MaxLayoutItems} KPIs"];
            return errors;
        }

        var unknown = new List<string>();
        foreach (var item in requested)
        {
            var definition = library.FirstOrDefault(kpi => string.Equals(kpi.Id, item.KpiId, StringComparison.OrdinalIgnoreCase));
            if (definition is null)
            {
                unknown.Add(item.KpiId);
                continue;
            }

            if (items.All(existing => existing.KpiId != definition.Id))
            {
                items.Add(new KpiDashboardLayoutItem { KpiId = definition.Id, Visible = item.Visible });
            }
        }

        if (unknown.Count > 0)
        {
            errors["Items"] = [$"Unknown KPI: {string.Join(", ", unknown)}"];
        }
        else if (items.All(item => !item.Visible))
        {
            errors["Items"] = ["Show at least one KPI"];
        }

        return errors;
    }
}
