using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>Reports &amp; Analytics / Standard Reports – Date Representation.</summary>
public static class StandardReportEndpoints
{
    private const string EntityType = "StandardReport";
    private const string SequenceName = "standard_report";

    public static RouteGroupBuilder MapStandardReportEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/standard-reports").WithTags("Standard Reports");

        // Page furniture: summary cards, calendar, filters and period buttons.
        group.MapGet("/summary", GetSummaryAsync).WithName("GetStandardReportSummary");
        group.MapGet("/calendar", GetCalendarAsync).WithName("GetStandardReportCalendar");
        group.MapGet("/options", GetOptions).WithName("GetStandardReportOptions");
        group.MapGet("/period", ResolvePeriod).WithName("ResolveStandardReportPeriod");

        // All Standard Reports table.
        group.MapGet("", GetReportsAsync).WithName("GetStandardReports");
        group.MapGet("/export", ExportReportsAsync).WithName("ExportStandardReports");
        group.MapPut("/report-period", ApplyReportPeriodAsync).WithName("ApplyStandardReportPeriod");

        group.MapGet("/{reportId}", GetReportByIdAsync).WithName("GetStandardReportById");
        group.MapGet("/{reportId}/output", GetReportOutputAsync).WithName("GetStandardReportOutput");
        group.MapPost("", CreateReportAsync).WithName("CreateStandardReport");
        group.MapPut("/{reportId}", UpdateReportAsync).WithName("UpdateStandardReport");
        group.MapDelete("/{reportId}", DeleteReportAsync).WithName("DeleteStandardReport");

        // Row actions.
        group.MapPost("/{reportId}/generate", GenerateReportAsync).WithName("GenerateStandardReport");
        group.MapPut("/{reportId}/schedule", ScheduleReportAsync).WithName("ScheduleStandardReport");

        return group;
    }

    /// <summary>
    /// The table. periodFrom/periodTo (Apply Dates) keep reports whose period overlaps the range and are read in timeZone;
    /// without includeTime they cover whole days. sortBy is reportName, category, reportPeriod, generatedOn, nextScheduled, frequency or status.
    /// </summary>
    private static async Task<IResult> GetReportsAsync(
        IStandardReportRepository repository,
        CancellationToken cancellationToken,
        string? search = null,
        string? category = null,
        string? frequency = null,
        string? status = null,
        DateTime? periodFrom = null,
        DateTime? periodTo = null,
        string? timeZone = null,
        bool includeTime = false,
        string? tenantId = null,
        string? clientId = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = StandardReportRepository.DefaultPageSize)
    {
        var filterErrors = StandardReportValidationExtensions.ValidateListFilters(
            category, frequency, status, sortBy, sortDirection, periodFrom, periodTo, timeZone);
        if (filterErrors is not null)
        {
            return Results.ValidationProblem(filterErrors);
        }

        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > StandardReportRepository.MaxPageSize ? StandardReportRepository.DefaultPageSize : pageSize;

        var query = BuildQuery(search, category, frequency, status, periodFrom, periodTo, timeZone, includeTime, tenantId, clientId, sortBy, sortDirection, page, pageSize);
        var result = await repository.QueryAsync(query, cancellationToken);

        return Results.Ok(new StandardReportListResponse(
            result.Items.Select(StandardReportResponse.FromEntity).ToList(),
            result.TotalCount,
            page,
            pageSize));
    }

    /// <summary>Total Reports, With Date Filters, Scheduled and Updated This Month. "This month" is the current month in timeZone.</summary>
    private static async Task<IResult> GetSummaryAsync(
        IStandardReportRepository repository,
        CancellationToken cancellationToken,
        string? timeZone = null,
        string? tenantId = null,
        string? clientId = null)
    {
        if (!ReportPeriods.TryGetTimeZone(timeZone, out var zone))
        {
            return TimeZoneProblem(timeZone);
        }

        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone);
        var (monthStartUtc, monthEndUtc) = ReportPeriods.MonthUtcRange(today.Year, today.Month, zone);

        var summary = await repository.GetSummaryAsync(tenantId, clientId, monthStartUtc, monthEndUtc, cancellationToken);

        return Results.Ok(new StandardReportSummaryResponse(
            summary.TotalReports,
            summary.WithDateFilters,
            summary.Scheduled,
            summary.UpdatedThisMonth));
    }

    /// <summary>Days in a month with Generated, Scheduled and Review due markers, bucketed by local date in timeZone. Defaults to the current month.</summary>
    private static async Task<IResult> GetCalendarAsync(
        IStandardReportRepository repository,
        CancellationToken cancellationToken,
        int? year = null,
        int? month = null,
        string? timeZone = null,
        string? tenantId = null,
        string? clientId = null)
    {
        if (!ReportPeriods.TryGetTimeZone(timeZone, out var zone))
        {
            return TimeZoneProblem(timeZone);
        }

        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone);
        var calendarYear = year ?? today.Year;
        var calendarMonth = month ?? today.Month;
        if (calendarYear is < 2000 or > 2100 || calendarMonth is < 1 or > 12)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Month"] = ["year must be 2000-2100 and month 1-12"]
            });
        }

        var (fromUtc, toUtc) = ReportPeriods.MonthUtcRange(calendarYear, calendarMonth, zone);
        var reports = await repository.GetCalendarReportsAsync(tenantId, clientId, fromUtc, toUtc, cancellationToken);

        var days = new SortedDictionary<DateOnly, (int Generated, int Scheduled, int ReviewDue)>();

        void Mark(DateTime? value, Func<(int Generated, int Scheduled, int ReviewDue), (int, int, int)> increment)
        {
            if (value is null || value < fromUtc || value >= toUtc)
            {
                return;
            }

            var date = ReportPeriods.LocalDateOnly(value.Value, zone);
            days[date] = increment(days.GetValueOrDefault(date));
        }

        foreach (var report in reports)
        {
            Mark(report.GeneratedOn, day => (day.Generated + 1, day.Scheduled, day.ReviewDue));
            Mark(report.NextScheduledOn, day => (day.Generated, day.Scheduled + 1, day.ReviewDue));
            Mark(report.ReviewDueOn, day => (day.Generated, day.Scheduled, day.ReviewDue + 1));
        }

        return Results.Ok(new StandardReportCalendarResponse(
            calendarYear,
            calendarMonth,
            string.IsNullOrWhiteSpace(timeZone) ? ReportPeriods.DefaultTimeZone : timeZone.Trim(),
            days.Select(day => new StandardReportCalendarDay(day.Key, day.Value.Generated, day.Value.Scheduled, day.Value.ReviewDue)).ToList()));
    }

    private static IResult GetOptions() => Results.Ok(new StandardReportOptionsResponse(
        StandardReportOptions.Categories.All,
        StandardReportOptions.Frequencies.All,
        StandardReportOptions.Statuses.All,
        StandardReportOptions.PeriodPresets.All,
        StandardReportRepository.SortFields.Keys.ToList(),
        StandardReportOptions.ExportFormats.All,
        ReportPeriods.DefaultTimeZone));

    /// <summary>Resolves Today, This week, This month, This quarter or This year to dates in timeZone.</summary>
    private static IResult ResolvePeriod(string? preset = null, string? timeZone = null)
    {
        var normalized = StandardReportOptions.PeriodPresets.Normalize(preset);
        if (normalized is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Preset"] = [$"Preset must be one of: {string.Join(", ", StandardReportOptions.PeriodPresets.All)}"]
            });
        }

        if (!ReportPeriods.TryGetTimeZone(timeZone, out var zone))
        {
            return TimeZoneProblem(timeZone);
        }

        var (from, to) = ReportPeriods.ResolvePreset(normalized, zone, DateTime.UtcNow);

        return Results.Ok(new ReportPeriodResponse(
            normalized,
            DateOnly.FromDateTime(from),
            DateOnly.FromDateTime(to),
            string.IsNullOrWhiteSpace(timeZone) ? ReportPeriods.DefaultTimeZone : timeZone.Trim()));
    }

    /// <summary>Downloads the table (same filters and sort as the list, every page) as xlsx or csv. Dates are shown in each report's own time zone.</summary>
    private static async Task<IResult> ExportReportsAsync(
        IStandardReportRepository repository,
        CancellationToken cancellationToken,
        string? format = null,
        string? search = null,
        string? category = null,
        string? frequency = null,
        string? status = null,
        DateTime? periodFrom = null,
        DateTime? periodTo = null,
        string? timeZone = null,
        bool includeTime = false,
        string? tenantId = null,
        string? clientId = null,
        string? sortBy = null,
        string? sortDirection = null)
    {
        var exportFormat = string.IsNullOrWhiteSpace(format) ? "xlsx" : StandardReportOptions.ExportFormats.Normalize(format);
        var filterErrors = StandardReportValidationExtensions.ValidateListFilters(
            category, frequency, status, sortBy, sortDirection, periodFrom, periodTo, timeZone) ?? [];
        if (exportFormat is null)
        {
            filterErrors["Format"] = [$"Format must be one of: {string.Join(", ", StandardReportOptions.ExportFormats.All)}"];
        }

        if (filterErrors.Count > 0)
        {
            return Results.ValidationProblem(filterErrors);
        }

        var query = BuildQuery(search, category, frequency, status, periodFrom, periodTo, timeZone, includeTime, tenantId, clientId, sortBy, sortDirection, 1, 0);
        var result = await repository.QueryAsync(query, cancellationToken);

        string[] headers = ["Report ID", "Report Name", "Category", "Report Period", "Generated On", "Next Scheduled", "Frequency", "Status", "Time Zone"];
        var rows = result.Items.Select(ExportRow).ToList();
        var fileName = $"standard-reports-{DateTime.UtcNow:yyyyMMddHHmmss}";

        if (exportFormat == "csv")
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", headers.Select(CsvField)));
            foreach (var row in rows)
            {
                csv.AppendLine(string.Join(",", row.Select(CsvField)));
            }

            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv", $"{fileName}.csv");
        }

        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Standard Reports");
        for (var index = 0; index < headers.Length; index++)
        {
            sheet.Cell(1, index + 1).Value = headers[index];
        }

        sheet.Row(1).Style.Font.Bold = true;

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            for (var column = 0; column < rows[rowIndex].Length; column++)
            {
                sheet.Cell(rowIndex + 2, column + 1).Value = rows[rowIndex][column];
            }
        }

        sheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"{fileName}.xlsx");
    }

    private static async Task<IResult> GetReportByIdAsync(
        string reportId,
        IStandardReportRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Viewed, cancellationToken);

        return Results.Ok(StandardReportResponse.FromEntity(report));
    }

    /// <summary>
    /// The viewer's breakdown: the report category's measure over the report's period (this year when it has none), read live
    /// from the same records as the analytics pages.
    /// </summary>
    private static async Task<IResult> GetReportOutputAsync(
        string reportId,
        IStandardReportRepository repository,
        IDashboardDataRepository dashboardRepository,
        IInventoryAnalyticsDataRepository inventoryRepository,
        IComplianceAnalyticsDataRepository complianceRepository,
        IFinancialAnalyticsDataRepository financialRepository,
        IFinancialAnalyticsCapexRequestRepository capexRepository,
        CancellationToken cancellationToken)
    {
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        var output = await StandardReportOutputCalculator.CalculateAsync(
            report,
            new StandardReportOutputSources(dashboardRepository, inventoryRepository, complianceRepository, financialRepository, capexRepository),
            DateTime.UtcNow,
            cancellationToken);

        return Results.Ok(output);
    }

    private static async Task<IResult> CreateReportAsync(
        CreateStandardReportRequest request,
        IStandardReportRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();
        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var report = request.ToEntity(string.Empty, currentUserAccessor.GetCurrentUser());

        // Checked before taking a number so a rejected request does not leave a gap in RPT- ids.
        if (await repository.NameExistsAsync(report.ReportName, report.TenantId, report.ClientId, null, cancellationToken))
        {
            return DuplicateNameProblem(report.ReportName);
        }

        var nextSequence = await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken);
        report.ReportId = $"RPT-{nextSequence:D4}";

        report = await repository.CreateAsync(report, cancellationToken);

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Created, cancellationToken);

        return Results.Created($"/api/standard-reports/{report.ReportId}", StandardReportResponse.FromEntity(report));
    }

    private static async Task<IResult> UpdateReportAsync(
        string reportId,
        UpdateStandardReportRequest request,
        IStandardReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();
        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        if (await repository.NameExistsAsync(request.ReportName!, report.TenantId, report.ClientId, report.Id, cancellationToken))
        {
            return DuplicateNameProblem(request.ReportName!.Trim());
        }

        request.ApplyTo(report, currentUserAccessor.GetCurrentUser());

        return await SaveAsync(report, repository, eventLogger, cancellationToken);
    }

    private static async Task<IResult> DeleteReportAsync(
        string reportId,
        IStandardReportRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        var deleted = await repository.DeleteAsync(report.Id, cancellationToken);
        if (!deleted)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Records a run: Generated On becomes now, status Ready, and a recurring report's next run moves past now.</summary>
    private static async Task<IResult> GenerateReportAsync(
        string reportId,
        IStandardReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        report.MarkGenerated(currentUserAccessor.GetCurrentUser(), DateTime.UtcNow);

        return await SaveAsync(report, repository, eventLogger, cancellationToken);
    }

    private static async Task<IResult> ScheduleReportAsync(
        string reportId,
        ScheduleStandardReportRequest request,
        IStandardReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();
        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        request.ApplyTo(report, currentUserAccessor.GetCurrentUser());

        return await SaveAsync(report, repository, eventLogger, cancellationToken);
    }

    /// <summary>Sets the same reporting period on the given reports (Apply Dates). Unknown ids are returned in NotFound.</summary>
    private static async Task<IResult> ApplyReportPeriodAsync(
        ApplyReportPeriodRequest request,
        IStandardReportRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();
        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var notFound = new List<string>();
        var updatedCount = 0;

        foreach (var reportId in request.ReportIds!.Where(id => !string.IsNullOrWhiteSpace(id)).Select(id => id.Trim()).Distinct())
        {
            var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
            if (report is null)
            {
                notFound.Add(reportId);
                continue;
            }

            request.ApplyTo(report, currentUser);

            if (await repository.UpdateAsync(report.Id, report, cancellationToken))
            {
                updatedCount++;
                await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Updated, cancellationToken);
            }
            else
            {
                notFound.Add(reportId);
            }
        }

        return Results.Ok(new ApplyReportPeriodResponse(updatedCount, notFound));
    }

    private static async Task<IResult> SaveAsync(
        StandardReport report,
        IStandardReportRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var updated = await repository.UpdateAsync(report.Id, report, cancellationToken);
        if (!updated)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, report.Id, report.ReportName, EventAction.Updated, cancellationToken);

        return Results.Ok(StandardReportResponse.FromEntity(report));
    }

    // Filters are validated before this is called, so the time zone is known to resolve.
    private static StandardReportQuery BuildQuery(
        string? search,
        string? category,
        string? frequency,
        string? status,
        DateTime? periodFrom,
        DateTime? periodTo,
        string? timeZone,
        bool includeTime,
        string? tenantId,
        string? clientId,
        string? sortBy,
        string? sortDirection,
        int page,
        int pageSize)
    {
        ReportPeriods.TryGetTimeZone(timeZone, out var zone);
        var (fromUtc, toUtc) = ReportPeriods.ToUtcRange(periodFrom, periodTo, zone, includeTime);

        return new StandardReportQuery(
            search,
            StandardReportOptions.Categories.Normalize(category),
            StandardReportOptions.Frequencies.Normalize(frequency),
            StandardReportOptions.Statuses.Normalize(status),
            fromUtc,
            toUtc,
            tenantId,
            clientId,
            sortBy?.Trim(),
            string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase),
            page,
            pageSize);
    }

    private static string[] ExportRow(StandardReport report)
    {
        ReportPeriods.TryGetTimeZone(report.TimeZone, out var zone);

        string Format(DateTime? value, string pattern) => value is null
            ? string.Empty
            : TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(value.Value, DateTimeKind.Utc), zone).ToString(pattern, CultureInfo.InvariantCulture);

        var periodPattern = report.IncludeTime ? "dd MMM yyyy, HH:mm" : "dd MMM yyyy";
        var period = report.ReportPeriodFrom is null || report.ReportPeriodTo is null
            ? string.Empty
            : $"{Format(report.ReportPeriodFrom, periodPattern)} – {Format(report.ReportPeriodTo, periodPattern)}";

        return
        [
            report.ReportId,
            report.ReportName,
            report.Category,
            period,
            Format(report.GeneratedOn, "dd MMM yyyy, HH:mm"),
            Format(report.NextScheduledOn, "dd MMM yyyy, HH:mm"),
            report.Frequency,
            report.Status ?? string.Empty,
            report.TimeZone
        ];
    }

    private static string CsvField(string value)
    {
        // Quote fields with separators, and neutralise leading formula characters for spreadsheet apps.
        if (value.Length > 0 && "=+-@".Contains(value[0]))
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }

    private static IResult TimeZoneProblem(string? timeZone)
    {
        var errors = new Dictionary<string, string[]>();
        StandardReportValidationExtensions.ValidateTimeZone(errors, timeZone);
        return Results.ValidationProblem(errors);
    }

    private static IResult DuplicateNameProblem(string reportName) =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["ReportName"] = [$"A report named '{reportName}' already exists"]
        });
}
