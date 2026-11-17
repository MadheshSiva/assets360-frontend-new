using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class ProductionAnalyticsValidationExtensions
{
    private const int MaxNameLength = 100;

    public static Dictionary<string, string[]> Validate(this SaveProductionAnalyticsViewRequest request)
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
        else if (request.ViewName.Trim().Equals(ProductionAnalyticsOptions.AllProductionViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{ProductionAnalyticsOptions.AllProductionViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    /// <summary>The plant is stored in the shared Location filter of the saved view.</summary>
    public static AssetPerformanceFilters ToDomain(this ProductionAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? ProductionAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new AssetPerformanceFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Plant),
            ProductionLine = InteractiveDashboardMappings.FilterValue(request?.ProductionLine),
            WorkCenter = InteractiveDashboardMappings.FilterValue(request?.WorkCenter),
            Product = InteractiveDashboardMappings.FilterValue(request?.Product),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }
}
