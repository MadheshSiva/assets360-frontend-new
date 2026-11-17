using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>A fixed list of choices for a dropdown or filter, matched ignoring case.</summary>
public sealed class OptionList(params string[] values)
{
    public IReadOnlyList<string> All { get; } = values;

    public bool IsValid(string? value) => Normalize(value) is not null;

    /// <summary>Standard spelling, e.g. "on demand" as "On demand"; null when not recognised.</summary>
    public string? Normalize(string? value) =>
        All.FirstOrDefault(item => string.Equals(item, value?.Trim(), StringComparison.OrdinalIgnoreCase));
}

public static class StandardReportOptions
{
    public const string DraftStatus = "Draft";
    public const string ReadyStatus = "Ready";
    public const string ScheduledStatus = "Scheduled";
    public const string NeedsReviewStatus = "Needs review";

    public static readonly OptionList Categories = new(
        "Assets",
        "WIP / Operations",
        "Maintenance",
        "Inspection",
        "Inventory",
        "Movement & Custody",
        "Audit & Compliance",
        "Financial");

    public static readonly OptionList Frequencies = new(
        "Daily",
        "Weekly",
        "Monthly",
        "Quarterly",
        "Yearly",
        StandardReportRepository.OnDemandFrequency);

    public static readonly OptionList Statuses = new(DraftStatus, ReadyStatus, ScheduledStatus, NeedsReviewStatus);

    // Quick buttons beside the Reporting period picker.
    public static readonly OptionList PeriodPresets = new("Today", "This week", "This month", "This quarter", "This year");

    public static readonly OptionList ExportFormats = new("xlsx", "csv");

    public static bool IsOnDemand(string? frequency) =>
        string.Equals(frequency?.Trim(), StandardReportRepository.OnDemandFrequency, StringComparison.OrdinalIgnoreCase);
}

public sealed record StandardReportOptionsResponse(
    IReadOnlyList<string> Categories,
    IReadOnlyList<string> Frequencies,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> PeriodPresets,
    IReadOnlyList<string> SortFields,
    IReadOnlyList<string> ExportFormats,
    string DefaultTimeZone);
