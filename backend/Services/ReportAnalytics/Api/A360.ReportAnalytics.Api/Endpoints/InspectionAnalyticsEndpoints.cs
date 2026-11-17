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

/// <summary>
/// Reports &amp; Analytics / Inspection Analytics: inspection execution, findings, compliance, repeat findings and inspector performance
/// worked out from live inspection and finding records. Data endpoints take the filter bar as query values.
/// </summary>
public static class InspectionAnalyticsEndpoints
{
    internal const string EntityType = "InspectionAnalyticsView";
    private const string BasePath = "/api/inspection-analytics";
    private const string SequenceName = "inspection_analytics_view";
    private const string Page = AssetPerformanceViewRepository.InspectionAnalyticsPage;

    public static RouteGroupBuilder MapInspectionAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Inspection Analytics");

        // Page furniture: dropdown values and the Organization / Location / Asset Category / Inspection Type / Inspector filters.
        group.MapGet("/options", GetOptions).WithName("GetInspectionAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetInspectionAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetInspectionAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateInspectionAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateInspectionAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteInspectionAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetInspectionAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetInspectionAnalyticsSummary");
        group.MapGet("/completion-trend", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.CompletionTrend())).WithName("GetInspectionCompletionTrend");
        group.MapGet("/findings-by-severity", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.FindingsBySeverity())).WithName("GetFindingsBySeverity");
        group.MapGet("/inspection-status", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.InspectionStatus())).WithName("GetInspectionStatus");
        group.MapGet("/findings-by-category", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.FindingsByCategory())).WithName("GetFindingsByCategory");
        group.MapGet("/compliance", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.Compliance())).WithName("GetInspectionCompliance");
        group.MapGet("/repeat-findings", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.RepeatFindingsTrend())).WithName("GetRepeatFindingsTrend");
        group.MapGet("/insights", ([AsParameters] InspectionAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetInspectionInsights");
        group.MapGet("/findings", GetFindingsAsync).WithName("GetOpenInspectionFindings");
        group.MapGet("/inspectors", GetInspectorsAsync).WithName("GetInspectorPerformance");

        // Compare Periods and Export.
        group.MapGet("/compare-periods", ComparePeriodsAsync).WithName("CompareInspectionPeriods");
        group.MapGet("/export", ExportAsync).WithName("ExportInspectionAnalytics");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new InspectionAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        InspectionAnalyticsOptions.DefaultDatePreset,
        InspectionAnalyticsOptions.InspectionStatuses.All,
        InspectionAnalyticsOptions.FindingStatuses.All,
        InspectionAnalyticsCalculator.Severities,
        InspectionAnalyticsOptions.FindingSortFields.All,
        InspectionAnalyticsOptions.ExportFormats.All,
        InspectionAnalyticsOptions.DefaultComplianceTarget,
        InspectionAnalyticsOptions.DefaultDueWithinDays,
        InspectionAnalyticsOptions.DefaultRepeatWindowDays));

    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var assets = await dataRepository.GetFilterOptionsAsync(tenant, client, cancellationToken);
        var inspections = await dataRepository.GetInspectionFilterOptionsAsync(tenant, client, cancellationToken);

        return Results.Ok(new InspectionAnalyticsFilterOptionsResponse(
            assets.Organizations, assets.Locations, assets.AssetCategories, assets.AssetTypes, inspections.InspectionTypes, inspections.Inspectors));
    }

    /// <summary>The built-in All Inspections view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<AssetPerformanceView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(Page, viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { InspectionAnalyticsViewResponse.AllInspections(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(InspectionAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveInspectionAnalyticsViewRequest request,
        IAssetPerformanceViewRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        if (viewerId is null)
        {
            return Results.Unauthorized();
        }

        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var errors = request.Validate();
        if (errors.Count == 0 && await NameTakenAsync(repository, viewerId, tenantId, clientId, request.ViewName!, null, cancellationToken))
        {
            errors["ViewName"] = ["You already have a view with this name"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var view = new AssetPerformanceView
        {
            ViewId = $"IAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
            Page = Page,
            ViewName = request.ViewName!.Trim(),
            OwnerId = viewerId,
            OwnerName = currentUser?.UserName,
            IsDefault = request.IsDefault ?? false,
            Filters = request.Filters.ToDomain(),
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = tenantId,
            ClientId = clientId,
            IsDeleted = false
        };

        view = await repository.CreateAsync(view, cancellationToken);
        if (view.IsDefault)
        {
            await repository.ClearDefaultAsync(Page, viewerId, tenantId, clientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{view.ViewId}", InspectionAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveInspectionAnalyticsViewRequest request,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != viewerId || view.Page != Page)
        {
            return Results.NotFound();
        }

        var errors = request.Validate();
        if (errors.Count == 0 && await NameTakenAsync(repository, viewerId, view.TenantId, view.ClientId, request.ViewName!, view.Id, cancellationToken))
        {
            errors["ViewName"] = ["You already have a view with this name"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        view.ViewName = request.ViewName!.Trim();
        view.IsDefault = request.IsDefault ?? view.IsDefault;
        view.Filters = request.Filters.ToDomain();
        view.UpdatedBy = currentUser?.UserName;
        view.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(view.Id, view, cancellationToken))
        {
            return Results.NotFound();
        }

        if (view.IsDefault)
        {
            await repository.ClearDefaultAsync(Page, viewerId, view.TenantId, view.ClientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Updated, cancellationToken);

        return Results.Ok(InspectionAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser()) || view.Page != Page
            || !await repository.DeleteAsync(view.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] InspectionAnalyticsRequest request,
        int findingsSize = InspectionAnalyticsOptions.DefaultPageSize,
        int inspectorLimit = InspectionAnalyticsOptions.DefaultInspectorLimit)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var findings = calculator.OpenFindings();

        return Results.Ok(new InspectionAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.CompletionTrend(),
            calculator.FindingsBySeverity(),
            calculator.InspectionStatus(),
            calculator.FindingsByCategory(),
            calculator.Insights(),
            calculator.Compliance(),
            calculator.RepeatFindingsTrend(),
            findings.Take(Math.Clamp(findingsSize, 0, InspectionAnalyticsOptions.MaxPageSize)).ToList(),
            findings.Count,
            calculator.Inspectors().Take(Math.Clamp(inspectorLimit, 0, InspectionAnalyticsOptions.MaxInspectorLimit)).ToList()));
    }

    /// <summary>
    /// Open Inspection Findings: every unresolved finding. severity=Critical, dueWithinDays=7 and repeatOnly=true back the insight buttons.
    /// findingCategory filters by finding category (category is the asset category on the filter bar).
    /// sortBy is one of /options findingSortFields (default severity, most severe first, then earliest due).
    /// </summary>
    private static async Task<IResult> GetFindingsAsync(
        [AsParameters] InspectionAnalyticsRequest request,
        string? search = null,
        string? severity = null,
        string? status = null,
        string? findingCategory = null,
        bool overdueOnly = false,
        bool repeatOnly = false,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = InspectionAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, InspectionAnalyticsOptions.FindingStatuses);
        CheckOption(errors, "SortBy", sortBy, InspectionAnalyticsOptions.FindingSortFields);
        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        IEnumerable<FindingRow> rows = calculator.OpenFindings();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.FindingId, row.AssetId, row.AssetName, row.Location, row.Owner, row.Description }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (!string.IsNullOrWhiteSpace(severity))
        {
            rows = rows.Where(row => string.Equals(row.Severity, severity.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (InspectionAnalyticsOptions.FindingStatuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(row => row.Status == statusValue);
        }

        if (!string.IsNullOrWhiteSpace(findingCategory))
        {
            rows = rows.Where(row => string.Equals(row.Category, findingCategory.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (overdueOnly)
        {
            rows = rows.Where(row => row.IsOverdue);
        }

        if (request.DueWithinDays is { } days)
        {
            var horizon = DateTime.UtcNow.AddDays(days);
            rows = rows.Where(row => row.DueDate <= horizon);
        }

        if (repeatOnly)
        {
            rows = rows.Where(calculator.IsRepeat);
        }

        var field = InspectionAnalyticsOptions.FindingSortFields.Normalize(sortBy);
        if (field is not null && field != "severity" || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<FindingRow, object?> key = field switch
            {
                "dueDate" => row => row.DueDate,
                "ageDays" => row => row.AgeDays,
                "findingId" => row => row.FindingId,
                "assetName" => row => row.AssetName,
                "category" => row => row.Category,
                "owner" => row => row.Owner,
                "status" => row => row.Status,
                _ => row => InspectionAnalyticsCalculator.SeverityRank(row.Severity)
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > InspectionAnalyticsOptions.MaxPageSize ? InspectionAnalyticsOptions.DefaultPageSize : pageSize;

        return Results.Ok(new InspectionFindingsResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>Inspector Performance: most completed inspections first; limit caps the rows (default 5).</summary>
    private static Task<IResult> GetInspectorsAsync(
        [AsParameters] InspectionAnalyticsRequest request,
        int limit = InspectionAnalyticsOptions.DefaultInspectorLimit) =>
        Section(request, calculator => calculator.Inspectors().Take(Math.Clamp(limit, 1, InspectionAnalyticsOptions.MaxInspectorLimit)).ToList());

    /// <summary>
    /// Compare Periods: the KPIs of the selected period against another one, given as compareFrom / compareTo or comparePreset.
    /// Without either, the previous period of the same length is used.
    /// </summary>
    private static async Task<IResult> ComparePeriodsAsync(
        [AsParameters] InspectionAnalyticsRequest request,
        string? comparePreset = null,
        DateOnly? compareFrom = null,
        DateOnly? compareTo = null)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var period = calculator.Period;
        if (string.IsNullOrWhiteSpace(comparePreset) && compareFrom is null && compareTo is null)
        {
            comparePreset = InteractiveDashboardOptions.CustomDatePreset;
            compareFrom = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(period.PreviousFromUtc, period.Zone));
            compareTo = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(period.PreviousToUtc, period.Zone)).AddDays(-1);
        }

        var (compare, _, compareProblem) = await LoadAsync(request, new DashboardFiltersRequest(
            null,
            null,
            null,
            string.IsNullOrWhiteSpace(comparePreset) ? InteractiveDashboardOptions.CustomDatePreset : comparePreset,
            compareFrom,
            compareTo,
            period.TimeZone));
        if (compare is null)
        {
            return compareProblem!;
        }

        var current = calculator.Summary();
        var other = compare.Summary();
        (string Name, KpiWidgetData Value, KpiWidgetData Compare, bool PercentChange)[] metrics =
        [
            ("Total Inspections", current.TotalInspections, other.TotalInspections, true),
            ("Completion Rate", current.CompletionRate, other.CompletionRate, false),
            ("Open Findings", current.OpenFindings, other.OpenFindings, true),
            ("Critical Findings", current.CriticalFindings, other.CriticalFindings, true),
            ("Corrective Actions Due", current.CorrectiveActionsDue, other.CorrectiveActionsDue, true)
        ];

        return Results.Ok(new InspectionPeriodComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(period),
            DashboardPeriodResponse.FromPeriod(compare.Period),
            metrics.Select(metric =>
            {
                var kpi = DashboardWidgetCalculator.Kpi(metric.Value.Value, metric.Compare.Value, metric.Value.Format, metric.PercentChange);
                return new PeriodComparisonItem(metric.Name, kpi.Format, kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit, kpi.Trend);
            }).ToList(),
            calculator.CompletionTrend(),
            compare.CompletionTrend()));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] InspectionAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !InspectionAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", InspectionAnalyticsOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var period = calculator.Period;
        var generatedAt = DateTime.UtcNow;
        var summary = calculator.Summary();
        var compliance = calculator.Compliance();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Asset Category", filters.Category ?? "All categories", null, null, null],
            ["Inspection Type", filters.InspectionType ?? "All inspection types", null, null, null],
            ["Inspector", filters.Inspector ?? "All inspectors", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Total Inspections", summary.TotalInspections),
                ("Completion Rate (%)", summary.CompletionRate),
                ("Open Findings", summary.OpenFindings),
                ("Critical Findings", summary.CriticalFindings),
                ("Corrective Actions Due", summary.CorrectiveActionsDue)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit]),
            ["Inspection Compliance (%)", compliance.Value, compliance.PreviousValue, compliance.Change, "points"]
        ]);

        AddSeriesSheet(workbook, "Completion Trend", calculator.CompletionTrend());
        AddSeriesSheet(workbook, "Findings by Severity", calculator.FindingsBySeverity());
        AddSheet(workbook, "Inspection Status", ["Status", "Inspections", "Percentage"],
            calculator.InspectionStatus().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSheet(workbook, "Findings by Category", ["Category", "Findings", "Percentage"],
            calculator.FindingsByCategory().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSeriesSheet(workbook, "Compliance", compliance.Trend);
        AddSeriesSheet(workbook, "Repeat Findings", calculator.RepeatFindingsTrend());

        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Findings / Assets / Locations"],
            calculator.Insights().Select(insight => (object?[])
            [
                insight.Title,
                insight.Message,
                insight.Count,
                string.Join(", ", insight.Findings.Select(finding => finding.FindingId ?? finding.Id)
                    .Concat(insight.Assets.Select(asset => asset.AssetId ?? asset.Id))
                    .Concat(insight.Locations))
            ]));

        AddSheet(workbook, "Open Findings",
            ["Finding ID", "Asset ID", "Asset", "Location", "Category", "Severity", "Raised", "Due Date", "Owner", "Status", "Overdue", "Age (days)"],
            calculator.OpenFindings().Select(row => (object?[])
            [
                row.FindingId, row.AssetId, row.AssetName, row.Location, row.Category, row.Severity, row.RaisedAt, row.DueDate, row.Owner, row.Status,
                row.IsOverdue ? "Yes" : "No", row.AgeDays
            ]));

        AddSheet(workbook, "Inspectors", ["Inspector", "Inspections", "Completed", "Avg. Duration (hrs)", "Finding Rate (%)", "Closure Rate (%)"],
            calculator.Inspectors().Select(row => (object?[])
            [
                row.Inspector, row.Inspections, row.Completed, row.AvgDurationHours, row.FindingRate, row.ClosureRate
            ]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"inspection-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(InspectionAnalyticsRequest request, Func<InspectionAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new InspectionAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>
    /// Applies the saved view, then the query values, checks them and reads the records.
    /// dates replaces the date range (Compare Periods); the other filters stay the same.
    /// </summary>
    private static async Task<(InspectionAnalyticsCalculator? Calculator, InspectionAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        InspectionAnalyticsRequest request,
        DashboardFiltersRequest? dates)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new AssetPerformanceFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(InspectionAnalyticsOptions.AllInspectionsViewId, StringComparison.OrdinalIgnoreCase))
        {
            var view = await request.ViewRepository.GetByViewIdAsync(request.ViewId, request.CancellationToken);
            if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUser) || view.Page != Page)
            {
                return (null, null, Results.ValidationProblem(new Dictionary<string, string[]> { ["ViewId"] = [$"View '{request.ViewId}' was not found"] }));
            }

            saved = view.Filters;
            viewId = view.ViewId;
        }

        string? Pick(string? value, string? fallback) => value is null ? fallback : InteractiveDashboardMappings.FilterValue(value);

        dates ??= new DashboardFiltersRequest(
            null,
            null,
            null,
            !string.IsNullOrWhiteSpace(request.DatePreset)
                ? request.DatePreset
                : request.From is not null || request.To is not null
                    ? InteractiveDashboardOptions.CustomDatePreset
                    : saved.DatePreset ?? InspectionAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        if (request.ComplianceTarget is < 0 or > 100)
        {
            errors["ComplianceTarget"] = ["ComplianceTarget must be between 0 and 100"];
        }

        if (request.DueWithinDays is < 0 or > InspectionAnalyticsOptions.MaxDays)
        {
            errors["DueWithinDays"] = [$"DueWithinDays must be between 0 and {InspectionAnalyticsOptions.MaxDays}"];
        }

        if (request.RepeatWindowDays is < 1 or > InspectionAnalyticsOptions.MaxDays)
        {
            errors["RepeatWindowDays"] = [$"RepeatWindowDays must be between 1 and {InspectionAnalyticsOptions.MaxDays}"];
        }

        if (errors.Count > 0)
        {
            return (null, null, Results.ValidationProblem(errors));
        }

        ReportPeriods.TryGetTimeZone(dates.TimeZone, out var zone);
        var utcNow = DateTime.UtcNow;
        var period = DashboardPeriods.Resolve(
            InteractiveDashboardOptions.DatePresets.Normalize(dates.DatePreset)!,
            dates.DateFrom,
            dates.DateTo,
            zone,
            string.IsNullOrWhiteSpace(dates.TimeZone) ? ReportPeriods.DefaultTimeZone : dates.TimeZone.Trim(),
            utcNow);

        var scope = new DashboardDataScope(
            Tenant(request.TenantId, currentUser),
            Client(request.ClientId, currentUser),
            Pick(request.Organization, saved.Organization),
            Pick(request.Location, saved.Location),
            Pick(request.Category, saved.AssetCategory),
            Pick(request.AssetType, saved.AssetType));
        var settings = new InspectionAnalyticsSettings(
            Pick(request.InspectionType, saved.InspectionType),
            Pick(request.Inspector, saved.Inspector),
            request.ComplianceTarget ?? InspectionAnalyticsOptions.DefaultComplianceTarget,
            request.DueWithinDays ?? InspectionAnalyticsOptions.DefaultDueWithinDays,
            request.RepeatWindowDays ?? InspectionAnalyticsOptions.DefaultRepeatWindowDays);

        var calculator = await InspectionAnalyticsCalculator.LoadAsync(request.DataRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new InspectionAnalyticsAppliedFilters(
            viewId ?? InspectionAnalyticsOptions.AllInspectionsViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            scope.AssetType,
            settings.InspectionType,
            settings.Inspector,
            settings.ComplianceTarget,
            settings.DueWithinDays,
            settings.RepeatWindowDays), null);
    }

    private static async Task<bool> NameTakenAsync(
        IAssetPerformanceViewRepository repository,
        string? ownerId,
        string? tenantId,
        string? clientId,
        string name,
        string? exceptId,
        CancellationToken cancellationToken) =>
        (await repository.GetOwnedAsync(Page, ownerId, tenantId, clientId, cancellationToken))
            .Any(view => view.Id != exceptId && string.Equals(view.ViewName, name.Trim(), StringComparison.OrdinalIgnoreCase));

    private static void AddSheet(XLWorkbook workbook, string name, IReadOnlyList<string> headers, IEnumerable<object?[]> rows)
    {
        var sheet = workbook.AddWorksheet(name);
        for (var column = 0; column < headers.Count; column++)
        {
            sheet.Cell(1, column + 1).Value = headers[column];
        }

        sheet.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var values in rows)
        {
            for (var column = 0; column < values.Length; column++)
            {
                sheet.Cell(row, column + 1).Value = XLCellValue.FromObject(values[column]);
            }

            row++;
        }

        sheet.Columns().AdjustToContents();
    }

    private static void AddSeriesSheet(XLWorkbook workbook, string name, PerformanceSeries series) =>
        AddSheet(workbook, name,
            new[] { "Month" }.Concat(series.Series.Select(line => line.Name)).ToList(),
            series.Categories.Select((month, index) => new object?[] { month }.Concat(series.Series.Select(line => (object?)line.Values[index])).ToArray()));

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}
