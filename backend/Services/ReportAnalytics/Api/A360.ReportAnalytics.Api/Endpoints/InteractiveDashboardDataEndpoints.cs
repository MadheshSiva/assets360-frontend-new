using System.Text.RegularExpressions;
using ClosedXML.Excel;
using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>
/// Interactive Dashboards data: every widget worked out from live Asset and Maintenance records for the filter bar.
/// Query values override the dashboard's default filters; pass "all" to clear one.
/// </summary>
public static class InteractiveDashboardDataEndpoints
{
    public static RouteGroupBuilder MapInteractiveDashboardDataEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(InteractiveDashboardEndpoints.BasePath).WithTags("Interactive Dashboards");

        group.MapGet("/{dashboardId}/data", GetDashboardDataAsync).WithName("GetInteractiveDashboardData");
        group.MapGet("/{dashboardId}/widgets/{widgetId}/data", GetWidgetDataAsync).WithName("GetInteractiveDashboardWidgetData");
        group.MapPost("/widgets/preview", PreviewWidgetAsync).WithName("PreviewInteractiveDashboardWidget");
        group.MapGet("/{dashboardId}/export", ExportDashboardAsync).WithName("ExportInteractiveDashboard");

        return group;
    }

    /// <summary>Every widget's data. datePreset is one of /options datePresets; from and to (yyyy-MM-dd) make it Custom.</summary>
    private static async Task<IResult> GetDashboardDataAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken,
        string? organization = null,
        string? location = null,
        string? assetCategory = null,
        string? datePreset = null,
        DateOnly? from = null,
        DateOnly? to = null,
        string? timeZone = null)
    {
        var dashboard = await InteractiveDashboardEndpoints.FindVisibleAsync(
            dashboardId, repository, InteractiveDashboardAccess.ViewerId(currentUserAccessor.GetCurrentUser()), cancellationToken);
        if (dashboard is null)
        {
            return Results.NotFound();
        }

        var filters = Merge(dashboard.DefaultFilters.ToRequest(), organization, location, assetCategory, datePreset, from, to, timeZone);
        var (calculator, scope, period, problem) = CreateCalculator(filters, dashboard.TenantId, dashboard.ClientId, dataRepository);
        if (problem is not null)
        {
            return problem;
        }

        var widgets = await CalculateAsync(calculator!, dashboard.Widgets, loggerFactory, cancellationToken);

        return Results.Ok(Response(dashboard, scope!, period!, widgets));
    }

    /// <summary>One widget's data, for refreshing a single card.</summary>
    private static async Task<IResult> GetWidgetDataAsync(
        string dashboardId,
        string widgetId,
        IInteractiveDashboardRepository repository,
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken,
        string? organization = null,
        string? location = null,
        string? assetCategory = null,
        string? datePreset = null,
        DateOnly? from = null,
        DateOnly? to = null,
        string? timeZone = null)
    {
        var dashboard = await InteractiveDashboardEndpoints.FindVisibleAsync(
            dashboardId, repository, InteractiveDashboardAccess.ViewerId(currentUserAccessor.GetCurrentUser()), cancellationToken);
        var widget = dashboard?.Widgets.FirstOrDefault(item => item.WidgetId == widgetId);
        if (dashboard is null || widget is null)
        {
            return Results.NotFound();
        }

        var filters = Merge(dashboard.DefaultFilters.ToRequest(), organization, location, assetCategory, datePreset, from, to, timeZone);
        var (calculator, scope, period, problem) = CreateCalculator(filters, dashboard.TenantId, dashboard.ClientId, dataRepository);
        if (problem is not null)
        {
            return problem;
        }

        var widgets = await CalculateAsync(calculator!, [widget], loggerFactory, cancellationToken);

        return Results.Ok(Response(dashboard, scope!, period!, widgets));
    }

    /// <summary>Add Widget preview: data for a widget that has not been saved, using the signed-in user's tenant.</summary>
    private static async Task<IResult> PreviewWidgetAsync(
        DashboardWidgetPreviewRequest request,
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        request.Widget.ValidateWidget(errors, "Widget");
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var (calculator, scope, period, problem) = CreateCalculator(
            request.Filters ?? new DashboardFiltersRequest(null, null, null, null, null, null, null),
            string.IsNullOrWhiteSpace(request.TenantId) ? currentUser?.TenantId : request.TenantId,
            string.IsNullOrWhiteSpace(request.ClientId) ? currentUser?.ClientId : request.ClientId,
            dataRepository);
        if (problem is not null)
        {
            return problem;
        }

        var widget = request.Widget!.ToWidget([]);
        var widgets = await CalculateAsync(calculator!, [widget], loggerFactory, cancellationToken);

        return Results.Ok(Response(null, scope!, period!, widgets));
    }

    /// <summary>Export: an Excel workbook with the filters on the first sheet and one sheet per widget.</summary>
    private static async Task<IResult> ExportDashboardAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken,
        string? format = null,
        string? organization = null,
        string? location = null,
        string? assetCategory = null,
        string? datePreset = null,
        DateOnly? from = null,
        DateOnly? to = null,
        string? timeZone = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !InteractiveDashboardOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", InteractiveDashboardOptions.ExportFormats.All)}"]
            });
        }

        var dashboard = await InteractiveDashboardEndpoints.FindVisibleAsync(
            dashboardId, repository, InteractiveDashboardAccess.ViewerId(currentUserAccessor.GetCurrentUser()), cancellationToken);
        if (dashboard is null)
        {
            return Results.NotFound();
        }

        var filters = Merge(dashboard.DefaultFilters.ToRequest(), organization, location, assetCategory, datePreset, from, to, timeZone);
        var (calculator, scope, period, problem) = CreateCalculator(filters, dashboard.TenantId, dashboard.ClientId, dataRepository);
        if (problem is not null)
        {
            return problem;
        }

        var widgets = await CalculateAsync(calculator!, dashboard.Widgets, loggerFactory, cancellationToken);
        var generatedAt = DateTime.UtcNow;

        using var workbook = new XLWorkbook();
        var summary = workbook.AddWorksheet("Dashboard");
        (string Label, object? Value)[] lines =
        [
            ("Dashboard", dashboard.DashboardName),
            ("Dashboard ID", dashboard.DashboardId),
            ("Description", dashboard.Description),
            ("Organization", scope!.Organization ?? "All organizations"),
            ("Location", scope.Location ?? "All locations"),
            ("Asset Category", scope.AssetCategory ?? "All categories"),
            ("Period", $"{period!.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})"),
            ("Generated (UTC)", generatedAt)
        ];

        for (var index = 0; index < lines.Length; index++)
        {
            summary.Cell(index + 1, 1).Value = lines[index].Label;
            summary.Cell(index + 1, 1).Style.Font.Bold = true;
            summary.Cell(index + 1, 2).Value = XLCellValue.FromObject(lines[index].Value);
        }

        summary.Columns().AdjustToContents();

        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { summary.Name };
        foreach (var widget in widgets)
        {
            var sheet = workbook.AddWorksheet(SheetName(widget.Title, usedNames));
            if (widget.Data is null)
            {
                sheet.Cell(1, 1).Value = widget.Error ?? "No data";
                continue;
            }

            var (headers, rows) = DashboardWidgetTables.ToRows(widget.Data);
            for (var column = 0; column < headers.Count; column++)
            {
                sheet.Cell(1, column + 1).Value = headers[column];
            }

            sheet.Row(1).Style.Font.Bold = true;

            for (var row = 0; row < rows.Count; row++)
            {
                for (var column = 0; column < rows[row].Count; column++)
                {
                    sheet.Cell(row + 2, column + 1).Value = rows[row][column] switch
                    {
                        IEnumerable<string> list => string.Join(", ", list),
                        var value => XLCellValue.FromObject(value)
                    };
                }
            }

            sheet.Columns().AdjustToContents();
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"{dashboard.DashboardId.ToLowerInvariant()}-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    /// <summary>Query values win over the dashboard defaults; from / to without a preset mean Custom.</summary>
    private static DashboardFiltersRequest Merge(
        DashboardFiltersRequest defaults,
        string? organization,
        string? location,
        string? assetCategory,
        string? datePreset,
        DateOnly? from,
        DateOnly? to,
        string? timeZone)
    {
        var preset = !string.IsNullOrWhiteSpace(datePreset)
            ? datePreset
            : from is not null || to is not null ? InteractiveDashboardOptions.CustomDatePreset : defaults.DatePreset;

        return new DashboardFiltersRequest(
            organization is null ? defaults.Organization : InteractiveDashboardMappings.FilterValue(organization),
            location is null ? defaults.Location : InteractiveDashboardMappings.FilterValue(location),
            assetCategory is null ? defaults.AssetCategory : InteractiveDashboardMappings.FilterValue(assetCategory),
            preset,
            from ?? defaults.DateFrom,
            to ?? defaults.DateTo,
            string.IsNullOrWhiteSpace(timeZone) ? defaults.TimeZone : timeZone);
    }

    private static (DashboardWidgetCalculator? Calculator, DashboardDataScope? Scope, DashboardPeriod? Period, IResult? Problem) CreateCalculator(
        DashboardFiltersRequest filters,
        string? tenantId,
        string? clientId,
        IDashboardDataRepository dataRepository)
    {
        var errors = new Dictionary<string, string[]>();
        filters.ValidateFilters(errors, "Filters");
        if (errors.Count > 0)
        {
            return (null, null, null, Results.ValidationProblem(errors));
        }

        ReportPeriods.TryGetTimeZone(filters.TimeZone, out var zone);
        var utcNow = DateTime.UtcNow;
        var period = DashboardPeriods.Resolve(
            InteractiveDashboardOptions.DatePresets.Normalize(filters.DatePreset) ?? InteractiveDashboardOptions.DefaultDatePreset,
            filters.DateFrom,
            filters.DateTo,
            zone,
            string.IsNullOrWhiteSpace(filters.TimeZone) ? ReportPeriods.DefaultTimeZone : filters.TimeZone.Trim(),
            utcNow);

        var scope = new DashboardDataScope(
            tenantId,
            clientId,
            InteractiveDashboardMappings.FilterValue(filters.Organization),
            InteractiveDashboardMappings.FilterValue(filters.Location),
            InteractiveDashboardMappings.FilterValue(filters.AssetCategory));

        return (new DashboardWidgetCalculator(dataRepository, scope, period, utcNow), scope, period, null);
    }

    /// <summary>Widgets are worked out one after another so they share the records already read; one failing widget does not hide the rest.</summary>
    private static async Task<List<DashboardWidgetDataResponse>> CalculateAsync(
        DashboardWidgetCalculator calculator,
        IReadOnlyList<DashboardWidget> widgets,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var results = new List<DashboardWidgetDataResponse>();
        foreach (var widget in widgets)
        {
            var metric = InteractiveDashboardOptions.FindMetric(widget.Metric);
            if (metric is null)
            {
                results.Add(new DashboardWidgetDataResponse(widget.WidgetId, widget.WidgetType, widget.Metric, widget.Title, string.Empty, null, $"Unknown metric '{widget.Metric}'"));
                continue;
            }

            try
            {
                var data = await calculator.CalculateAsync(widget, cancellationToken);
                results.Add(new DashboardWidgetDataResponse(widget.WidgetId, widget.WidgetType, metric.Key, widget.Title, metric.Shape, data, null));
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                loggerFactory.CreateLogger(nameof(InteractiveDashboardDataEndpoints))
                    .LogError(exception, "Dashboard widget {WidgetId} ({Metric}) failed", widget.WidgetId, widget.Metric);
                results.Add(new DashboardWidgetDataResponse(widget.WidgetId, widget.WidgetType, metric.Key, widget.Title, metric.Shape, null, "This widget could not be loaded"));
            }
        }

        return results;
    }

    private static DashboardDataResponse Response(
        InteractiveDashboard? dashboard,
        DashboardDataScope scope,
        DashboardPeriod period,
        IReadOnlyList<DashboardWidgetDataResponse> widgets) => new(
        dashboard?.DashboardId,
        dashboard?.DashboardName,
        DateTime.UtcNow,
        new DashboardAppliedFilters(scope.Organization, scope.Location, scope.AssetCategory),
        DashboardPeriodResponse.FromPeriod(period),
        widgets);

    // Excel sheet names: at most 31 characters, none of : \ / ? * [ ], unique in the workbook.
    private static string SheetName(string title, HashSet<string> usedNames)
    {
        var name = Regex.Replace(string.IsNullOrWhiteSpace(title) ? "Widget" : title.Trim(), @"[:\\/?*\[\]]", " ");
        name = name.Length > 31 ? name[..31] : name;

        var candidate = name;
        for (var suffix = 2; !usedNames.Add(candidate); suffix++)
        {
            var tail = $" ({suffix})";
            candidate = (name.Length + tail.Length > 31 ? name[..(31 - tail.Length)] : name) + tail;
        }

        return candidate;
    }
}
