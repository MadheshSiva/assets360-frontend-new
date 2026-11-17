using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class IotUtilizationAnalyticsValidationExtensions
{
    private const int MaxFilterLength = 200;

    public static Dictionary<string, string[]> Validate(this SaveIotUtilizationAnalyticsViewRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.ViewName))
        {
            errors["ViewName"] = ["ViewName is required"];
        }
        else if (request.ViewName.Trim().Length > IotUtilizationAnalyticsOptions.MaxNameLength)
        {
            errors["ViewName"] = [$"ViewName must be {IotUtilizationAnalyticsOptions.MaxNameLength} characters or fewer"];
        }
        else if (request.ViewName.Trim().Equals(IotUtilizationAnalyticsOptions.AllAssetsViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{IotUtilizationAnalyticsOptions.AllAssetsViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            ValidateFilterValues(errors, "Filters.", filters.Organization, filters.Location, filters.Category, filters.DeviceType, filters.Connectivity);
            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    /// <summary>Lengths of the free filter values and the Connectivity choice; prefix is "" for query values, "Filters." in a body.</summary>
    public static void ValidateFilterValues(
        Dictionary<string, string[]> errors,
        string prefix,
        string? organization,
        string? location,
        string? category,
        string? deviceType,
        string? connectivity)
    {
        foreach (var (name, value) in new[] { ("Organization", organization), ("Location", location), ("Category", category), ("DeviceType", deviceType) })
        {
            if (value?.Trim().Length > MaxFilterLength)
            {
                errors[$"{prefix}{name}"] = [$"{name} must be {MaxFilterLength} characters or fewer"];
            }
        }

        if (InteractiveDashboardMappings.FilterValue(connectivity) is { } status && !IotUtilizationAnalyticsOptions.ConnectivityStatuses.IsValid(status))
        {
            errors[$"{prefix}Connectivity"] = [$"Connectivity must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.ConnectivityStatuses.All)}"];
        }
    }

    public static IotUtilizationAnalyticsFilters ToDomain(this IotUtilizationAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? IotUtilizationAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new IotUtilizationAnalyticsFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            AssetCategory = InteractiveDashboardMappings.FilterValue(request?.Category),
            DeviceType = InteractiveDashboardMappings.FilterValue(request?.DeviceType),
            Connectivity = IotUtilizationAnalyticsOptions.ConnectivityStatuses.Normalize(InteractiveDashboardMappings.FilterValue(request?.Connectivity)),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }

    /// <summary>Create (isNew) and update of an action plan. A new plan's due date may not be before today (UTC).</summary>
    public static Dictionary<string, string[]> Validate(this SaveIotUtilizationActionPlanRequest request, bool isNew, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["Title"] = ["Title is required"];
        }
        else if (request.Title.Trim().Length > IotUtilizationAnalyticsOptions.MaxTitleLength)
        {
            errors["Title"] = [$"Title must be {IotUtilizationAnalyticsOptions.MaxTitleLength} characters or fewer"];
        }

        if (string.IsNullOrWhiteSpace(request.Owner))
        {
            errors["Owner"] = ["Owner is required"];
        }
        else if (request.Owner.Trim().Length > IotUtilizationAnalyticsOptions.MaxOwnerLength)
        {
            errors["Owner"] = [$"Owner must be {IotUtilizationAnalyticsOptions.MaxOwnerLength} characters or fewer"];
        }

        if (request.DueDate is null)
        {
            errors["DueDate"] = ["DueDate is required"];
        }
        else if (isNew && request.DueDate < today)
        {
            errors["DueDate"] = ["The due date cannot be in the past"];
        }

        if (!string.IsNullOrWhiteSpace(request.Priority) && !IotUtilizationAnalyticsOptions.PlanPriorities.IsValid(request.Priority))
        {
            errors["Priority"] = [$"Priority must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.PlanPriorities.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && !IotUtilizationAnalyticsOptions.PlanStatuses.IsValid(request.Status))
        {
            errors["Status"] = [$"Status must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.PlanStatuses.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.InsightKey) && !IotUtilizationAnalyticsOptions.InsightKeys.IsValid(request.InsightKey))
        {
            errors["InsightKey"] = [$"InsightKey must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.InsightKeys.All)}"];
        }

        if (request.Notes?.Trim().Length > IotUtilizationAnalyticsOptions.MaxNotesLength)
        {
            errors["Notes"] = [$"Notes must be {IotUtilizationAnalyticsOptions.MaxNotesLength} characters or fewer"];
        }

        if (request.Context?.Trim().Length > IotUtilizationAnalyticsOptions.MaxContextLength)
        {
            errors["Context"] = [$"Context must be {IotUtilizationAnalyticsOptions.MaxContextLength} characters or fewer"];
        }

        if (request.DeviceIds is { Count: > 5000 })
        {
            errors["DeviceIds"] = ["DeviceIds can list at most 5000 devices"];
        }

        return errors;
    }
}
