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
/// Reports &amp; Analytics / Maintenance Analytics: cost, work orders, preventive compliance, reliability, downtime, backlog and
/// technician performance worked out from live Maintenance, Asset and WIP records. Data endpoints take the filter bar as query values.
/// </summary>
public static class MaintenanceAnalyticsEndpoints
{
    internal const string EntityType = "MaintenanceAnalyticsView";
    private const string BasePath = "/api/maintenance-analytics";
    private const string SequenceName = "maintenance_analytics_view";
    private const string Page = AssetPerformanceViewRepository.MaintenanceAnalyticsPage;

    public static RouteGroupBuilder MapMaintenanceAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Maintenance Analytics");

        // Page furniture: dropdown values and the Organization / Location / Asset Category filters.
        group.MapGet("/options", GetOptions).WithName("GetMaintenanceAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetMaintenanceAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetMaintenanceAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateMaintenanceAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateMaintenanceAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteMaintenanceAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetMaintenanceAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetMaintenanceAnalyticsSummary");
        group.MapGet("/cost-trend", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.CostTrend())).WithName("GetMaintenanceCostTrend");
        group.MapGet("/work-orders-by-type", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.WorkOrdersByType())).WithName("GetWorkOrdersByType");
        group.MapGet("/work-order-status", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.WorkOrderStatus())).WithName("GetWorkOrderStatus");
        group.MapGet("/preventive-compliance", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.PreventiveCompliance())).WithName("GetPreventiveMaintenanceCompliance");
        group.MapGet("/reliability", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.Reliability())).WithName("GetMaintenanceMttrVsMtbf");
        group.MapGet("/downtime-by-cause", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.DowntimeByCause())).WithName("GetDowntimeByCause");
        group.MapGet("/insights", ([AsParameters] MaintenanceAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetMaintenanceInsights");
        group.MapGet("/backlog", GetBacklogAsync).WithName("GetMaintenanceBacklog");
        group.MapGet("/technicians", GetTechniciansAsync).WithName("GetTechnicianPerformance");

        // Compare Periods and Export.
        group.MapGet("/compare-periods", ComparePeriodsAsync).WithName("CompareMaintenancePeriods");
        group.MapGet("/export", ExportAsync).WithName("ExportMaintenanceAnalytics");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new MaintenanceAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        MaintenanceAnalyticsOptions.DefaultDatePreset,
        MaintenanceAnalyticsOptions.MaintenanceTypes.All,
        MaintenanceAnalyticsOptions.Statuses.All,
        MaintenanceAnalyticsCalculator.Priorities,
        MaintenanceAnalyticsCalculator.DowntimeCauses,
        MaintenanceAnalyticsOptions.BacklogSortFields.All,
        MaintenanceAnalyticsOptions.ExportFormats.All,
        MaintenanceAnalyticsOptions.DefaultComplianceTarget,
        MaintenanceAnalyticsOptions.DefaultFailureHealthThreshold));

    /// <summary>Organization, Location, Asset Category and Asset Type values; Maintenance Type values are in /options.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        return Results.Ok(await dataRepository.GetFilterOptionsAsync(Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken));
    }

    /// <summary>The built-in All Maintenance view first, then the user's saved views.</summary>
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

        return Results.Ok(new[] { MaintenanceAnalyticsViewResponse.AllMaintenance(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(MaintenanceAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveMaintenanceAnalyticsViewRequest request,
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
            ViewId = $"MAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
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

        return Results.Created($"{BasePath}/views/{view.ViewId}", MaintenanceAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveMaintenanceAnalyticsViewRequest request,
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

        return Results.Ok(MaintenanceAnalyticsViewResponse.FromEntity(view));
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
        [AsParameters] MaintenanceAnalyticsRequest request,
        int backlogSize = MaintenanceAnalyticsOptions.DefaultPageSize,
        int technicianLimit = MaintenanceAnalyticsOptions.DefaultTechnicianLimit)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var backlog = calculator.Backlog();

        return Results.Ok(new MaintenanceAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.CostTrend(),
            calculator.WorkOrdersByType(),
            calculator.WorkOrderStatus(),
            calculator.Insights(),
            calculator.PreventiveCompliance(),
            calculator.Reliability(),
            calculator.DowntimeByCause(),
            backlog.Take(Math.Clamp(backlogSize, 0, MaintenanceAnalyticsOptions.MaxPageSize)).ToList(),
            backlog.Count,
            calculator.Technicians().Take(Math.Clamp(technicianLimit, 0, MaintenanceAnalyticsOptions.MaxTechnicianLimit)).ToList()));
    }

    /// <summary>
    /// Maintenance Backlog: every unfinished work order. status=Overdue or partsShortage=true back the "View work orders" insight buttons.
    /// sortBy is one of /options backlogSortFields (default priority, most urgent first, then oldest).
    /// </summary>
    private static async Task<IResult> GetBacklogAsync(
        [AsParameters] MaintenanceAnalyticsRequest request,
        string? search = null,
        string? priority = null,
        string? status = null,
        string? assignedTo = null,
        bool partsShortage = false,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = MaintenanceAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, MaintenanceAnalyticsOptions.Statuses);
        CheckOption(errors, "SortBy", sortBy, MaintenanceAnalyticsOptions.BacklogSortFields);
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

        IEnumerable<BacklogRow> rows = calculator.Backlog();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.WorkOrderId, row.AssetId, row.AssetName, row.Location, row.AssignedTo }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (!string.IsNullOrWhiteSpace(priority))
        {
            rows = rows.Where(row => string.Equals(row.Priority, priority.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (MaintenanceAnalyticsOptions.Statuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(row => row.Status == statusValue);
        }

        if (!string.IsNullOrWhiteSpace(assignedTo))
        {
            rows = rows.Where(row => row.AssignedTo?.Contains(assignedTo.Trim(), StringComparison.OrdinalIgnoreCase) == true);
        }

        if (partsShortage)
        {
            rows = rows.Where(row => row.PartsShortage);
        }

        var field = MaintenanceAnalyticsOptions.BacklogSortFields.Normalize(sortBy);
        if (field is not null && field != "priority" || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<BacklogRow, object?> key = field switch
            {
                "ageDays" => row => row.AgeDays,
                "dueDate" => row => row.DueDate,
                "workOrderId" => row => row.WorkOrderId,
                "status" => row => row.Status,
                "assignedTo" => row => row.AssignedTo,
                "assetName" => row => row.AssetName,
                _ => row => MaintenanceAnalyticsCalculator.PriorityRank(row.Priority)
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > MaintenanceAnalyticsOptions.MaxPageSize ? MaintenanceAnalyticsOptions.DefaultPageSize : pageSize;

        return Results.Ok(new MaintenanceBacklogResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>Technician Performance: most completed jobs first; limit caps the rows (default 5).</summary>
    private static Task<IResult> GetTechniciansAsync(
        [AsParameters] MaintenanceAnalyticsRequest request,
        int limit = MaintenanceAnalyticsOptions.DefaultTechnicianLimit) =>
        Section(request, calculator => calculator.Technicians().Take(Math.Clamp(limit, 1, MaintenanceAnalyticsOptions.MaxTechnicianLimit)).ToList());

    /// <summary>
    /// Compare Periods: the KPIs of the selected period against another one, given as compareFrom / compareTo or comparePreset.
    /// Without either, the previous period of the same length is used.
    /// </summary>
    private static async Task<IResult> ComparePeriodsAsync(
        [AsParameters] MaintenanceAnalyticsRequest request,
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
            ("Maintenance Cost", current.MaintenanceCost, other.MaintenanceCost, true),
            ("Open Work Orders", current.OpenWorkOrders, other.OpenWorkOrders, true),
            ("Preventive Compliance", current.PreventiveCompliance, other.PreventiveCompliance, false),
            ("MTTR", current.Mttr, other.Mttr, true),
            ("MTBF", current.Mtbf, other.Mtbf, true)
        ];

        return Results.Ok(new MaintenancePeriodComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(period),
            DashboardPeriodResponse.FromPeriod(compare.Period),
            metrics.Select(metric =>
            {
                var kpi = DashboardWidgetCalculator.Kpi(metric.Value.Value, metric.Compare.Value, metric.Value.Format, metric.PercentChange);
                return new PeriodComparisonItem(metric.Name, kpi.Format, kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit, kpi.Trend);
            }).ToList(),
            calculator.CostTrend().Trend,
            compare.CostTrend().Trend));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] MaintenanceAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !MaintenanceAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", MaintenanceAnalyticsOptions.ExportFormats.All)}"]
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
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Asset Category", filters.Category ?? "All categories", null, null, null],
            ["Maintenance Type", filters.MaintenanceType ?? "All maintenance types", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Maintenance Cost", summary.MaintenanceCost),
                ("Open Work Orders", summary.OpenWorkOrders),
                ("Preventive Compliance (%)", summary.PreventiveCompliance),
                ("MTTR (hrs)", summary.Mttr),
                ("MTBF (hrs)", summary.Mtbf)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Cost Trend", calculator.CostTrend().Trend);
        AddSheet(workbook, "Work Orders by Type", ["Type", "Work Orders", "Percentage"],
            calculator.WorkOrdersByType().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSheet(workbook, "Work Order Status", ["Status", "Work Orders", "Percentage"],
            calculator.WorkOrderStatus().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSeriesSheet(workbook, "PM Compliance", calculator.PreventiveCompliance().Trend);
        AddSeriesSheet(workbook, "MTTR vs MTBF", calculator.Reliability().Trend);
        AddSeriesSheet(workbook, "Downtime by Cause", calculator.DowntimeByCause().Trend);

        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Work Orders / Assets / Parts"],
            calculator.Insights().Select(insight => (object?[])
            [
                insight.Title,
                insight.Message,
                insight.Count,
                string.Join(", ", insight.WorkOrders.Select(workOrder => workOrder.WorkOrderId ?? workOrder.Id)
                    .Concat(insight.Assets.Select(asset => asset.AssetId ?? asset.Id))
                    .Concat(insight.Parts))
            ]));

        AddSheet(workbook, "Backlog",
            ["Priority", "Work Order", "Type", "Asset ID", "Asset", "Location", "Age (days)", "Assigned To", "Status", "Due Date", "Parts Shortage"],
            calculator.Backlog().Select(row => (object?[])
            [
                row.Priority, row.WorkOrderId, row.WorkType, row.AssetId, row.AssetName, row.Location, row.AgeDays, row.AssignedTo, row.Status, row.DueDate,
                row.PartsShortage ? "Yes" : "No"
            ]));

        AddSheet(workbook, "Technicians", ["Technician", "Assigned", "Completed", "First-Time Fix Rate (%)", "Avg. Response (hrs)", "SLA Compliance (%)"],
            calculator.Technicians().Select(row => (object?[])
            [
                row.Technician, row.Assigned, row.Completed, row.FirstTimeFixRate, row.AvgResponseHours, row.SlaCompliance
            ]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"maintenance-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(MaintenanceAnalyticsRequest request, Func<MaintenanceAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new MaintenanceAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>
    /// Applies the saved view, then the query values, checks them and reads the records.
    /// dates replaces the date range (Compare Periods); the other filters stay the same.
    /// </summary>
    private static async Task<(MaintenanceAnalyticsCalculator? Calculator, MaintenanceAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        MaintenanceAnalyticsRequest request,
        DashboardFiltersRequest? dates)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new AssetPerformanceFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(MaintenanceAnalyticsOptions.AllMaintenanceViewId, StringComparison.OrdinalIgnoreCase))
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
                    : saved.DatePreset ?? MaintenanceAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        var maintenanceType = Pick(request.MaintenanceType, saved.MaintenanceType);
        if (maintenanceType is not null && !MaintenanceAnalyticsOptions.MaintenanceTypes.IsValid(maintenanceType))
        {
            errors["MaintenanceType"] = [$"MaintenanceType must be one of: {string.Join(", ", MaintenanceAnalyticsOptions.MaintenanceTypes.All)}"];
        }

        if (request.ComplianceTarget is < 0 or > 100)
        {
            errors["ComplianceTarget"] = ["ComplianceTarget must be between 0 and 100"];
        }

        if (request.FailureHealthThreshold is < 0 or > 100)
        {
            errors["FailureHealthThreshold"] = ["FailureHealthThreshold must be between 0 and 100"];
        }

        if (request.EmergencyCostTarget is < 0)
        {
            errors["EmergencyCostTarget"] = ["EmergencyCostTarget must be 0 or more"];
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
        var settings = new MaintenanceAnalyticsSettings(
            MaintenanceAnalyticsOptions.MaintenanceTypes.Normalize(maintenanceType),
            request.ComplianceTarget ?? MaintenanceAnalyticsOptions.DefaultComplianceTarget,
            request.EmergencyCostTarget,
            request.FailureHealthThreshold ?? MaintenanceAnalyticsOptions.DefaultFailureHealthThreshold);

        var calculator = await MaintenanceAnalyticsCalculator.LoadAsync(request.DataRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new MaintenanceAnalyticsAppliedFilters(
            viewId ?? MaintenanceAnalyticsOptions.AllMaintenanceViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            scope.AssetType,
            settings.MaintenanceType,
            settings.ComplianceTarget,
            settings.EmergencyCostTarget,
            settings.FailureHealthThreshold), null);
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
