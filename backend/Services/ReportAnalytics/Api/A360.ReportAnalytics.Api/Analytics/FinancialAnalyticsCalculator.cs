using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// CostCenter narrows everything to one cost center (code or "code name"). BudgetTarget is the budget utilization target in percent.
/// DefaultUsefulLifeYears depreciates assets whose register entry and Master Data give no useful life. MaintenanceRatioLimit flags assets whose
/// maintenance to date exceeds that share of their acquisition cost; UtilizationThreshold marks assets below it as disposal candidates.
/// </summary>
public sealed record FinancialAnalyticsSettings(
    string? CostCenter,
    double BudgetTarget,
    double DefaultUsefulLifeYears,
    double MaintenanceRatioLimit,
    double UtilizationThreshold);

public sealed record FinancialSummary(
    KpiWidgetData TotalAssetValue,
    KpiWidgetData MaintenanceSpend,
    KpiWidgetData Capex,
    KpiWidgetData Opex,
    KpiWidgetData NetBookValue);

/// <summary>Monthly Acquisition and Maintenance cost and the running total; PreviousCumulative is the previous period's running total.</summary>
public sealed record FinancialTcoTrend(PerformanceSeries Trend, PerformanceSeries PreviousTrend, double Acquisition, double Maintenance, double Total);

public sealed record FinancialCategoryCost(string Category, double Acquisition, double Maintenance, double Total, double Percentage);

public sealed record FinancialCategoryCosts(double Total, IReadOnlyList<FinancialCategoryCost> Items);

/// <summary>Monthly depreciation (straight line) and accumulated depreciation at each month end.</summary>
public sealed record FinancialDepreciation(PerformanceSeries Trend, PerformanceSeries PreviousTrend, double PeriodDepreciation, double Accumulated);

public sealed record FinancialCostCenterRow(
    string Code,
    string Name,
    double Budget,
    string BudgetSource,
    double Actual,
    double Maintenance,
    double Capex,
    double Variance,
    double? Utilization,
    string Status);

public sealed record FinancialBudgetUtilization(double Spend, double Budget, double Remaining, double? Utilization, double Target, bool? MeetsTarget);

public sealed record FinancialSiteMaintenance(string Site, double Labour, double Parts, double Contractor, double Total);

public sealed record FinancialAssetRow(
    string Key,
    string? AssetRecordId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? Location,
    string? CostCenter,
    double Acquisition,
    double Maintenance,
    double PeriodMaintenance,
    double Depreciation,
    double NetBookValue,
    double Tco,
    double? OperatingHours,
    double? CostPerHour,
    double? MaintenanceRatio,
    int? UsefulLifeMonths,
    string UsefulLifeSource);

public sealed record FinancialCapexRequestRow(
    string RequestId,
    string Title,
    string? AssetId,
    string? AssetName,
    string? Location,
    string? Category,
    string? CostCenter,
    double Amount,
    string? Currency,
    string? Justification,
    string? RequestedBy,
    DateTime SubmittedAt,
    string Status,
    IReadOnlyList<FinancialAnalyticsCapexDecision> Decisions)
{
    public static FinancialCapexRequestRow FromEntity(FinancialAnalyticsCapexRequest request) => new(
        request.RequestId,
        request.Title,
        request.AssetId,
        request.AssetName,
        request.Location,
        request.Category,
        request.CostCenter,
        request.Amount,
        request.Currency,
        request.Justification,
        request.RequestedBy,
        request.SubmittedAt,
        request.Status ?? FinancialAnalyticsCapexRequestRepository.PendingStatus,
        request.Decisions);
}

/// <summary>An underutilized asset with book value left; RecoverableValue is its net book value.</summary>
public sealed record FinancialDisposalCandidate(
    string Key,
    string? AssetRecordId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? Location,
    double Utilization,
    double RecoverableValue);

/// <summary>A Financial Insights card; Amount is the money it is about (base currency) and Change a percentage where it applies.</summary>
public sealed record FinancialInsight(string Key, string Severity, string Title, string Message, int Count, double? Amount, double? Change, IReadOnlyList<string> Actions);

/// <summary>
/// Financial Analytics for one filter bar and date range. Amounts are in the register's base currency (no conversion).
/// Acquisition (CAPEX) is an asset's total purchase cost (purchase cost when no total) on its purchase date (or registration date).
/// Maintenance is the cost tracking records plus the cost lines of work orders that have no cost tracking record: labour, parts and
/// contractor (additional cost, and labour on work orders done by a vendor). Depreciation is straight line over the useful life from the
/// asset (expected lifespan), else its Master Data asset type or category, else DefaultUsefulLifeYears, down to the type's residual value.
/// TCO = acquisition + maintenance; OPEX = maintenance + depreciation. Cost centers are Master Data departments (cost center / code / name),
/// matched by the asset's classification cost center or department and the work order's department; budgets are the department's annual budget
/// phased by elapsed days of the period, else the cost records' budget allocations.
/// </summary>
public sealed class FinancialAnalyticsCalculator
{
    public const string Unassigned = "Unassigned";
    public const string Uncategorised = "Uncategorised";
    public const string UnknownLocation = "Unassigned location";

    public const string OverBudget = "Over Budget";
    public const string AtRisk = "At Risk";
    public const string OnTrack = "On Track";
    public const string NoBudget = "No Budget";

    public static readonly IReadOnlyList<string> CostCenterStatuses = [OverBudget, AtRisk, OnTrack, NoBudget];

    private const double DaysPerMonth = 30.4375;
    private static readonly DateTime Epoch = new(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly DashboardPeriod _period;
    private readonly FinancialAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly List<AssetModel> _assets;
    private readonly Dictionary<string, AssetModel> _assetsByKey;
    private readonly List<CostEntry> _costs;
    private readonly List<CostCenterModel> _costCenters;
    private readonly IReadOnlyList<FinancialAnalyticsCapexRequest> _capexRequests;
    private readonly HashSet<string> _onDisposal;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _previousMonths;

    private FinancialAnalyticsCalculator(
        DashboardPeriod period,
        FinancialAnalyticsSettings settings,
        DateTime utcNow,
        List<AssetModel> assets,
        List<CostEntry> costs,
        List<CostCenterModel> costCenters,
        IReadOnlyList<FinancialAnalyticsCapexRequest> capexRequests,
        HashSet<string> onDisposal)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _assets = assets;
        _assetsByKey = new Dictionary<string, AssetModel>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in assets)
        {
            foreach (var key in asset.Keys)
            {
                _assetsByKey.TryAdd(key, asset);
            }
        }

        _costs = costs;
        _costCenters = costCenters;
        _capexRequests = capexRequests;
        _onDisposal = onDisposal;
        _months = AssetPerformanceCalculator.Months(period, utcNow);

        var previousFrom = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(period.PreviousFromUtc, period.Zone));
        var previous = period with { From = previousFrom, To = period.From.AddDays(-1), FromUtc = period.PreviousFromUtc, ToUtc = period.PreviousToUtc };
        _previousMonths = AssetPerformanceCalculator.Months(previous, utcNow);
    }

    public DashboardPeriod Period => _period;

    public static async Task<FinancialAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository dataRepository,
        IFinancialAnalyticsDataRepository financialRepository,
        IFinancialAnalyticsCapexRequestRepository capexRepository,
        DashboardDataScope scope,
        DashboardPeriod period,
        FinancialAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var scoped = await dataRepository.GetAssetsAsync(scope, cancellationToken);
        var records = await financialRepository.GetAssetFinancialsAsync(
            scope.TenantId, scope.ClientId, scope.FiltersAssets ? scoped.Select(asset => asset.MongoId).ToList() : null, cancellationToken);

        IReadOnlyCollection<string>? keys = scope.FiltersAssets ? records.SelectMany(record => record.Keys()).Distinct().ToList() : null;
        // Work orders recorded against the selected site count when the location is the only asset filter.
        var siteOnly = !string.IsNullOrWhiteSpace(scope.Location) && string.IsNullOrWhiteSpace(scope.Organization)
            && string.IsNullOrWhiteSpace(scope.AssetCategory) && string.IsNullOrWhiteSpace(scope.AssetType);

        var workOrders = await financialRepository.GetWorkOrderCostsAsync(scope.TenantId, scope.ClientId, keys, siteOnly ? scope.Location : null, cancellationToken);
        IReadOnlyList<DashboardCostRecord> costRecords = keys is { Count: 0 }
            ? []
            : await dataRepository.GetCostRecordsAsync(scope, keys, Epoch, period.ToUtc > utcNow ? period.ToUtc : utcNow, cancellationToken);
        var departments = await financialRepository.GetCostCentersAsync(scope.TenantId, scope.ClientId, cancellationToken);
        var lives = await financialRepository.GetUsefulLivesAsync(scope.TenantId, scope.ClientId, cancellationToken);
        var disposals = await financialRepository.GetDisposalAssetsAsync(scope.TenantId, scope.ClientId, cancellationToken);
        var capex = await capexRepository.ListAsync(scope.TenantId, scope.ClientId, FinancialAnalyticsCapexRequestRepository.OpenStatuses, cancellationToken);

        var costCenters = departments
            .Select(department => new CostCenterModel(
                department.CostCenter ?? department.Code ?? department.Name ?? Unassigned,
                department.Name ?? department.CostCenter ?? department.Code ?? Unassigned,
                department.AnnualBudget,
                new[] { department.CostCenter, department.Code, department.Name }.OfType<string>().ToHashSet(StringComparer.OrdinalIgnoreCase)))
            .GroupBy(center => center.Code, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        CostCenterModel CenterOf(params string?[] values)
        {
            foreach (var value in values.Where(value => !string.IsNullOrWhiteSpace(value)))
            {
                var match = costCenters.FirstOrDefault(center => center.Names.Contains(value!));
                if (match is not null)
                {
                    return match;
                }
            }

            var raw = values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? Unassigned;
            var added = costCenters.FirstOrDefault(center => string.Equals(center.Code, raw, StringComparison.OrdinalIgnoreCase));
            if (added is null)
            {
                added = new CostCenterModel(raw, raw, null, new HashSet<string>(StringComparer.OrdinalIgnoreCase) { raw });
                costCenters.Add(added);
            }

            return added;
        }

        var assets = records.Select(record =>
        {
            var (months, residual, source) = UsefulLife(record, lives, settings.DefaultUsefulLifeYears);
            return new AssetModel(
                record.MongoId,
                record.MongoId,
                record.AssetId,
                record.AssetName,
                record.Category ?? Uncategorised,
                record.Site ?? UnknownLocation,
                CenterOf(record.CostCenter, record.Department),
                record.PurchaseCost is > 0 ? record.PurchaseCost.Value : 0,
                record.PurchaseDate ?? record.CreatedAt,
                months,
                residual,
                source,
                record.OperatingHoursPerDay,
                Percent(record.Utilization),
                IsDisposed(record.Status),
                record.Keys().ToList());
        }).ToList();

        var assetsByKey = new Dictionary<string, AssetModel>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in assets)
        {
            foreach (var key in asset.Keys)
            {
                assetsByKey.TryAdd(key, asset);
            }
        }

        AssetModel? AssetOf(string? key) => key is not null && assetsByKey.TryGetValue(key.Trim(), out var asset) ? asset : null;

        var costs = new List<CostEntry>();
        var trackedWorkOrders = costRecords
            .Select(record => record.WorkOrderId)
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id!.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var record in costRecords.Where(record => record.CreatedAt is not null))
        {
            var asset = AssetOf(record.AssetId);
            var labour = Math.Max(0, record.LaborCost);
            var parts = Math.Max(0, record.SparePartsCost);
            var contractor = Math.Max(0, record.Total - labour - parts);
            costs.Add(new CostEntry(
                record.CreatedAt!.Value,
                asset?.Key ?? record.AssetId?.Trim(),
                asset?.AssetName,
                asset?.Category ?? Uncategorised,
                asset?.Site ?? UnknownLocation,
                asset?.CostCenter ?? CenterOf(),
                labour,
                parts,
                contractor,
                record.BudgetAllocation));
        }

        foreach (var workOrder in workOrders.Where(workOrder => workOrder.CostDate is not null))
        {
            if (workOrder.WorkOrderId is not null && trackedWorkOrders.Contains(workOrder.WorkOrderId))
            {
                continue;
            }

            var external = !string.IsNullOrWhiteSpace(workOrder.Vendor);
            var labour = external ? 0 : workOrder.Labour;
            var contractor = workOrder.Additional + (external ? workOrder.Labour : 0);
            if (labour + workOrder.Parts + contractor <= 0)
            {
                continue;
            }

            var asset = AssetOf(workOrder.AssetId);
            costs.Add(new CostEntry(
                workOrder.CostDate!.Value,
                asset?.Key ?? workOrder.AssetId?.Trim(),
                asset?.AssetName ?? workOrder.AssetName,
                asset?.Category ?? Uncategorised,
                asset?.Site ?? workOrder.Site ?? UnknownLocation,
                workOrder.Department is not null ? CenterOf(workOrder.Department) : asset?.CostCenter ?? CenterOf(),
                labour,
                workOrder.Parts,
                contractor,
                null));
        }

        var onDisposal = disposals
            .Where(disposal => disposal.AssetRegistrationId is not null
                && disposal.RequestStatus?.Trim().ToLowerInvariant() is not ("cancelled" or "canceled" or "rejected"))
            .Select(disposal => disposal.AssetRegistrationId!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // The cost center filter narrows assets, costs and the CAPEX requests.
        if (settings.CostCenter is { } filter)
        {
            bool Matches(CostCenterModel center) =>
                string.Equals(center.Code, filter, StringComparison.OrdinalIgnoreCase)
                || string.Equals($"{center.Code} {center.Name}", filter, StringComparison.OrdinalIgnoreCase)
                || center.Names.Contains(filter);

            assets = assets.Where(asset => Matches(asset.CostCenter)).ToList();
            costs = costs.Where(cost => Matches(cost.CostCenter)).ToList();
            costCenters = costCenters.Where(Matches).ToList();
            capex = capex.Where(request => request.CostCenter is not null && (costCenters.Any(center => center.Names.Contains(request.CostCenter))
                || string.Equals(request.CostCenter, filter, StringComparison.OrdinalIgnoreCase))).ToList();
        }

        if (scope.FiltersAssets)
        {
            capex = capex.Where(request =>
                (request.AssetId is not null && assetsByKey.ContainsKey(request.AssetId))
                || (request.AssetId is null
                    && (scope.Location is null || string.Equals(request.Location, scope.Location, StringComparison.OrdinalIgnoreCase))
                    && (scope.AssetCategory is null || string.Equals(request.Category, scope.AssetCategory, StringComparison.OrdinalIgnoreCase))
                    && scope.Organization is null && scope.AssetType is null))
                .ToList();
        }

        return new FinancialAnalyticsCalculator(period, settings, utcNow, assets, costs, costCenters, capex, onDisposal);
    }

    public FinancialSummary Summary()
    {
        var end = PeriodEnd(_period.ToUtc);
        var previousEnd = PeriodEnd(_period.PreviousToUtc);
        var maintenance = Maintenance(_period.FromUtc, _period.ToUtc);
        var previousMaintenance = Maintenance(_period.PreviousFromUtc, _period.PreviousToUtc);

        return new FinancialSummary(
            Kpi(AssetValue(end), AssetValue(previousEnd)),
            Kpi(maintenance, previousMaintenance),
            Kpi(Capex(_period.FromUtc, _period.ToUtc), Capex(_period.PreviousFromUtc, _period.PreviousToUtc)),
            Kpi(maintenance + DepreciationBetween(_period.FromUtc, _period.ToUtc), previousMaintenance + DepreciationBetween(_period.PreviousFromUtc, _period.PreviousToUtc)),
            Kpi(NetBookValue(end), NetBookValue(previousEnd)));
    }

    public FinancialTcoTrend TcoTrend()
    {
        PerformanceSeries Build(IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> months)
        {
            var acquisition = months.Select(month => (double?)Round2(Capex(month.StartUtc, month.EndUtc))).ToList();
            var maintenance = months.Select(month => (double?)Round2(Maintenance(month.StartUtc, month.EndUtc))).ToList();
            var running = 0d;
            var cumulative = months.Select((_, index) => (double?)Round2(running += (acquisition[index] ?? 0) + (maintenance[index] ?? 0))).ToList();

            return new PerformanceSeries(Labels(months),
            [
                new("Acquisition", acquisition),
                new("Maintenance", maintenance),
                new("Total TCO (cumulative)", cumulative)
            ]);
        }

        var acquisitionTotal = Round2(Capex(_period.FromUtc, _period.ToUtc));
        var maintenanceTotal = Round2(Maintenance(_period.FromUtc, _period.ToUtc));

        return new FinancialTcoTrend(Build(_months), Build(_previousMonths), acquisitionTotal, maintenanceTotal, Round2(acquisitionTotal + maintenanceTotal));
    }

    public FinancialCategoryCosts CategoryCosts()
    {
        var acquisition = _assets
            .Where(asset => InWindow(asset.AcquiredAt, _period.FromUtc, _period.ToUtc))
            .GroupBy(asset => asset.Category, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Sum(asset => asset.Cost), StringComparer.OrdinalIgnoreCase);
        var maintenance = CostsBetween(_period.FromUtc, _period.ToUtc)
            .GroupBy(cost => cost.Category, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Sum(cost => cost.Total), StringComparer.OrdinalIgnoreCase);

        var rows = acquisition.Keys.Union(maintenance.Keys, StringComparer.OrdinalIgnoreCase)
            .Select(category => (Category: category, Acquisition: acquisition.GetValueOrDefault(category), Maintenance: maintenance.GetValueOrDefault(category)))
            .Where(row => row.Acquisition + row.Maintenance > 0)
            .ToList();
        var total = rows.Sum(row => row.Acquisition + row.Maintenance);

        return new FinancialCategoryCosts(
            Round2(total),
            rows
                .Select(row => new FinancialCategoryCost(
                    row.Category,
                    Round2(row.Acquisition),
                    Round2(row.Maintenance),
                    Round2(row.Acquisition + row.Maintenance),
                    total == 0 ? 0 : Round1(100 * (row.Acquisition + row.Maintenance) / total)))
                .OrderByDescending(row => row.Total)
                .ToList());
    }

    public FinancialDepreciation Depreciation()
    {
        PerformanceSeries Build(IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> months) => new(Labels(months),
        [
            new("Monthly Depreciation", months.Select(month => (double?)Round2(DepreciationBetween(month.StartUtc, month.EndUtc))).ToList()),
            new("Accumulated Depreciation", months.Select(month => (double?)Round2(_assets.Where(asset => !asset.Disposed).Sum(asset => Accumulated(asset, month.EndUtc)))).ToList())
        ]);

        return new FinancialDepreciation(
            Build(_months),
            Build(_previousMonths),
            Round2(DepreciationBetween(_period.FromUtc, _period.ToUtc)),
            Round2(_assets.Where(asset => !asset.Disposed).Sum(asset => Accumulated(asset, PeriodEnd(_period.ToUtc)))));
    }

    /// <summary>Budget vs actual (maintenance + CAPEX) per cost center: Master Data departments plus any cost center that has spend.</summary>
    public IReadOnlyList<FinancialCostCenterRow> CostCenters()
    {
        var costs = CostsBetween(_period.FromUtc, _period.ToUtc).ToList();
        var acquired = _assets.Where(asset => InWindow(asset.AcquiredAt, _period.FromUtc, _period.ToUtc)).ToList();
        var elapsed = Math.Max(0, (PeriodEnd(_period.ToUtc) - _period.FromUtc).TotalDays);

        return _costCenters
            .Select(center =>
            {
                var maintenance = costs.Where(cost => cost.CostCenter == center).Sum(cost => cost.Total);
                var capex = acquired.Where(asset => asset.CostCenter == center).Sum(asset => asset.Cost);
                var allocations = costs.Where(cost => cost.CostCenter == center).Select(cost => cost.BudgetAllocation).OfType<double>().ToList();
                var (budget, source) = center.AnnualBudget is > 0
                    ? (center.AnnualBudget.Value * elapsed / 365, "Annual budget (phased)")
                    : allocations.Count > 0 ? (allocations.Sum(), "Budget allocation") : (0d, "None");
                var actual = maintenance + capex;
                double? utilization = budget > 0 ? Round1(100 * actual / budget) : null;

                return new FinancialCostCenterRow(
                    center.Code,
                    center.Name,
                    Round2(budget),
                    source,
                    Round2(actual),
                    Round2(maintenance),
                    Round2(capex),
                    Round2(actual - budget),
                    utilization,
                    StatusOf(utilization, actual));
            })
            .Where(row => row.Budget > 0 || row.Actual > 0 || _costCenters.First(center => center.Code == row.Code).AnnualBudget is not null)
            .OrderBy(row => row.Code == Unassigned)
            .ThenBy(row => row.Code, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public FinancialBudgetUtilization BudgetUtilization()
    {
        var rows = CostCenters();
        var budget = Round2(rows.Sum(row => row.Budget));
        var spend = Round2(rows.Sum(row => row.Actual));
        double? utilization = budget > 0 ? Round1(100 * spend / budget) : null;

        return new FinancialBudgetUtilization(spend, budget, Round2(budget - spend), utilization, _settings.BudgetTarget, utilization is null ? null : utilization <= _settings.BudgetTarget);
    }

    public IReadOnlyList<FinancialSiteMaintenance> SiteMaintenance() => CostsBetween(_period.FromUtc, _period.ToUtc)
        .GroupBy(cost => cost.Site, StringComparer.OrdinalIgnoreCase)
        .Select(group => new FinancialSiteMaintenance(
            group.Key,
            Round2(group.Sum(cost => cost.Labour)),
            Round2(group.Sum(cost => cost.Parts)),
            Round2(group.Sum(cost => cost.Contractor)),
            Round2(group.Sum(cost => cost.Total))))
        .Where(row => row.Total > 0)
        .OrderByDescending(row => row.Total)
        .ToList();

    /// <summary>Every asset with an acquisition or maintenance cost to the period end, highest TCO first.</summary>
    public IReadOnlyList<FinancialAssetRow> Assets()
    {
        var end = PeriodEnd(_period.ToUtc);
        var toDate = _costs.Where(cost => cost.Date < end && cost.AssetKey is not null).GroupBy(cost => cost.AssetKey!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var rows = new List<FinancialAssetRow>();
        foreach (var asset in _assets.Where(asset => asset.AcquiredAt is null || asset.AcquiredAt < end))
        {
            var costs = toDate.GetValueOrDefault(asset.Key) ?? [];
            rows.Add(Row(asset.Key, asset, costs, end));
        }

        // Maintenance on assets that are not in the register (work orders and cost records naming an unknown asset).
        foreach (var (key, costs) in toDate.Where(item => !_assetsByKey.ContainsKey(item.Key)))
        {
            rows.Add(Row(key, null, costs, end));
        }

        return rows.Where(row => row.Tco > 0).OrderByDescending(row => row.Tco).ToList();
    }

    public IReadOnlyList<FinancialCapexRequestRow> CapexRequests() => _capexRequests.Select(FinancialCapexRequestRow.FromEntity).ToList();

    public IReadOnlyList<FinancialDisposalCandidate> DisposalCandidates()
    {
        var end = PeriodEnd(_period.ToUtc);
        return _assets
            .Where(asset => !asset.Disposed && asset.Utilization is not null && asset.Utilization < _settings.UtilizationThreshold
                && (asset.AcquiredAt is null || asset.AcquiredAt < end)
                && !asset.Keys.Any(_onDisposal.Contains))
            .Select(asset => new FinancialDisposalCandidate(
                asset.Key, asset.MongoId, asset.AssetId, asset.AssetName, asset.Category, asset.Site, Round1(asset.Utilization!.Value), Round2(asset.Cost - Accumulated(asset, end))))
            .Where(candidate => candidate.RecoverableValue > 0)
            .OrderByDescending(candidate => candidate.RecoverableValue)
            .ToList();
    }

    public IReadOnlyList<FinancialInsight> Insights()
    {
        var maintenance = Round2(Maintenance(_period.FromUtc, _period.ToUtc));
        var previous = Round2(Maintenance(_period.PreviousFromUtc, _period.PreviousToUtc));
        double? change = previous > 0 ? Round1((maintenance - previous) / previous * 100) : null;
        var (severity, title, message) = change switch
        {
            _ when maintenance == 0 => ("info", "No maintenance spend in the period", "No maintenance cost has been recorded for the current filters."),
            null => ("info", "No maintenance spend in the previous period",
                $"Maintenance spend this period is {Money(maintenance)}; there is no previous period spend to compare with."),
            > 0 => ("warning", $"Maintenance spend {change:0.#}% above prior period",
                $"Maintenance costs are {change:0.#}% higher than the previous period ({Money(maintenance)} vs {Money(previous)})."),
            _ => ("success", $"Maintenance spend {Math.Abs(change.Value):0.#}% below prior period",
                $"Maintenance costs are {Math.Abs(change.Value):0.#}% lower than the previous period ({Money(maintenance)} vs {Money(previous)}).")
        };

        var overRatio = Assets().Where(row => row.MaintenanceRatio > _settings.MaintenanceRatioLimit).ToList();
        var capex = _capexRequests;
        var capexTotal = Round2(capex.Sum(request => request.Amount));
        var disposals = DisposalCandidates();
        var recoverable = Round2(disposals.Sum(candidate => candidate.RecoverableValue));
        var budget = BudgetUtilization();

        var list = new List<FinancialInsight>
        {
            new("maintenance_spend", severity, title, message, maintenance > 0 ? 1 : 0, maintenance, change, ["view_costs", "create_action_plan"]),
            new("maintenance_ratio", overRatio.Count > 0 ? "critical" : "success",
                $"{Plural(overRatio.Count, "asset")} exceed{(overRatio.Count == 1 ? "s" : "")} the maintenance cost threshold",
                $"Maintenance to date is above {_settings.MaintenanceRatioLimit:0.#}% of acquisition cost; review repair vs replace.",
                overRatio.Count, Round2(overRatio.Sum(row => row.Maintenance)), null, ["view_assets", "create_action_plan"]),
            new("capex_approval", capex.Count > 0 ? "warning" : "success",
                capex.Count > 0 ? $"CAPEX approval required for {Money(capexTotal)}" : "No CAPEX requests pending approval",
                $"{Plural(capex.Count, "CAPEX request")} {(capex.Count == 1 ? "is" : "are")} pending approval.",
                capex.Count, capexTotal, null, ["open_approvals", "view_details"]),
            new("disposal_opportunity", disposals.Count > 0 ? "success" : "info",
                $"Asset disposal opportunity identified: {Money(recoverable)} recoverable value",
                $"{Plural(disposals.Count, "underutilized asset")} (below {_settings.UtilizationThreshold:0.#}% utilization) {(disposals.Count == 1 ? "has" : "have")} {Money(recoverable)} net book value.",
                disposals.Count, recoverable, null, ["view_assets", "create_action_plan"]),
            new("budget_utilization", budget.Utilization is null ? "info" : budget.Utilization > 100 ? "critical" : budget.MeetsTarget == true ? "success" : "warning",
                budget.Utilization is null ? "No budget recorded for the selected cost centers" : $"Budget utilization at {budget.Utilization:0.#}%",
                budget.Utilization is null
                    ? "Add annual budgets to the departments in Master Data to track budget vs actual."
                    : $"{Money(budget.Spend)} spent of {Money(budget.Budget)} budget (target {_settings.BudgetTarget:0.#}%).",
                budget.Utilization is > 100 ? 1 : 0, budget.Spend, budget.Utilization, ["view_details"])
        };

        return list;
    }

    // ===== Building blocks =====

    private FinancialAssetRow Row(string key, AssetModel? asset, List<CostEntry> costs, DateTime end)
    {
        var maintenance = costs.Sum(cost => cost.Total);
        var periodMaintenance = costs.Where(cost => cost.Date >= _period.FromUtc && cost.Date < _period.ToUtc).Sum(cost => cost.Total);
        var acquisition = asset?.Cost ?? 0;
        var depreciation = asset is null ? 0 : Accumulated(asset, end);
        var tco = acquisition + maintenance;
        double? hours = asset?.HoursPerDay is > 0 && asset.AcquiredAt is { } since && since < end
            ? Math.Round(asset.HoursPerDay.Value * (end - since).TotalDays)
            : null;

        return new FinancialAssetRow(
            key,
            asset?.MongoId,
            asset?.AssetId ?? key,
            asset?.AssetName ?? costs.Select(cost => cost.AssetName).FirstOrDefault(name => name is not null),
            asset?.Category ?? costs.Select(cost => cost.Category).FirstOrDefault(),
            asset?.Site ?? costs.Select(cost => cost.Site).FirstOrDefault(),
            asset?.CostCenter.Code ?? costs.Select(cost => cost.CostCenter.Code).FirstOrDefault(),
            Round2(acquisition),
            Round2(maintenance),
            Round2(periodMaintenance),
            Round2(depreciation),
            Round2(acquisition - depreciation),
            Round2(tco),
            hours,
            hours is > 0 ? Round2(tco / hours.Value) : null,
            acquisition > 0 ? Round1(100 * maintenance / acquisition) : null,
            asset?.UsefulLifeMonths,
            asset?.UsefulLifeSource ?? "Not in asset register");
    }

    private static (int Months, double Residual, string Source) UsefulLife(FinancialAssetRecord record, IReadOnlyList<FinancialUsefulLifeRecord> lives, double defaultYears)
    {
        bool Named(FinancialUsefulLifeRecord life, string? value) =>
            value is not null && (string.Equals(life.Name, value, StringComparison.OrdinalIgnoreCase) || string.Equals(life.Code, value, StringComparison.OrdinalIgnoreCase));

        var type = lives.FirstOrDefault(life => life.Kind == "type" && Named(life, record.AssetType));
        var category = lives.FirstOrDefault(life => life.Kind == "category" && Named(life, record.Category));
        var residual = Math.Clamp(type?.ResidualPercent ?? 0, 0, 100) / 100;

        if (record.ExpectedLifespan is > 0)
        {
            var unit = record.ExpectedLifespanUnit?.Trim().ToLowerInvariant() ?? "years";
            var months = unit.StartsWith("month") ? record.ExpectedLifespan.Value
                : unit.StartsWith("week") ? record.ExpectedLifespan.Value * 7 / DaysPerMonth
                : unit.StartsWith("day") ? record.ExpectedLifespan.Value / DaysPerMonth
                : record.ExpectedLifespan.Value * 12;
            if (months >= 1)
            {
                return ((int)Math.Round(months), residual, "Asset expected lifespan");
            }
        }

        if (type?.UsefulLifeMonths is > 0)
        {
            return (type.UsefulLifeMonths.Value, residual, "Asset type");
        }

        if (category?.UsefulLifeMonths is > 0)
        {
            return (category.UsefulLifeMonths.Value, residual, "Asset category");
        }

        return ((int)Math.Round(defaultYears * 12), residual, "Default useful life");
    }

    /// <summary>Straight-line depreciation accumulated by atUtc.</summary>
    private static double Accumulated(AssetModel asset, DateTime atUtc)
    {
        if (asset.Cost <= 0 || asset.AcquiredAt is not { } start || atUtc <= start || asset.UsefulLifeMonths <= 0)
        {
            return 0;
        }

        var depreciable = asset.Cost * (1 - asset.Residual);
        var months = (atUtc - start).TotalDays / DaysPerMonth;
        return Math.Min(depreciable, depreciable * months / asset.UsefulLifeMonths);
    }

    private double DepreciationBetween(DateTime fromUtc, DateTime toUtc)
    {
        var end = PeriodEnd(toUtc);
        return end <= fromUtc ? 0 : _assets.Where(asset => !asset.Disposed).Sum(asset => Accumulated(asset, end) - Accumulated(asset, fromUtc));
    }

    private double AssetValue(DateTime atUtc) => _assets.Where(asset => !asset.Disposed && (asset.AcquiredAt is null || asset.AcquiredAt < atUtc)).Sum(asset => asset.Cost);

    private double NetBookValue(DateTime atUtc) =>
        _assets.Where(asset => !asset.Disposed && (asset.AcquiredAt is null || asset.AcquiredAt < atUtc)).Sum(asset => asset.Cost - Accumulated(asset, atUtc));

    private double Capex(DateTime fromUtc, DateTime toUtc) => _assets.Where(asset => InWindow(asset.AcquiredAt, fromUtc, toUtc)).Sum(asset => asset.Cost);

    private double Maintenance(DateTime fromUtc, DateTime toUtc) => CostsBetween(fromUtc, toUtc).Sum(cost => cost.Total);

    private IEnumerable<CostEntry> CostsBetween(DateTime fromUtc, DateTime toUtc) => _costs.Where(cost => cost.Date >= fromUtc && cost.Date < toUtc);

    private static bool InWindow(DateTime? date, DateTime fromUtc, DateTime toUtc) => date is { } value && value >= fromUtc && value < toUtc;

    /// <summary>Balances are read at the end of the period, or now while it is running.</summary>
    private DateTime PeriodEnd(DateTime toUtc) => toUtc < _utcNow ? toUtc : _utcNow;

    private string StatusOf(double? utilization, double actual) => utilization switch
    {
        null => actual > 0 ? NoBudget : OnTrack,
        > 100 => OverBudget,
        _ when utilization >= _settings.BudgetTarget => AtRisk,
        _ => OnTrack
    };

    private static KpiWidgetData Kpi(double value, double previous) => DashboardWidgetCalculator.Kpi(Round2(value), Round2(previous), "currency", percentChange: true);

    /// <summary>"18%", "18" or "0.18" as a percentage; null for words such as "High".</summary>
    private static double? Percent(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var trimmed = text.Trim().TrimEnd('%').Trim();
        if (!double.TryParse(trimmed, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
        {
            return null;
        }

        return !text.Contains('%') && value is > 0 and <= 1 && trimmed.Contains('.') ? value * 100 : value;
    }

    private static bool IsDisposed(string? status)
    {
        var text = status?.Trim().ToLowerInvariant() ?? string.Empty;
        return text.Contains("dispos") || text.Contains("scrap") || text.Contains("written off") || text.Contains("write-off") || text.Contains("sold");
    }

    private static IReadOnlyList<string> Labels(IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> months) =>
        months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static string Money(double value) => value.ToString("N0", CultureInfo.InvariantCulture);

    private static double Round1(double value) => Math.Round(value, 1);

    private static double Round2(double value) => Math.Round(value, 2);

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private sealed record CostCenterModel(string Code, string Name, double? AnnualBudget, HashSet<string> Names);

    private sealed record AssetModel(
        string Key,
        string MongoId,
        string? AssetId,
        string? AssetName,
        string Category,
        string Site,
        CostCenterModel CostCenter,
        double Cost,
        DateTime? AcquiredAt,
        int UsefulLifeMonths,
        double Residual,
        string UsefulLifeSource,
        double? HoursPerDay,
        double? Utilization,
        bool Disposed,
        IReadOnlyList<string> Keys);

    private sealed record CostEntry(
        DateTime Date,
        string? AssetKey,
        string? AssetName,
        string Category,
        string Site,
        CostCenterModel CostCenter,
        double Labour,
        double Parts,
        double Contractor,
        double? BudgetAllocation)
    {
        public double Total => Labour + Parts + Contractor;
    }
}
