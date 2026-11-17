using System.Globalization;
using MongoDB.Bson;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>
/// Reports &amp; Analytics / Generated Reports: reports built from a template over one Data Export dataset. Creating or regenerating a
/// report reads the dataset's live collection for the time range and keeps a snapshot of the rows (at most MaxRows) with the report.
/// Recurrence and recipients are stored with the report; no scheduler or e-mail delivery runs them.
/// </summary>
public static class GeneratedReportEndpoints
{
    internal const string EntityType = "GeneratedReport";
    private const string BasePath = "/api/generated-reports";
    private const string Sequence = "generated_report";

    public static RouteGroupBuilder MapGeneratedReportEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Generated Reports");

        group.MapGet("/templates", GetTemplates).WithName("GetGeneratedReportTemplates");
        group.MapGet(string.Empty, GetReportsAsync).WithName("GetGeneratedReports");
        group.MapGet("/{reportId}", GetReportAsync).WithName("GetGeneratedReport");
        group.MapPost(string.Empty, CreateReportAsync).WithName("CreateGeneratedReport");
        group.MapPost("/{reportId}/regenerate", RegenerateReportAsync).WithName("RegenerateGeneratedReport");
        group.MapDelete("/{reportId}", DeleteReportAsync).WithName("DeleteGeneratedReport");

        return group;
    }

    /// <summary>Modules and their templates (dataset, columns, whether they can be generated), plus the form's choices.</summary>
    private static IResult GetTemplates() => Results.Ok(new GeneratedReportTemplatesResponse(
        GeneratedReportTemplateCatalog.Modules
            .Select(module => new GeneratedReportModuleResponse(module.Id, module.Name, module.Templates.Select(GeneratedReportTemplateResponse.From).ToList()))
            .ToList(),
        GeneratedReportOptions.TimeRanges.Select(range => new GeneratedReportTimeRangeResponse(range.Value, range.Label)).ToList(),
        GeneratedReportOptions.Recurrences.All,
        GeneratedReportOptions.Formats.All,
        GeneratedReportOptions.Weekdays.All,
        GeneratedReportOptions.MaxRows));

    /// <summary>Reports without their rows, newest first. recurrence = Once | Daily | Weekly | Monthly.</summary>
    private static async Task<IResult> GetReportsAsync(
        IGeneratedReportRepository reports,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null,
        string? recurrence = null)
    {
        var errors = new Dictionary<string, string[]>();
        if (!string.IsNullOrWhiteSpace(recurrence) && !GeneratedReportOptions.Recurrences.IsValid(recurrence))
        {
            errors["Recurrence"] = [$"Recurrence must be one of: {string.Join(", ", GeneratedReportOptions.Recurrences.All)}"];
        }

        AddZoneError(errors, timeZone);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var zone = Zone(timeZone);
        var list = await reports.ListAsync(tenant, client, GeneratedReportOptions.Recurrences.Normalize(recurrence), cancellationToken);
        return Results.Ok(list.Select(report => GeneratedReportSummaryResponse.From(report, zone)).ToList());
    }

    private static async Task<IResult> GetReportAsync(
        string reportId,
        IGeneratedReportRepository reports,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null,
        string? timeZone = null)
    {
        var errors = new Dictionary<string, string[]>();
        AddZoneError(errors, timeZone);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (tenant, client) = Scope(tenantId, clientId, currentUserAccessor.GetCurrentUser());
        var report = await reports.GetByReportIdAsync(reportId, tenant, client, cancellationToken);
        return report is null ? Results.NotFound() : Results.Ok(GeneratedReportResponse.From(report, Zone(timeZone ?? report.TimeZone)));
    }

    /// <summary>Validates the form, reads the template's rows for the time range and stores the report (Completed, or Failed when the read fails).</summary>
    private static async Task<IResult> CreateReportAsync(
        CreateGeneratedReportRequest request,
        IGeneratedReportRepository reports,
        IDataExportDataRepository data,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(request.TenantId, request.ClientId, currentUser);
        var template = GeneratedReportTemplateCatalog.Find(request.Template)!;
        var recurrence = GeneratedReportOptions.Recurrences.Normalize(request.Recurrence)!;
        var once = recurrence == GeneratedReportOptions.OnceRecurrence;
        var utcNow = DateTime.UtcNow;

        var report = new GeneratedReport
        {
            ReportId = $"GRP-{await sequenceGenerator.GetNextValueAsync(Sequence, cancellationToken):D4}",
            Name = request.Name!.Trim(),
            Module = template.Module,
            TemplateId = template.Id,
            Template = template.Name,
            DatasetId = template.DatasetId!,
            DateField = template.DateField,
            TimeRange = GeneratedReportOptions.TimeRange(request.TimeRange)!.Value,
            Recurrence = recurrence,
            ScheduleTime = once ? null : request.ScheduleTime?.Trim(),
            ScheduleDay = recurrence == GeneratedReportOptions.WeeklyRecurrence ? GeneratedReportOptions.Weekdays.Normalize(request.ScheduleDay) : null,
            ScheduleDate = recurrence == GeneratedReportOptions.MonthlyRecurrence ? request.ScheduleDate?.Trim() : null,
            TimeZone = Zone(request.TimeZone).Id,
            Format = GeneratedReportOptions.Formats.Normalize(request.Format)!,
            ShareWith = (request.ShareWith ?? [])
                .Where(email => !string.IsNullOrWhiteSpace(email))
                .Select(email => email.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            ExpireOn = string.IsNullOrWhiteSpace(request.ExpireOn)
                ? null
                : DateOnly.ParseExact(request.ExpireOn.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            TenantId = tenant,
            ClientId = client,
            IsDeleted = false
        };

        await GenerateAsync(report, template, data, loggerFactory, utcNow, cancellationToken);

        report = await reports.CreateAsync(report, cancellationToken);
        await eventLogger.LogAsync(EntityType, report.Id, report.Name, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/{report.ReportId}", GeneratedReportResponse.From(report, Zone(report.TimeZone)));
    }

    /// <summary>Reads the rows again for the same time range ending now and replaces the snapshot.</summary>
    private static async Task<IResult> RegenerateReportAsync(
        string reportId,
        IGeneratedReportRepository reports,
        IDataExportDataRepository data,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var report = await reports.GetByReportIdAsync(reportId, tenant, client, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        var template = GeneratedReportTemplateCatalog.Find(report.TemplateId);
        if (template is null || !template.Available)
        {
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { ["Template"] = [$"The template {report.Template} is no longer available"] },
                statusCode: StatusCodes.Status409Conflict);
        }

        var utcNow = DateTime.UtcNow;
        report.DatasetId = template.DatasetId!;
        report.DateField = template.DateField;
        report.UpdatedAt = utcNow;
        report.UpdatedBy = currentUser?.UserName;
        await GenerateAsync(report, template, data, loggerFactory, utcNow, cancellationToken);

        if (!await reports.UpdateAsync(report.Id, report, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.Name, EventAction.Updated, cancellationToken);
        return Results.Ok(GeneratedReportResponse.From(report, Zone(report.TimeZone)));
    }

    private static async Task<IResult> DeleteReportAsync(
        string reportId,
        IGeneratedReportRepository reports,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (tenant, client) = Scope(tenantId, clientId, currentUser);
        var report = await reports.GetByReportIdAsync(reportId, tenant, client, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        var utcNow = DateTime.UtcNow;
        report.IsDeleted = true;
        report.DeletedAt = utcNow;
        report.UpdatedAt = utcNow;
        report.UpdatedBy = currentUser?.UserName;
        if (!await reports.UpdateAsync(report.Id, report, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.Name, EventAction.Deleted, cancellationToken);
        return Results.NoContent();
    }

    /// <summary>Fills headers, rows, range and status of the report from the template's dataset, scoped to the report's tenant / client.</summary>
    private static async Task GenerateAsync(
        GeneratedReport report,
        GeneratedReportTemplate template,
        IDataExportDataRepository data,
        ILoggerFactory loggerFactory,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var range = GeneratedReportOptions.TimeRange(report.TimeRange)
            ?? GeneratedReportOptions.TimeRange(GeneratedReportOptions.AllTimeRange)!;

        report.GeneratedAt = utcNow;
        report.Headers = template.Columns.ToList();
        report.RangeFrom = template.DateField is not null && range.Length is { } length ? utcNow - length : null;
        report.RangeTo = report.RangeFrom is null ? null : utcNow;

        try
        {
            var dataset = template.Dataset
                ?? throw new InvalidOperationException($"Dataset {template.DatasetId} of template {template.Id} is not in the catalog");
            var fields = template.Columns
                .Select(column => dataset.Field(column)
                    ?? throw new InvalidOperationException($"Column {column} of template {template.Id} is not a field of {dataset.Id}"))
                .ToList();

            var filters = new List<BsonDocument>();
            if (report.RangeFrom is not null && dataset.Field(template.DateField) is { } dateField)
            {
                filters.Add(GeneratedReportTemplateCatalog.RangeFilter(dateField, report.RangeFrom.Value, utcNow));
            }

            var result = await data.ReadAsync(dataset, fields, filters, report.TenantId, report.ClientId, GeneratedReportOptions.MaxRows, cancellationToken);
            report.Rows = result.Rows.Select(row => new BsonArray(row.Select(ToBson))).ToList();
            report.RowCount = report.Rows.Count;
            report.Truncated = result.Truncated;
            report.Status = GeneratedReportOptions.CompletedStatus;
            report.Error = null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            loggerFactory.CreateLogger(typeof(GeneratedReportEndpoints))
                .LogError(exception, "Generated report {ReportId} ({TemplateId}) could not be generated", report.ReportId, template.Id);
            report.Rows = [];
            report.RowCount = 0;
            report.Truncated = false;
            report.Status = GeneratedReportOptions.FailedStatus;
            report.Error = "The report data could not be read. Try again later.";
        }
    }

    private static BsonValue ToBson(object? value) => value switch
    {
        null => BsonNull.Value,
        DateTime date => new BsonDateTime(DataExportTime.Utc(date)),
        double number => new BsonDouble(number),
        string text => new BsonString(text),
        _ => new BsonString(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty)
    };

    private static void AddZoneError(Dictionary<string, string[]> errors, string? timeZone)
    {
        if (!string.IsNullOrWhiteSpace(timeZone) && !ReportPeriods.TryGetTimeZone(timeZone, out _))
        {
            errors["TimeZone"] = [$"Unknown time zone '{timeZone}'"];
        }
    }

    private static TimeZoneInfo Zone(string? timeZone) =>
        ReportPeriods.TryGetTimeZone(string.IsNullOrWhiteSpace(timeZone) ? GeneratedReportOptions.DefaultTimeZone : timeZone, out var zone) ? zone : TimeZoneInfo.Utc;

    private static (string? Tenant, string? Client) Scope(string? tenantId, string? clientId, CurrentUser? currentUser) =>
        (string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId.Trim(), string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId.Trim());
}
