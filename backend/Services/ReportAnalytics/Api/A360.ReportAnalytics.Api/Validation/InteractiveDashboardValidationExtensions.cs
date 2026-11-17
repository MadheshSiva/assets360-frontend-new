using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class InteractiveDashboardValidationExtensions
{
    private const int MaxNameLength = 200;
    private const int MaxDescriptionLength = 1000;
    private const int MaxRoleLength = 100;
    private const int MaxTitleLength = 100;
    private const int MaxShareEntries = 200;
    private const int MaxRangeDays = 1100;

    public static Dictionary<string, string[]> Validate(this CreateInteractiveDashboardRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateInformation(errors, request.DashboardName, request.Description, request.AudienceRole);

        if (!string.IsNullOrWhiteSpace(request.Visibility) && !InteractiveDashboardOptions.Visibilities.IsValid(request.Visibility))
        {
            errors["Visibility"] = [$"Visibility must be one of: {string.Join(", ", InteractiveDashboardOptions.Visibilities.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.TemplateKey) && InteractiveDashboardOptions.FindTemplate(request.TemplateKey) is null)
        {
            errors["TemplateKey"] = [$"TemplateKey must be one of: {string.Join(", ", InteractiveDashboardOptions.Templates.Select(template => template.Key))}"];
        }

        request.DefaultFilters.ValidateFilters(errors, "DefaultFilters");
        ValidateWidgets(errors, request.Widgets);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this UpdateInteractiveDashboardRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateInformation(errors, request.DashboardName, request.Description, request.AudienceRole);
        request.DefaultFilters.ValidateFilters(errors, "DefaultFilters");
        ValidateWidgets(errors, request.Widgets);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this ShareInteractiveDashboardRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Visibility) || !InteractiveDashboardOptions.Visibilities.IsValid(request.Visibility))
        {
            errors["Visibility"] = [$"Visibility must be one of: {string.Join(", ", InteractiveDashboardOptions.Visibilities.All)}"];
        }

        void Entries(string key, IReadOnlyList<DashboardShareRequest>? entries)
        {
            if (entries is null)
            {
                return;
            }

            if (entries.Count > MaxShareEntries)
            {
                errors[key] = [$"{key} can hold at most {MaxShareEntries} entries"];
                return;
            }

            for (var index = 0; index < entries.Count; index++)
            {
                if (string.IsNullOrWhiteSpace(entries[index].Id))
                {
                    errors[$"{key}[{index}].Id"] = ["Id is required"];
                }

                if (!string.IsNullOrWhiteSpace(entries[index].Permission) && !InteractiveDashboardOptions.Permissions.IsValid(entries[index].Permission))
                {
                    errors[$"{key}[{index}].Permission"] = [$"Permission must be one of: {string.Join(", ", InteractiveDashboardOptions.Permissions.All)}"];
                }
            }
        }

        Entries("Users", request.Users);
        Entries("Groups", request.Groups);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this DashboardLayoutRequest request, InteractiveDashboard dashboard)
    {
        var errors = new Dictionary<string, string[]>();
        var items = request.Widgets ?? [];

        if (items.Count == 0)
        {
            errors["Widgets"] = ["List at least one widget"];
            return errors;
        }

        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var widget = dashboard.Widgets.FirstOrDefault(widget => widget.WidgetId == item.WidgetId?.Trim());
            if (widget is null)
            {
                errors[$"Widgets[{index}].WidgetId"] = [$"Widget '{item.WidgetId}' is not on this dashboard"];
                continue;
            }

            ValidatePosition(errors, $"Widgets[{index}]",
                item.X ?? widget.Position.X, item.Y ?? widget.Position.Y, item.W ?? widget.Position.W, item.H ?? widget.Position.H);
        }

        return errors;
    }

    public static void ValidateWidget(this DashboardWidgetRequest? widget, Dictionary<string, string[]> errors, string prefix)
    {
        if (widget is null)
        {
            errors[prefix] = ["Widget is required"];
            return;
        }

        var metric = InteractiveDashboardOptions.FindMetric(widget.Metric);
        if (metric is null)
        {
            errors[$"{prefix}.Metric"] = [$"Metric must be one of: {string.Join(", ", InteractiveDashboardOptions.Metrics.Select(item => item.Key))}"];
        }

        if (!string.IsNullOrWhiteSpace(widget.WidgetType))
        {
            var type = InteractiveDashboardOptions.FindWidgetType(widget.WidgetType);
            if (type is null)
            {
                errors[$"{prefix}.WidgetType"] = [$"WidgetType must be one of: {string.Join(", ", InteractiveDashboardOptions.WidgetTypeKeys.All)}"];
            }
            else if (metric is not null && !metric.WidgetTypes.Contains(type.Key))
            {
                errors[$"{prefix}.WidgetType"] = [$"{metric.Label} can be shown as: {string.Join(", ", metric.WidgetTypes)}"];
            }
        }

        if (widget.Title?.Trim().Length > MaxTitleLength)
        {
            errors[$"{prefix}.Title"] = [$"Title must be {MaxTitleLength} characters or fewer"];
        }

        if (widget.Position is { } position)
        {
            ValidatePosition(errors, $"{prefix}.Position", position.X ?? 0, position.Y ?? 0, position.W ?? 1, position.H ?? 1);
        }

        if (widget.Settings is { } settings)
        {
            if (settings.Limit is < 1 or > InteractiveDashboardOptions.MaxLimit)
            {
                errors[$"{prefix}.Settings.Limit"] = [$"Limit must be between 1 and {InteractiveDashboardOptions.MaxLimit}"];
            }

            if (settings.Months is < 1 or > InteractiveDashboardOptions.MaxTrendMonths)
            {
                errors[$"{prefix}.Settings.Months"] = [$"Months must be between 1 and {InteractiveDashboardOptions.MaxTrendMonths}"];
            }

            if (!string.IsNullOrWhiteSpace(settings.Orientation) && !InteractiveDashboardOptions.Orientations.IsValid(settings.Orientation))
            {
                errors[$"{prefix}.Settings.Orientation"] = [$"Orientation must be one of: {string.Join(", ", InteractiveDashboardOptions.Orientations.All)}"];
            }
        }
    }

    public static void ValidateFilters(this DashboardFiltersRequest? filters, Dictionary<string, string[]> errors, string prefix)
    {
        if (filters is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(filters.DatePreset) && !InteractiveDashboardOptions.DatePresets.IsValid(filters.DatePreset))
        {
            errors[$"{prefix}.DatePreset"] = [$"DatePreset must be one of: {string.Join(", ", InteractiveDashboardOptions.DatePresets.All)}"];
        }
        else if (InteractiveDashboardOptions.DatePresets.Normalize(filters.DatePreset) == InteractiveDashboardOptions.CustomDatePreset)
        {
            if (filters.DateFrom is null || filters.DateTo is null)
            {
                errors[$"{prefix}.DateFrom"] = ["A Custom date range needs DateFrom and DateTo"];
            }
            else if (filters.DateFrom > filters.DateTo)
            {
                errors[$"{prefix}.DateTo"] = ["DateTo must be on or after DateFrom"];
            }
            else if (filters.DateTo.Value.DayNumber - filters.DateFrom.Value.DayNumber >= MaxRangeDays)
            {
                errors[$"{prefix}.DateTo"] = [$"The date range can cover at most {MaxRangeDays} days"];
            }
        }

        if (!ReportPeriods.TryGetTimeZone(filters.TimeZone, out _))
        {
            errors[$"{prefix}.TimeZone"] = [$"TimeZone '{filters.TimeZone}' is not recognised (use an id such as Asia/Dubai or UTC)"];
        }
    }

    private static void ValidateInformation(Dictionary<string, string[]> errors, string? name, string? description, string? audienceRole)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["DashboardName"] = ["DashboardName is required"];
        }
        else if (name.Trim().Length > MaxNameLength)
        {
            errors["DashboardName"] = [$"DashboardName must be {MaxNameLength} characters or fewer"];
        }

        if (description?.Trim().Length > MaxDescriptionLength)
        {
            errors["Description"] = [$"Description must be {MaxDescriptionLength} characters or fewer"];
        }

        if (audienceRole?.Trim().Length > MaxRoleLength)
        {
            errors["AudienceRole"] = [$"AudienceRole must be {MaxRoleLength} characters or fewer"];
        }
    }

    private static void ValidateWidgets(Dictionary<string, string[]> errors, IReadOnlyList<DashboardWidgetRequest>? widgets)
    {
        if (widgets is null)
        {
            return;
        }

        if (widgets.Count > InteractiveDashboardOptions.MaxWidgets)
        {
            errors["Widgets"] = [$"A dashboard can hold at most {InteractiveDashboardOptions.MaxWidgets} widgets"];
            return;
        }

        for (var index = 0; index < widgets.Count; index++)
        {
            widgets[index].ValidateWidget(errors, $"Widgets[{index}]");
        }
    }

    private static void ValidatePosition(Dictionary<string, string[]> errors, string prefix, int x, int y, int w, int h)
    {
        var columns = InteractiveDashboardOptions.GridColumns;

        if (w is < 1 || w > columns)
        {
            errors[$"{prefix}.W"] = [$"W must be between 1 and {columns}"];
        }

        if (x < 0 || x + w > columns)
        {
            errors[$"{prefix}.X"] = [$"X must be 0 or more and X + W at most {columns}"];
        }

        if (y < 0)
        {
            errors[$"{prefix}.Y"] = ["Y must be 0 or more"];
        }

        if (h is < 1 || h > InteractiveDashboardOptions.MaxWidgetHeight)
        {
            errors[$"{prefix}.H"] = [$"H must be between 1 and {InteractiveDashboardOptions.MaxWidgetHeight}"];
        }
    }
}
