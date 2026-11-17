using System.Diagnostics;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>
/// Reports &amp; Analytics / Data Export &amp; API: export jobs over live datasets, reporting API connections, run history and access logs.
/// Run now generates the file from the dataset's collection and keeps it with the run; delivery to S3 / SFTP / e-mail / API is not
/// configured, so every run is recorded as "not delivered: no transport configured".
/// </summary>
public static class DataExportEndpoints
{
    internal const string JobEntityType = "DataExportJob";
    internal const string ConnectionEntityType = "DataExportConnection";
    private const string BasePath = "/api/data-export";
    private const string JobSequence = "data_export_job";
    private const string ConnectionSequence = "data_export_connection";
    private const string RunSequence = "data_export_run";
    private const string LogSequence = "data_export_access_log";
    private const string WebConsole = "Web console";

    public static RouteGroupBuilder MapDataExportEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Data Export & API");

        // Page furniture.
        group.MapGet("/options", GetOptions).WithName("GetDataExportOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetDataExportFilters");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetDataExportOverview");
        group.MapGet("/summary", GetSummaryAsync).WithName("GetDataExportSummary");
        group.MapGet("/stats", GetStatsAsync).WithName("GetDataExportRunStats");

        // Datasets: metadata, preview and a sample download.
        group.MapGet("/datasets", GetDatasetsAsync).WithName("GetDataExportDatasets");
        group.MapGet("/datasets/{datasetId}", GetDatasetAsync).WithName("GetDataExportDataset");
        group.MapGet("/datasets/{datasetId}/fields", GetDatasetFields).WithName("GetDataExportDatasetFields");
        group.MapGet("/datasets/{datasetId}/preview", PreviewDatasetAsync).WithName("PreviewDataExportDataset");
        group.MapGet("/datasets/{datasetId}/sample", DownloadDatasetSampleAsync).WithName("DownloadDataExportDatasetSample");

        // Export jobs.
        group.MapGet("/jobs", GetJobsAsync).WithName("GetDataExportJobs");
        group.MapGet("/jobs/{jobId}", GetJobAsync).WithName("GetDataExportJob");
        group.MapPost("/jobs", CreateJobAsync).WithName("CreateDataExportJob");
        group.MapPut("/jobs/{jobId}", UpdateJobAsync).WithName("UpdateDataExportJob");
        group.MapDelete("/jobs/{jobId}", DeleteJobAsync).WithName("DeleteDataExportJob");
        group.MapPost("/jobs/{jobId}/pause", PauseJobAsync).WithName("PauseDataExportJob");
        group.MapPost("/jobs/{jobId}/resume", ResumeJobAsync).WithName("ResumeDataExportJob");
        group.MapPost("/jobs/{jobId}/run", RunJobAsync).WithName("RunDataExportJob");
        group.MapGet("/jobs/{jobId}/runs", GetJobRunsAsync).WithName("GetDataExportJobRuns");
        group.MapGet("/jobs/{jobId}/sample", DownloadJobSampleAsync).WithName("DownloadDataExportJobSample");

        // Run history and generated files.
        group.MapGet("/runs", GetRunsAsync).WithName("GetDataExportRuns");
        group.MapGet("/runs/{runId}", GetRunAsync).WithName("GetDataExportRun");
        group.MapGet("/runs/{runId}/file", DownloadRunFileAsync).WithName("DownloadDataExportRunFile");

        // API connections.
        group.MapGet("/connections", GetConnectionsAsync).WithName("GetDataExportConnections");
        group.MapGet("/connections/{connectionId}", GetConnectionAsync).WithName("GetDataExportConnection");
        group.MapPost("/connections", CreateConnectionAsync).WithName("CreateDataExportConnection");
        group.MapPut("/connections/{connectionId}", UpdateConnectionAsync).WithName("UpdateDataExportConnection");
        group.MapDelete("/connections/{connectionId}", DeleteConnectionAsync).WithName("DeleteDataExportConnection");
        group.MapPost("/connections/{connectionId}/test", TestConnectionAsync).WithName("TestDataExportConnection");

        // Access logs and Export.
        group.MapGet("/access-logs", GetAccessLogsAsync).WithName("GetDataExportAccessLogs");
        group.MapGet("/export", ExportAsync).WithName("ExportDataExport");

        return group;
    }

    // ----- Options, filters, overview -----

    private static IResult GetOptions() => Results.Ok(new DataExportOptionsResponse(
        DataExportOptions.Formats.All,
        DataExportOptions.Deliveries.All,
        DataExportOptions.Frequencies.All,
        DataExportOptions.JobStatuses.All,
        DataExportOptions.ConnectionTypes.All,
        DataExportOptions.ConnectionStatuses.All,
        DataExportOptions.AuthMethods.All,
        DataExportOptions.LogResults.All,
        DataExportFieldTypes.Operators,
        DataExportOptions.Weekdays,
        DataExportOptions.ExportSections.All,
        DataExportOptions.ExportFormats.All,
        DataExportOptions.DefaultTimeZone,
        DataExportOptions.MaxRowsPerRun,
        DataExportOptions.MaxFileBytes,
        DataExportOptions.MaxPreviewRows,
        DataExportOptions.NoTransportMessage));

    /// <summary>Owner, data source (module), dataset and destination values for the filter bar.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDataExportJobRepository jobs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var list = await jobs.ListAsync(tenant, client, cancellationToken);

        return Results.Ok(new DataExportFiltersResponse(
            Distinct(list.Select(job => job.OwnerName ?? job.CreatedBy)),
            Distinct(DataExportDatasetCatalog.Datasets.SelectMany(dataset => dataset.Modules)),
            DataExportDatasetCatalog.Datasets.Select(dataset => new DataExportDatasetOption(dataset.Id, dataset.Name)).ToList(),
            Distinct(list.Select(job => DataExportOptions.DestinationLabel(job.Delivery, job.Target)))));
    }

    private static async Task<IResult> GetOverviewAsync(
        IDataExportJobRepository jobs,
        IDataExportConnectionRepository connections,
        IDataExportRunRepository runs,
        IDataExportAccessLogRepository logs,
        IDataExportDataRepository data,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        int logLimit = DataExportOptions.DefaultLogPageSize)
    {
        if (ZoneError(timeZone) is { } problem)
        {
            return problem;
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        var utcNow = DateTime.UtcNow;

        var jobList = await jobs.ListAsync(tenant, client, cancellationToken);
        var connectionList = await connections.ListAsync(tenant, client, cancellationToken);
        var runs60 = await runs.ListAsync(tenant, client, null, utcNow.AddDays(-60), 0, cancellationToken);
        var logs30 = (await logs.QueryAsync(new DataExportAccessLogQuery(tenant, client, null, null, null, utcNow.AddDays(-31), 1, 0), cancellationToken)).Items;
        var latest = await logs.QueryAsync(
            new DataExportAccessLogQuery(tenant, client, null, null, null, null, 1, Math.Clamp(logLimit, 1, DataExportOptions.MaxLogPageSize)), cancellationToken);
        var datasets = await DatasetsAsync(data, jobList, tenant, client, zone, cancellationToken);

        return Results.Ok(new DataExportOverviewResponse(
            utcNow,
            zone.Id,
            DataExportStatsCalculator.Summary(jobList, connectionList, runs60, utcNow),
            jobList.Select(job => DataExportJobResponse.From(job, zone)).ToList(),
            connectionList.Select(connection => DataExportConnectionResponse.From(connection, zone, utcNow)).ToList(),
            datasets,
            DataExportStatsCalculator.Daily(7, runs60, logs30, zone, utcNow),
            DataExportStatsCalculator.Daily(30, runs60, logs30, zone, utcNow),
            latest.Items.Select(log => DataExportAccessLogResponse.From(log, zone)).ToList(),
            latest.TotalCount));
    }

    private static async Task<IResult> GetSummaryAsync(
        IDataExportJobRepository jobs,
        IDataExportConnectionRepository connections,
        IDataExportRunRepository runs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var utcNow = DateTime.UtcNow;
        return Results.Ok(DataExportStatsCalculator.Summary(
            await jobs.ListAsync(tenant, client, cancellationToken),
            await connections.ListAsync(tenant, client, cancellationToken),
            await runs.ListAsync(tenant, client, null, utcNow.AddDays(-60), 0, cancellationToken),
            utcNow));
    }

    /// <summary>Runs and data access per day for the last 7 or 30 days (days=7|30), from the run history and access logs.</summary>
    private static async Task<IResult> GetStatsAsync(
        IDataExportRunRepository runs,
        IDataExportAccessLogRepository logs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? days = "7",
        string? jobId = null)
    {
        var errors = new Dictionary<string, string[]>();
        if (!DataExportOptions.StatsRanges.IsValid(days))
        {
            errors["Days"] = ["Days must be 7 or 30"];
        }

        if (!string.IsNullOrWhiteSpace(timeZone) && !ReportPeriods.TryGetTimeZone(timeZone, out _))
        {
            errors["TimeZone"] = [$"Unknown time zone '{timeZone}'"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var count = int.Parse(days!.Trim());
        var utcNow = DateTime.UtcNow;
        var from = utcNow.AddDays(-(count + 1));
        var runList = await runs.ListAsync(tenant, client, jobId, from, 0, cancellationToken);
        var logList = string.IsNullOrWhiteSpace(jobId)
            ? (await logs.QueryAsync(new DataExportAccessLogQuery(tenant, client, null, null, null, from, 1, 0), cancellationToken)).Items
            : [];

        return Results.Ok(DataExportStatsCalculator.Daily(count, runList, logList, DataExportTime.Zone(timeZone), utcNow));
    }

    // ----- Datasets -----

    private static async Task<IResult> GetDatasetsAsync(
        IDataExportDataRepository data,
        IDataExportJobRepository jobs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? search = null,
        string? module = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var list = await DatasetsAsync(data, await jobs.ListAsync(tenant, client, cancellationToken), tenant, client, DataExportTime.Zone(timeZone), cancellationToken);
        IEnumerable<DataExportDatasetResponse> rows = list;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(dataset => $"{dataset.Name} {string.Join(' ', dataset.Modules)} {dataset.Owner} {dataset.Description}".Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(module))
        {
            rows = rows.Where(dataset => dataset.Modules.Contains(module.Trim(), StringComparer.OrdinalIgnoreCase));
        }

        return Results.Ok(rows.ToList());
    }

    private static async Task<IResult> GetDatasetAsync(
        string datasetId,
        IDataExportDataRepository data,
        IDataExportJobRepository jobs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var dataset = DataExportDatasetCatalog.Find(datasetId);
        if (dataset is null)
        {
            return Results.NotFound();
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var stats = await data.GetStatsAsync(dataset, tenant, client, cancellationToken);
        var exports = (await jobs.ListAsync(tenant, client, cancellationToken)).Count(job => job.DatasetId == dataset.Id);
        return Results.Ok(DataExportDatasetResponse.From(dataset, stats, exports, DataExportTime.Zone(timeZone)));
    }

    private static IResult GetDatasetFields(string datasetId) =>
        DataExportDatasetCatalog.Find(datasetId) is { } dataset
            ? Results.Ok(dataset.Fields.Select(field => new DataExportFieldResponse(field.Group, field.Name, field.Type)).ToList())
            : Results.NotFound();

    /// <summary>First rows of a dataset (newest first). fields is a comma-separated list of field names; all fields when empty.</summary>
    private static async Task<IResult> PreviewDatasetAsync(
        string datasetId,
        IDataExportDataRepository data,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? fields = null,
        int rows = DataExportOptions.DefaultPreviewRows)
    {
        var dataset = DataExportDatasetCatalog.Find(datasetId);
        if (dataset is null)
        {
            return Results.NotFound();
        }

        var (selected, problem) = SelectFields(dataset, fields, rows, DataExportOptions.MaxPreviewRows, timeZone);
        if (problem is not null)
        {
            return problem;
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        var result = await data.ReadAsync(dataset, selected!, [], tenant, client, rows, cancellationToken);
        var stats = await data.GetStatsAsync(dataset, tenant, client, cancellationToken);

        return Results.Ok(new DataExportPreviewResponse(
            dataset.Id,
            selected!.Select(field => field.Name).ToList(),
            result.Rows.Select(row => row.Select(value => value is DateTime ? DataExportFileWriter.Cell(value, zone) : value).ToArray()).ToList(),
            stats.Rows,
            result.Truncated));
    }

    /// <summary>Sample download (CSV) of a dataset; recorded in the access logs.</summary>
    private static async Task<IResult> DownloadDatasetSampleAsync(
        string datasetId,
        IDataExportDataRepository data,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? fields = null,
        int rows = DataExportOptions.DefaultSampleRows)
    {
        var dataset = DataExportDatasetCatalog.Find(datasetId);
        if (dataset is null)
        {
            return Results.NotFound();
        }

        var (selected, problem) = SelectFields(dataset, fields, rows, DataExportOptions.MaxSampleRows, timeZone);
        if (problem is not null)
        {
            return problem;
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var zone = DataExportTime.Zone(timeZone);
        var result = await data.ReadAsync(dataset, selected!, [], tenant, client, rows, cancellationToken);
        var content = DataExportFileWriter.Write("CSV", selected!, result.Rows, zone, dataset.Name).Content;

        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Sample downloaded", dataset.Name, WebConsole, DataExportOptions.ResultSuccess, null, null, cancellationToken);

        return Results.File(content, DataExportFileWriter.CsvContentType, $"{Slug(dataset.Name)}-sample.csv");
    }

    // ----- Export jobs -----

    private static async Task<IResult> GetJobsAsync(
        IDataExportJobRepository jobs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? search = null,
        string? status = null,
        string? format = null,
        string? owner = null,
        string? module = null,
        string? datasetId = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, DataExportOptions.JobStatuses);
        CheckOption(errors, "Format", format, DataExportOptions.Formats);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        IEnumerable<DataExportJobResponse> rows = (await jobs.ListAsync(tenant, client, cancellationToken)).Select(job => DataExportJobResponse.From(job, zone));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(job => $"{job.Name} {job.Module} {job.Owner} {job.Destination} {job.Format}".Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (DataExportOptions.JobStatuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(job => job.Status == statusValue);
        }

        if (DataExportOptions.Formats.Normalize(format) is { } formatValue)
        {
            rows = rows.Where(job => job.Format == formatValue);
        }

        if (!string.IsNullOrWhiteSpace(owner))
        {
            rows = rows.Where(job => string.Equals(job.Owner, owner.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(module))
        {
            rows = rows.Where(job => string.Equals(job.Module, module.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (!string.IsNullOrWhiteSpace(datasetId))
        {
            rows = rows.Where(job => string.Equals(job.DatasetId, datasetId.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        return Results.Ok(rows.ToList());
    }

    private static async Task<IResult> GetJobAsync(
        string jobId,
        IDataExportJobRepository jobs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        return job is null ? Results.NotFound() : Results.Ok(DataExportJobResponse.From(job, DataExportTime.Zone(timeZone ?? job.TimeZone)));
    }

    /// <summary>Saves the Export Builder draft. Status Draft keeps it unscheduled; Scheduled (default) works out the next run.</summary>
    private static async Task<IResult> CreateJobAsync(
        SaveDataExportJobRequest request,
        IDataExportJobRepository jobs,
        IDataExportConnectionRepository connections,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(request.TenantId, request.ClientId, currentUser);
        var errors = await ValidateJobAsync(request, jobs, connections, tenant, client, null, cancellationToken);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var job = new DataExportJob
        {
            JobId = $"EXP-{await sequenceGenerator.GetNextValueAsync(JobSequence, cancellationToken):D4}",
            OwnerId = CustomReportAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            TenantId = tenant,
            ClientId = client,
            IsDeleted = false
        };
        Apply(job, request, currentUser, utcNow);
        job.Status = DataExportOptions.SaveStatuses.Normalize(request.Status) ?? DataExportOptions.ScheduledStatus;
        job.NextRunAt = DataExportSchedule.NextRun(job.Frequency, job.Time, job.Status, DataExportTime.Zone(job.TimeZone), utcNow);

        job = await jobs.CreateAsync(job, cancellationToken);
        await eventLogger.LogAsync(JobEntityType, job.Id, job.Name, EventAction.Created, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            job.Status == DataExportOptions.DraftStatus ? "Export draft saved" : "Export created", job.Name, WebConsole,
            DataExportOptions.ResultSuccess, job.JobId, null, cancellationToken);

        return Results.Created($"{BasePath}/jobs/{job.JobId}", DataExportJobResponse.From(job, DataExportTime.Zone(job.TimeZone)));
    }

    /// <summary>Updates a job from the Export Builder. A Draft saved with Status Scheduled is scheduled; Paused / Failed jobs keep their status.</summary>
    private static async Task<IResult> UpdateJobAsync(
        string jobId,
        SaveDataExportJobRequest request,
        IDataExportJobRepository jobs,
        IDataExportConnectionRepository connections,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(request.TenantId, request.ClientId, currentUser);
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        if (job is null)
        {
            return Results.NotFound();
        }

        if (job.Status == DataExportOptions.RunningStatus)
        {
            return Conflict("Status", "The export is running; save your changes when the run has finished");
        }

        var errors = await ValidateJobAsync(request, jobs, connections, tenant, client, job.Id, cancellationToken);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        Apply(job, request, currentUser, utcNow);
        var requested = DataExportOptions.SaveStatuses.Normalize(request.Status);
        if (job.Status == DataExportOptions.DraftStatus || requested == DataExportOptions.DraftStatus)
        {
            job.Status = requested ?? job.Status;
        }

        job.NextRunAt = DataExportSchedule.NextRun(job.Frequency, job.Time, job.Status, DataExportTime.Zone(job.TimeZone), utcNow);

        if (!await jobs.UpdateAsync(job.Id, job, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(JobEntityType, job.Id, job.Name, EventAction.Updated, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Export updated", job.Name, WebConsole, DataExportOptions.ResultSuccess, job.JobId, null, cancellationToken);

        return Results.Ok(DataExportJobResponse.From(job, DataExportTime.Zone(job.TimeZone)));
    }

    /// <summary>Removes the job and its schedule. Its run history and generated files are kept.</summary>
    private static async Task<IResult> DeleteJobAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        if (job is null)
        {
            return Results.NotFound();
        }

        var utcNow = DateTime.UtcNow;
        job.IsDeleted = true;
        job.DeletedAt = utcNow;
        job.NextRunAt = null;
        job.UpdatedAt = utcNow;
        job.UpdatedBy = currentUser?.UserName;
        if (!await jobs.UpdateAsync(job.Id, job, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(JobEntityType, job.Id, job.Name, EventAction.Deleted, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Export deleted", job.Name, WebConsole, DataExportOptions.ResultSuccess, job.JobId, null, cancellationToken);

        return Results.NoContent();
    }

    private static Task<IResult> PauseJobAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null) =>
        ChangeStatusAsync(jobId, pause: true, jobs, logs, sequenceGenerator, currentUserAccessor, eventLogger, httpContext, tenantId, clientId, cancellationToken);

    private static Task<IResult> ResumeJobAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null) =>
        ChangeStatusAsync(jobId, pause: false, jobs, logs, sequenceGenerator, currentUserAccessor, eventLogger, httpContext, tenantId, clientId, cancellationToken);

    private static async Task<IResult> ChangeStatusAsync(
        string jobId,
        bool pause,
        IDataExportJobRepository jobs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        if (job is null)
        {
            return Results.NotFound();
        }

        if (pause && job.Status is DataExportOptions.DraftStatus or DataExportOptions.RunningStatus)
        {
            return Conflict("Status", $"A {job.Status!.ToLowerInvariant()} export cannot be paused");
        }

        if (!pause && job.Status != DataExportOptions.PausedStatus)
        {
            return Conflict("Status", "Only a paused export can be resumed");
        }

        var utcNow = DateTime.UtcNow;
        job.Status = pause ? DataExportOptions.PausedStatus : DataExportOptions.ScheduledStatus;
        if (!pause)
        {
            job.LastError = null;
        }

        job.NextRunAt = DataExportSchedule.NextRun(job.Frequency, job.Time, job.Status, DataExportTime.Zone(job.TimeZone), utcNow);
        job.UpdatedAt = utcNow;
        job.UpdatedBy = currentUser?.UserName;
        if (!await jobs.UpdateAsync(job.Id, job, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(JobEntityType, job.Id, job.Name, EventAction.Updated, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            pause ? "Export paused" : "Export resumed", job.Name, WebConsole, DataExportOptions.ResultSuccess, job.JobId, null, cancellationToken);

        return Results.Ok(DataExportJobResponse.From(job, DataExportTime.Zone(job.TimeZone)));
    }

    /// <summary>
    /// Run now: reads the job's fields and filters from the dataset's collection, writes the CSV / Excel / JSON file and stores it with
    /// the run. Delivery is not attempted (no transport is configured), so the run says "not delivered: no transport configured".
    /// </summary>
    private static async Task<IResult> RunJobAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportRunRepository runs,
        IDataExportAccessLogRepository logs,
        IDataExportDataRepository data,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        HttpContext httpContext,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        if (job is null)
        {
            return Results.NotFound();
        }

        if (job.Status == DataExportOptions.RunningStatus && job.UpdatedAt > DateTime.UtcNow.AddMinutes(-10))
        {
            return Conflict("Status", "This export is already running");
        }

        var zone = DataExportTime.Zone(job.TimeZone);
        var startedAt = DateTime.UtcNow;
        var previousStatus = job.Status;
        job.Status = DataExportOptions.RunningStatus;
        job.UpdatedAt = startedAt;
        await jobs.UpdateAsync(job.Id, job, cancellationToken);

        var run = new DataExportRun
        {
            RunId = $"RUN-{await sequenceGenerator.GetNextValueAsync(RunSequence, cancellationToken):D6}",
            JobId = job.JobId,
            JobName = job.Name,
            DatasetId = job.DatasetId,
            Format = job.Format,
            Delivery = job.Delivery,
            Target = job.Target,
            StartedAt = startedAt,
            TriggeredBy = currentUser?.UserName ?? "Anonymous",
            CreatedBy = currentUser?.UserName,
            CreatedAt = startedAt,
            TenantId = tenant,
            ClientId = client,
            IsDeleted = false
        };

        var watch = Stopwatch.StartNew();
        DataExportFile? file = null;
        try
        {
            var dataset = DataExportDatasetCatalog.Find(job.DatasetId)
                ?? throw new DataExportRunException($"Dataset {job.DatasetId} is no longer available");
            var fields = job.Fields.Select(dataset.Field).ToList();
            if (fields.Count == 0 || fields.Any(field => field is null))
            {
                throw new DataExportRunException($"One of the selected fields is no longer part of {dataset.Name}; edit the export and pick the fields again");
            }

            var filters = DataExportValidationExtensions.BuildFilters(
                dataset, job.Filters.Select(filter => (filter.Field, filter.Operator, filter.Value)), startedAt, out var filterError);
            if (filterError is not null)
            {
                throw new DataExportRunException(filterError);
            }

            var rows = await data.ReadAsync(dataset, fields!, filters, tenant, client, DataExportOptions.MaxRowsPerRun, cancellationToken);
            if (rows.Truncated)
            {
                throw new DataExportRunException($"More than {DataExportOptions.MaxRowsPerRun:N0} rows match; add filters to export fewer rows");
            }

            file = DataExportFileWriter.Write(job.Format, fields!, rows.Rows, zone, job.Name);
            if (file.Content.LongLength > DataExportOptions.MaxFileBytes)
            {
                throw new DataExportRunException(
                    $"The file is {file.Content.LongLength / 1024 / 1024} MB, above the {DataExportOptions.MaxFileBytes / 1024 / 1024} MB limit; select fewer fields or add filters");
            }

            run.RowCount = rows.Rows.Count;
            run.SizeBytes = file.Content.LongLength;
            run.FileName = $"{Slug(job.Name)}-{TimeZoneInfo.ConvertTimeFromUtc(startedAt, zone):yyyyMMdd-HHmm}.{file.Extension}";
            run.ContentType = file.ContentType;
            run.HasFile = true;
            run.Status = DataExportOptions.SuccessStatus;
        }
        catch (DataExportRunException exception)
        {
            run.Status = DataExportOptions.FailedStatus;
            run.Error = exception.Message;
            file = null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            loggerFactory.CreateLogger(typeof(DataExportEndpoints)).LogError(exception, "Data export run {RunId} of {JobId} failed", run.RunId, job.JobId);
            run.Status = DataExportOptions.FailedStatus;
            run.Error = "The dataset could not be read. Try again later.";
            file = null;
        }

        watch.Stop();
        var finishedAt = DateTime.UtcNow;
        run.FinishedAt = finishedAt;
        run.DurationMs = watch.ElapsedMilliseconds;
        run.DeliveryStatus = DataExportOptions.NotDeliveredStatus;
        run.DeliveryMessage = DataExportOptions.NoTransportMessage;
        run.Status ??= DataExportOptions.FailedStatus;

        run = await runs.CreateAsync(run, CancellationToken.None);
        if (file is not null)
        {
            await runs.SaveFileAsync(new DataExportRunFile
            {
                RunId = run.RunId,
                FileName = run.FileName!,
                ContentType = file.ContentType,
                Content = file.Content,
                CreatedBy = run.CreatedBy,
                CreatedAt = finishedAt,
                TenantId = tenant,
                ClientId = client,
                Status = "Active",
                IsDeleted = false
            }, CancellationToken.None);
        }

        var succeeded = run.Status == DataExportOptions.SuccessStatus;
        job.Status = succeeded
            ? previousStatus == DataExportOptions.PausedStatus ? DataExportOptions.PausedStatus : DataExportOptions.SuccessStatus
            : DataExportOptions.FailedStatus;
        job.LastRunId = run.RunId;
        job.LastRunAt = startedAt;
        job.LastError = succeeded ? null : run.Error;
        job.LastRowCount = run.RowCount;
        job.LastSizeBytes = run.SizeBytes;
        job.NextRunAt = DataExportSchedule.NextRun(job.Frequency, job.Time, job.Status, zone, finishedAt);
        job.UpdatedAt = finishedAt;
        job.UpdatedBy = currentUser?.UserName;
        await jobs.UpdateAsync(job.Id, job, CancellationToken.None);

        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            succeeded ? "Export generated (not delivered: no transport configured)" : "Export failed",
            job.Name, DataExportOptions.DestinationLabel(job.Delivery, job.Target),
            succeeded ? DataExportOptions.ResultSuccess : DataExportOptions.ResultFailed, job.JobId, run.RunId, CancellationToken.None);

        return Results.Ok(new DataExportRunResult(DataExportJobResponse.From(job, zone), DataExportRunResponse.From(run, zone)));
    }

    private static async Task<IResult> GetJobRunsAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportRunRepository runs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        int limit = 50)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        if (job is null)
        {
            return Results.NotFound();
        }

        var zone = DataExportTime.Zone(timeZone ?? job.TimeZone);
        var list = await runs.ListAsync(tenant, client, job.JobId, null, Math.Clamp(limit, 1, 500), cancellationToken);
        return Results.Ok(list.Select(run => DataExportRunResponse.From(run, zone)).ToList());
    }

    /// <summary>Sample download (CSV) of a job: its fields and filters, first rows only. Recorded in the access logs.</summary>
    private static async Task<IResult> DownloadJobSampleAsync(
        string jobId,
        IDataExportJobRepository jobs,
        IDataExportDataRepository data,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        int rows = DataExportOptions.DefaultSampleRows)
    {
        if (rows < 1 || rows > DataExportOptions.MaxSampleRows)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Rows"] = [$"Rows must be between 1 and {DataExportOptions.MaxSampleRows}"] });
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var job = await jobs.GetByJobIdAsync(jobId, tenant, client, cancellationToken);
        var dataset = job is null ? null : DataExportDatasetCatalog.Find(job.DatasetId);
        if (job is null || dataset is null)
        {
            return Results.NotFound();
        }

        var fields = job.Fields.Select(dataset.Field).Where(field => field is not null).Select(field => field!).ToList();
        var filters = DataExportValidationExtensions.BuildFilters(
            dataset, job.Filters.Select(filter => (filter.Field, filter.Operator, filter.Value)), DateTime.UtcNow, out var filterError);
        if (fields.Count == 0 || filterError is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Job"] = [filterError ?? "The export has no valid fields; edit it first"] });
        }

        var result = await data.ReadAsync(dataset, fields, filters, tenant, client, rows, cancellationToken);
        var content = DataExportFileWriter.Write("CSV", fields, result.Rows, DataExportTime.Zone(job.TimeZone), job.Name).Content;
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Sample downloaded", job.Name, WebConsole, DataExportOptions.ResultSuccess, job.JobId, null, cancellationToken);

        return Results.File(content, DataExportFileWriter.CsvContentType, $"{Slug(job.Name)}-sample.csv");
    }

    // ----- Runs -----

    private static async Task<IResult> GetRunsAsync(
        IDataExportRunRepository runs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? jobId = null,
        int? days = null,
        int limit = 100)
    {
        if (days is < 1 or > 366)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Days"] = ["Days must be between 1 and 366"] });
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        var list = await runs.ListAsync(tenant, client, jobId, days is null ? null : DateTime.UtcNow.AddDays(-days.Value), Math.Clamp(limit, 1, 1_000), cancellationToken);
        return Results.Ok(list.Select(run => DataExportRunResponse.From(run, zone)).ToList());
    }

    private static async Task<IResult> GetRunAsync(
        string runId,
        IDataExportRunRepository runs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var run = await runs.GetByRunIdAsync(runId, tenant, client, cancellationToken);
        return run is null ? Results.NotFound() : Results.Ok(DataExportRunResponse.From(run, DataExportTime.Zone(timeZone)));
    }

    /// <summary>The file a run generated. Recorded in the access logs.</summary>
    private static async Task<IResult> DownloadRunFileAsync(
        string runId,
        IDataExportRunRepository runs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var run = await runs.GetByRunIdAsync(runId, tenant, client, cancellationToken);
        var file = run is { HasFile: true } ? await runs.GetFileAsync(run.RunId, tenant, client, cancellationToken) : null;
        if (run is null || file is null)
        {
            return Results.NotFound();
        }

        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Export file downloaded", run.JobName, WebConsole, DataExportOptions.ResultSuccess, run.JobId, run.RunId, cancellationToken);

        return Results.File(file.Content, file.ContentType, file.FileName);
    }

    // ----- Connections -----

    private static async Task<IResult> GetConnectionsAsync(
        IDataExportConnectionRepository connections,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? search = null,
        string? status = null)
    {
        if (!string.IsNullOrWhiteSpace(status) && !DataExportOptions.ConnectionStatuses.IsValid(status))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Status"] = [$"Status must be one of: {string.Join(", ", DataExportOptions.ConnectionStatuses.All)}"]
            });
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        var utcNow = DateTime.UtcNow;
        IEnumerable<DataExportConnectionResponse> rows = (await connections.ListAsync(tenant, client, cancellationToken))
            .Select(connection => DataExportConnectionResponse.From(connection, zone, utcNow));
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(connection => $"{connection.Name} {connection.Type} {connection.BaseUrl} {connection.Auth}".Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        if (DataExportOptions.ConnectionStatuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(connection => connection.Status == statusValue);
        }

        return Results.Ok(rows.ToList());
    }

    private static async Task<IResult> GetConnectionAsync(
        string connectionId,
        IDataExportConnectionRepository connections,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var connection = await connections.GetByConnectionIdAsync(connectionId, tenant, client, cancellationToken);
        return connection is null
            ? Results.NotFound()
            : Results.Ok(DataExportConnectionResponse.From(connection, DataExportTime.Zone(timeZone), DateTime.UtcNow));
    }

    /// <summary>Adds a connection and, unless TestNow is false, tests it right away. Only a masked form of the secret is stored.</summary>
    private static async Task<IResult> CreateConnectionAsync(
        SaveDataExportConnectionRequest request,
        IDataExportConnectionRepository connections,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? timeZone = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(request.TenantId, request.ClientId, currentUser);
        var errors = request.Validate(creating: true);
        if (errors.Count == 0 && await connections.NameExistsAsync(request.Name!, tenant, client, null, cancellationToken))
        {
            errors["Name"] = ["A connection with this name already exists"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var connection = new DataExportConnection
        {
            ConnectionId = $"CON-{await sequenceGenerator.GetNextValueAsync(ConnectionSequence, cancellationToken):D4}",
            OwnerId = CustomReportAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            Status = DataExportOptions.UntestedStatus,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            TenantId = tenant,
            ClientId = client,
            IsDeleted = false
        };
        ApplyConnection(connection, request, currentUser, utcNow);

        if (request.TestNow ?? true)
        {
            await RecordTestAsync(connection, cancellationToken);
        }

        connection = await connections.CreateAsync(connection, cancellationToken);
        await eventLogger.LogAsync(ConnectionEntityType, connection.Id, connection.Name, EventAction.Created, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "API connection added", connection.Name, connection.Type, DataExportOptions.ResultSuccess, null, null, cancellationToken);

        return Results.Created($"{BasePath}/connections/{connection.ConnectionId}", DataExportConnectionResponse.From(connection, DataExportTime.Zone(timeZone), DateTime.UtcNow));
    }

    /// <summary>Edits a connection. Leave Secret empty to keep the stored one. Export jobs that named the old connection follow the rename.</summary>
    private static async Task<IResult> UpdateConnectionAsync(
        string connectionId,
        SaveDataExportConnectionRequest request,
        IDataExportConnectionRepository connections,
        IDataExportJobRepository jobs,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? timeZone = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(request.TenantId, request.ClientId, currentUser);
        var connection = await connections.GetByConnectionIdAsync(connectionId, tenant, client, cancellationToken);
        if (connection is null)
        {
            return Results.NotFound();
        }

        var errors = request.Validate(creating: false);
        if (errors.Count == 0 && await connections.NameExistsAsync(request.Name!, tenant, client, connection.Id, cancellationToken))
        {
            errors["Name"] = ["A connection with this name already exists"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var oldName = connection.Name;
        var urlChanged = !string.Equals(connection.BaseUrl, NormalizeUrl(request.BaseUrl!), StringComparison.Ordinal);
        var utcNow = DateTime.UtcNow;
        ApplyConnection(connection, request, currentUser, utcNow);
        if (urlChanged)
        {
            connection.Status = DataExportOptions.UntestedStatus;
            connection.Tests = [];
            connection.CertificateExpiresAt = null;
        }

        if (request.TestNow == true)
        {
            await RecordTestAsync(connection, cancellationToken);
        }

        if (!await connections.UpdateAsync(connection.Id, connection, cancellationToken))
        {
            return Results.NotFound();
        }

        if (!string.Equals(oldName, connection.Name, StringComparison.Ordinal))
        {
            foreach (var job in (await jobs.ListAsync(tenant, client, cancellationToken))
                .Where(job => job.Delivery == DataExportOptions.ApiDelivery && job.Target == oldName))
            {
                job.Target = connection.Name;
                job.UpdatedAt = utcNow;
                job.UpdatedBy = currentUser?.UserName;
                await jobs.UpdateAsync(job.Id, job, cancellationToken);
            }
        }

        await eventLogger.LogAsync(ConnectionEntityType, connection.Id, connection.Name, EventAction.Updated, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "API connection updated", connection.Name, connection.Type, DataExportOptions.ResultSuccess, null, null, cancellationToken);

        return Results.Ok(DataExportConnectionResponse.From(connection, DataExportTime.Zone(timeZone), DateTime.UtcNow));
    }

    /// <summary>Removes the connection and its masked secret. Export jobs that use it keep its name as target until edited.</summary>
    private static async Task<IResult> DeleteConnectionAsync(
        string connectionId,
        IDataExportConnectionRepository connections,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var connection = await connections.GetByConnectionIdAsync(connectionId, tenant, client, cancellationToken);
        if (connection is null)
        {
            return Results.NotFound();
        }

        var utcNow = DateTime.UtcNow;
        connection.IsDeleted = true;
        connection.DeletedAt = utcNow;
        connection.SecretMask = null;
        connection.UpdatedAt = utcNow;
        connection.UpdatedBy = currentUser?.UserName;
        if (!await connections.UpdateAsync(connection.Id, connection, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ConnectionEntityType, connection.Id, connection.Name, EventAction.Deleted, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "API connection removed", connection.Name, connection.Type, DataExportOptions.ResultSuccess, null, null, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Calls the base URL over HTTPS (no credentials sent), reads its certificate and records the result.</summary>
    private static async Task<IResult> TestConnectionAsync(
        string connectionId,
        IDataExportConnectionRepository connections,
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        HttpContext httpContext,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var connection = await connections.GetByConnectionIdAsync(connectionId, tenant, client, cancellationToken);
        if (connection is null)
        {
            return Results.NotFound();
        }

        var check = await RecordTestAsync(connection, cancellationToken);
        connection.UpdatedAt = DateTime.UtcNow;
        connection.UpdatedBy = currentUser?.UserName;
        await connections.UpdateAsync(connection.Id, connection, cancellationToken);
        await LogAccessAsync(logs, sequenceGenerator, httpContext, currentUser, tenant, client,
            "Connection test", connection.Name, connection.Name, check.Reachable ? DataExportOptions.ResultSuccess : DataExportOptions.ResultFailed,
            null, null, cancellationToken);

        return Results.Ok(DataExportConnectionResponse.From(connection, DataExportTime.Zone(timeZone), DateTime.UtcNow));
    }

    // ----- Access logs and export -----

    private static async Task<IResult> GetAccessLogsAsync(
        IDataExportAccessLogRepository logs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? search = null,
        string? result = null,
        string? resource = null,
        int? days = null,
        int page = 1,
        int pageSize = DataExportOptions.DefaultLogPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Result", result, DataExportOptions.LogResults);
        if (days is < 1 or > 366)
        {
            errors["Days"] = ["Days must be between 1 and 366"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > DataExportOptions.MaxLogPageSize ? DataExportOptions.DefaultLogPageSize : pageSize;
        var zone = DataExportTime.Zone(timeZone);
        var (items, total) = await logs.QueryAsync(new DataExportAccessLogQuery(
            tenant, client, search, DataExportOptions.LogResults.Normalize(result), resource,
            days is null ? null : DateTime.UtcNow.AddDays(-days.Value), page, pageSize), cancellationToken);

        return Results.Ok(new DataExportAccessLogPageResponse(items.Select(log => DataExportAccessLogResponse.From(log, zone)).ToList(), total, page, pageSize));
    }

    /// <summary>Export: section=access-logs (default, with the Access Logs filters), jobs or runs, as csv (default) or xlsx.</summary>
    private static async Task<IResult> ExportAsync(
        IDataExportAccessLogRepository logs,
        IDataExportJobRepository jobs,
        IDataExportRunRepository runs,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? section = null,
        string? format = null,
        string? search = null,
        string? result = null,
        string? resource = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Section", section, DataExportOptions.ExportSections);
        CheckOption(errors, "Format", format, DataExportOptions.ExportFormats);
        CheckOption(errors, "Result", result, DataExportOptions.LogResults);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = DataExportTime.Zone(timeZone);
        var kind = DataExportOptions.ExportSections.Normalize(section) ?? "access-logs";
        var xlsx = DataExportOptions.ExportFormats.Normalize(format) == "xlsx";
        string[] header;
        List<object?[]> rows;
        string title;

        switch (kind)
        {
            case "jobs":
                title = "Export Jobs";
                header = ["Export ID", "Name", "Dataset", "Module", "Format", "Delivery", "Target", "Frequency", "Time", "Status", "Last Run", "Next Run", "Last Rows", "Last Size (bytes)", "Owner", "Last Error"];
                rows = (await jobs.ListAsync(tenant, client, cancellationToken)).Select(job => (object?[])
                [
                    job.JobId, job.Name, DataExportDatasetCatalog.Find(job.DatasetId)?.Name ?? job.DatasetId, job.Module, job.Format, job.Delivery, job.Target,
                    job.Frequency, job.Time, job.Status, Local(job.LastRunAt, zone), Local(job.NextRunAt, zone), job.LastRowCount, job.LastSizeBytes,
                    job.OwnerName ?? job.CreatedBy, job.LastError
                ]).ToList();
                break;
            case "runs":
                title = "Export Runs";
                header = ["Run ID", "Export ID", "Export", "Dataset", "Format", "Status", "Started", "Duration (ms)", "Rows", "Size (bytes)", "File", "Delivery", "Delivery Status", "Error", "Triggered By"];
                rows = (await runs.ListAsync(tenant, client, null, null, 0, cancellationToken)).Select(run => (object?[])
                [
                    run.RunId, run.JobId, run.JobName, run.DatasetId, run.Format, run.Status, Local(run.StartedAt, zone), run.DurationMs, run.RowCount, run.SizeBytes,
                    run.FileName, $"{run.Delivery} → {run.Target}", run.DeliveryMessage ?? run.DeliveryStatus, run.Error, run.TriggeredBy
                ]).ToList();
                break;
            default:
                title = "Access Logs";
                header = [$"Time ({zone.Id})", "Actor", "Action", "Resource", "Client / destination", "IP address", "Result"];
                rows = (await logs.QueryAsync(new DataExportAccessLogQuery(tenant, client, search, DataExportOptions.LogResults.Normalize(result), resource, null, 1, 0), cancellationToken))
                    .Items.Select(log => (object?[]) [Local(log.At, zone), log.Actor, log.Action, log.Resource, log.Client, log.Ip, log.Result]).ToList();
                break;
        }

        var stamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var name = $"data-export-{kind}-{stamp}";
        return xlsx
            ? Results.File(DataExportFileWriter.Xlsx(title, header, rows), DataExportFileWriter.XlsxContentType, $"{name}.xlsx")
            : Results.File(
                DataExportFileWriter.Csv(header, rows.Select(row => row.Select(value => DataExportFileWriter.Cell(value is DateTime date ? DateTime.SpecifyKind(date, DateTimeKind.Unspecified) : value, TimeZoneInfo.Utc)).ToArray())),
                DataExportFileWriter.CsvContentType,
                $"{name}.csv");
    }

    // ----- Helpers -----

    private sealed class DataExportRunException(string message) : Exception(message);

    private static async Task<List<DataExportDatasetResponse>> DatasetsAsync(
        IDataExportDataRepository data,
        IReadOnlyList<DataExportJob> jobs,
        string? tenant,
        string? client,
        TimeZoneInfo zone,
        CancellationToken cancellationToken)
    {
        var list = new List<DataExportDatasetResponse>();
        foreach (var dataset in DataExportDatasetCatalog.Datasets)
        {
            var stats = await data.GetStatsAsync(dataset, tenant, client, cancellationToken);
            list.Add(DataExportDatasetResponse.From(dataset, stats, jobs.Count(job => job.DatasetId == dataset.Id), zone));
        }

        return list;
    }

    private static async Task<Dictionary<string, string[]>> ValidateJobAsync(
        SaveDataExportJobRequest request,
        IDataExportJobRepository jobs,
        IDataExportConnectionRepository connections,
        string? tenant,
        string? client,
        string? exceptId,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate();
        if (!errors.ContainsKey("Name") && await jobs.NameExistsAsync(request.Name!, tenant, client, exceptId, cancellationToken))
        {
            errors["Name"] = ["An export with this name already exists"];
        }

        if (!errors.ContainsKey("Target") && DataExportOptions.Deliveries.Normalize(request.Delivery) == DataExportOptions.ApiDelivery
            && !(await connections.ListAsync(tenant, client, cancellationToken)).Any(connection => string.Equals(connection.Name, request.Target?.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            errors["Target"] = [$"'{request.Target}' is not an API connection; add it under API Connections first"];
        }

        return errors;
    }

    private static void Apply(DataExportJob job, SaveDataExportJobRequest request, CurrentUser? currentUser, DateTime utcNow)
    {
        var dataset = DataExportDatasetCatalog.Find(request.DatasetId)!;
        var frequency = DataExportOptions.Frequencies.Normalize(request.Frequency)!;
        var delivery = DataExportOptions.Deliveries.Normalize(request.Delivery)!;

        job.Name = request.Name!.Trim();
        job.DatasetId = dataset.Id;
        job.Module = dataset.Modules[0];
        job.Format = DataExportOptions.Formats.Normalize(request.Format)!;
        job.Delivery = delivery;
        job.Target = request.Target!.Trim();

        job.Frequency = frequency;
        job.Time = frequency switch
        {
            DataExportOptions.RealTimeFrequency => "Continuous",
            DataExportOptions.OnDemandFrequency => "Manual",
            _ => request.Time!.Trim()
        };
        job.TimeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? DataExportOptions.DefaultTimeZone : request.TimeZone.Trim();
        // Field names in the dataset's spelling, each once.
        job.Fields = request.Fields!.Select(name => dataset.Field(name)!.Name).Distinct().ToList();
        job.Filters = (request.Filters ?? []).Select(filter => new DataExportFilter
        {
            Field = dataset.Field(filter.Field)!.Name,
            Operator = filter.Operator!.Trim(),
            Value = filter.Value!.Trim()
        }).ToList();
        job.Encrypted = request.Encrypted ?? true;
        job.UpdatedAt = utcNow;
        job.UpdatedBy = currentUser?.UserName;
    }

    private static void ApplyConnection(DataExportConnection connection, SaveDataExportConnectionRequest request, CurrentUser? currentUser, DateTime utcNow)
    {
        connection.Name = request.Name!.Trim();
        connection.Type = DataExportOptions.ConnectionTypes.Normalize(request.Type)!;
        connection.BaseUrl = NormalizeUrl(request.BaseUrl!);
        connection.Auth = DataExportOptions.AuthMethods.Normalize(request.Auth)!;
        connection.AuthClientId = string.IsNullOrWhiteSpace(request.AuthClientId) ? null : request.AuthClientId.Trim();
        if (!string.IsNullOrEmpty(request.Secret))
        {
            // The plaintext secret is never stored; only a mask showing its last characters (for long secrets) is kept.
            connection.SecretMask = Mask(request.Secret);
            connection.SecretSetAt = utcNow;
        }

        connection.UpdatedAt = utcNow;
        connection.UpdatedBy = currentUser?.UserName;
    }

    private static async Task<DataExportConnectionCheck> RecordTestAsync(DataExportConnection connection, CancellationToken cancellationToken)
    {
        var check = await DataExportConnectionTester.CheckAsync(connection.BaseUrl, cancellationToken);
        var utcNow = DateTime.UtcNow;
        connection.Status = DataExportConnectionTester.StatusOf(check, utcNow);
        connection.LastTestedAt = utcNow;
        connection.LastTestMessage = check.Message;
        connection.CertificateExpiresAt = check.CertificateExpiresAt ?? connection.CertificateExpiresAt;
        connection.Tests = new[]
            {
                new DataExportConnectionTest { At = utcNow, Ok = check.Reachable, HttpStatus = check.HttpStatus, LatencyMs = check.LatencyMs, Message = check.Message }
            }
            .Concat(connection.Tests)
            .Take(DataExportOptions.MaxConnectionTests)
            .ToList();
        return check;
    }

    private static async Task LogAccessAsync(
        IDataExportAccessLogRepository logs,
        ISequenceGenerator sequenceGenerator,
        HttpContext httpContext,
        CurrentUser? currentUser,
        string? tenant,
        string? client,
        string action,
        string resource,
        string clientName,
        string result,
        string? jobId,
        string? runId,
        CancellationToken cancellationToken)
    {
        var utcNow = DateTime.UtcNow;
        await logs.CreateAsync(new DataExportAccessLog
        {
            LogId = $"LOG-{await sequenceGenerator.GetNextValueAsync(LogSequence, cancellationToken):D6}",
            At = utcNow,
            Actor = currentUser?.UserName ?? "Anonymous",
            Action = action,
            Resource = resource,
            Client = clientName,
            Ip = ClientIp(httpContext),
            Result = result,
            Status = result,
            JobId = jobId,
            RunId = runId,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            TenantId = tenant,
            ClientId = client,
            IsDeleted = false
        }, cancellationToken);
    }

    /// <summary>The caller's address: the first X-Forwarded-For hop (set by the gateway) or the socket address.</summary>
    private static string? ClientIp(HttpContext httpContext)
    {
        var forwarded = httpContext.Request.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(forwarded))
        {
            var first = forwarded.Split(',')[0].Trim();
            if (System.Net.IPAddress.TryParse(first, out var parsed))
            {
                return parsed.ToString();
            }
        }

        var remote = httpContext.Connection.RemoteIpAddress;
        return remote is null ? null : (remote.IsIPv4MappedToIPv6 ? remote.MapToIPv4() : remote).ToString();
    }

    private static string Mask(string secret) => secret.Length >= 12 ? $"••••••••{secret[^4..]}" : "••••••••";

    private static string NormalizeUrl(string url) => url.Trim().TrimEnd('/');

    private static (List<DataExportDatasetField>? Fields, IResult? Problem) SelectFields(
        DataExportDataset dataset, string? fields, int rows, int maxRows, string? timeZone)
    {
        var errors = new Dictionary<string, string[]>();
        if (rows < 1 || rows > maxRows)
        {
            errors["Rows"] = [$"Rows must be between 1 and {maxRows}"];
        }

        if (!string.IsNullOrWhiteSpace(timeZone) && !ReportPeriods.TryGetTimeZone(timeZone, out _))
        {
            errors["TimeZone"] = [$"Unknown time zone '{timeZone}'"];
        }

        var selected = dataset.Fields.ToList();
        if (!string.IsNullOrWhiteSpace(fields))
        {
            var names = fields.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            if (names.FirstOrDefault(name => dataset.Field(name) is null) is { } unknown)
            {
                errors["Fields"] = [$"'{unknown}' is not a field of {dataset.Name}"];
            }
            else
            {
                selected = names.Select(name => dataset.Field(name)!).Distinct().ToList();
            }
        }

        return errors.Count > 0 ? (null, Results.ValidationProblem(errors)) : (selected, null);
    }

    private static IResult? ZoneError(string? timeZone) =>
        !string.IsNullOrWhiteSpace(timeZone) && !ReportPeriods.TryGetTimeZone(timeZone, out _)
            ? Results.ValidationProblem(new Dictionary<string, string[]> { ["TimeZone"] = [$"Unknown time zone '{timeZone}'"] })
            : null;

    private static IResult Conflict(string key, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] }, statusCode: StatusCodes.Status409Conflict);

    private static DateTime? Local(DateTime? utc, TimeZoneInfo zone) =>
        utc is null ? null : DateTime.SpecifyKind(TimeZoneInfo.ConvertTimeFromUtc(DataExportTime.Utc(utc.Value), zone), DateTimeKind.Unspecified);

    private static List<string> Distinct(IEnumerable<string?> values) =>
        values.Where(value => !string.IsNullOrWhiteSpace(value)).Select(value => value!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).ToList();

    private static string Slug(string value)
    {
        var slug = new string(value.ToLowerInvariant().Select(character => char.IsAsciiLetterOrDigit(character) ? character : '-').ToArray());
        while (slug.Contains("--"))
        {
            slug = slug.Replace("--", "-");
        }

        slug = slug.Trim('-');
        return slug.Length == 0 ? "export" : slug;
    }

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }

    private static (string? Tenant, string? Client) Scope(string? tenantId, string? clientId, CurrentUser? currentUser) =>
        (string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId.Trim(), string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId.Trim());
}
