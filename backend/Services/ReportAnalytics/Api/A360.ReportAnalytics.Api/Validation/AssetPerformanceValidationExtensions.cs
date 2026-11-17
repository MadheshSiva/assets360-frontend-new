using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class AssetPerformanceValidationExtensions
{
    private const int MaxNameLength = 100;

    public static Dictionary<string, string[]> Validate(this SaveAssetPerformanceViewRequest request)
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
        else if (request.ViewName.Trim().Equals(AssetPerformanceOptions.AllAssetsViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{AssetPerformanceOptions.AllAssetsViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    public static AssetPerformanceFilters ToDomain(this AssetPerformanceFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? AssetPerformanceOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new AssetPerformanceFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            AssetCategory = InteractiveDashboardMappings.FilterValue(request?.Category),
            AssetType = InteractiveDashboardMappings.FilterValue(request?.AssetType),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }
}
