using System.Globalization;
using System.Text.RegularExpressions;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Validation;

public static partial class GeneratedReportValidationExtensions
{
    [GeneratedRegex(@"^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$", RegexOptions.IgnoreCase)]
    private static partial Regex Email();

    [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")]
    private static partial Regex Clock();

    public static Dictionary<string, string[]> Validate(this CreateGeneratedReportRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["Name"] = ["Name is required"];
        }
        else if (name.Length > GeneratedReportOptions.MaxNameLength)
        {
            errors["Name"] = [$"Name must be {GeneratedReportOptions.MaxNameLength} characters or fewer"];
        }

        var module = GeneratedReportTemplateCatalog.FindModule(request.Module);
        if (module is null)
        {
            errors["Module"] = [$"Module must be one of: {string.Join(", ", GeneratedReportTemplateCatalog.Modules.Select(item => item.Name))}"];
        }

        var template = GeneratedReportTemplateCatalog.Find(request.Template);
        if (string.IsNullOrWhiteSpace(request.Template))
        {
            errors["Template"] = ["Select a template"];
        }
        else if (template is null)
        {
            errors["Template"] = [$"'{request.Template.Trim()}' is not a report template"];
        }
        else if (module is not null && template.Module != module.Name)
        {
            errors["Template"] = [$"{template.Name} is not a template of {module.Name}"];
        }
        else if (!template.Available)
        {
            errors["Template"] = [$"{template.Name} cannot be generated: {template.UnavailableReason}"];
        }

        if (GeneratedReportOptions.TimeRange(request.TimeRange) is null)
        {
            errors["TimeRange"] = [$"TimeRange must be one of: {string.Join(", ", GeneratedReportOptions.TimeRanges.Select(range => range.Value))}"];
        }

        CheckOption(errors, "Format", request.Format, GeneratedReportOptions.Formats);
        CheckOption(errors, "Recurrence", request.Recurrence, GeneratedReportOptions.Recurrences);

        var recurrence = GeneratedReportOptions.Recurrences.Normalize(request.Recurrence);
        if (recurrence is not null && recurrence != GeneratedReportOptions.OnceRecurrence)
        {
            if (string.IsNullOrWhiteSpace(request.ScheduleTime) || !Clock().IsMatch(request.ScheduleTime.Trim()))
            {
                errors["ScheduleTime"] = [$"Enter the time (HH:mm) of the {recurrence.ToLowerInvariant()} report"];
            }

            if (recurrence == GeneratedReportOptions.WeeklyRecurrence && !GeneratedReportOptions.Weekdays.IsValid(request.ScheduleDay))
            {
                errors["ScheduleDay"] = [$"ScheduleDay must be one of: {string.Join(", ", GeneratedReportOptions.Weekdays.All)}"];
            }

            if (recurrence == GeneratedReportOptions.MonthlyRecurrence && !IsDate(request.ScheduleDate))
            {
                errors["ScheduleDate"] = ["Enter the date (YYYY-MM-DD) of the first monthly report"];
            }
        }

        var recipients = request.ShareWith ?? [];
        if (recipients.Count > GeneratedReportOptions.MaxRecipients)
        {
            errors["ShareWith"] = [$"Share with at most {GeneratedReportOptions.MaxRecipients} addresses"];
        }
        else if (recipients.FirstOrDefault(email => !string.IsNullOrWhiteSpace(email) && !Email().IsMatch(email.Trim())) is { } invalid)
        {
            errors["ShareWith"] = [$"'{invalid.Trim()}' is not a valid e-mail address"];
        }

        if (!string.IsNullOrWhiteSpace(request.ExpireOn))
        {
            if (!IsDate(request.ExpireOn))
            {
                errors["ExpireOn"] = ["Use YYYY-MM-DD for ExpireOn"];
            }
            else if (DateOnly.ParseExact(request.ExpireOn.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture) < DateOnly.FromDateTime(DateTime.UtcNow))
            {
                errors["ExpireOn"] = ["ExpireOn cannot be in the past"];
            }
        }

        if (!string.IsNullOrWhiteSpace(request.TimeZone) && !ReportPeriods.TryGetTimeZone(request.TimeZone, out _))
        {
            errors["TimeZone"] = [$"Unknown time zone '{request.TimeZone}'"];
        }

        return errors;
    }

    private static bool IsDate(string? value) =>
        !string.IsNullOrWhiteSpace(value) && DateOnly.TryParseExact(value.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            errors[key] = [$"{key} is required"];
        }
        else if (!options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }
}
