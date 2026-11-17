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

/// <summary>
/// Reports &amp; Analytics / Inventory Analytics: stock value, items, turnover, reorder risk, slow-moving stock, warehouse utilization,
/// consumption and suppliers worked out from MDM inventory masters (items, warehouses, stores, bins, suppliers), Maintenance spare parts,
/// WIP material consumption and work order parts. Data endpoints take the filter bar as query values.
/// </summary>
public static class InventoryAnalyticsEndpoints
{
    internal const string EntityType = "InventoryAnalyticsView";
    internal const string RequestEntityType = "InventoryAnalyticsActionRequest";
    internal const string Page = "inventory-analytics";
    private const string BasePath = "/api/inventory-analytics";
    private const string SequenceName = "inventory_analytics_view";
    private const string PurchaseRequestSequence = "inventory_analytics_purchase_request";
    private const string ActionPlanSequence = "inventory_analytics_action_plan";

    public static RouteGroupBuilder MapInventoryAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Inventory Analytics");

        // Page furniture: dropdown values and the Organization / Location / Warehouse / Store / Category filters.
        group.MapGet("/options", GetOptions).WithName("GetInventoryAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetInventoryAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetInventoryAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateInventoryAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateInventoryAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteInventoryAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetInventoryAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetInventoryAnalyticsSummary");
        group.MapGet("/value-trend", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.ValueTrend())).WithName("GetInventoryValueTrend");
        group.MapGet("/stock-by-category", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.StockByCategory())).WithName("GetInventoryStockByCategory");
        group.MapGet("/stock-status", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.StockStatus())).WithName("GetInventoryStockStatus");
        group.MapGet("/consumption-trend", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.ConsumptionTrend())).WithName("GetInventoryConsumptionTrend");
        group.MapGet("/warehouse-utilization", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.Warehouses())).WithName("GetInventoryWarehouseUtilization");
        group.MapGet("/critical-at-risk", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.CriticalAtRisk())).WithName("GetInventoryCriticalAtRisk");
        group.MapGet("/slow-moving", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.SlowMoving())).WithName("GetInventorySlowMoving");
        group.MapGet("/suppliers", ([AsParameters] InventoryAnalyticsRequest request) => Section(request, calculator => calculator.Suppliers())).WithName("GetInventorySuppliers");
        group.MapGet("/reorder", GetReorderAsync).WithName("GetInventoryItemsBelowReorder");

        // Compare Periods and Export.
        group.MapGet("/compare-periods", ComparePeriodsAsync).WithName("CompareInventoryPeriods");
        group.MapGet("/export", ExportAsync).WithName("ExportInventoryAnalytics");

        // Create Purchase Request / Create Action Plan.
        group.MapGet("/requests", GetRequestsAsync).WithName("GetInventoryActionRequests");
        group.MapGet("/requests/{requestId}", GetRequestAsync).WithName("GetInventoryActionRequest");
        group.MapPost("/requests", CreateRequestAsync).WithName("CreateInventoryActionRequest");
        group.MapPut("/requests/{requestId}", UpdateRequestAsync).WithName("UpdateInventoryActionRequest");
        group.MapDelete("/requests/{requestId}", DeleteRequestAsync).WithName("DeleteInventoryActionRequest");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new InventoryAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        InventoryAnalyticsOptions.DefaultDatePreset,
        InventoryAnalyticsOptions.StockStatuses.All,
        InventoryAnalyticsOptions.Risks.All,
        InventoryAnalyticsOptions.ReorderSortFields.All,
        InventoryAnalyticsOptions.ExportFormats.All,
        InventoryAnalyticsOptions.RequestTypes.All,
        InventoryAnalyticsOptions.RequestPriorities.All,
        InventoryAnalyticsOptions.RequestStatuses.All,
        InventoryAnalyticsOptions.DefaultSlowMovingDays,
        InventoryAnalyticsOptions.DefaultUsageWindowDays));

    /// <summary>
    /// Organizations, locations (warehouse sites), warehouses, stores and item categories. Warehouses are limited to the organization /
    /// location given and stores to the warehouse given, so the dropdowns cascade.
    /// </summary>
    private static async Task<IResult> GetFiltersAsync(
        IInventoryAnalyticsDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? organization = null,
        string? location = null,
        string? warehouse = null,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        organization = InteractiveDashboardMappings.FilterValue(organization);
        location = InteractiveDashboardMappings.FilterValue(location);
        warehouse = InteractiveDashboardMappings.FilterValue(warehouse);

        var organizations = await dataRepository.GetOrganizationNamesAsync(tenant, client, cancellationToken);
        var warehouses = await dataRepository.GetWarehousesAsync(tenant, client, cancellationToken);
        var stores = await dataRepository.GetStoresAsync(tenant, client, cancellationToken);
        var stock = await dataRepository.GetStockAsync(tenant, client, cancellationToken);
        var categories = (await dataRepository.GetItemCategoriesAsync(tenant, client, cancellationToken))
            .Concat(stock.Select(record => record.Category).OfType<string>().Where(category => !string.IsNullOrWhiteSpace(category)).Select(category => category.Trim()))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(category => category, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var sites = organization is null ? null : await dataRepository.GetOrganizationSitesAsync(tenant, client, organization, cancellationToken);

        static bool Same(string? left, string? right) =>
            left is not null && right is not null && string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
        bool AtSite(InventoryWarehouseRecord record, string site) => Same(record.Location, site) || Same(record.City, site);

        var siteScoped = warehouses
            .Where(record => sites is null || sites.Found && sites.Sites.Any(site => AtSite(record, site)))
            .ToList();
        var scoped = siteScoped.Where(record => location is null || AtSite(record, location)).ToList();
        var storeScope = warehouse is null
            ? scoped
            : scoped.Where(record => Same(record.Name, warehouse) || Same(record.Code, warehouse) || Same(record.Id, warehouse)).ToList();

        return Results.Ok(new InventoryAnalyticsFilterOptionsResponse(
            organizations.Select(name => new DashboardOption(name, name)).ToList(),
            siteScoped.Select(record => record.Location ?? record.City).OfType<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(site => site, StringComparer.OrdinalIgnoreCase)
                .Select(site => new DashboardOption(site, site))
                .ToList(),
            scoped.OrderBy(record => record.Name, StringComparer.OrdinalIgnoreCase)
                .Select(record => new InventoryWarehouseOption(record.Name, record.Name, record.Code, record.Location ?? record.City))
                .ToList(),
            stores.Where(store => storeScope.Any(record => Same(record.Id, store.WarehouseId) || Same(record.Name, store.WarehouseName)))
                .OrderBy(store => store.Name, StringComparer.OrdinalIgnoreCase)
                .Select(store => new InventoryStoreOption(store.Name, store.Name, store.Code, store.WarehouseName))
                .ToList(),
            categories.Select(category => new DashboardOption(category, category)).ToList(),
            InventoryAnalyticsOptions.StockStatuses.All));
    }

    /// <summary>The built-in All Inventory view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IInventoryAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<InventoryAnalyticsView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { InventoryAnalyticsViewResponse.AllInventory(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(InventoryAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveInventoryAnalyticsViewRequest request,
        IInventoryAnalyticsViewRepository repository,
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
        var view = new InventoryAnalyticsView
        {
            ViewId = $"IAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
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
            await repository.ClearDefaultAsync(viewerId, tenantId, clientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{view.ViewId}", InventoryAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveInventoryAnalyticsViewRequest request,
        IInventoryAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != viewerId)
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
            await repository.ClearDefaultAsync(viewerId, view.TenantId, view.ClientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Updated, cancellationToken);

        return Results.Ok(InventoryAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IInventoryAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser())
            || !await repository.DeleteAsync(view.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] InventoryAnalyticsRequest request,
        int reorderSize = InventoryAnalyticsOptions.DefaultOverviewRows,
        int slowSize = InventoryAnalyticsOptions.DefaultOverviewRows)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var reorder = calculator.Reorder();
        var slow = calculator.SlowMoving();

        return Results.Ok(new InventoryAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.ValueTrend(),
            calculator.StockByCategory(),
            calculator.StockStatus(),
            calculator.ConsumptionTrend(),
            calculator.Warehouses(),
            reorder.Take(Math.Clamp(reorderSize, 0, InventoryAnalyticsOptions.MaxPageSize)).ToList(),
            reorder.Count,
            calculator.CriticalAtRisk(),
            slow with { Items = slow.Items.Take(Math.Clamp(slowSize, 0, InventoryAnalyticsOptions.MaxPageSize)).ToList() },
            calculator.Suppliers()));
    }

    /// <summary>
    /// Items Below Reorder Level, highest risk first. risk, critical and supplier narrow the list (critical=true with risk=High backs the
    /// "critical spare parts" insight); sortBy is one of /options reorderSortFields.
    /// </summary>
    private static async Task<IResult> GetReorderAsync(
        [AsParameters] InventoryAnalyticsRequest request,
        string? search = null,
        string? risk = null,
        bool? critical = null,
        string? supplier = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = InventoryAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Risk", risk, InventoryAnalyticsOptions.Risks);
        CheckOption(errors, "SortBy", sortBy, InventoryAnalyticsOptions.ReorderSortFields);
        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (page < 1)
        {
            errors["Page"] = ["Page must be 1 or more"];
        }

        if (pageSize < 1 || pageSize > InventoryAnalyticsOptions.MaxPageSize)
        {
            errors["PageSize"] = [$"PageSize must be between 1 and {InventoryAnalyticsOptions.MaxPageSize}"];
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

        IEnumerable<InventoryReorderRow> rows = calculator.Reorder();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.Code, row.Name, row.Category, row.WarehouseName, row.Store, row.Supplier }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (InventoryAnalyticsOptions.Risks.Normalize(risk) is { } riskValue)
        {
            rows = rows.Where(row => row.Risk == riskValue);
        }

        if (critical is { } isCritical)
        {
            rows = rows.Where(row => row.Critical == isCritical);
        }

        if (!string.IsNullOrWhiteSpace(supplier))
        {
            rows = rows.Where(row => string.Equals(row.Supplier?.Trim(), supplier.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        var field = InventoryAnalyticsOptions.ReorderSortFields.Normalize(sortBy);
        if (field is not null && field != "risk" || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<InventoryReorderRow, object?> key = field switch
            {
                "code" => row => row.Code,
                "name" => row => row.Name,
                "category" => row => row.Category,
                "warehouseName" => row => row.WarehouseName,
                "available" => row => row.Available,
                "reorderLevel" => row => row.ReorderLevel,
                "daysCover" => row => row.DaysCover,
                "supplier" => row => row.Supplier,
                _ => row => row.RiskRank
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();

        return Results.Ok(new InventoryReorderResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>
    /// Compare Periods: the KPIs and monthly issue value of the selected period against another one, given as compareFrom / compareTo or
    /// comparePreset. Without either, the previous period of the same length is used. Stock value and below-reorder counts are snapshots,
    /// so their comparison value is null.
    /// </summary>
    private static async Task<IResult> ComparePeriodsAsync(
        [AsParameters] InventoryAnalyticsRequest request,
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
        (string Name, KpiWidgetData Value, double? Compare)[] metrics =
        [
            ("Total Inventory Value", current.TotalValue, null),
            ("Stock Items", current.StockItems, current.StockItems.PreviousValue),
            ("Inventory Turnover", current.Turnover, other.Turnover.Value),
            ("Items Below Reorder", current.BelowReorder, null),
            ("Stock Accuracy", current.StockAccuracy, null)
        ];

        return Results.Ok(new InventoryPeriodComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(period),
            DashboardPeriodResponse.FromPeriod(compare.Period),
            metrics.Select(metric =>
            {
                var kpi = DashboardWidgetCalculator.Kpi(metric.Value.Value, metric.Compare, metric.Value.Format, percentChange: true);
                return new PeriodComparisonItem(metric.Name, kpi.Format, kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit, kpi.Trend);
            }).ToList(),
            calculator.ValueTrend().Trend,
            compare.ValueTrend().Trend));
    }

    /// <summary>
    /// Export: format=xlsx (default) is a workbook with a sheet per page section; format=csv is one section, picked with
    /// section=reorder (default), slow-moving, suppliers or warehouses.
    /// </summary>
    private static async Task<IResult> ExportAsync([AsParameters] InventoryAnalyticsRequest request, string? format = null, string? section = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Format", format, InventoryAnalyticsOptions.ExportFormats);
        CheckOption(errors, "Section", section, CsvSections);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var sheets = Sheets(calculator);

        if (InventoryAnalyticsOptions.ExportFormats.Normalize(format) == "csv")
        {
            var name = CsvSections.Normalize(section) ?? "reorder";
            var sheet = sheets.First(item => item.Key == name);
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", sheet.Headers.Select(Csv)));
            foreach (var row in sheet.Rows)
            {
                csv.AppendLine(string.Join(",", row.Select(value => Csv(value switch
                {
                    null => string.Empty,
                    DateTime date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
                    _ => value.ToString() ?? string.Empty
                }))));
            }

            return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"inventory-analytics-{name}-{generatedAt:yyyyMMddHHmmss}.csv");
        }

        var period = calculator.Period;
        var summary = calculator.Summary();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Warehouse", filters.Warehouse ?? "All warehouses", null, null, null],
            ["Store / Bin", filters.Store ?? "All stores / bins", null, null, null],
            ["Item Category", filters.Category ?? "All categories", null, null, null],
            ["Stock Status", filters.StockStatus ?? "All stock status", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Total Inventory Value", summary.TotalValue),
                ("Stock Items", summary.StockItems),
                ("Inventory Turnover (x)", summary.Turnover),
                ("Items Below Reorder", summary.BelowReorder),
                ("Stock Accuracy (%)", summary.StockAccuracy)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Value Trend", calculator.ValueTrend().Trend);
        AddSheet(workbook, "Stock by Category", ["Category", "Items", "Units", "Value"],
            calculator.StockByCategory().Categories.Select(item => (object?[])[item.Category, item.Items, item.Units, item.Value]));
        AddSheet(workbook, "Stock Status", ["Status", "Items", "Percentage"],
            calculator.StockStatus().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSeriesSheet(workbook, "Consumption", calculator.ConsumptionTrend().Trend);

        foreach (var sheet in sheets)
        {
            AddSheet(workbook, sheet.Title, sheet.Headers, sheet.Rows);
        }

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"inventory-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static readonly OptionList CsvSections = new("reorder", "slow-moving", "suppliers", "warehouses");

    private sealed record ExportSheet(string Key, string Title, IReadOnlyList<string> Headers, IReadOnlyList<object?[]> Rows);

    private static IReadOnlyList<ExportSheet> Sheets(InventoryAnalyticsCalculator calculator) =>
    [
        new("reorder", "Below Reorder",
            ["Item Code", "Item Name", "Category", "Warehouse", "Store", "Available", "Reorder Level", "Suggested Qty", "Daily Usage", "Days of Cover", "Supplier", "Risk", "Critical"],
            calculator.Reorder().Select(row => (object?[])
            [
                row.Code, row.Name, row.Category, row.WarehouseName, row.Store, row.Available, row.ReorderLevel, row.SuggestedQuantity, row.DailyUsage,
                row.DaysCover, row.Supplier, row.Risk, row.Critical ? "Yes" : "No"
            ]).ToList()),
        new("slow-moving", "Slow Moving",
            ["Item Code", "Item Name", "Category", "Warehouse", "Store", "Qty", "Value", "Days Since Issue", "Last Issued"],
            calculator.SlowMoving().Items.Select(row => (object?[])
            [
                row.Code, row.Name, row.Category, row.WarehouseName, row.Store, row.Quantity, row.Value, row.DaysSinceIssue, row.LastIssuedAt
            ]).ToList()),
        new("warehouses", "Warehouses",
            ["Code", "Warehouse", "Site", "Utilization (%)", "Utilization Basis", "Items", "Units", "Value", "Below Reorder", "Stores", "Keeper"],
            calculator.Warehouses().Select(row => (object?[])
            [
                row.Code, row.Name, row.Site, row.Utilization, row.UtilizationBasis, row.Items, row.Units, row.Value, row.BelowReorder,
                string.Join(", ", row.Stores), row.Keeper
            ]).ToList()),
        new("suppliers", "Suppliers",
            ["Supplier", "Code", "Category", "Items", "Stock Value", "Below Reorder", "Rating", "Preferred"],
            calculator.Suppliers().Select(row => (object?[])
            [
                row.Name, row.Code, row.Category, row.Items, row.StockValue, row.BelowReorder, row.Rating, row.Preferred ? "Yes" : "No"
            ]).ToList())
    ];

    // ----- Purchase requests and action plans -----

    private static async Task<IResult> GetRequestsAsync(
        IInventoryAnalyticsActionRequestRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? requestType = null,
        string? status = null,
        string? tenantId = null,
        string? clientId = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "RequestType", requestType, InventoryAnalyticsOptions.RequestTypes);
        CheckOption(errors, "Status", status, InventoryAnalyticsOptions.RequestStatuses);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var list = await repository.GetListAsync(
            Tenant(tenantId, currentUser),
            Client(clientId, currentUser),
            InventoryAnalyticsOptions.RequestTypes.Normalize(requestType),
            InventoryAnalyticsOptions.RequestStatuses.Normalize(status),
            cancellationToken);

        return Results.Ok(list.Select(InventoryActionRequestResponse.FromEntity).ToList());
    }

    private static async Task<IResult> GetRequestAsync(string requestId, IInventoryAnalyticsActionRequestRepository repository, CancellationToken cancellationToken) =>
        await repository.GetByRequestIdAsync(requestId, cancellationToken) is { } request
            ? Results.Ok(InventoryActionRequestResponse.FromEntity(request))
            : Results.NotFound();

    private static async Task<IResult> CreateRequestAsync(
        SaveInventoryActionRequest request,
        IInventoryAnalyticsActionRequestRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate(null);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var type = InventoryAnalyticsOptions.RequestTypes.Normalize(request.RequestType)!;
        var purchase = type == InventoryAnalyticsOptions.PurchaseRequestType;
        var utcNow = DateTime.UtcNow;
        var sequence = await sequenceGenerator.GetNextValueAsync(purchase ? PurchaseRequestSequence : ActionPlanSequence, cancellationToken);
        var entity = new InventoryAnalyticsActionRequest
        {
            RequestId = $"{(purchase ? "PR" : "AP")}-{utcNow:yyyy}-{sequence:D5}",
            RequestType = type,
            OwnerId = CustomReportAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            Status = InventoryAnalyticsOptions.RequestStatuses.Normalize(request.Status) ?? InventoryAnalyticsOptions.OpenStatus,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = Tenant(request.TenantId, currentUser),
            ClientId = Client(request.ClientId, currentUser),
            IsDeleted = false
        };
        Apply(entity, request);

        entity = await repository.CreateAsync(entity, cancellationToken);
        await eventLogger.LogAsync(RequestEntityType, entity.Id, $"{entity.RequestId} {entity.Title}", EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/requests/{entity.RequestId}", InventoryActionRequestResponse.FromEntity(entity));
    }

    private static async Task<IResult> UpdateRequestAsync(
        string requestId,
        SaveInventoryActionRequest request,
        IInventoryAnalyticsActionRequestRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var entity = await repository.GetByRequestIdAsync(requestId, cancellationToken);
        if (entity is null)
        {
            return Results.NotFound();
        }

        var errors = request.Validate(entity);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        Apply(entity, request);
        entity.Status = InventoryAnalyticsOptions.RequestStatuses.Normalize(request.Status) ?? entity.Status;
        entity.UpdatedBy = currentUserAccessor.GetCurrentUser()?.UserName;
        entity.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(entity.Id, entity, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(RequestEntityType, entity.Id, $"{entity.RequestId} {entity.Title}", EventAction.Updated, cancellationToken);

        return Results.Ok(InventoryActionRequestResponse.FromEntity(entity));
    }

    private static async Task<IResult> DeleteRequestAsync(
        string requestId,
        IInventoryAnalyticsActionRequestRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var entity = await repository.GetByRequestIdAsync(requestId, cancellationToken);
        if (entity is null || !await repository.DeleteAsync(entity.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(RequestEntityType, entity.Id, $"{entity.RequestId} {entity.Title}", EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static void Apply(InventoryAnalyticsActionRequest entity, SaveInventoryActionRequest request)
    {
        static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        entity.Title = request.Title!.Trim();
        entity.ItemCodes = (request.ItemCodes ?? []).Select(Clean).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        entity.Quantity = request.Quantity;
        entity.Supplier = Clean(request.Supplier);
        entity.DueDate = request.DueDate?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        entity.Priority = InventoryAnalyticsOptions.RequestPriorities.Normalize(request.Priority) ?? "Medium";
        entity.Assignee = Clean(request.Assignee);
        entity.Notes = Clean(request.Notes);
        entity.Source = Clean(request.Source);
        entity.Warehouse = Clean(request.Warehouse);
    }

    // ----- Shared -----

    private static async Task<IResult> Section<T>(InventoryAnalyticsRequest request, Func<InventoryAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new InventoryAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>
    /// Applies the saved view, then the query values, checks them and reads the records.
    /// dates replaces the date range (Compare Periods); the other filters stay the same.
    /// </summary>
    private static async Task<(InventoryAnalyticsCalculator? Calculator, InventoryAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        InventoryAnalyticsRequest request,
        DashboardFiltersRequest? dates)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new InventoryAnalyticsFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(InventoryAnalyticsOptions.AllInventoryViewId, StringComparison.OrdinalIgnoreCase))
        {
            var view = await request.ViewRepository.GetByViewIdAsync(request.ViewId, request.CancellationToken);
            if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUser))
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
                    : saved.DatePreset ?? InventoryAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        var stockStatus = Pick(request.StockStatus, saved.StockStatus);
        if (stockStatus is not null && !InventoryAnalyticsOptions.StockStatuses.IsValid(stockStatus))
        {
            errors["StockStatus"] = [$"StockStatus must be one of: {string.Join(", ", InventoryAnalyticsOptions.StockStatuses.All)}"];
        }

        if (request.SlowMovingDays is < 1 or > InventoryAnalyticsOptions.MaxSlowMovingDays)
        {
            errors["SlowMovingDays"] = [$"SlowMovingDays must be between 1 and {InventoryAnalyticsOptions.MaxSlowMovingDays}"];
        }

        if (request.UsageWindowDays is < 1 or > InventoryAnalyticsOptions.MaxUsageWindowDays)
        {
            errors["UsageWindowDays"] = [$"UsageWindowDays must be between 1 and {InventoryAnalyticsOptions.MaxUsageWindowDays}"];
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

        var settings = new InventoryAnalyticsSettings(
            Tenant(request.TenantId, currentUser),
            Client(request.ClientId, currentUser),
            Pick(request.Organization, saved.Organization),
            Pick(request.Location, saved.Location),
            Pick(request.Warehouse, saved.Warehouse),
            Pick(request.Store, saved.Store),
            Pick(request.Category, saved.Category),
            InventoryAnalyticsOptions.StockStatuses.Normalize(stockStatus),
            request.SlowMovingDays ?? InventoryAnalyticsOptions.DefaultSlowMovingDays,
            request.UsageWindowDays ?? InventoryAnalyticsOptions.DefaultUsageWindowDays);

        var calculator = await InventoryAnalyticsCalculator.LoadAsync(request.DataRepository, period, settings, utcNow, request.CancellationToken);

        return (calculator, new InventoryAnalyticsAppliedFilters(
            viewId ?? InventoryAnalyticsOptions.AllInventoryViewId,
            settings.Organization,
            settings.Location,
            settings.Warehouse,
            settings.Store,
            settings.Category,
            settings.StockStatus,
            settings.SlowMovingDays,
            settings.UsageWindowDays), null);
    }

    private static async Task<bool> NameTakenAsync(
        IInventoryAnalyticsViewRepository repository,
        string? ownerId,
        string? tenantId,
        string? clientId,
        string name,
        string? exceptId,
        CancellationToken cancellationToken) =>
        (await repository.GetOwnedAsync(ownerId, tenantId, clientId, cancellationToken))
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

    private static string Csv(string value) =>
        value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;

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
