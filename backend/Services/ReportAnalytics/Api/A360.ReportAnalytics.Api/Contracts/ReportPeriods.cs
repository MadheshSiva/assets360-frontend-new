namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>Converts dates entered in the report's time zone to and from the UTC values stored in Mongo.</summary>
public static class ReportPeriods
{
    public const string DefaultTimeZone = "UTC";

    public static bool TryGetTimeZone(string? timeZoneId, out TimeZoneInfo timeZone)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            timeZone = TimeZoneInfo.Utc;
            return true;
        }

        return TimeZoneInfo.TryFindSystemTimeZoneById(timeZoneId.Trim(), out timeZone!);
    }

    /// <summary>A value with an offset or Z is already absolute; one without is read as local time in the zone.</summary>
    public static DateTime ToUtc(DateTime value, TimeZoneInfo timeZone) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => TimeZoneInfo.ConvertTimeToUtc(value, timeZone)
    };

    public static DateTime? ToUtc(DateTime? value, TimeZoneInfo timeZone) =>
        value is null ? null : ToUtc(value.Value, timeZone);

    /// <summary>
    /// The UTC range for a reporting period. Without time the range covers whole days in the zone,
    /// so 01 Sep – 30 Sep runs from the start of 1 Sep to the last millisecond of 30 Sep.
    /// </summary>
    public static (DateTime? FromUtc, DateTime? ToUtc) ToUtcRange(DateTime? from, DateTime? to, TimeZoneInfo timeZone, bool includeTime)
    {
        if (includeTime)
        {
            return (ToUtc(from, timeZone), ToUtc(to, timeZone));
        }

        return (
            from is null ? null : StartOfDayUtc(LocalDate(from.Value, timeZone), timeZone),
            to is null ? null : StartOfDayUtc(LocalDate(to.Value, timeZone).AddDays(1), timeZone).AddMilliseconds(-1));
    }

    /// <summary>The range for a quick button (Today, This week, ...) in the zone, as whole days. Weeks start on Sunday to match the calendar.</summary>
    public static (DateTime From, DateTime To) ResolvePreset(string preset, TimeZoneInfo timeZone, DateTime utcNow)
    {
        var today = TimeZoneInfo.ConvertTimeFromUtc(utcNow, timeZone).Date;

        var (start, endExclusive) = preset.Trim().ToLowerInvariant() switch
        {
            "today" => (today, today.AddDays(1)),
            "this week" => (today.AddDays(-(int)today.DayOfWeek), today.AddDays(7 - (int)today.DayOfWeek)),
            "this quarter" => QuarterOf(today),
            "this year" => (new DateTime(today.Year, 1, 1), new DateTime(today.Year + 1, 1, 1)),
            _ => (new DateTime(today.Year, today.Month, 1), new DateTime(today.Year, today.Month, 1).AddMonths(1))
        };

        return (start, endExclusive.AddDays(-1));
    }

    /// <summary>UTC bounds [start, end) of a calendar month in the zone.</summary>
    public static (DateTime StartUtc, DateTime EndUtc) MonthUtcRange(int year, int month, TimeZoneInfo timeZone)
    {
        var start = new DateTime(year, month, 1);
        return (StartOfDayUtc(start, timeZone), StartOfDayUtc(start.AddMonths(1), timeZone));
    }

    public static DateOnly LocalDateOnly(DateTime utcValue, TimeZoneInfo timeZone) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utcValue, DateTimeKind.Utc), timeZone));

    private static DateTime LocalDate(DateTime value, TimeZoneInfo timeZone) => value.Kind switch
    {
        DateTimeKind.Unspecified => value.Date,
        _ => TimeZoneInfo.ConvertTimeFromUtc(value.ToUniversalTime(), timeZone).Date
    };

    private static DateTime StartOfDayUtc(DateTime localDate, TimeZoneInfo timeZone) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(localDate.Date, DateTimeKind.Unspecified), timeZone);

    private static (DateTime Start, DateTime EndExclusive) QuarterOf(DateTime today)
    {
        var start = new DateTime(today.Year, (today.Month - 1) / 3 * 3 + 1, 1);
        return (start, start.AddMonths(3));
    }
}
