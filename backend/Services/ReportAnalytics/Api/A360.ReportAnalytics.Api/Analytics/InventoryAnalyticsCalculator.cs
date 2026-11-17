using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// The Inventory Analytics filter bar after the saved view and query values are applied (null means all). SlowMovingDays marks
/// stock not issued for that long; UsageWindowDays is the look-back used for daily usage and days of cover.
/// </summary>
public sealed record InventoryAnalyticsSettings(
    string? TenantId,
    string? ClientId,
    string? Organization,
    string? Location,
    string? Warehouse,
    string? Store,
    string? Category,
    string? StockStatus,
    int SlowMovingDays,
    int UsageWindowDays);

/// <summary>
/// KPIs. Total value, below-reorder and stock accuracy have no previous value: stock is a snapshot (no stock ledger is kept) and
/// no service records cycle counts, so StockAccuracy is always null. Turnover is the annualised value issued over the current stock value.
/// </summary>
public sealed record InventorySummary(
    KpiWidgetData TotalValue,
    KpiWidgetData StockItems,
    KpiWidgetData Turnover,
    KpiWidgetData BelowReorder,
    KpiWidgetData StockAccuracy,
    double TotalUnits);

/// <summary>Value issued per month (AED). Receipts and month-end values need a stock ledger, which Asset360 does not keep yet.</summary>
public sealed record InventoryValueTrend(PerformanceSeries Trend, double IssuedValue, double IssuedUnits, double CurrentValue);

public sealed record InventoryCategoryStock(string Category, int Items, double Units, double Value);

public sealed record InventoryStockByCategory(double TotalUnits, double TotalValue, IReadOnlyList<InventoryCategoryStock> Categories);

public sealed record InventoryDepartmentTotal(string Department, double Units, double Value);

/// <summary>Units issued per month by consuming department.</summary>
public sealed record InventoryConsumptionTrend(PerformanceSeries Trend, IReadOnlyList<InventoryDepartmentTotal> Departments);

/// <summary>
/// A warehouse in scope. Utilization is units held over bin capacity (Basis "Bin capacity"), else over the items' max stock
/// (Basis "Max stock"); null when neither is recorded. StockAccuracy is null: no cycle counts are recorded.
/// </summary>
public sealed record InventoryWarehouseRow(
    string Id,
    string Code,
    string Name,
    string? Site,
    double? Utilization,
    string? UtilizationBasis,
    int Items,
    double Units,
    double Value,
    int BelowReorder,
    IReadOnlyList<string> Stores,
    string? Keeper,
    double? StockAccuracy);

/// <summary>
/// An item at or below its reorder level. DaysCover is available ÷ daily usage over the usage window (null without usage).
/// Risk: High when out of stock or under 7 days of cover; Medium under 30 days, or no usage history and at most half the reorder level.
/// </summary>
public sealed record InventoryReorderRow(
    string Id,
    string Source,
    string Code,
    string Name,
    string Category,
    string? WarehouseCode,
    string? WarehouseName,
    string? Store,
    string? Site,
    double Available,
    double ReorderLevel,
    double SuggestedQuantity,
    double? DailyUsage,
    double? DaysCover,
    string? Supplier,
    string Risk,
    int RiskRank,
    bool Critical,
    double UnitCost);

/// <summary>Stock on hand not issued for SlowMovingDays or more (never-issued items count from when they were registered).</summary>
public sealed record InventorySlowRow(
    string Id,
    string Code,
    string Name,
    string Category,
    string? WarehouseName,
    string? Store,
    string? Site,
    double Quantity,
    double Value,
    int? DaysSinceIssue,
    DateTime? LastIssuedAt);

public sealed record InventorySlowMoving(int Total, double Value, int ThresholdDays, IReadOnlyList<InventorySlowRow> Items);

/// <summary>A supplier of stock in scope. Delivery and fill-rate figures need purchase orders, which Asset360 does not record yet.</summary>
public sealed record InventorySupplierRow(string Name, string? Code, string Category, int Items, double StockValue, int BelowReorder, double? Rating, bool Preferred);

/// <summary>Works out every Inventory Analytics section for one filter bar from a single read of the stock, masters and issues.</summary>
public sealed class InventoryAnalyticsCalculator
{
    public const string InStock = "In Stock";
    public const string BelowReorderStatus = "Below Reorder";
    public const string OutOfStock = "Out of Stock";
    public const string Overstocked = "Overstocked";
    public const string Uncategorised = "Uncategorised";
    public const string High = "High";
    public const string Medium = "Medium";
    public const string Low = "Low";

    /// <summary>Stock statuses worked out from each item's quantity against its reorder level and max stock.</summary>
    public static readonly IReadOnlyList<string> StockStatuses = [InStock, BelowReorderStatus, OutOfStock, Overstocked];

    public static readonly IReadOnlyList<string> Risks = [High, Medium, Low];

    private const double CriticalCoverDays = 7;
    private const double MediumCoverDays = 30;

    private readonly DashboardPeriod _period;
    private readonly InventoryAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;
    private readonly List<StockLine> _scoped;
    private readonly List<InventoryIssueRecord> _issues;
    private readonly List<WarehouseScope> _warehouses;
    private readonly IReadOnlyList<InventorySupplierRecord> _suppliers;

    private sealed record StockLine(InventoryStockRecord Record, InventoryWarehouseRecord? Warehouse, string Category, string Status, double Threshold,
        double? DailyUsage, DateTime? LastIssuedAt)
    {
        public double Value => Record.Quantity * Record.UnitCost;

        public bool IsBelowReorder => Status is BelowReorderStatus or OutOfStock;
    }

    private sealed record WarehouseScope(InventoryWarehouseRecord Warehouse, IReadOnlyList<InventoryStoreRecord> Stores, double? Utilization, string? Basis);

    private InventoryAnalyticsCalculator(
        DashboardPeriod period,
        InventoryAnalyticsSettings settings,
        DateTime utcNow,
        List<StockLine> scoped,
        List<InventoryIssueRecord> issues,
        List<WarehouseScope> warehouses,
        IReadOnlyList<InventorySupplierRecord> suppliers)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _months = AssetPerformanceCalculator.Months(period, utcNow);
        _scoped = scoped;
        _issues = issues;
        _warehouses = warehouses;
        _suppliers = suppliers;
    }

    public DashboardPeriod Period => _period;

    public InventoryAnalyticsSettings Settings => _settings;

    public static async Task<InventoryAnalyticsCalculator> LoadAsync(
        IInventoryAnalyticsDataRepository repository,
        DashboardPeriod period,
        InventoryAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var tenantId = settings.TenantId;
        var clientId = settings.ClientId;
        var stock = await repository.GetStockAsync(tenantId, clientId, cancellationToken);
        var warehouses = await repository.GetWarehousesAsync(tenantId, clientId, cancellationToken);
        var stores = await repository.GetStoresAsync(tenantId, clientId, cancellationToken);
        var bins = await repository.GetBinsAsync(tenantId, clientId, cancellationToken);
        var suppliers = await repository.GetSuppliersAsync(tenantId, clientId, cancellationToken);
        var issues = await repository.GetIssuesAsync(tenantId, clientId, utcNow > period.ToUtc ? utcNow : period.ToUtc, cancellationToken);
        var organization = settings.Organization is null
            ? null
            : await repository.GetOrganizationSitesAsync(tenantId, clientId, settings.Organization, cancellationToken);

        // Warehouses on the filter bar: organization (its sites), location and warehouse.
        bool SiteMatch(InventoryWarehouseRecord warehouse, string value) =>
            Same(warehouse.Location, value) || Same(warehouse.City, value);
        var scopedWarehouses = warehouses
            .Where(warehouse => organization is null
                || organization.Found && organization.Sites.Any(site => SiteMatch(warehouse, site)))
            .Where(warehouse => settings.Location is null || SiteMatch(warehouse, settings.Location))
            .Where(warehouse => settings.Warehouse is null || Matches(warehouse, settings.Warehouse))
            .ToList();
        var store = settings.Store is null
            ? null
            : stores.FirstOrDefault(item => Same(item.Name, settings.Store) || Same(item.Code, settings.Store) || Same(item.Id, settings.Store));
        if (store is not null)
        {
            scopedWarehouses = scopedWarehouses.Where(warehouse => Same(warehouse.Id, store.WarehouseId) || Same(warehouse.Name, store.WarehouseName)).ToList();
        }

        var locationFiltered = settings.Organization is not null || settings.Location is not null || settings.Warehouse is not null || settings.Store is not null;

        InventoryWarehouseRecord? WarehouseOf(InventoryStockRecord record) =>
            record.WarehouseId is null && record.WarehouseName is null
                ? null
                : warehouses.FirstOrDefault(warehouse => Same(warehouse.Id, record.WarehouseId))
                  ?? warehouses.FirstOrDefault(warehouse => Same(warehouse.Name, record.WarehouseName) || Same(warehouse.Code, record.WarehouseName));

        // Each issue is matched to its stock line by item code (or part number) to filter it and to work out usage.
        var byCode = new Dictionary<string, InventoryStockRecord>(StringComparer.OrdinalIgnoreCase);
        foreach (var record in stock)
        {
            byCode.TryAdd(record.Code, record);
            if (!string.IsNullOrWhiteSpace(record.PartNumber))
            {
                byCode.TryAdd(record.PartNumber, record);
            }
        }

        InventoryStockRecord? RecordOf(InventoryIssueRecord issue) =>
            issue.ItemCode is not null && byCode.TryGetValue(issue.ItemCode, out var record) ? record : null;

        var usageFrom = utcNow.AddDays(-settings.UsageWindowDays);
        var usage = new Dictionary<string, double>();
        var lastIssued = new Dictionary<string, DateTime>();
        foreach (var issue in issues)
        {
            if (RecordOf(issue) is not { } record || issue.IssuedAt is not { } at || at > utcNow)
            {
                continue;
            }

            if (at >= usageFrom)
            {
                usage[record.Id] = usage.GetValueOrDefault(record.Id) + issue.Quantity;
            }

            if (!lastIssued.TryGetValue(record.Id, out var last) || at > last)
            {
                lastIssued[record.Id] = at;
            }
        }

        var lines = new Dictionary<string, StockLine>();
        foreach (var record in stock)
        {
            var warehouse = WarehouseOf(record);
            if (locationFiltered)
            {
                if (warehouse is null || !scopedWarehouses.Contains(warehouse))
                {
                    continue;
                }

                if (store is not null && !(Same(record.StoreId, store.Id) || Same(record.StoreName, store.Name)))
                {
                    continue;
                }
            }

            var category = string.IsNullOrWhiteSpace(record.Category) ? Uncategorised : record.Category.Trim();
            if (settings.Category is not null && !Same(category, settings.Category))
            {
                continue;
            }

            var threshold = record.ReorderLevel ?? record.MinStock ?? 0;
            var status = record.Quantity <= 0
                ? OutOfStock
                : threshold > 0 && record.Quantity <= threshold
                    ? BelowReorderStatus
                    : record.MaxStock is > 0 && record.Quantity > record.MaxStock
                        ? Overstocked
                        : InStock;
            if (settings.StockStatus is not null && status != settings.StockStatus)
            {
                continue;
            }

            var daily = usage.TryGetValue(record.Id, out var used) && used > 0 ? used / settings.UsageWindowDays : (double?)null;
            lines[record.Id] = new StockLine(record, warehouse, category, status, threshold, daily,
                lastIssued.TryGetValue(record.Id, out var lastAt) ? lastAt : null);
        }

        var anyFilter = locationFiltered || settings.Category is not null || settings.StockStatus is not null;
        var scopedIssues = issues
            .Where(issue => RecordOf(issue) is { } record ? lines.ContainsKey(record.Id) : !anyFilter)
            .Select(issue => issue.Value is null && RecordOf(issue) is { } record
                ? issue with { Value = issue.Quantity * record.UnitCost }
                : issue)
            .ToList();

        // Utilization counts every item held in the warehouse, whatever the category and status filters.
        var warehouseScopes = scopedWarehouses
            .OrderBy(warehouse => warehouse.Name, StringComparer.OrdinalIgnoreCase)
            .Select(warehouse =>
            {
                var held = stock.Where(record => WarehouseOf(record) == warehouse).ToList();
                var warehouseBins = bins.Where(bin => Same(bin.WarehouseId, warehouse.Id) || Same(bin.WarehouseName, warehouse.Name)).ToList();
                var capacity = warehouseBins.Sum(bin => bin.Capacity is > 0 ? bin.Capacity.Value : 0);
                double? utilization = null;
                string? basis = null;
                if (capacity > 0)
                {
                    var inBins = held.Where(record => warehouseBins.Any(bin => bin.Capacity is > 0 && (Same(bin.Id, record.BinId) || Same(bin.Name, record.BinName) || Same(bin.Code, record.BinName))))
                        .Sum(record => Math.Max(0, record.Quantity));
                    utilization = Round1(100 * inBins / capacity);
                    basis = "Bin capacity";
                }
                else if (held.Where(record => record.MaxStock is > 0).ToList() is { Count: > 0 } bounded)
                {
                    utilization = Round1(100 * bounded.Sum(record => Math.Max(0, record.Quantity)) / bounded.Sum(record => record.MaxStock!.Value));
                    basis = "Max stock";
                }

                var warehouseStores = stores.Where(item => Same(item.WarehouseId, warehouse.Id) || Same(item.WarehouseName, warehouse.Name))
                    .OrderBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                return new WarehouseScope(warehouse, warehouseStores, utilization, basis);
            })
            .ToList();

        return new InventoryAnalyticsCalculator(period, settings, utcNow, lines.Values.ToList(), scopedIssues, warehouseScopes, suppliers);
    }

    public InventorySummary Summary()
    {
        var value = Round2(_scoped.Sum(line => line.Value));
        var items = _scoped.Count;
        var previousItems = _scoped.Count(line => line.Record.CreatedAt is null || line.Record.CreatedAt < _period.FromUtc);
        var (turnover, previousTurnover) = (Turnover(_period.FromUtc, _period.ToUtc), Turnover(_period.PreviousFromUtc, _period.PreviousToUtc));

        return new InventorySummary(
            DashboardWidgetCalculator.Kpi(value, null, "currency", percentChange: true),
            DashboardWidgetCalculator.Kpi(items, previousItems, "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(turnover, previousTurnover, "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(_scoped.Count(line => line.IsBelowReorder), null, "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(null, null, "percent", percentChange: false),
            Round2(_scoped.Sum(line => Math.Max(0, line.Record.Quantity))));
    }

    public InventoryValueTrend ValueTrend()
    {
        var inPeriod = IssuesBetween(_period.FromUtc, _period.ToUtc).ToList();
        return new InventoryValueTrend(
            new PerformanceSeries(MonthLabels(),
            [
                new PerformanceSeriesLine("Issues", _months.Select(month => (double?)Round2(IssuesBetween(month.StartUtc, month.EndUtc).Sum(issue => issue.Value ?? 0))).ToList())
            ]),
            Round2(inPeriod.Sum(issue => issue.Value ?? 0)),
            Round2(inPeriod.Sum(issue => issue.Quantity)),
            Round2(_scoped.Sum(line => line.Value)));
    }

    /// <summary>The previous period's monthly issue value (Compare Periods).</summary>
    public PerformanceSeries PreviousValueTrend()
    {
        var previous = _period with { FromUtc = _period.PreviousFromUtc, ToUtc = _period.PreviousToUtc, From = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(_period.PreviousFromUtc, _period.Zone)), To = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(_period.PreviousToUtc, _period.Zone)).AddDays(-1) };
        var months = AssetPerformanceCalculator.Months(previous, _period.PreviousToUtc);
        return new PerformanceSeries(
            months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList(),
            [new PerformanceSeriesLine("Issues", months.Select(month => (double?)Round2(IssuesBetween(month.StartUtc, month.EndUtc).Sum(issue => issue.Value ?? 0))).ToList())]);
    }

    public InventoryStockByCategory StockByCategory()
    {
        var categories = _scoped
            .GroupBy(line => line.Category, StringComparer.OrdinalIgnoreCase)
            .Select(group => new InventoryCategoryStock(group.Key, group.Count(), Round2(group.Sum(line => Math.Max(0, line.Record.Quantity))), Round2(group.Sum(line => line.Value))))
            .OrderByDescending(category => category.Units)
            .ThenBy(category => category.Category, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return new InventoryStockByCategory(Round2(categories.Sum(category => category.Units)), Round2(categories.Sum(category => category.Value)), categories);
    }

    /// <summary>Stock lines by stock status (every status listed, in /options order).</summary>
    public CountBreakdown StockStatus()
    {
        var total = _scoped.Count;
        return new CountBreakdown(total, StockStatuses
            .Select(status =>
            {
                var count = _scoped.Count(line => line.Status == status);
                return new CountItem(status, count, total == 0 ? 0 : Round1(100d * count / total));
            })
            .ToList());
    }

    public InventoryConsumptionTrend ConsumptionTrend()
    {
        var inPeriod = IssuesBetween(_period.FromUtc, _period.ToUtc).ToList();
        var departments = inPeriod
            .GroupBy(issue => issue.Department, StringComparer.OrdinalIgnoreCase)
            .Select(group => new InventoryDepartmentTotal(group.Key, Round2(group.Sum(issue => issue.Quantity)), Round2(group.Sum(issue => issue.Value ?? 0))))
            .OrderByDescending(department => department.Units)
            .ToList();

        return new InventoryConsumptionTrend(
            new PerformanceSeries(MonthLabels(), departments
                .Select(department => new PerformanceSeriesLine(department.Department, _months
                    .Select(month => (double?)Round2(IssuesBetween(month.StartUtc, month.EndUtc)
                        .Where(issue => Same(issue.Department, department.Department))
                        .Sum(issue => issue.Quantity)))
                    .ToList()))
                .ToList()),
            departments);
    }

    public IReadOnlyList<InventoryWarehouseRow> Warehouses() => _warehouses
        .Select(scope =>
        {
            var lines = _scoped.Where(line => line.Warehouse == scope.Warehouse).ToList();
            return new InventoryWarehouseRow(
                scope.Warehouse.Id,
                scope.Warehouse.Code,
                scope.Warehouse.Name,
                scope.Warehouse.Location ?? scope.Warehouse.City,
                scope.Utilization,
                scope.Basis,
                lines.Count,
                Round2(lines.Sum(line => Math.Max(0, line.Record.Quantity))),
                Round2(lines.Sum(line => line.Value)),
                lines.Count(line => line.IsBelowReorder),
                scope.Stores.Select(store => store.Name).ToList(),
                scope.Warehouse.Manager ?? scope.Stores.Select(store => store.Keeper).FirstOrDefault(keeper => keeper is not null),
                null);
        })
        .ToList();

    /// <summary>Items at or below their reorder level, highest risk first, then fewest days of cover.</summary>
    public IReadOnlyList<InventoryReorderRow> Reorder() => _scoped
        .Where(line => line.IsBelowReorder)
        .Select(line =>
        {
            var record = line.Record;
            var cover = line.DailyUsage is > 0 ? Round1(Math.Max(0, record.Quantity) / line.DailyUsage.Value) : (double?)null;
            var risk = record.Quantity <= 0 || cover < CriticalCoverDays
                ? High
                : cover < MediumCoverDays || cover is null && record.Quantity <= line.Threshold / 2
                    ? Medium
                    : Low;
            var target = record.MaxStock is > 0 ? record.MaxStock.Value : line.Threshold * 2;
            var suggested = record.ReorderQuantity is > 0 ? record.ReorderQuantity.Value : Math.Max(1, Math.Ceiling(target - Math.Max(0, record.Quantity)));
            return new InventoryReorderRow(
                record.Id,
                record.Source,
                record.Code,
                record.Name,
                line.Category,
                line.Warehouse?.Code,
                line.Warehouse?.Name ?? record.WarehouseName,
                record.StoreName,
                line.Warehouse?.Location ?? line.Warehouse?.City,
                record.Quantity,
                line.Threshold,
                suggested,
                line.DailyUsage is null ? null : Round2(line.DailyUsage.Value),
                cover,
                record.Supplier,
                risk,
                RiskRank(risk),
                record.CriticalSpare,
                record.UnitCost);
        })
        .OrderBy(row => row.RiskRank)
        .ThenBy(row => row.DaysCover ?? double.MaxValue)
        .ThenBy(row => row.Code, StringComparer.OrdinalIgnoreCase)
        .ToList();

    /// <summary>Critical spares below reorder level that are out of stock or have under 7 days of cover.</summary>
    public IReadOnlyList<InventoryReorderRow> CriticalAtRisk() =>
        Reorder().Where(row => row.Critical && (row.Available <= 0 || row.DaysCover < CriticalCoverDays)).ToList();

    public InventorySlowMoving SlowMoving()
    {
        var threshold = _settings.SlowMovingDays;
        var rows = _scoped
            .Where(line => line.Record.Quantity > 0)
            .Select(line =>
            {
                var since = line.LastIssuedAt ?? line.Record.CreatedAt;
                var days = since is null ? (int?)null : (int)Math.Floor((_utcNow - since.Value).TotalDays);
                return (Line: line, Days: days);
            })
            .Where(item => item.Days >= threshold)
            .Select(item => new InventorySlowRow(
                item.Line.Record.Id,
                item.Line.Record.Code,
                item.Line.Record.Name,
                item.Line.Category,
                item.Line.Warehouse?.Name ?? item.Line.Record.WarehouseName,
                item.Line.Record.StoreName,
                item.Line.Warehouse?.Location ?? item.Line.Warehouse?.City,
                item.Line.Record.Quantity,
                Round2(item.Line.Value),
                item.Days,
                item.Line.LastIssuedAt))
            .OrderByDescending(row => row.Value)
            .ToList();
        return new InventorySlowMoving(rows.Count, Round2(rows.Sum(row => row.Value)), threshold, rows);
    }

    /// <summary>Suppliers of stock in scope, most items first.</summary>
    public IReadOnlyList<InventorySupplierRow> Suppliers() => _scoped
        .Where(line => !string.IsNullOrWhiteSpace(line.Record.Supplier))
        .GroupBy(line => line.Record.Supplier!.Trim(), StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var master = _suppliers.FirstOrDefault(supplier => Same(supplier.Name, group.Key) || Same(supplier.Code, group.Key) || Same(supplier.Id, group.Key));
            var category = master?.Category ?? group.GroupBy(line => line.Category).OrderByDescending(item => item.Count()).First().Key;
            return new InventorySupplierRow(
                master?.Name ?? group.Key,
                master?.Code,
                category,
                group.Count(),
                Round2(group.Sum(line => line.Value)),
                group.Count(line => line.IsBelowReorder),
                master?.Rating,
                master?.Preferred ?? false);
        })
        .OrderByDescending(row => row.Items)
        .ThenByDescending(row => row.StockValue)
        .ToList();

    public static int RiskRank(string risk) => risk switch
    {
        High => 0,
        Medium => 1,
        _ => 2
    };

    /// <summary>Value issued in [from, to) annualised, over the current stock value; null without stock or elapsed time.</summary>
    private double? Turnover(DateTime fromUtc, DateTime toUtc)
    {
        var end = toUtc > _utcNow ? _utcNow : toUtc;
        var days = (end - fromUtc).TotalDays;
        var stockValue = _scoped.Sum(line => line.Value);
        if (days <= 0 || stockValue <= 0)
        {
            return null;
        }

        var issued = IssuesBetween(fromUtc, end).Sum(issue => issue.Value ?? 0);
        return Round2(issued * 365 / days / stockValue);
    }

    private IEnumerable<InventoryIssueRecord> IssuesBetween(DateTime fromUtc, DateTime toUtc) =>
        _issues.Where(issue => issue.IssuedAt >= fromUtc && issue.IssuedAt < toUtc && issue.IssuedAt <= _utcNow);

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static bool Matches(InventoryWarehouseRecord warehouse, string value) =>
        Same(warehouse.Name, value) || Same(warehouse.Code, value) || Same(warehouse.Id, value);

    private static bool Same(string? left, string? right) =>
        left is not null && right is not null && string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);

    private static double Round1(double value) => Math.Round(value, 1);

    private static double Round2(double value) => Math.Round(value, 2);
}
