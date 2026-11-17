using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class PredictiveAnalyticsValidationExtensions
{
    private const int MaxNameLength = 100;

    public static Dictionary<string, string[]> Validate(this SavePredictiveAnalyticsViewRequest request)
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
        else if (request.ViewName.Trim().Equals(PredictiveAnalyticsOptions.AllPredictionsViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{PredictiveAnalyticsOptions.AllPredictionsViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            if (InteractiveDashboardMappings.FilterValue(filters.RiskLevel) is { } risk && !PredictiveAnalyticsOptions.RiskLevels.IsValid(risk))
            {
                errors["Filters.RiskLevel"] = [$"RiskLevel must be one of: {string.Join(", ", PredictiveAnalyticsOptions.RiskLevels.All)}"];
            }

            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    /// <summary>Checks the tuning values of a data request (filters and dates are checked when the request is loaded).</summary>
    public static void ValidateSettings(this PredictiveAnalyticsRequest request, Dictionary<string, string[]> errors)
    {
        if (request.AccuracyTarget is < 0 or > 100)
        {
            errors["AccuracyTarget"] = ["AccuracyTarget must be between 0 and 100"];
        }

        if (request.ReviewConfidence is < 0 or > 100)
        {
            errors["ReviewConfidence"] = ["ReviewConfidence must be between 0 and 100"];
        }

        if (request.HighRiskScore is < 0 or > 100)
        {
            errors["HighRiskScore"] = ["HighRiskScore must be between 0 and 100"];
        }

        if (request.FailureWindowDays is < 1 or > PredictiveAnalyticsOptions.MaxFailureWindowDays)
        {
            errors["FailureWindowDays"] = [$"FailureWindowDays must be between 1 and {PredictiveAnalyticsOptions.MaxFailureWindowDays}"];
        }

        if (request.ToleranceDays is < 0 or > PredictiveAnalyticsOptions.MaxToleranceDays)
        {
            errors["ToleranceDays"] = [$"ToleranceDays must be between 0 and {PredictiveAnalyticsOptions.MaxToleranceDays}"];
        }
    }

    public static PredictiveAnalyticsFilters ToDomain(this PredictiveAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? PredictiveAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new PredictiveAnalyticsFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            AssetCategory = InteractiveDashboardMappings.FilterValue(request?.Category),
            AssetType = InteractiveDashboardMappings.FilterValue(request?.AssetType),
            RiskLevel = PredictiveAnalyticsOptions.RiskLevels.Normalize(InteractiveDashboardMappings.FilterValue(request?.RiskLevel)),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }
}
