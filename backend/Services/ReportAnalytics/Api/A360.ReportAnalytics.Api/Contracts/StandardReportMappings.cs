using A360.ReportAnalytics.Domain.Entities;
using A360.Security;

namespace A360.ReportAnalytics.Api.Contracts;

internal static class StandardReportMappings
{
    // Callers validate first, so the time zone and option values are known to be good here.
    public static StandardReport ToEntity(this CreateStandardReportRequest request, string reportId, CurrentUser? currentUser)
    {
        var report = new StandardReport
        {
            ReportId = reportId,
            CreatedBy = FirstNonEmpty(request.CreatedBy, currentUser?.UserName),
            CreatedAt = DateTime.UtcNow,
            TenantId = FirstNonEmpty(request.TenantId, currentUser?.TenantId),
            ClientId = FirstNonEmpty(request.ClientId, currentUser?.ClientId),
            IsDeleted = false
        };

        Apply(
            report,
            request.ReportName,
            request.Description,
            request.Category,
            request.ReportPeriodFrom,
            request.ReportPeriodTo,
            request.TimeZone,
            request.IncludeTime,
            request.Frequency,
            request.NextScheduledOn,
            request.ReviewDueOn,
            request.Status);

        return report;
    }

    public static void ApplyTo(this UpdateStandardReportRequest request, StandardReport report, CurrentUser? currentUser)
    {
        Apply(
            report,
            request.ReportName,
            request.Description,
            request.Category,
            request.ReportPeriodFrom,
            request.ReportPeriodTo,
            request.TimeZone,
            request.IncludeTime,
            request.Frequency,
            request.NextScheduledOn,
            request.ReviewDueOn,
            request.Status);

        report.UpdatedBy = FirstNonEmpty(request.UpdatedBy, currentUser?.UserName);
        report.UpdatedAt = DateTime.UtcNow;
    }

    public static void ApplyTo(this ScheduleStandardReportRequest request, StandardReport report, CurrentUser? currentUser)
    {
        var timeZoneId = string.IsNullOrWhiteSpace(request.TimeZone) ? report.TimeZone : request.TimeZone.Trim();
        ReportPeriods.TryGetTimeZone(timeZoneId, out var timeZone);

        report.Frequency = StandardReportOptions.Frequencies.Normalize(request.Frequency)!;
        report.TimeZone = timeZoneId;

        if (StandardReportOptions.IsOnDemand(report.Frequency))
        {
            report.NextScheduledOn = null;
            if (report.Status == StandardReportOptions.ScheduledStatus)
            {
                report.Status = report.GeneratedOn is null ? StandardReportOptions.DraftStatus : StandardReportOptions.ReadyStatus;
            }
        }
        else
        {
            report.NextScheduledOn = ReportPeriods.ToUtc(request.NextScheduledOn, timeZone);
            if (report.Status is null or StandardReportOptions.DraftStatus)
            {
                report.Status = StandardReportOptions.ScheduledStatus;
            }
        }

        report.UpdatedBy = FirstNonEmpty(request.UpdatedBy, currentUser?.UserName);
        report.UpdatedAt = DateTime.UtcNow;
    }

    public static void ApplyTo(this ApplyReportPeriodRequest request, StandardReport report, CurrentUser? currentUser)
    {
        var timeZoneId = string.IsNullOrWhiteSpace(request.TimeZone) ? report.TimeZone : request.TimeZone.Trim();
        ReportPeriods.TryGetTimeZone(timeZoneId, out var timeZone);

        report.TimeZone = timeZoneId;
        report.IncludeTime = request.IncludeTime ?? false;
        (report.ReportPeriodFrom, report.ReportPeriodTo) =
            ReportPeriods.ToUtcRange(request.ReportPeriodFrom, request.ReportPeriodTo, timeZone, report.IncludeTime);

        report.UpdatedBy = FirstNonEmpty(request.UpdatedBy, currentUser?.UserName);
        report.UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Marks the report generated now. A recurring report moves its next run forward past now,
    /// keeping the same day/time slot.
    /// </summary>
    public static void MarkGenerated(this StandardReport report, CurrentUser? currentUser, DateTime utcNow)
    {
        report.GeneratedOn = utcNow;
        report.Status = StandardReportOptions.ReadyStatus;

        if (!StandardReportOptions.IsOnDemand(report.Frequency))
        {
            var next = report.NextScheduledOn ?? utcNow;
            while (next <= utcNow)
            {
                next = Advance(next, report.Frequency);
            }

            report.NextScheduledOn = next;
        }

        report.UpdatedBy = currentUser?.UserName ?? report.UpdatedBy;
        report.UpdatedAt = utcNow;
    }

    private static DateTime Advance(DateTime value, string frequency) => frequency switch
    {
        "Daily" => value.AddDays(1),
        "Weekly" => value.AddDays(7),
        "Quarterly" => value.AddMonths(3),
        "Yearly" => value.AddYears(1),
        _ => value.AddMonths(1)
    };

    private static void Apply(
        StandardReport report,
        string? reportName,
        string? description,
        string? category,
        DateTime? reportPeriodFrom,
        DateTime? reportPeriodTo,
        string? timeZoneId,
        bool? includeTime,
        string? frequency,
        DateTime? nextScheduledOn,
        DateTime? reviewDueOn,
        string? status)
    {
        var zoneId = string.IsNullOrWhiteSpace(timeZoneId) ? ReportPeriods.DefaultTimeZone : timeZoneId.Trim();
        ReportPeriods.TryGetTimeZone(zoneId, out var timeZone);

        report.ReportName = reportName!.Trim();
        report.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        report.Category = StandardReportOptions.Categories.Normalize(category)!;
        report.TimeZone = zoneId;
        report.IncludeTime = includeTime ?? false;
        (report.ReportPeriodFrom, report.ReportPeriodTo) =
            ReportPeriods.ToUtcRange(reportPeriodFrom, reportPeriodTo, timeZone, report.IncludeTime);
        report.Frequency = StandardReportOptions.Frequencies.Normalize(frequency)!;
        report.NextScheduledOn = StandardReportOptions.IsOnDemand(report.Frequency) ? null : ReportPeriods.ToUtc(nextScheduledOn, timeZone);
        report.ReviewDueOn = ReportPeriods.ToUtc(reviewDueOn, timeZone);
        report.Status = StandardReportOptions.Statuses.Normalize(status)
            ?? report.Status
            ?? StandardReportOptions.DraftStatus;
    }

    private static string? FirstNonEmpty(string? requested, string? fallback)
    {
        return string.IsNullOrWhiteSpace(requested) ? fallback : requested.Trim();
    }
}
