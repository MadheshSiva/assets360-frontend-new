using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>Run and access statistics worked out from the stored run history and access logs.</summary>
public static class DataExportStatsCalculator
{
    /// <summary>One bucket per local day, the last one being today.</summary>
    public static DataExportRunStatsResponse Daily(
        int days,
        IReadOnlyList<DataExportRun> runs,
        IReadOnlyList<DataExportAccessLog> logs,
        TimeZoneInfo zone,
        DateTime utcNow)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, zone));
        var first = today.AddDays(-(days - 1));
        var success = new int[days];
        var failed = new int[days];
        var bytes = new long[days];
        var rows = new long[days];
        var accessOk = new int[days];
        var accessFailed = new int[days];

        int Index(DateTime utc) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DataExportTime.Utc(utc), zone)).DayNumber - first.DayNumber;

        foreach (var run in runs)
        {
            var index = Index(run.StartedAt);
            if (index < 0 || index >= days)
            {
                continue;
            }

            if (run.Status == DataExportOptions.SuccessStatus)
            {
                success[index]++;
                bytes[index] += run.SizeBytes;
                rows[index] += run.RowCount;
            }
            else
            {
                failed[index]++;
            }
        }

        foreach (var log in logs)
        {
            var index = Index(log.At);
            if (index < 0 || index >= days)
            {
                continue;
            }

            if (log.Result == DataExportOptions.ResultSuccess)
            {
                accessOk[index]++;
            }
            else
            {
                accessFailed[index]++;
            }
        }

        var dates = Enumerable.Range(0, days).Select(offset => first.AddDays(offset)).ToList();
        var ok = success.Sum();
        var bad = failed.Sum();

        return new DataExportRunStatsResponse(
            days,
            dates.Select(date => date.ToString("dd MMM", CultureInfo.InvariantCulture)).ToList(),
            dates.Select(date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).ToList(),
            success,
            failed,
            bytes,
            rows,
            accessOk,
            accessFailed,
            ok + bad,
            ok,
            bad,
            Rate(ok, bad),
            bytes.Sum(),
            rows.Sum());
    }

    public static DataExportSummaryResponse Summary(
        IReadOnlyList<DataExportJob> jobs,
        IReadOnlyList<DataExportConnection> connections,
        IReadOnlyList<DataExportRun> runs60,
        DateTime utcNow)
    {
        var weekAgo = utcNow.AddDays(-7);
        var from30 = utcNow.AddDays(-30);

        static bool Active(DataExportJob job) => job.Status is not (DataExportOptions.PausedStatus or DataExportOptions.DraftStatus);
        static bool Scheduled(DataExportJob job) => Active(job) && job.Frequency != DataExportOptions.OnDemandFrequency;
        bool Existed(DateTime? createdAt) => createdAt is not null && createdAt <= weekAgo;

        var current = runs60.Where(run => run.StartedAt >= from30).ToList();
        var previous = runs60.Where(run => run.StartedAt < from30).ToList();

        return new DataExportSummaryResponse(
            jobs.Count(Active),
            jobs.Count(job => Active(job) && Existed(job.CreatedAt)),
            connections.Count,
            connections.Count(connection => Existed(connection.CreatedAt)),
            jobs.Count(Scheduled),
            jobs.Count(job => Scheduled(job) && Existed(job.CreatedAt)),
            Rate(current.Count(Succeeded), current.Count(run => !Succeeded(run))),
            Rate(previous.Count(Succeeded), previous.Count(run => !Succeeded(run))),
            current.Where(Succeeded).Sum(run => run.SizeBytes),
            previous.Where(Succeeded).Sum(run => run.SizeBytes),
            jobs.Count(job => job.Status == DataExportOptions.FailedStatus),
            connections.Count(connection => connection.Status is DataExportOptions.WarningStatus or DataExportOptions.DisconnectedStatus),
            DataExportOptions.NoTransportMessage);
    }

    private static bool Succeeded(DataExportRun run) => run.Status == DataExportOptions.SuccessStatus;

    private static double? Rate(int ok, int bad) => ok + bad == 0 ? null : Math.Round(ok * 100.0 / (ok + bad), 1);
}
