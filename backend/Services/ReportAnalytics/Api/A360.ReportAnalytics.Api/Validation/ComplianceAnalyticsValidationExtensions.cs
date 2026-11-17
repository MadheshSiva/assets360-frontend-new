using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Validation;

public static class ComplianceAnalyticsValidationExtensions
{
    private const int MaxNameLength = 100;
    private const int MaxTitleLength = 120;
    private const int MaxOwnerLength = 100;
    private const int MaxNotesLength = 500;
    private const int MaxReferenceLength = 200;

    /// <summary>Compliance Area, Regulation and Risk Level values (shared by the filter bar and saved views).</summary>
    public static void ValidateComplianceFilters(Dictionary<string, string[]> errors, string prefix, string? area, string? regulation, string? riskLevel)
    {
        if (InteractiveDashboardMappings.FilterValue(area) is { } areaValue && !ComplianceAnalyticsOptions.Areas.IsValid(areaValue))
        {
            errors[$"{prefix}Area"] = [$"Area must be one of: {string.Join(", ", ComplianceAnalyticsOptions.Areas.All)}"];
        }

        if (InteractiveDashboardMappings.FilterValue(regulation) is { Length: > ComplianceAnalyticsOptions.MaxRegulationLength })
        {
            errors[$"{prefix}Regulation"] = [$"Regulation must be {ComplianceAnalyticsOptions.MaxRegulationLength} characters or fewer"];
        }

        if (InteractiveDashboardMappings.FilterValue(riskLevel) is { } level && !ComplianceAnalyticsOptions.RiskLevels.IsValid(level))
        {
            errors[$"{prefix}RiskLevel"] = [$"RiskLevel must be one of: {string.Join(", ", ComplianceAnalyticsOptions.RiskLevels.All)}"];
        }
    }

    public static Dictionary<string, string[]> Validate(this SaveComplianceAnalyticsViewRequest request)
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
        else if (request.ViewName.Trim().Equals(ComplianceAnalyticsOptions.AllComplianceViewName, StringComparison.OrdinalIgnoreCase))
        {
            errors["ViewName"] = [$"{ComplianceAnalyticsOptions.AllComplianceViewName} is the built-in view; pick another name"];
        }

        if (request.Filters is { } filters)
        {
            ValidateComplianceFilters(errors, "Filters.", filters.Area, filters.Regulation, filters.RiskLevel);
            new DashboardFiltersRequest(null, null, null, filters.DatePreset, filters.DateFrom, filters.DateTo, filters.TimeZone)
                .ValidateFilters(errors, "Filters");
        }

        return errors;
    }

    public static ComplianceAnalyticsFilters ToDomain(this ComplianceAnalyticsFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? ComplianceAnalyticsOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new ComplianceAnalyticsFilters
        {
            Organization = InteractiveDashboardMappings.FilterValue(request?.Organization),
            Location = InteractiveDashboardMappings.FilterValue(request?.Location),
            ComplianceArea = ComplianceAnalyticsOptions.Areas.Normalize(InteractiveDashboardMappings.FilterValue(request?.Area)),
            Regulation = InteractiveDashboardMappings.FilterValue(request?.Regulation),
            RiskLevel = ComplianceAnalyticsOptions.RiskLevels.Normalize(InteractiveDashboardMappings.FilterValue(request?.RiskLevel)),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = string.IsNullOrWhiteSpace(request?.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim()
        };
    }

    /// <summary>Create (isUpdate false: due date not in the past) or update an action plan.</summary>
    public static Dictionary<string, string[]> Validate(this SaveComplianceActionPlanRequest request, bool isUpdate, DateOnly today)
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

        if (string.IsNullOrWhiteSpace(request.Owner))
        {
            errors["Owner"] = ["Owner is required"];
        }
        else if (request.Owner.Trim().Length > MaxOwnerLength)
        {
            errors["Owner"] = [$"Owner must be {MaxOwnerLength} characters or fewer"];
        }

        if (request.DueDate is null)
        {
            errors["DueDate"] = ["DueDate is required"];
        }
        else if (!isUpdate && request.DueDate < today)
        {
            errors["DueDate"] = ["DueDate cannot be in the past"];
        }

        if (!string.IsNullOrWhiteSpace(request.Priority) && !ComplianceAnalyticsOptions.ActionPlanPriorities.IsValid(request.Priority))
        {
            errors["Priority"] = [$"Priority must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ActionPlanPriorities.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && !ComplianceAnalyticsOptions.ActionPlanStatuses.IsValid(request.Status))
        {
            errors["Status"] = [$"Status must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ActionPlanStatuses.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(request.SourceType) && !ComplianceAnalyticsOptions.ActionPlanSources.IsValid(request.SourceType))
        {
            errors["SourceType"] = [$"SourceType must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ActionPlanSources.All)}"];
        }

        foreach (var (key, value, max) in new[]
                 {
                     ("Notes", request.Notes, MaxNotesLength),
                     ("Context", request.Context, MaxNotesLength),
                     ("SourceId", request.SourceId, MaxReferenceLength),
                     ("Location", request.Location, MaxReferenceLength),
                     ("Regulation", request.Regulation, MaxReferenceLength)
                 })
        {
            if (value is not null && value.Trim().Length > max)
            {
                errors[key] = [$"{key} must be {max} characters or fewer"];
            }
        }

        return errors;
    }
}
