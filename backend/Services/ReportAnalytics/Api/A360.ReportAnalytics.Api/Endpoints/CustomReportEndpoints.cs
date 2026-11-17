using System.Text.Json;
using ClosedXML.Excel;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.ReportAnalytics.Repository.Reporting;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>Reports &amp; Analytics / Custom Reports: the library, Report Configuration and the report actions.</summary>
public static class CustomReportEndpoints
{
    internal const string EntityType = "CustomReport";
    private const string SequenceName = "custom_report";
    private const long MaxImportFileBytes = 1024 * 1024;
    private const int MaxImportTemplates = 50;

    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public static RouteGroupBuilder MapCustomReportEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/custom-reports").WithTags("Custom Reports");

        // Page furniture: summary cards and library filters.
        group.MapGet("/summary", GetSummaryAsync).WithName("GetCustomReportSummary");
        group.MapGet("/owners", GetOwnersAsync).WithName("GetCustomReportOwners");
        group.MapGet("/options", GetOptions).WithName("GetCustomReportOptions");

        // Custom Report Library, Export Reports and Import Template.
        group.MapGet("", GetReportsAsync).WithName("GetCustomReports");
        group.MapGet("/export", ExportReportsAsync).WithName("ExportCustomReports");
        group.MapPost("/import", ImportTemplatesAsync).WithName("ImportCustomReportTemplates").DisableAntiforgery();

        // Create Custom Report / Save Draft / Save Report.
        group.MapGet("/{reportId}", GetReportByIdAsync).WithName("GetCustomReportById");
        group.MapPost("", CreateReportAsync).WithName("CreateCustomReport");
        group.MapPut("/{reportId}", UpdateReportAsync).WithName("UpdateCustomReport");
        group.MapDelete("/{reportId}", DeleteReportAsync).WithName("DeleteCustomReport");

        // Library card actions.
        group.MapPost("/{reportId}/publish", PublishReportAsync).WithName("PublishCustomReport");
        group.MapPost("/{reportId}/unpublish", UnpublishReportAsync).WithName("UnpublishCustomReport");
        group.MapPost("/{reportId}/duplicate", DuplicateReportAsync).WithName("DuplicateCustomReport");
        group.MapPut("/{reportId}/favorite", SetFavoriteAsync).WithName("SetCustomReportFavorite");

        return group;
    }

    /// <summary>
    /// The library. owner is an ownerId from /owners; lastUpdated is Any time, Today, Last 7 days, Last 30 days or Last 90 days
    /// (days in timeZone); sortBy is updatedAt (default, newest first), reportName, module, owner or status.
    /// </summary>
    private static async Task<IResult> GetReportsAsync(
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? search = null,
        string? owner = null,
        string? module = null,
        string? status = null,
        string? lastUpdated = null,
        string? timeZone = null,
        bool favoritesOnly = false,
        string? tenantId = null,
        string? clientId = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = CustomReportRepository.DefaultPageSize)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (query, problem) = BuildQuery(currentUser, search, owner, module, status, lastUpdated, timeZone, favoritesOnly, tenantId, clientId, sortBy, sortDirection, page, pageSize);
        if (problem is not null)
        {
            return problem;
        }

        var result = await repository.QueryAsync(query!, cancellationToken);
        var viewerId = CustomReportAccess.ViewerId(currentUser);

        return Results.Ok(new CustomReportListResponse(
            result.Items.Select(report => CustomReportListItemResponse.FromEntity(report, viewerId)).ToList(),
            result.TotalCount,
            query!.Page,
            query.PageSize));
    }

    /// <summary>Custom Reports, Published, Scheduled and Drafts among the reports the user can see.</summary>
    private static async Task<IResult> GetSummaryAsync(
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var counts = await repository.CountByStatusAsync(Scope(currentUserAccessor.GetCurrentUser(), tenantId, clientId), cancellationToken);
        long Count(string status) => counts.GetValueOrDefault(status);

        return Results.Ok(new CustomReportSummaryResponse(
            counts.Values.Sum(),
            Count(CustomReportOptions.PublishedStatus),
            Count(CustomReportOptions.ScheduledStatus),
            Count(CustomReportOptions.DraftStatus)));
    }

    /// <summary>The Owner filter: everyone who owns a report the user can see.</summary>
    private static async Task<IResult> GetOwnersAsync(
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        return Results.Ok(await repository.GetOwnersAsync(Scope(currentUserAccessor.GetCurrentUser(), tenantId, clientId), cancellationToken));
    }

    private static IResult GetOptions() => Results.Ok(new CustomReportOptionsResponse(
        CustomReportOptions.Modules.All,
        CustomReportOptions.Statuses.All,
        CustomReportOptions.Visibilities.All,
        CustomReportOptions.LastUpdated.All,
        CustomReportOptions.BuilderSteps,
        CustomReportOptions.ChartTypes.All,
        CustomReportOptions.DefaultViews.All,
        ReportAggregations.All,
        new Dictionary<string, IReadOnlyList<string>>
        {
            [ReportFieldTypes.String] = ReportFilterOperators.ForType(ReportFieldTypes.String),
            [ReportFieldTypes.Number] = ReportFilterOperators.ForType(ReportFieldTypes.Number),
            [ReportFieldTypes.Currency] = ReportFilterOperators.ForType(ReportFieldTypes.Currency),
            [ReportFieldTypes.Date] = ReportFilterOperators.ForType(ReportFieldTypes.Date)
        },
        CustomReportOptions.FilterLogic.All,
        ReportCalculationOperators.All,
        CustomReportOptions.CalculatedDataTypes.All,
        CustomReportOptions.ScheduleFrequencies.All,
        CustomReportOptions.DaysOfWeek.All,
        CustomReportRepository.SortFields.Keys.ToList(),
        CustomReportOptions.ExportFormats.All,
        CustomReportOptions.LibraryExportFormats.All,
        CustomReportOptions.MaxRowLimit));

    /// <summary>
    /// Export Reports. json downloads the report definitions as templates (re-importable with Import Template);
    /// xlsx downloads the library list. reportIds (comma separated) picks reports, otherwise the library filters apply.
    /// </summary>
    private static async Task<IResult> ExportReportsAsync(
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? format = null,
        string? reportIds = null,
        string? search = null,
        string? owner = null,
        string? module = null,
        string? status = null,
        string? lastUpdated = null,
        string? timeZone = null,
        bool favoritesOnly = false,
        string? tenantId = null,
        string? clientId = null,
        string? sortBy = null,
        string? sortDirection = null)
    {
        var exportFormat = string.IsNullOrWhiteSpace(format) ? "json" : CustomReportOptions.LibraryExportFormats.Normalize(format);
        if (exportFormat is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", CustomReportOptions.LibraryExportFormats.All)}"]
            });
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyCollection<CustomReport> reports;

        var ids = (reportIds ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToList();
        if (ids.Count > 0)
        {
            reports = (await repository.GetByReportIdsAsync(ids, cancellationToken))
                .Where(report => CustomReportAccess.CanView(report, viewerId))
                .OrderBy(report => ids.IndexOf(report.ReportId))
                .ToList();
        }
        else
        {
            var (query, problem) = BuildQuery(currentUser, search, owner, module, status, lastUpdated, timeZone, favoritesOnly, tenantId, clientId, sortBy, sortDirection, 1, 0);
            if (problem is not null)
            {
                return problem;
            }

            reports = (await repository.QueryAsync(query!, cancellationToken)).Items;
        }

        var fileName = $"custom-reports-{DateTime.UtcNow:yyyyMMddHHmmss}";

        if (exportFormat == "json")
        {
            var templates = reports.Select(CustomReportTemplate.FromEntity).ToList();
            return Results.File(JsonSerializer.SerializeToUtf8Bytes(templates, TemplateJson), "application/json", $"{fileName}.json");
        }

        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Custom Reports");
        string[] headers = ["Report ID", "Report Name", "Description", "Owner", "Module", "Status", "Visibility", "Data Sources", "Fields", "Chart", "Schedule", "Next Run (UTC)", "Updated (UTC)"];
        for (var index = 0; index < headers.Length; index++)
        {
            sheet.Cell(1, index + 1).Value = headers[index];
        }

        sheet.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var report in reports)
        {
            sheet.Cell(row, 1).Value = report.ReportId;
            sheet.Cell(row, 2).Value = report.ReportName;
            sheet.Cell(row, 3).Value = report.Description;
            sheet.Cell(row, 4).Value = report.OwnerName;
            sheet.Cell(row, 5).Value = report.Module;
            sheet.Cell(row, 6).Value = report.Status;
            sheet.Cell(row, 7).Value = report.Visibility;
            sheet.Cell(row, 8).Value = string.Join(", ", report.Definition.DataSources);
            sheet.Cell(row, 9).Value = report.Definition.SelectedFields.Count;
            sheet.Cell(row, 10).Value = report.Definition.Visualization.ChartType;
            sheet.Cell(row, 11).Value = ReportSchedules.Describe(report.Schedule);
            sheet.Cell(row, 12).Value = report.Schedule?.NextRunAt;
            sheet.Cell(row, 13).Value = report.UpdatedAt;
            row++;
        }

        sheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{fileName}.xlsx");
    }

    /// <summary>Import Template: a .json file holding one template or an array of them (as produced by Export Reports). Each becomes a Draft owned by the importer.</summary>
    private static async Task<IResult> ImportTemplatesAsync(
        IFormFile? file,
        ICustomReportRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return FileProblem("Upload a .json template file");
        }

        if (file.Length > MaxImportFileBytes)
        {
            return FileProblem("The template file must be 1 MB or smaller");
        }

        List<CustomReportTemplate?> templates;
        try
        {
            await using var stream = file.OpenReadStream();
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            templates = document.RootElement.ValueKind == JsonValueKind.Array
                ? document.RootElement.EnumerateArray().Select(element => element.Deserialize<CustomReportTemplate>(TemplateJson)).ToList()
                : [document.RootElement.Deserialize<CustomReportTemplate>(TemplateJson)];
        }
        catch (JsonException exception)
        {
            return FileProblem($"The file is not a valid report template: {exception.Message}");
        }

        if (templates.Count == 0 || templates.Count > MaxImportTemplates)
        {
            return FileProblem($"The file must hold between 1 and {MaxImportTemplates} templates");
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var created = new List<CustomReportListItemResponse>();
        var failed = new List<CustomReportImportFailure>();

        for (var index = 0; index < templates.Count; index++)
        {
            if (templates[index] is not { } template)
            {
                failed.Add(new CustomReportImportFailure(index, null, new Dictionary<string, string[]> { ["Template"] = ["Template is empty"] }));
                continue;
            }

            var request = template.ToCreateRequest();
            var (report, errors) = await CreateAsync(request, repository, sequenceGenerator, currentUser, eventLogger, cancellationToken);
            if (report is null)
            {
                failed.Add(new CustomReportImportFailure(index, template.ReportName, errors!));
                continue;
            }

            created.Add(CustomReportListItemResponse.FromEntity(report, viewerId));
        }

        return Results.Ok(new CustomReportImportResponse(created, failed));
    }

    private static async Task<IResult> GetReportByIdAsync(
        string reportId,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var viewerId = CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser());
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null || !CustomReportAccess.CanView(report, viewerId))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Viewed, cancellationToken);

        return Results.Ok(CustomReportResponse.FromEntity(report, viewerId));
    }

    /// <summary>Create Custom Report / Save Draft: only the name is required; the builder steps may be partly filled.</summary>
    private static async Task<IResult> CreateReportAsync(
        CreateCustomReportRequest request,
        ICustomReportRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (report, errors) = await CreateAsync(request, repository, sequenceGenerator, currentUser, eventLogger, cancellationToken);
        if (report is null)
        {
            return Results.ValidationProblem(errors!);
        }

        return Results.Created(
            $"/api/custom-reports/{report.ReportId}",
            CustomReportResponse.FromEntity(report, CustomReportAccess.ViewerId(currentUser)));
    }

    /// <summary>Save Draft / Save Report. A Published or Scheduled report must stay complete; a draft may be partial.</summary>
    private static async Task<IResult> UpdateReportAsync(
        string reportId,
        UpdateCustomReportRequest request,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (report, problem) = await FindEditableAsync(reportId, repository, currentUser, cancellationToken);
        if (report is null)
        {
            return problem!;
        }

        var errors = request.Validate();
        var definition = request.Definition.ToDomain();
        definition.ValidateDefinition(errors, requireComplete: report.Status != CustomReportOptions.DraftStatus);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        request.ApplyTo(report, currentUser, DateTime.UtcNow);

        return await SaveAsync(report, repository, currentUser, eventLogger, cancellationToken);
    }

    private static async Task<IResult> DeleteReportAsync(
        string reportId,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var (report, problem) = await FindEditableAsync(reportId, repository, currentUserAccessor.GetCurrentUser(), cancellationToken);
        if (report is null)
        {
            return problem!;
        }

        if (!await repository.DeleteAsync(report.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Publish: the report must be complete. It becomes Scheduled when it has a schedule, else Published.</summary>
    private static async Task<IResult> PublishReportAsync(
        string reportId,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (report, problem) = await FindEditableAsync(reportId, repository, currentUser, cancellationToken);
        if (report is null)
        {
            return problem!;
        }

        var errors = new Dictionary<string, string[]>();
        report.Definition.ValidateDefinition(errors, requireComplete: true);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        report.Publish(currentUser, DateTime.UtcNow);

        return await SaveAsync(report, repository, currentUser, eventLogger, cancellationToken);
    }

    /// <summary>Moves a Published or Scheduled report back to Draft; its schedule is kept but stops running.</summary>
    private static async Task<IResult> UnpublishReportAsync(
        string reportId,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (report, problem) = await FindEditableAsync(reportId, repository, currentUser, cancellationToken);
        if (report is null)
        {
            return problem!;
        }

        report.Unpublish(currentUser, DateTime.UtcNow);

        return await SaveAsync(report, repository, currentUser, eventLogger, cancellationToken);
    }

    /// <summary>Copies any report the user can see into a new Draft they own ("Copy of …" unless a name is given).</summary>
    private static async Task<IResult> DuplicateReportAsync(
        string reportId,
        DuplicateCustomReportRequest? request,
        ICustomReportRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var source = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (source is null || !CustomReportAccess.CanView(source, viewerId))
        {
            return Results.NotFound();
        }

        if (request?.ReportName?.Trim().Length > 200)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["ReportName"] = ["ReportName must be 200 characters or fewer"] });
        }

        var copy = source.Duplicate(await NextReportIdAsync(sequenceGenerator, cancellationToken), request?.ReportName, currentUser, DateTime.UtcNow);
        copy = await repository.CreateAsync(copy, cancellationToken);

        await eventLogger.LogAsync(EntityType, copy.Id, copy.ReportName, EventAction.Created, cancellationToken);

        return Results.Created($"/api/custom-reports/{copy.ReportId}", CustomReportResponse.FromEntity(copy, viewerId));
    }

    /// <summary>The star on a library card; favourites are per user, so a signed-in user is required.</summary>
    private static async Task<IResult> SetFavoriteAsync(
        string reportId,
        FavoriteCustomReportRequest request,
        ICustomReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        var viewerId = CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser());
        if (viewerId is null)
        {
            return Results.Unauthorized();
        }

        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null || !CustomReportAccess.CanView(report, viewerId))
        {
            return Results.NotFound();
        }

        if (!await repository.SetFavoriteAsync(report.Id, viewerId, request.IsFavorite, cancellationToken))
        {
            return Results.NotFound();
        }

        return Results.Ok(new { report.ReportId, request.IsFavorite });
    }

    internal static CustomReportScope Scope(CurrentUser? currentUser, string? tenantId, string? clientId) =>
        new(
            CustomReportAccess.ViewerId(currentUser),
            string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId,
            string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId);

    /// <summary>The report if the user may change it; 404 when they cannot see it, 403 when it belongs to someone else.</summary>
    internal static async Task<(CustomReport? Report, IResult? Problem)> FindEditableAsync(
        string reportId,
        ICustomReportRepository repository,
        CurrentUser? currentUser,
        CancellationToken cancellationToken)
    {
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null || !CustomReportAccess.CanView(report, viewerId))
        {
            return (null, Results.NotFound());
        }

        return CustomReportAccess.CanEdit(report, viewerId)
            ? (report, null)
            : (null, Results.Problem(statusCode: StatusCodes.Status403Forbidden, title: "Only the report owner can change this report"));
    }

    private static async Task<(CustomReport? Report, Dictionary<string, string[]>? Errors)> CreateAsync(
        CreateCustomReportRequest request,
        ICustomReportRepository repository,
        ISequenceGenerator sequenceGenerator,
        CurrentUser? currentUser,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate();
        request.Definition.ToDomain().ValidateDefinition(errors, requireComplete: false);
        if (errors.Count > 0)
        {
            return (null, errors);
        }

        var report = request.ToEntity(await NextReportIdAsync(sequenceGenerator, cancellationToken), currentUser, DateTime.UtcNow);
        report = await repository.CreateAsync(report, cancellationToken);

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Created, cancellationToken);

        return (report, null);
    }

    private static async Task<string> NextReportIdAsync(ISequenceGenerator sequenceGenerator, CancellationToken cancellationToken) =>
        $"CRP-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}";

    private static async Task<IResult> SaveAsync(
        CustomReport report,
        ICustomReportRepository repository,
        CurrentUser? currentUser,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!await repository.UpdateAsync(report.Id, report, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Updated, cancellationToken);

        return Results.Ok(CustomReportResponse.FromEntity(report, CustomReportAccess.ViewerId(currentUser)));
    }

    private static (CustomReportQuery? Query, IResult? Problem) BuildQuery(
        CurrentUser? currentUser,
        string? search,
        string? owner,
        string? module,
        string? status,
        string? lastUpdated,
        string? timeZone,
        bool favoritesOnly,
        string? tenantId,
        string? clientId,
        string? sortBy,
        string? sortDirection,
        int page,
        int pageSize)
    {
        var errors = new Dictionary<string, string[]>();

        void Check(string key, string? value, OptionList options)
        {
            if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
            {
                errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
            }
        }

        Check("Module", module, CustomReportOptions.Modules);
        Check("Status", status, CustomReportOptions.Statuses);
        Check("LastUpdated", lastUpdated, CustomReportOptions.LastUpdated);

        if (!string.IsNullOrWhiteSpace(sortBy) && !CustomReportRepository.SortFields.ContainsKey(sortBy.Trim()))
        {
            errors["SortBy"] = [$"SortBy must be one of: {string.Join(", ", CustomReportRepository.SortFields.Keys)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (!ReportPeriods.TryGetTimeZone(timeZone, out var zone))
        {
            errors["TimeZone"] = [$"TimeZone '{timeZone}' is not recognised (use an id such as Asia/Dubai or UTC)"];
        }

        if (errors.Count > 0)
        {
            return (null, Results.ValidationProblem(errors));
        }

        if (pageSize != 0)
        {
            page = page < 1 ? 1 : page;
            pageSize = pageSize < 1 || pageSize > CustomReportRepository.MaxPageSize ? CustomReportRepository.DefaultPageSize : pageSize;
        }

        return (new CustomReportQuery(
            Scope(currentUser, tenantId, clientId),
            search,
            owner,
            CustomReportOptions.Modules.Normalize(module),
            CustomReportOptions.Statuses.Normalize(status),
            CustomReportOptions.UpdatedSince(lastUpdated, zone, DateTime.UtcNow),
            favoritesOnly,
            sortBy?.Trim(),
            // The default (updatedAt) is newest first; a chosen column defaults to ascending.
            string.IsNullOrWhiteSpace(sortBy) || string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase),
            page,
            pageSize), null);
    }

    private static IResult FileProblem(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["File"] = [message] });
}
