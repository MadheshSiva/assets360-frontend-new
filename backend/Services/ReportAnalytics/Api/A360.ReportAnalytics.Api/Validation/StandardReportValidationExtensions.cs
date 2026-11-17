using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Validation;

public static class StandardReportValidationExtensions
{
    private const int MaxReportNameLength = 200;
    private const int MaxDescriptionLength = 1000;
    private const int MaxApplyReportIds = 500;

    public static Dictionary<string, string[]> Validate(this CreateStandardReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateReport(
            errors,
            request.ReportName,
            request.Description,
            request.Category,
            request.ReportPeriodFrom,
            request.ReportPeriodTo,
            request.TimeZone,
            request.Frequency,
            request.Status);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this UpdateStandardReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateReport(
            errors,
            request.ReportName,
            request.Description,
            request.Category,
            request.ReportPeriodFrom,
            request.ReportPeriodTo,
            request.TimeZone,
            request.Frequency,
            request.Status);

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this ScheduleStandardReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateOption(errors, "Frequency", request.Frequency, StandardReportOptions.Frequencies, required: true);
        ValidateTimeZone(errors, request.TimeZone);

        if (StandardReportOptions.Frequencies.IsValid(request.Frequency)
            && !StandardReportOptions.IsOnDemand(request.Frequency)
            && request.NextScheduledOn is null)
        {
            errors["NextScheduledOn"] = ["NextScheduledOn is required unless Frequency is On demand"];
        }

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this ApplyReportPeriodRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.ReportIds is null || request.ReportIds.All(string.IsNullOrWhiteSpace))
        {
            errors["ReportIds"] = ["At least one ReportId is required"];
        }
        else if (request.ReportIds.Count > MaxApplyReportIds)
        {
            errors["ReportIds"] = [$"No more than {MaxApplyReportIds} reports can be updated at once"];
        }

        if (request.ReportPeriodFrom is null || request.ReportPeriodTo is null)
        {
            errors["ReportPeriod"] = ["ReportPeriodFrom and ReportPeriodTo are required"];
        }

        ValidatePeriod(errors, request.ReportPeriodFrom, request.ReportPeriodTo);
        ValidateTimeZone(errors, request.TimeZone);

        return errors;
    }

    public static Dictionary<string, string[]>? ValidateListFilters(
        string? category,
        string? frequency,
        string? status,
        string? sortBy,
        string? sortDirection,
        DateTime? periodFrom,
        DateTime? periodTo,
        string? timeZone)
    {
        var errors = new Dictionary<string, string[]>();

        ValidateOption(errors, "Category", category, StandardReportOptions.Categories, required: false);
        ValidateOption(errors, "Frequency", frequency, StandardReportOptions.Frequencies, required: false);
        ValidateOption(errors, "Status", status, StandardReportOptions.Statuses, required: false);
        ValidatePeriod(errors, periodFrom, periodTo);
        ValidateTimeZone(errors, timeZone);

        if (!string.IsNullOrWhiteSpace(sortBy)
            && !StandardReportRepository.SortFields.ContainsKey(sortBy.Trim()))
        {
            errors["SortBy"] = [$"SortBy must be one of: {string.Join(", ", StandardReportRepository.SortFields.Keys)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortDirection)
            && !sortDirection.Trim().Equals("asc", StringComparison.OrdinalIgnoreCase)
            && !sortDirection.Trim().Equals("desc", StringComparison.OrdinalIgnoreCase))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        return errors.Count > 0 ? errors : null;
    }

    public static void ValidateTimeZone(Dictionary<string, string[]> errors, string? timeZone)
    {
        if (!ReportPeriods.TryGetTimeZone(timeZone, out _))
        {
            errors["TimeZone"] = [$"TimeZone '{timeZone}' is not recognised (use an id such as Asia/Dubai or UTC)"];
        }
    }

    private static void ValidateReport(
        Dictionary<string, string[]> errors,
        string? reportName,
        string? description,
        string? category,
        DateTime? reportPeriodFrom,
        DateTime? reportPeriodTo,
        string? timeZone,
        string? frequency,
        string? status)
    {
        if (string.IsNullOrWhiteSpace(reportName))
        {
            errors["ReportName"] = ["ReportName is required"];
        }
        else if (reportName.Trim().Length > MaxReportNameLength)
        {
            errors["ReportName"] = [$"ReportName must be {MaxReportNameLength} characters or fewer"];
        }

        if (description?.Trim().Length > MaxDescriptionLength)
        {
            errors["Description"] = [$"Description must be {MaxDescriptionLength} characters or fewer"];
        }

        ValidateOption(errors, "Category", category, StandardReportOptions.Categories, required: true);
        ValidateOption(errors, "Frequency", frequency, StandardReportOptions.Frequencies, required: true);
        ValidateOption(errors, "Status", status, StandardReportOptions.Statuses, required: false);
        ValidateTimeZone(errors, timeZone);

        if ((reportPeriodFrom is null) != (reportPeriodTo is null))
        {
            errors["ReportPeriod"] = ["ReportPeriodFrom and ReportPeriodTo must both be set or both be empty"];
        }

        ValidatePeriod(errors, reportPeriodFrom, reportPeriodTo);
    }

    private static void ValidatePeriod(Dictionary<string, string[]> errors, DateTime? from, DateTime? to)
    {
        if (from is not null && to is not null && from > to)
        {
            errors["ReportPeriod"] = ["The period start must be on or before its end"];
        }
    }

    private static void ValidateOption(
        Dictionary<string, string[]> errors,
        string key,
        string? value,
        OptionList options,
        bool required)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            if (required)
            {
                errors[key] = [$"{key} is required"];
            }

            return;
        }

        if (!options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }
}
