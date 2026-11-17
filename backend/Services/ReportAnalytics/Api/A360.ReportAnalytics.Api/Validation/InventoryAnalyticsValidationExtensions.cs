using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class InventoryAnalyticsValidationExtensions
{
    private const int MaxNameLength = 100;
    private const int MaxTitleLength = 200;
    private const int MaxTextLength = 2000;
    private const int MaxItemCodes = 500;

    public static Dictionary<string, string[]> Validate(this SaveInventoryAnalyticsViewRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.ViewName))
        {
            errors["ViewName"] = ["ViewName is required"];
        }
        else if (request.ViewName.Trim().Length > MaxNameLength)
        {
            errors["ViewName"] = [$"ViewName must be {MaxNameLength} characters or fewer"];
        }
        else if (request.ViewName.Trim().Equals(InventoryAnalyticsOptions.AllInventoryViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{InventoryAnalyticsOptions.AllInventoryViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            if (InteractiveDashboardMappings.FilterValue(filters.StockStatus) is { } status && !InventoryAnalyticsOptions.StockStatuses.IsValid(status))
            {
                errors["Filters.StockStatus"] = [$"StockStatus must be one of: {string.Join(", ", InventoryAnalyticsOptions.StockStatuses.All)}"];
            }

            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    public static InventoryAnalyticsFilters ToDomain(this InventoryAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? InventoryAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new InventoryAnalyticsFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            Warehouse = InteractiveDashboardMappings.FilterValue(request?.Warehouse),
            Store = InteractiveDashboardMappings.FilterValue(request?.Store),
            Category = InteractiveDashboardMappings.FilterValue(request?.Category),
            StockStatus = InventoryAnalyticsOptions.StockStatuses.Normalize(InteractiveDashboardMappings.FilterValue(request?.StockStatus)),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }

    /// <summary>Create (existing is null) or edit a purchase request / action plan. The type cannot change on an edit.</summary>
    public static Dictionary<string, string[]> Validate(this SaveInventoryActionRequest request, InventoryAnalyticsActionRequest? existing)
    {
        var errors = new Dictionary<string, string[]>();
        var type = existing?.RequestType ?? InventoryAnalyticsOptions.RequestTypes.Normalize(request.RequestType);

        if (existing is null && type is null)
        {
            errors["RequestType"] = [$"RequestType must be one of: {string.Join(", ", InventoryAnalyticsOptions.RequestTypes.All)}"];
        }
        else if (existing is not null && !string.IsNullOrWhiteSpace(request.RequestType)
                 && !string.Equals(request.RequestType.Trim(), existing.RequestType, StringComparison.OrdinalIgnoreCase))
        {
            errors["RequestType"] = ["RequestType cannot be changed"];
        }

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["Title"] = ["Title is required"];
        }
        else if (request.Title.Trim().Length > MaxTitleLength)
        {
            errors["Title"] = [$"Title must be {MaxTitleLength} characters or fewer"];
        }

        if (type == InventoryAnalyticsOptions.PurchaseRequestType)
        {
            if (request.Quantity is null or <= 0)
            {
                errors["Quantity"] = ["Quantity must be greater than 0"];
            }

            if (request.DueDate is null)
            {
                errors["DueDate"] = ["DueDate (needed by) is required"];
            }
        }
        else if (type == InventoryAnalyticsOptions.ActionPlanType)
        {
            if (string.IsNullOrWhiteSpace(request.Assignee))
            {
                errors["Assignee"] = ["Assignee (owner) is required"];
            }

            if (request.DueDate is null)
            {
                errors["DueDate"] = ["DueDate is required"];
            }

            if (string.IsNullOrWhiteSpace(request.Notes))
            {
                errors["Notes"] = ["Notes (planned actions) are required"];
            }

            if (request.Quantity is <= 0)
            {
                errors["Quantity"] = ["Quantity must be greater than 0"];
            }
        }

        if (!string.IsNullOrWhiteSpace(request.Priority) && !InventoryAnalyticsOptions.RequestPriorities.IsValid(request.Priority))
        {
            errors["Priority"] = [$"Priority must be one of: {string.Join(", ", InventoryAnalyticsOptions.RequestPriorities.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && !InventoryAnalyticsOptions.RequestStatuses.IsValid(request.Status))
        {
            errors["Status"] = [$"Status must be one of: {string.Join(", ", InventoryAnalyticsOptions.RequestStatuses.All)}"];
        }

        if (request.Notes?.Length > MaxTextLength)
        {
            errors["Notes"] = [$"Notes must be {MaxTextLength} characters or fewer"];
        }

        foreach (var (key, value) in new[] { ("Supplier", request.Supplier), ("Assignee", request.Assignee), ("Source", request.Source), ("Warehouse", request.Warehouse) })
        {
            if (value?.Trim().Length > MaxTitleLength)
            {
                errors[key] = [$"{key} must be {MaxTitleLength} characters or fewer"];
            }
        }

        if (request.ItemCodes?.Count > MaxItemCodes)
        {
            errors["ItemCodes"] = [$"At most {MaxItemCodes} item codes can be listed"];
        }

        return errors;
    }
}
