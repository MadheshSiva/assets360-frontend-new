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
/// Reports &amp; Analytics / WIP / Production Analytics: production output, work in progress, equipment utilization, OEE, downtime and
/// bottlenecks worked out from live WIP jobs, tasks, material consumption and downtime records. Data endpoints take the filter bar as query values.
/// </summary>
public static class ProductionAnalyticsEndpoints
{
    internal const string EntityType = "ProductionAnalyticsView";
    private const string BasePath = "/api/production-analytics";
    private const string SequenceName = "production_analytics_view";
    private const string Page = AssetPerformanceViewRepository.ProductionAnalyticsPage;

    public static RouteGroupBuilder MapProductionAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("WIP / Production Analytics");

        // Page furniture: dropdown values and the Organization / Plant / Production Line / Work Center / Product filters.
        group.MapGet("/options", GetOptions).WithName("GetProductionAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetProductionAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetProductionAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateProductionAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateProductionAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteProductionAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetProductionAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetProductionAnalyticsSummary");
        group.MapGet("/output-trend", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.OutputTrend())).WithName("GetProductionOutputTrend");
        group.MapGet("/wip-by-stage", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.WipByStage())).WithName("GetWipByProductionStage");
        group.MapGet("/work-order-status", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.WorkOrderStatus())).WithName("GetProductionWorkOrderStatus");
        group.MapGet("/utilization-by-line", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.UtilizationByLine())).WithName("GetEquipmentUtilizationByLine");
        group.MapGet("/downtime-by-cause", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.DowntimeByCause())).WithName("GetProductionDowntimeByCause");
        group.MapGet("/efficiency-trend", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.EfficiencyTrend())).WithName("GetProductionEfficiencyTrend");
        group.MapGet("/insights", ([AsParameters] ProductionAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetProductionInsights");
        group.MapGet("/orders", GetOrdersAsync).WithName("GetActiveProductionOrders");
        group.MapGet("/bottlenecks", GetBottlenecksAsync).WithName("GetBottleneckWorkCenters");

        // Compare Periods and Export.
        group.MapGet("/compare-periods", ComparePeriodsAsync).WithName("CompareProductionPeriods");
        group.MapGet("/export", ExportAsync).WithName("ExportProductionAnalytics");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new ProductionAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        ProductionAnalyticsOptions.DefaultDatePreset,
        ProductionAnalyticsOptions.Statuses.All,
        ProductionAnalyticsOptions.Stages.All,
        ProductionAnalyticsOptions.Schedules.All,
        ProductionAnalyticsCalculator.DowntimeCauses,
        ProductionAnalyticsOptions.Risks.All,
        ProductionAnalyticsOptions.OrderSortFields.All,
        ProductionAnalyticsOptions.ExportFormats.All,
        ProductionAnalyticsOptions.DefaultUtilizationTarget,
        ProductionAnalyticsOptions.DefaultAtRiskGap));

    /// <summary>Organizations, plus the plants, production lines, work centres and products found on production orders.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var scope = new DashboardDataScope(Tenant(tenantId, currentUser), Client(clientId, currentUser), null, null, null);
        return Results.Ok(await ProductionAnalyticsCalculator.FilterOptionsAsync(dataRepository, scope, cancellationToken));
    }

    /// <summary>The built-in All Production view first, then the user's saved views.</summary>
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

        return Results.Ok(new[] { ProductionAnalyticsViewResponse.AllProduction(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(ProductionAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveProductionAnalyticsViewRequest request,
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
            ViewId = $"PAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
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

        return Results.Created($"{BasePath}/views/{view.ViewId}", ProductionAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveProductionAnalyticsViewRequest request,
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

        return Results.Ok(ProductionAnalyticsViewResponse.FromEntity(view));
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
        [AsParameters] ProductionAnalyticsRequest request,
        int ordersSize = ProductionAnalyticsOptions.DefaultPageSize,
        int bottleneckLimit = ProductionAnalyticsOptions.DefaultBottleneckLimit)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var orders = calculator.ActiveOrders();

        return Results.Ok(new ProductionAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.OutputTrend(),
            calculator.WipByStage(),
            calculator.WorkOrderStatus(),
            calculator.UtilizationByLine(),
            calculator.Insights(),
            calculator.DowntimeByCause(),
            calculator.EfficiencyTrend(),
            orders.Take(Math.Clamp(ordersSize, 0, ProductionAnalyticsOptions.MaxPageSize)).ToList(),
            orders.Count,
            calculator.Bottlenecks().Take(Math.Clamp(bottleneckLimit, 0, ProductionAnalyticsOptions.MaxBottleneckLimit)).ToList()));
    }

    /// <summary>
    /// Active Production Orders: every unfinished order. schedule takes one or more of Delayed, At Risk, On Track (comma separated) and,
    /// with stage, backs the insight buttons. sortBy is one of /options orderSortFields (default schedule: delayed first, then by due date).
    /// </summary>
    private static async Task<IResult> GetOrdersAsync(
        [AsParameters] ProductionAnalyticsRequest request,
        string? search = null,
        string? status = null,
        string? stage = null,
        string? schedule = null,
        string? priority = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = ProductionAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, ProductionAnalyticsOptions.Statuses);
        CheckOption(errors, "Stage", stage, ProductionAnalyticsOptions.Stages);
        CheckOption(errors, "SortBy", sortBy, ProductionAnalyticsOptions.OrderSortFields);
        var schedules = (schedule ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        foreach (var value in schedules.Where(value => !ProductionAnalyticsOptions.Schedules.IsValid(value)))
        {
            errors["Schedule"] = [$"Schedule must be one or more of: {string.Join(", ", ProductionAnalyticsOptions.Schedules.All)}"];
        }

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

        IEnumerable<ProductionOrderRow> rows = calculator.ActiveOrders();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.OrderNo, row.Product, row.Line, row.WorkCenter, row.AssetId }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (ProductionAnalyticsOptions.Statuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(row => row.Status == statusValue);
        }

        if (ProductionAnalyticsOptions.Stages.Normalize(stage) is { } stageValue)
        {
            rows = rows.Where(row => row.Stage == stageValue);
        }

        if (schedules.Count > 0)
        {
            var wanted = schedules.Select(value => ProductionAnalyticsOptions.Schedules.Normalize(value)!).ToHashSet();
            rows = rows.Where(row => wanted.Contains(row.Schedule));
        }

        if (!string.IsNullOrWhiteSpace(priority))
        {
            rows = rows.Where(row => string.Equals(row.Priority?.Trim(), priority.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        var field = ProductionAnalyticsOptions.OrderSortFields.Normalize(sortBy);
        if (field is not null && field != "schedule" || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<ProductionOrderRow, object?> key = field switch
            {
                "dueDate" => row => row.DueDate,
                "orderNo" => row => row.OrderNo,
                "product" => row => row.Product,
                "line" => row => row.Line,
                "progress" => row => row.Progress,
                "wipQty" => row => row.WipQty,
                "wipValue" => row => row.WipValue,
                "status" => row => row.Status,
                _ => row => ProductionAnalyticsCalculator.Schedules.ToList().IndexOf(row.Schedule)
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > ProductionAnalyticsOptions.MaxPageSize ? ProductionAnalyticsOptions.DefaultPageSize : pageSize;

        return Results.Ok(new ProductionOrdersResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>Bottleneck Work Centers: highest risk first; risk narrows to High, Medium or Low; limit caps the rows (default 5).</summary>
    private static async Task<IResult> GetBottlenecksAsync(
        [AsParameters] ProductionAnalyticsRequest request,
        string? risk = null,
        int limit = ProductionAnalyticsOptions.DefaultBottleneckLimit)
    {
        if (!string.IsNullOrWhiteSpace(risk) && !ProductionAnalyticsOptions.Risks.IsValid(risk))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Risk"] = [$"Risk must be one of: {string.Join(", ", ProductionAnalyticsOptions.Risks.All)}"]
            });
        }

        var wanted = ProductionAnalyticsOptions.Risks.Normalize(risk);
        return await Section(request, calculator => calculator.Bottlenecks()
            .Where(row => wanted is null || row.Risk == wanted)
            .Take(Math.Clamp(limit, 1, ProductionAnalyticsOptions.MaxBottleneckLimit))
            .ToList());
    }

    /// <summary>
    /// Compare Periods: the KPIs of the selected period against another one, given as compareFrom / compareTo or comparePreset.
    /// Without either, the previous period of the same length is used.
    /// </summary>
    private static async Task<IResult> ComparePeriodsAsync(
        [AsParameters] ProductionAnalyticsRequest request,
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
            ("Production Output", current.ProductionOutput, other.ProductionOutput, true),
            ("WIP Value", current.WipValue, other.WipValue, true),
            ("On-Time Completion", current.OnTimeCompletion, other.OnTimeCompletion, false),
            ("Equipment Utilization", current.EquipmentUtilization, other.EquipmentUtilization, false),
            ("Overall Equipment Effectiveness", current.Oee, other.Oee, false)
        ];

        return Results.Ok(new ProductionPeriodComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(period),
            DashboardPeriodResponse.FromPeriod(compare.Period),
            current.OutputUnit,
            metrics.Select(metric =>
            {
                var kpi = DashboardWidgetCalculator.Kpi(metric.Value.Value, metric.Compare.Value, metric.Value.Format, metric.PercentChange);
                return new PeriodComparisonItem(metric.Name, kpi.Format, kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit, kpi.Trend);
            }).ToList(),
            calculator.OutputTrend(),
            compare.OutputTrend()));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] ProductionAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !ProductionAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", ProductionAnalyticsOptions.ExportFormats.All)}"]
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
        var wip = calculator.WipByStage();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Plant", filters.Plant ?? "All plants", null, null, null],
            ["Production Line", filters.ProductionLine ?? "All production lines", null, null, null],
            ["Work Center", filters.WorkCenter ?? "All work centers", null, null, null],
            ["Product", filters.Product ?? "All products", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ($"Production Output ({summary.OutputUnit})", summary.ProductionOutput),
                ("WIP Value", summary.WipValue),
                ("On-Time Completion (%)", summary.OnTimeCompletion),
                ("Equipment Utilization (%)", summary.EquipmentUtilization),
                ("OEE (%)", summary.Oee)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Output Trend", calculator.OutputTrend());
        AddSeriesSheet(workbook, "WIP by Stage", wip.Trend);
        AddSheet(workbook, "Work Order Status", ["Status", "Orders", "Percentage"],
            calculator.WorkOrderStatus().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSheet(workbook, "Utilization by Line", ["Line", "Work Centers", "Utilization (%)", "Target (%)", "Meets Target"],
            calculator.UtilizationByLine().Select(line => (object?[])
            [
                line.Line, line.WorkCenters, line.Utilization, line.Target, line.MeetsTarget is null ? null : line.MeetsTarget.Value ? "Yes" : "No"
            ]));
        AddSheet(workbook, "Downtime by Cause", ["Cause", "Hours", "Percentage"],
            calculator.DowntimeByCause().Causes.Select(cause => (object?[])[cause.Cause, cause.Hours, cause.Percentage]));
        AddSeriesSheet(workbook, "Efficiency Trend", calculator.EfficiencyTrend());

        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Value", "Orders / Lines"],
            calculator.Insights().Select(insight => (object?[])
            [
                insight.Title,
                insight.Message,
                insight.Count,
                insight.Value,
                string.Join(", ", insight.Orders.Select(order => order.OrderNo ?? order.Id).Concat(insight.Lines))
            ]));

        AddSheet(workbook, "Active Orders",
            ["Order No", "Product", "Plant", "Line", "Work Center", "Planned Qty", "Completed Qty", "WIP Qty", "Progress (%)", "Due Date", "Status", "Stage", "Schedule", "WIP Value"],
            calculator.ActiveOrders().Select(row => (object?[])
            [
                row.OrderNo, row.Product, row.Plant, row.Line, row.WorkCenter, row.PlannedQty, row.CompletedQty, row.WipQty, row.Progress, row.DueDate,
                row.Status, row.Stage, row.Schedule, row.WipValue
            ]));

        AddSheet(workbook, "Bottlenecks", ["Work Center", "Line", "Queue", "In Progress", "Avg. Wait (days)", "Utilization (%)", "Risk"],
            calculator.Bottlenecks().Select(row => (object?[])[row.WorkCenter, row.Line, row.Queue, row.InProgress, row.AvgWaitDays, row.Utilization, row.Risk]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"production-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(ProductionAnalyticsRequest request, Func<ProductionAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new ProductionAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>
    /// Applies the saved view, then the query values, checks them and reads the records.
    /// dates replaces the date range (Compare Periods); the other filters stay the same.
    /// </summary>
    private static async Task<(ProductionAnalyticsCalculator? Calculator, ProductionAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        ProductionAnalyticsRequest request,
        DashboardFiltersRequest? dates)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new AssetPerformanceFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(ProductionAnalyticsOptions.AllProductionViewId, StringComparison.OrdinalIgnoreCase))
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
                    : saved.DatePreset ?? ProductionAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        if (request.UtilizationTarget is < 0 or > 100)
        {
            errors["UtilizationTarget"] = ["UtilizationTarget must be between 0 and 100"];
        }

        if (request.OutputTarget is < 0)
        {
            errors["OutputTarget"] = ["OutputTarget must be 0 or more"];
        }

        if (request.AtRiskGap is < 0 or > 100)
        {
            errors["AtRiskGap"] = ["AtRiskGap must be between 0 and 100"];
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

        // Plant, line, work centre and product narrow the orders themselves; the organization narrows their assets.
        var scope = new DashboardDataScope(
            Tenant(request.TenantId, currentUser),
            Client(request.ClientId, currentUser),
            Pick(request.Organization, saved.Organization),
            null,
            null);
        var settings = new ProductionAnalyticsSettings(
            Pick(request.Plant, saved.Location),
            Pick(request.ProductionLine, saved.ProductionLine),
            Pick(request.WorkCenter, saved.WorkCenter),
            Pick(request.Product, saved.Product),
            request.UtilizationTarget ?? ProductionAnalyticsOptions.DefaultUtilizationTarget,
            request.OutputTarget,
            request.AtRiskGap ?? ProductionAnalyticsOptions.DefaultAtRiskGap);

        var calculator = await ProductionAnalyticsCalculator.LoadAsync(request.DataRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new ProductionAnalyticsAppliedFilters(
            viewId ?? ProductionAnalyticsOptions.AllProductionViewId,
            scope.Organization,
            settings.Plant,
            settings.ProductionLine,
            settings.WorkCenter,
            settings.Product,
            settings.UtilizationTarget,
            settings.OutputTarget,
            settings.AtRiskGap), null);
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
