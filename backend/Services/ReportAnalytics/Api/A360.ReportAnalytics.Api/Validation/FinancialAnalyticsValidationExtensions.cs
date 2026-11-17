using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class FinancialAnalyticsValidationExtensions
{
    private const int MaxNameLength = 100;
    private const int MaxTitleLength = 200;
    private const int MaxTextLength = 2000;
    private const int MaxDecisionRequests = 200;

    public static Dictionary<string, string[]> Validate(this SaveFinancialAnalyticsViewRequest request)
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
        else if (request.ViewName.Trim().Equals(FinancialAnalyticsOptions.AllFinancialViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{FinancialAnalyticsOptions.AllFinancialViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    public static AssetPerformanceFilters ToDomain(this FinancialAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? FinancialAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new AssetPerformanceFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            AssetCategory = InteractiveDashboardMappings.FilterValue(request?.Category),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }

    /// <summary>The percentages and the default useful life of the filter bar.</summary>
    public static void ValidateSettings(this FinancialAnalyticsRequest request, Dictionary<string, string[]> errors)
    {
        if (request.BudgetTarget is < 0 or > 200)
        {
            errors["BudgetTarget"] = ["BudgetTarget must be between 0 and 200"];
        }

        if (request.DefaultUsefulLifeYears is <= 0 or > 100)
        {
            errors["DefaultUsefulLifeYears"] = ["DefaultUsefulLifeYears must be more than 0 and at most 100"];
        }

        if (request.MaintenanceRatioLimit is < 0 or > 1000)
        {
            errors["MaintenanceRatioLimit"] = ["MaintenanceRatioLimit must be between 0 and 1000"];
        }

        if (request.UtilizationThreshold is < 0 or > 100)
        {
            errors["UtilizationThreshold"] = ["UtilizationThreshold must be between 0 and 100"];
        }

        if (request.CostCenter is { Length: > MaxNameLength })
        {
            errors["CostCenter"] = [$"CostCenter must be {MaxNameLength} characters or fewer"];
        }
    }

    public static Dictionary<string, string[]> Validate(this SaveFinancialCapexRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Title))
        {
            errors["Title"] = ["Title is required"];
        }
        else if (request.Title.Trim().Length > MaxTitleLength)
        {
            errors["Title"] = [$"Title must be {MaxTitleLength} characters or fewer"];
        }

        if (request.Amount is null)
        {
            errors["Amount"] = ["Amount is required"];
        }
        else if (request.Amount <= 0 || double.IsNaN(request.Amount.Value) || double.IsInfinity(request.Amount.Value))
        {
            errors["Amount"] = ["Amount must be more than 0"];
        }

        if (request.Currency is { } currency && (currency.Trim().Length != 3 || !currency.Trim().All(char.IsLetter)))
        {
            errors["Currency"] = ["Currency must be a 3-letter ISO code"];
        }

        foreach (var (key, value) in new[]
        {
            ("AssetId", request.AssetId), ("AssetName", request.AssetName), ("Location", request.Location), ("Category", request.Category),
            ("CostCenter", request.CostCenter), ("RequestedBy", request.RequestedBy)
        })
        {
            if (value is { Length: > MaxTitleLength })
            {
                errors[key] = [$"{key} must be {MaxTitleLength} characters or fewer"];
            }
        }

        if (request.Justification is { Length: > MaxTextLength })
        {
            errors["Justification"] = [$"Justification must be {MaxTextLength} characters or fewer"];
        }

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this FinancialCapexDecisionRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.RequestIds is not { Count: > 0 } || request.RequestIds.Any(string.IsNullOrWhiteSpace))
        {
            errors["RequestIds"] = ["RequestIds must list at least one request"];
        }
        else if (request.RequestIds.Count > MaxDecisionRequests)
        {
            errors["RequestIds"] = [$"At most {MaxDecisionRequests} requests can be decided at once"];
        }

        if (string.IsNullOrWhiteSpace(request.Decision))
        {
            errors["Decision"] = ["Decision is required"];
        }
        else if (!FinancialAnalyticsOptions.CapexDecisions.IsValid(request.Decision))
        {
            errors["Decision"] = [$"Decision must be one of: {string.Join(", ", FinancialAnalyticsOptions.CapexDecisions.All)}"];
        }

        if (string.IsNullOrWhiteSpace(request.Comments))
        {
            errors["Comments"] = ["Comments are required"];
        }
        else if (request.Comments.Length > MaxTextLength)
        {
            errors["Comments"] = [$"Comments must be {MaxTextLength} characters or fewer"];
        }

        if (request.Approver is { Length: > MaxTitleLength })
        {
            errors["Approver"] = [$"Approver must be {MaxTitleLength} characters or fewer"];
        }

        return errors;
    }
}
