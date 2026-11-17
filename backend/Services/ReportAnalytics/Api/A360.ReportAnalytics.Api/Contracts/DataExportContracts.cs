using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Contracts;

public static class DataExportOptions
{
    public const string DraftStatus = "Draft";
    public const string ScheduledStatus = "Scheduled";
    public const string RunningStatus = "Running";
    public const string SuccessStatus = "Success";
    public const string FailedStatus = "Failed";
    public const string PausedStatus = "Paused";

    public const string UntestedStatus = "Untested";
    public const string ConnectedStatus = "Connected";
    public const string WarningStatus = "Warning";
    public const string DisconnectedStatus = "Disconnected";

    public const string ResultSuccess = "Success";
    public const string ResultFailed = "Failed";
    public const string ResultDenied = "Denied";

    public const string ApiDelivery = "API";
    public const string OnDemandFrequency = "On demand";
    public const string RealTimeFrequency = "Real-time";
    public const string HourlyFrequency = "Hourly";
    public const string DailyFrequency = "Daily";
    public const string WeeklyFrequency = "Weekly";
    public const string MonthlyFrequency = "Monthly";

    /// <summary>The scheduler's and the UI's time zone (the page shows GST).</summary>
    public const string DefaultTimeZone = "Asia/Dubai";

    /// <summary>No S3 / SFTP / e-mail / API transport is configured, so runs only generate the file.</summary>
    public const string NotDeliveredStatus = "Not delivered";
    public const string NoTransportMessage = "not delivered: no transport configured";

    public const int MaxRowsPerRun = 100_000;
    public const long MaxFileBytes = 12L * 1024 * 1024;
    public const int DefaultPreviewRows = 10;
    public const int MaxPreviewRows = 100;
    public const int DefaultSampleRows = 25;
    public const int MaxSampleRows = 1_000;
    public const int MaxFields = 200;
    public const int MaxFilters = 20;
    public const int MaxNameLength = 80;
    public const int MaxTargetLength = 200;
    public const int DefaultLogPageSize = 500;
    public const int MaxLogPageSize = 1_000;
    public const int MaxConnectionTests = 200;
    public const int CertificateWarningDays = 30;

    public static readonly OptionList Formats = new("CSV", "XLSX", "JSON");
    public static readonly OptionList Deliveries = new("S3", "Secure FTP", "Email", ApiDelivery);
    public static readonly OptionList Frequencies = new(OnDemandFrequency, HourlyFrequency, DailyFrequency, WeeklyFrequency, MonthlyFrequency, RealTimeFrequency);
    public static readonly OptionList JobStatuses = new(SuccessStatus, RunningStatus, ScheduledStatus, FailedStatus, PausedStatus, DraftStatus);
    public static readonly OptionList SaveStatuses = new(DraftStatus, ScheduledStatus);
    public static readonly OptionList ConnectionTypes = new("REST", "OData", "JDBC");
    public static readonly OptionList ConnectionStatuses = new(UntestedStatus, ConnectedStatus, WarningStatus, DisconnectedStatus);
    public static readonly OptionList AuthMethods = new(
        "OAuth 2.0 (client credentials)", "API key", "Basic", "Key pair", "Service principal", "Personal access token");
    public static readonly OptionList LogResults = new(ResultSuccess, ResultFailed, ResultDenied);
    public static readonly OptionList ExportSections = new("access-logs", "jobs", "runs");
    public static readonly OptionList ExportFormats = new("csv", "xlsx");
    public static readonly OptionList StatsRanges = new("7", "30");
    public static readonly string[] Weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    public static string DestinationLabel(string delivery, string target) => delivery switch
    {
        "S3" => "S3",
        "Secure FTP" => "SFTP",
        "Email" => "Email",
        _ => string.IsNullOrWhiteSpace(target) ? "API" : target
    };
}

// ----- Requests -----

public sealed record DataExportFilterRequest(string? Field, string? Operator, string? Value);

/// <summary>Body of POST /jobs and PUT /jobs/{jobId}: the Export Builder draft. Status is Draft or Scheduled (default).</summary>
public sealed record SaveDataExportJobRequest(
    string? Name,
    string? DatasetId,
    string? Format,
    IReadOnlyList<string>? Fields,
    IReadOnlyList<DataExportFilterRequest>? Filters,
    string? Delivery,
    string? Target,
    string? Frequency,
    string? Time,
    bool? Encrypted,
    string? Status,
    string? TimeZone,
    string? TenantId,
    string? ClientId);

/// <summary>
/// Body of POST /connections and PUT /connections/{connectionId}. Secret is required when adding and optional when editing
/// (omit it to keep the stored one). Only a masked form of it is kept.
/// </summary>
public sealed record SaveDataExportConnectionRequest(
    string? Name,
    string? Type,
    string? BaseUrl,
    string? Auth,
    string? AuthClientId,
    string? Secret,
    bool? TestNow,
    string? TenantId,
    string? ClientId);

// ----- Responses -----

public sealed record DataExportOptionsResponse(
    IReadOnlyList<string> Formats,
    IReadOnlyList<string> Deliveries,
    IReadOnlyList<string> Frequencies,
    IReadOnlyList<string> JobStatuses,
    IReadOnlyList<string> ConnectionTypes,
    IReadOnlyList<string> ConnectionStatuses,
    IReadOnlyList<string> AuthMethods,
    IReadOnlyList<string> LogResults,
    IReadOnlyDictionary<string, IReadOnlyList<string>> Operators,
    IReadOnlyList<string> Weekdays,
    IReadOnlyList<string> ExportSections,
    IReadOnlyList<string> ExportFormats,
    string DefaultTimeZone,
    int MaxRowsPerRun,
    long MaxFileBytes,
    int MaxPreviewRows,
    string DeliveryNote);

public sealed record DataExportFiltersResponse(
    IReadOnlyList<string> Owners,
    IReadOnlyList<string> Modules,
    IReadOnlyList<DataExportDatasetOption> Datasets,
    IReadOnlyList<string> Destinations);

public sealed record DataExportDatasetOption(string Id, string Name);

public sealed record DataExportFieldResponse(string Group, string Name, string Type);

public sealed record DataExportDatasetResponse(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<string> Modules,
    IReadOnlyList<string> Groups,
    IReadOnlyList<DataExportFieldResponse> Fields,
    long Rows,
    long? SizeBytes,
    string? Refreshed,
    DateTime? RefreshedUtc,
    string Owner,
    string Collection,
    int Exports)
{
    public static DataExportDatasetResponse From(DataExportDataset dataset, Repository.Repositories.DataExportDatasetStats stats, int exports, TimeZoneInfo zone) => new(
        dataset.Id,
        dataset.Name,
        dataset.Description,
        dataset.Modules,
        dataset.Groups,
        dataset.Fields.Select(field => new DataExportFieldResponse(field.Group, field.Name, field.Type)).ToList(),
        stats.Rows,
        stats.SizeBytes,
        DataExportTime.Stamp(stats.RefreshedAt, zone),
        stats.RefreshedAt,
        dataset.SourceService,
        dataset.Collection,
        exports);
}

public sealed record DataExportPreviewResponse(
    string DatasetId,
    IReadOnlyList<string> Header,
    IReadOnlyList<object?[]> Rows,
    long TotalRows,
    bool Truncated);

public sealed record DataExportFilterResponse(string Field, string Operator, string Value);

public sealed record DataExportJobResponse(
    string Id,
    string Name,
    string Module,
    string DatasetId,
    string? DatasetName,
    string Format,
    string Delivery,
    string Target,
    string Destination,
    string Frequency,
    string Time,
    string TimeZone,
    string? LastRun,
    string? NextRun,
    DateTime? LastRunUtc,
    DateTime? NextRunUtc,
    string Status,
    string Owner,
    IReadOnlyList<string> Fields,
    IReadOnlyList<DataExportFilterResponse> Filters,
    bool Encrypted,
    string? LastError,
    string? LastRunId,
    long? LastRowCount,
    long? LastSizeBytes,
    DateTime? CreatedAt,
    DateTime? UpdatedAt)
{
    public static DataExportJobResponse From(DataExportJob job, TimeZoneInfo zone) => new(
        job.JobId,
        job.Name,
        job.Module,
        job.DatasetId,
        DataExportDatasetCatalog.Find(job.DatasetId)?.Name,
        job.Format,
        job.Delivery,
        job.Target,
        DataExportOptions.DestinationLabel(job.Delivery, job.Target),
        job.Frequency,
        job.Time,
        job.TimeZone,
        DataExportTime.Stamp(job.LastRunAt, zone),
        DataExportTime.Stamp(job.NextRunAt, zone),
        job.LastRunAt,
        job.NextRunAt,
        job.Status ?? DataExportOptions.DraftStatus,
        job.OwnerName ?? job.CreatedBy ?? "Unknown",
        job.Fields,
        job.Filters.Select(filter => new DataExportFilterResponse(filter.Field, filter.Operator, filter.Value)).ToList(),
        job.Encrypted,
        job.LastError,
        job.LastRunId,
        job.LastRowCount,
        job.LastSizeBytes,
        job.CreatedAt,
        job.UpdatedAt);
}

public sealed record DataExportRunResponse(
    string Id,
    string JobId,
    string JobName,
    string DatasetId,
    string Format,
    string Status,
    string? StartedAt,
    DateTime StartedAtUtc,
    DateTime? FinishedAtUtc,
    long DurationMs,
    long RowCount,
    long SizeBytes,
    string? FileName,
    bool HasFile,
    string Delivery,
    string Target,
    string DeliveryStatus,
    string? DeliveryMessage,
    string? Error,
    string? TriggeredBy)
{
    public static DataExportRunResponse From(DataExportRun run, TimeZoneInfo zone) => new(
        run.RunId,
        run.JobId,
        run.JobName,
        run.DatasetId,
        run.Format,
        run.Status ?? DataExportOptions.FailedStatus,
        DataExportTime.Stamp(run.StartedAt, zone),
        run.StartedAt,
        run.FinishedAt,
        run.DurationMs,
        run.RowCount,
        run.SizeBytes,
        run.FileName,
        run.HasFile,
        run.Delivery,
        run.Target,
        run.DeliveryStatus,
        run.DeliveryMessage,
        run.Error,
        run.TriggeredBy);
}

public sealed record DataExportRunResult(DataExportJobResponse Job, DataExportRunResponse Run);

public sealed record DataExportConnectionTestResponse(string At, DateTime AtUtc, bool Ok, int? HttpStatus, long? LatencyMs, string? Message);

public sealed record DataExportConnectionResponse(
    string Id,
    string Name,
    string Type,
    string BaseUrl,
    string Auth,
    string? AuthClientId,
    string Status,
    double? Uptime,
    int TestsLast30Days,
    string? LastTested,
    DateTime? LastTestedUtc,
    string? LastTestMessage,
    bool SecretStored,
    string? SecretMask,
    int? CertExpiresInDays,
    DateTime? CertificateExpiresAt,
    string Owner,
    IReadOnlyList<DataExportConnectionTestResponse> RecentTests)
{
    public static DataExportConnectionResponse From(DataExportConnection connection, TimeZoneInfo zone, DateTime utcNow)
    {
        var recent = connection.Tests.Where(test => test.At >= utcNow.AddDays(-30)).ToList();
        return new DataExportConnectionResponse(
            connection.ConnectionId,
            connection.Name,
            connection.Type,
            connection.BaseUrl,
            connection.Auth,
            connection.AuthClientId,
            connection.Status ?? DataExportOptions.UntestedStatus,
            recent.Count == 0 ? null : Math.Round(recent.Count(test => test.Ok) * 100.0 / recent.Count, 1),
            recent.Count,
            DataExportTime.Stamp(connection.LastTestedAt, zone),
            connection.LastTestedAt,
            connection.LastTestMessage,
            !string.IsNullOrEmpty(connection.SecretMask),
            connection.SecretMask,
            connection.CertificateExpiresAt is { } expires ? (int)Math.Floor((expires - utcNow).TotalDays) : null,
            connection.CertificateExpiresAt,
            connection.OwnerName ?? connection.CreatedBy ?? "Unknown",
            connection.Tests.Take(10)
                .Select(test => new DataExportConnectionTestResponse(DataExportTime.Stamp(test.At, zone)!, test.At, test.Ok, test.HttpStatus, test.LatencyMs, test.Message))
                .ToList());
    }
}

public sealed record DataExportAccessLogResponse(
    string Id,
    string At,
    DateTime AtUtc,
    string Actor,
    string Action,
    string Resource,
    string Client,
    string Ip,
    string Result)
{
    public static DataExportAccessLogResponse From(DataExportAccessLog log, TimeZoneInfo zone) => new(
        log.LogId,
        DataExportTime.Stamp(log.At, zone)!,
        log.At,
        log.Actor,
        log.Action,
        log.Resource,
        log.Client,
        log.Ip ?? "—",
        log.Result);
}

public sealed record DataExportAccessLogPageResponse(IReadOnlyList<DataExportAccessLogResponse> Items, long TotalCount, int Page, int PageSize);

/// <summary>Runs and data access per day (oldest first) in the requested time zone, from the run history and the access logs.</summary>
public sealed record DataExportRunStatsResponse(
    int Days,
    IReadOnlyList<string> Labels,
    IReadOnlyList<string> Dates,
    IReadOnlyList<int> Success,
    IReadOnlyList<int> Failed,
    IReadOnlyList<long> GeneratedBytes,
    IReadOnlyList<long> GeneratedRows,
    IReadOnlyList<int> AccessOk,
    IReadOnlyList<int> AccessFailed,
    int TotalRuns,
    int SuccessfulRuns,
    int FailedRuns,
    double? SuccessRate,
    long GeneratedBytesTotal,
    long GeneratedRowsTotal);

/// <summary>Headline figures. "WeekAgo" counts are the current items that already existed seven days ago.</summary>
public sealed record DataExportSummaryResponse(
    int ActiveExports,
    int ActiveExportsWeekAgo,
    int Connections,
    int ConnectionsWeekAgo,
    int ScheduledJobs,
    int ScheduledJobsWeekAgo,
    double? SuccessRate30,
    double? SuccessRatePrevious30,
    long GeneratedBytes30,
    long GeneratedBytesPrevious30,
    int FailedJobs,
    int UnhealthyConnections,
    string DeliveryNote);

public sealed record DataExportOverviewResponse(
    DateTime GeneratedAt,
    string TimeZone,
    DataExportSummaryResponse Summary,
    IReadOnlyList<DataExportJobResponse> Jobs,
    IReadOnlyList<DataExportConnectionResponse> Connections,
    IReadOnlyList<DataExportDatasetResponse> Datasets,
    DataExportRunStatsResponse Stats7,
    DataExportRunStatsResponse Stats30,
    IReadOnlyList<DataExportAccessLogResponse> Logs,
    long LogsTotal);

/// <summary>UTC ↔ local "yyyy-MM-ddTHH:mm" stamps as the page shows them.</summary>
public static class DataExportTime
{
    public static string? Stamp(DateTime? utc, TimeZoneInfo zone) =>
        utc is null
            ? null
            : TimeZoneInfo.ConvertTimeFromUtc(Utc(utc.Value), zone)
                .ToString("yyyy-MM-dd'T'HH:mm", System.Globalization.CultureInfo.InvariantCulture);

    public static DateTime Utc(DateTime value) =>
        value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    public static TimeZoneInfo Zone(string? timeZone) =>
        ReportPeriods.TryGetTimeZone(string.IsNullOrWhiteSpace(timeZone) ? DataExportOptions.DefaultTimeZone : timeZone, out var zone) ? zone : TimeZoneInfo.Utc;
}
