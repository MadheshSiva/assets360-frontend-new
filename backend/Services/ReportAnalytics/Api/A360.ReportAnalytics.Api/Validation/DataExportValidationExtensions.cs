using System.Text.RegularExpressions;
using MongoDB.Bson;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Validation;

public static partial class DataExportValidationExtensions
{
    [GeneratedRegex(@"^s3://[a-z0-9][a-z0-9.-]{2,62}(/[\w.\-/]*)?$")]
    private static partial Regex S3Path();

    [GeneratedRegex(@"^[a-z0-9.-]+\.[a-z]{2,}(/[\w.\-/]*)?$", RegexOptions.IgnoreCase)]
    private static partial Regex SftpTarget();

    [GeneratedRegex(@"^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$", RegexOptions.IgnoreCase)]
    private static partial Regex Email();

    [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")]
    private static partial Regex Clock();

    [GeneratedRegex(@"^[0-5]\d$")]
    private static partial Regex Minute();

    public static Dictionary<string, string[]> Validate(this SaveDataExportJobRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["Name"] = ["Name is required"];
        }
        else if (name.Length > DataExportOptions.MaxNameLength)
        {
            errors["Name"] = [$"Name must be {DataExportOptions.MaxNameLength} characters or fewer"];
        }

        var dataset = DataExportDatasetCatalog.Find(request.DatasetId);
        if (dataset is null)
        {
            errors["DatasetId"] = [$"DatasetId must be one of: {string.Join(", ", DataExportDatasetCatalog.Datasets.Select(item => item.Id))}"];
        }

        CheckOption(errors, "Format", request.Format, DataExportOptions.Formats, required: true);
        CheckOption(errors, "Delivery", request.Delivery, DataExportOptions.Deliveries, required: true);
        CheckOption(errors, "Frequency", request.Frequency, DataExportOptions.Frequencies, required: true);
        CheckOption(errors, "Status", request.Status, DataExportOptions.SaveStatuses, required: false);

        if (!string.IsNullOrWhiteSpace(request.TimeZone) && !ReportPeriods.TryGetTimeZone(request.TimeZone, out _))
        {
            errors["TimeZone"] = [$"Unknown time zone '{request.TimeZone}'"];
        }

        var fields = request.Fields ?? [];
        if (fields.Count == 0)
        {
            errors["Fields"] = ["Select at least one field"];
        }
        else if (fields.Count > DataExportOptions.MaxFields)
        {
            errors["Fields"] = [$"Select at most {DataExportOptions.MaxFields} fields"];
        }
        else if (dataset is not null && fields.FirstOrDefault(field => dataset.Field(field) is null) is { } unknown)
        {
            errors["Fields"] = [$"'{unknown}' is not a field of {dataset.Name}"];
        }

        var filters = request.Filters ?? [];
        if (filters.Count > DataExportOptions.MaxFilters)
        {
            errors["Filters"] = [$"Use at most {DataExportOptions.MaxFilters} filters"];
        }
        else if (dataset is not null)
        {
            for (var index = 0; index < filters.Count; index++)
            {
                var filter = filters[index];
                var field = dataset.Field(filter.Field);
                if (field is null)
                {
                    errors[$"Filters[{index}].Field"] = [$"'{filter.Field}' is not a field of {dataset.Name}"];
                }
                else if (DataExportFilterBuilder.TryBuild(field, filter.Operator, filter.Value, DateTime.UtcNow, out var error) is null)
                {
                    errors[$"Filters[{index}]"] = [error!];
                }
            }
        }

        var delivery = DataExportOptions.Deliveries.Normalize(request.Delivery);
        var target = request.Target?.Trim() ?? string.Empty;
        if (target.Length > DataExportOptions.MaxTargetLength)
        {
            errors["Target"] = [$"Target must be {DataExportOptions.MaxTargetLength} characters or fewer"];
        }
        else if (delivery is not null && TargetError(delivery, target) is { } targetError)
        {
            errors["Target"] = [targetError];
        }

        var frequency = DataExportOptions.Frequencies.Normalize(request.Frequency);
        if (frequency is not null && TimeError(frequency, request.Time?.Trim() ?? string.Empty) is { } timeError)
        {
            errors["Time"] = [timeError];
        }

        return errors;
    }

    public static Dictionary<string, string[]> Validate(this SaveDataExportConnectionRequest request, bool creating)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            errors["Name"] = ["Name is required"];
        }
        else if (name.Length > 60)
        {
            errors["Name"] = ["Name must be 60 characters or fewer"];
        }

        CheckOption(errors, "Type", request.Type, DataExportOptions.ConnectionTypes, required: true);
        CheckOption(errors, "Auth", request.Auth, DataExportOptions.AuthMethods, required: true);

        if (UrlError(request.BaseUrl) is { } urlError)
        {
            errors["BaseUrl"] = [urlError];
        }

        if (request.AuthClientId is { Length: > 120 })
        {
            errors["AuthClientId"] = ["AuthClientId must be 120 characters or fewer"];
        }

        if (creating || request.Secret is { Length: > 0 })
        {
            if (string.IsNullOrEmpty(request.Secret) || request.Secret.Length < 8)
            {
                errors["Secret"] = ["Enter the secret (at least 8 characters)"];
            }
            else if (request.Secret.Length > 8_192)
            {
                errors["Secret"] = ["The secret is too long"];
            }
        }

        return errors;
    }

    /// <summary>The filter rows as Mongo conditions; unknown fields are left out (they were rejected when the job was saved).</summary>
    public static List<BsonDocument> BuildFilters(DataExportDataset dataset, IEnumerable<(string Field, string Operator, string Value)> filters, DateTime utcNow, out string? error)
    {
        error = null;
        var list = new List<BsonDocument>();
        foreach (var (fieldName, op, value) in filters)
        {
            var field = dataset.Field(fieldName);
            if (field is null)
            {
                error = $"'{fieldName}' is no longer a field of {dataset.Name}";
                return [];
            }

            var condition = DataExportFilterBuilder.TryBuild(field, op, value, utcNow, out var filterError);
            if (condition is null)
            {
                error = filterError;
                return [];
            }

            list.Add(condition);
        }

        return list;
    }

    /// <summary>Base URL: absolute https with a full host name and no credentials or query string.</summary>
    public static string? UrlError(string? value)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var url))
        {
            return "Enter a valid URL";
        }

        if (url.Scheme != Uri.UriSchemeHttps)
        {
            return "Only https:// endpoints are allowed";
        }

        if (!url.Host.Contains('.'))
        {
            return "Enter a full host name";
        }

        if (!string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Query) || !string.IsNullOrEmpty(url.Fragment))
        {
            return "Remove credentials and query parameters from the URL";
        }

        return null;
    }

    private static string? TargetError(string delivery, string target)
    {
        switch (delivery)
        {
            case "S3":
                return S3Path().IsMatch(target) ? null : "Enter an S3 path such as s3://bucket/folder/";
            case "Secure FTP":
                return SftpTarget().IsMatch(target) ? null : "Enter an SFTP host and folder, without credentials";
            case "Email":
                var list = target.Split(new[] { ',', ';' }, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
                if (list.Length == 0)
                {
                    return "Add at least one recipient";
                }

                return list.All(address => Email().IsMatch(address)) ? null : "One of the recipient addresses is not valid";
            default:
                return target.Length > 0 ? null : "Choose an API connection";
        }
    }

    private static string? TimeError(string frequency, string time)
    {
        switch (frequency)
        {
            case DataExportOptions.HourlyFrequency:
                return Minute().IsMatch(time) ? null : "Hourly exports need the minute past the hour (00-59)";
            case DataExportOptions.DailyFrequency or DataExportOptions.MonthlyFrequency:
                return Clock().IsMatch(time) ? null : "Choose a run time (HH:mm)";
            case DataExportOptions.WeeklyFrequency:
                var parts = time.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                return parts.Length == 2 && DataExportOptions.Weekdays.Contains(parts[0]) && Clock().IsMatch(parts[1])
                    ? null
                    : "Weekly exports need a day and time, e.g. Mon 08:00";
            default:
                return null;
        }
    }

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options, bool required)
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
