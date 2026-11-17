using A360.ReportAnalytics.Repository.Repositories;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Contracts;

public static class CustomReportOptions
{
    public const string DraftStatus = "Draft";
    public const string PublishedStatus = "Published";
    public const string ScheduledStatus = "Scheduled";

    public const string NoSchedule = "None";
    public const string DefaultVisibility = "My team";
    public const string TableChart = "Table";

    public const int MaxRowLimit = 10_000;
    public const int DefaultPreviewLimit = 50;
    public const int MaxPreviewLimit = 500;

    // Same module list as the Standard Reports categories.
    public static readonly OptionList Modules = StandardReportOptions.Categories;

    public static readonly OptionList Statuses = new(DraftStatus, PublishedStatus, ScheduledStatus);

    public static readonly OptionList Visibilities = new(CustomReportRepository.PrivateVisibility, DefaultVisibility, "Organization");

    public static readonly OptionList LastUpdated = new("Any time", "Today", "Last 7 days", "Last 30 days", "Last 90 days");

    public static readonly OptionList ChartTypes = new(TableChart, "Bar", "Horizontal bar", "Line", "Area", "Pie", "Donut");

    public static readonly OptionList DefaultViews = new("Table", "Chart");

    public static readonly OptionList FilterLogic = new("And", "Or");

    public static readonly OptionList CalculatedDataTypes = new(ReportFieldTypes.Number, ReportFieldTypes.Currency);

    public static readonly OptionList ScheduleFrequencies = new(NoSchedule, "Daily", "Weekly", "Monthly", "Quarterly");

    public static readonly OptionList DaysOfWeek = new("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");

    public static readonly OptionList LibraryExportFormats = new("json", "xlsx");

    public static readonly IReadOnlyList<string> BuilderSteps = ["Data Source", "Select Fields", "Filters", "Group & Sort", "Visualize", "Preview"];

    /// <summary>Start of the "Last Updated" range in UTC; null for Any time.</summary>
    public static DateTime? UpdatedSince(string? lastUpdated, TimeZoneInfo timeZone, DateTime utcNow)
    {
        var today = TimeZoneInfo.ConvertTimeFromUtc(utcNow, timeZone).Date;

        DateTime? localStart = LastUpdated.Normalize(lastUpdated) switch
        {
            "Today" => today,
            "Last 7 days" => today.AddDays(-6),
            "Last 30 days" => today.AddDays(-29),
            "Last 90 days" => today.AddDays(-89),
            _ => null
        };

        return localStart is null ? null : TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(localStart.Value, DateTimeKind.Unspecified), timeZone);
    }
}

public sealed record CustomReportOptionsResponse(
    IReadOnlyList<string> Modules,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> Visibilities,
    IReadOnlyList<string> LastUpdated,
    IReadOnlyList<string> BuilderSteps,
    IReadOnlyList<string> ChartTypes,
    IReadOnlyList<string> DefaultViews,
    IReadOnlyList<string> Aggregations,
    IReadOnlyDictionary<string, IReadOnlyList<string>> FilterOperatorsByType,
    IReadOnlyList<string> FilterLogic,
    IReadOnlyList<string> CalculationOperators,
    IReadOnlyList<string> CalculatedDataTypes,
    IReadOnlyList<string> ScheduleFrequencies,
    IReadOnlyList<string> DaysOfWeek,
    IReadOnlyList<string> LibrarySortFields,
    IReadOnlyList<string> ExportFormats,
    IReadOnlyList<string> LibraryExportFormats,
    int MaxRowLimit);
