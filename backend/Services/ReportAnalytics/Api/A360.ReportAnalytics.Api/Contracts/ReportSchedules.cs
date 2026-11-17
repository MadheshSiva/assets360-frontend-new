using System.Globalization;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>Next run time and display text for a custom report schedule.</summary>
public static class ReportSchedules
{
    /// <summary>The first run after utcNow, at Time in the schedule's zone. Monthly/Quarterly days past month end use the last day.</summary>
    public static DateTime? NextRun(CustomReportSchedule schedule, DateTime utcNow)
    {
        if (!ReportPeriods.TryGetTimeZone(schedule.TimeZone, out var zone) || !TryParseTime(schedule.Time, out var time))
        {
            return null;
        }

        var now = TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone);
        var today = now.Date;
        DateTime candidate;

        switch (schedule.Frequency)
        {
            case "Daily":
                candidate = today + time;
                if (candidate <= now)
                {
                    candidate = candidate.AddDays(1);
                }

                break;
            case "Weekly":
                var target = Enum.Parse<DayOfWeek>(schedule.DayOfWeek!, ignoreCase: true);
                candidate = today.AddDays(((int)target - (int)today.DayOfWeek + 7) % 7) + time;
                if (candidate <= now)
                {
                    candidate = candidate.AddDays(7);
                }

                break;
            case "Monthly":
                candidate = OnDay(today.Year, today.Month, schedule.DayOfMonth ?? 1) + time;
                if (candidate <= now)
                {
                    var next = today.AddMonths(1);
                    candidate = OnDay(next.Year, next.Month, schedule.DayOfMonth ?? 1) + time;
                }

                break;
            case "Quarterly":
                var quarterStart = new DateTime(today.Year, (today.Month - 1) / 3 * 3 + 1, 1);
                candidate = OnDay(quarterStart.Year, quarterStart.Month, schedule.DayOfMonth ?? 1) + time;
                if (candidate <= now)
                {
                    var next = quarterStart.AddMonths(3);
                    candidate = OnDay(next.Year, next.Month, schedule.DayOfMonth ?? 1) + time;
                }

                break;
            default:
                return null;
        }

        candidate = DateTime.SpecifyKind(candidate, DateTimeKind.Unspecified);
        if (zone.IsInvalidTime(candidate))
        {
            candidate = candidate.AddHours(1);
        }

        return TimeZoneInfo.ConvertTimeToUtc(candidate, zone);
    }

    /// <summary>e.g. "Monthly – 1st day, 08:00", "Weekly – Monday, 08:00", "Daily – 08:00".</summary>
    public static string? Describe(CustomReportSchedule? schedule) => schedule?.Frequency switch
    {
        null => null,
        "Daily" => $"Daily – {schedule.Time}",
        "Weekly" => $"Weekly – {schedule.DayOfWeek}, {schedule.Time}",
        "Monthly" or "Quarterly" => $"{schedule.Frequency} – {Ordinal(schedule.DayOfMonth ?? 1)} day, {schedule.Time}",
        _ => null
    };

    public static bool TryParseTime(string? value, out TimeSpan time) =>
        TimeSpan.TryParseExact(value?.Trim(), @"hh\:mm", CultureInfo.InvariantCulture, out time) && time < TimeSpan.FromDays(1);

    private static DateTime OnDay(int year, int month, int day) =>
        new(year, month, Math.Min(day, DateTime.DaysInMonth(year, month)));

    private static string Ordinal(int day) => (day % 100) switch
    {
        11 or 12 or 13 => $"{day}th",
        _ => (day % 10) switch
        {
            1 => $"{day}st",
            2 => $"{day}nd",
            3 => $"{day}rd",
            _ => $"{day}th"
        }
    };
}
