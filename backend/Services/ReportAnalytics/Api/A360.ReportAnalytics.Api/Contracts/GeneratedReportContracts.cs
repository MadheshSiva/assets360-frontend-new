using MongoDB.Bson;
using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Contracts;

public static class GeneratedReportOptions
{
    public const string CompletedStatus = "Completed";
    public const string FailedStatus = "Failed";
    public const string OnceRecurrence = "Once";
    public const string DailyRecurrence = "Daily";
    public const string WeeklyRecurrence = "Weekly";
    public const string MonthlyRecurrence = "Monthly";
    public const string AllTimeRange = "all";

    /// <summary>The page shows GST.</summary>
    public const string DefaultTimeZone = "Asia/Dubai";

    /// <summary>Rows kept with a report; a report over more rows is marked truncated.</summary>
    public const int MaxRows = 1_000;
    public const int MaxNameLength = 80;
    public const int MaxRecipients = 20;

    public static readonly OptionList Recurrences = new(OnceRecurrence, DailyRecurrence, WeeklyRecurrence, MonthlyRecurrence);
    public static readonly OptionList Formats = new("URL", "PDF", "CSV");
    public static readonly OptionList Weekdays = new("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday");

    /// <summary>Time range presets: how far back from now the template's date field may be.</summary>
    public static readonly IReadOnlyList<GeneratedReportTimeRange> TimeRanges =
    [
        new("1h", "1 Hours", TimeSpan.FromHours(1)),
        new("2h", "2 Hours", TimeSpan.FromHours(2)),
        new("4h", "4 Hours", TimeSpan.FromHours(4)),
        new("8h", "8 Hours", TimeSpan.FromHours(8)),
        new("24h", "24 Hours", TimeSpan.FromHours(24)),
        new("7d", "7 Days", TimeSpan.FromDays(7)),
        new("30d", "30 Days", TimeSpan.FromDays(30)),
        new("90d", "90 Days", TimeSpan.FromDays(90)),
        new("1y", "1 Year", TimeSpan.FromDays(365)),
        new(AllTimeRange, "All Time", null)
    ];

    public static GeneratedReportTimeRange? TimeRange(string? value) =>
        TimeRanges.FirstOrDefault(range => string.Equals(range.Value, value?.Trim(), StringComparison.OrdinalIgnoreCase));
}

public sealed record GeneratedReportTimeRange(string Value, string Label, TimeSpan? Length);

/// <summary>Create Report form. Schedule fields are required for their recurrence: Daily time, Weekly day + time, Monthly date + time.</summary>
public sealed record CreateGeneratedReportRequest(
    string? Name,
    string? Module,
    string? Template,
    string? TimeRange,
    string? Recurrence,
    string? ScheduleTime,
    string? ScheduleDay,
    string? ScheduleDate,
    string? Format,
    IReadOnlyList<string>? ShareWith,
    string? ExpireOn,
    string? TimeZone,
    string? TenantId,
    string? ClientId);

public sealed record GeneratedReportTemplateResponse(
    string Id,
    string Name,
    string? DatasetId,
    string? DatasetName,
    IReadOnlyList<string> Columns,
    string? DateField,
    bool Available,
    string? UnavailableReason,
    string? Note)
{
    public static GeneratedReportTemplateResponse From(GeneratedReportTemplate template) => new(
        template.Id,
        template.Name,
        template.DatasetId,
        template.Dataset?.Name,
        template.Columns,
        template.DateField,
        template.Available,
        template.UnavailableReason,
        template.Note);
}

public sealed record GeneratedReportModuleResponse(string Id, string Name, IReadOnlyList<GeneratedReportTemplateResponse> Templates);

public sealed record GeneratedReportTimeRangeResponse(string Value, string Label);

public sealed record GeneratedReportTemplatesResponse(
    IReadOnlyList<GeneratedReportModuleResponse> Modules,
    IReadOnlyList<GeneratedReportTimeRangeResponse> TimeRanges,
    IReadOnlyList<string> Recurrences,
    IReadOnlyList<string> Formats,
    IReadOnlyList<string> Weekdays,
    int MaxRows);

/// <summary>A report in the list (no rows). Dates are local "yyyy-MM-dd" / "yyyy-MM-dd HH:mm" in the requested time zone.</summary>
public record GeneratedReportSummaryResponse(
    string Id,
    string Name,
    string Module,
    string TemplateId,
    string Template,
    string DatasetId,
    string TimeRange,
    string TimeRangeLabel,
    string? DateField,
    string Recurrence,
    string? ScheduleTime,
    string? ScheduleDay,
    string? ScheduleDate,
    string Format,
    IReadOnlyList<string> ShareWith,
    string? ExpireOn,
    string? CreatedOn,
    string? GeneratedOn,
    string? RangeFrom,
    string? RangeTo,
    string Status,
    string? Error,
    int RowCount,
    bool Truncated,
    string? CreatedBy)
{
    public static GeneratedReportSummaryResponse From(GeneratedReport report, TimeZoneInfo zone) => new(
        report.ReportId,
        report.Name,
        report.Module,
        report.TemplateId,
        report.Template,
        report.DatasetId,
        report.TimeRange,
        GeneratedReportOptions.TimeRange(report.TimeRange)?.Label ?? report.TimeRange,
        report.DateField,
        report.Recurrence,
        report.ScheduleTime,
        report.ScheduleDay,
        report.ScheduleDate,
        report.Format,
        report.ShareWith,
        report.ExpireOn?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture),
        Local(report.CreatedAt, zone, "yyyy-MM-dd"),
        Local(report.GeneratedAt, zone, "yyyy-MM-dd HH:mm"),
        Local(report.RangeFrom, zone, "yyyy-MM-dd HH:mm"),
        Local(report.RangeTo, zone, "yyyy-MM-dd HH:mm"),
        report.Status ?? GeneratedReportOptions.CompletedStatus,
        report.Error,
        report.RowCount,
        report.Truncated,
        report.CreatedBy);

    protected static string? Local(DateTime? utc, TimeZoneInfo zone, string format) =>
        utc is null
            ? null
            : TimeZoneInfo.ConvertTimeFromUtc(DataExportTime.Utc(utc.Value), zone).ToString(format, System.Globalization.CultureInfo.InvariantCulture);
}

/// <summary>A report with its columns and rows. Cells are text, numbers or null; dates are local "yyyy-MM-dd HH:mm".</summary>
public sealed record GeneratedReportResponse(
    GeneratedReportSummaryResponse Report,
    IReadOnlyList<string> Headers,
    IReadOnlyList<object?[]> Rows)
{
    public static GeneratedReportResponse From(GeneratedReport report, TimeZoneInfo zone) => new(
        GeneratedReportSummaryResponse.From(report, zone),
        report.Headers,
        report.Rows.Select(row => row.Select(value => Cell(value, zone)).ToArray()).ToList());

    private static object? Cell(BsonValue value, TimeZoneInfo zone) => value switch
    {
        { IsBsonNull: true } => null,
        { IsValidDateTime: true } => DataExportFileWriter.Cell(value.ToUniversalTime(), zone),
        { IsNumeric: true } => value.ToDouble(),
        { IsString: true } => value.AsString,
        _ => value.ToString()
    };
}
