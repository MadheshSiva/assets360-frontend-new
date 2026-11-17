using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// A KPI as the dashboard evaluates it: a built-in KPI with the tenant's changes, or a custom one. Metric is the catalogue figure it
/// measures (null for a manually reported value). TargetSet is false while a built-in KPI keeps its default target.
/// </summary>
public sealed record KpiDefinition(
    string Id,
    string Name,
    string Module,
    string Unit,
    string Direction,
    double Target,
    bool TargetSet,
    string? Owner,
    string Info,
    string? Metric,
    double? ManualValue,
    bool Flow,
    bool History,
    string Source,
    DateOnly? ReviewDueDate,
    bool IsBuiltIn,
    bool IsModified,
    DateTime? UpdatedAt);

/// <summary>
/// One KPI for the filter bar. Value is null (status "No Data") when nothing could be measured. Change is against the previous period of the
/// same length: points for percentages, percent otherwise; null without a previous value. Target is the period target (flow targets are
/// pro-rated; TargetBasis "budget" when it comes from recorded budget allocations). Attainment is % of target (100 = on target, capped at 130
/// for lower-is-better KPIs). Variance is value − target in points (%), units (count, x) or percent of target (AED, hrs), per VarianceUnit.
/// Spark holds the monthly values (MonthLabels) for KPIs with history that are on the view, else the current value only.
/// </summary>
public sealed record KpiState(
    KpiDefinition Kpi,
    double? Value,
    double? PreviousValue,
    double? Change,
    string ChangeUnit,
    double Target,
    string TargetBasis,
    string Status,
    double? Attainment,
    double? Variance,
    string VarianceUnit,
    IReadOnlyList<double?> Spark);

/// <summary>Average attainment (capped at 120%) of the view's KPIs per month or quarter; Prior is the previous period aligned by position.</summary>
public sealed record KpiTrend(string Granularity, IReadOnlyList<string> Categories, IReadOnlyList<double?> Overall, IReadOnlyList<double?> Target, IReadOnlyList<double?> Prior);

public sealed record KpiModuleAttainment(string Module, int Kpis, double Attainment, double Target);

/// <summary>A KPI Insights card. Action is exceptions, due-week, settings or plan; KpiId names the KPI a settings / plan action opens.</summary>
public sealed record KpiInsight(string Key, string Tone, string Title, string Text, string ActionLabel, string Action, string? KpiId, IReadOnlyList<string> KpiIds);

public sealed record KpiLibraryModule(string Module, int Count);

/// <summary>
/// KPI Dashboard figures for one filter bar and date range. Every catalogue KPI is read from the existing analytics calculators
/// (Asset Performance, Maintenance, Inspection and WIP / Production Analytics), run read-only for the period, the previous period and,
/// for the KPIs on the view, each month of both. Records are read once per request (<see cref="KpiDashboardDataCache"/>).
/// </summary>
public sealed class KpiDashboardCalculator
{
    public const string OnTrack = "On Track";
    public const string Watch = "Watch";
    public const string AtRisk = "At Risk";
    public const string OverBudget = "Over Budget";
    public const string NoData = "No Data";

    public const string Monthly = "Monthly";
    public const string Quarterly = "Quarterly";

    public static readonly IReadOnlyList<string> Statuses = [OnTrack, Watch, AtRisk, OverBudget, NoData];
    public static readonly IReadOnlyList<string> ExceptionStatuses = [Watch, AtRisk, OverBudget];
    public static readonly IReadOnlyList<string> Granularities = [Monthly, Quarterly];

    private const double TrendCap = 120;
    private const double LowerCap = 130;
    private const int DueSoonDays = 7;

    private readonly IDashboardDataRepository _data;
    private readonly DashboardDataScope _scope;
    private readonly DashboardPeriod _period;
    private readonly DateTime _utcNow;
    private readonly Window _current;
    private readonly Window _previous;
    private readonly List<Window> _months;
    private readonly List<Window> _priorMonths;
    private readonly List<DateOnly> _monthStarts;
    private IReadOnlyList<DashboardAsset>? _assets;
    private IReadOnlyList<DashboardSparePart>? _spareParts;

    private KpiDashboardCalculator(IDashboardDataRepository data, DashboardDataScope scope, DashboardPeriod period, DashboardPeriod previous, DateTime utcNow)
    {
        _data = data;
        _scope = scope;
        _period = period;
        _utcNow = utcNow;
        _current = new Window(this, period);
        _previous = new Window(this, previous);

        var months = AssetPerformanceCalculator.Months(period, utcNow);
        _monthStarts = months.Select(month => month.Month).ToList();
        _months = months.Select(month => new Window(this, WindowPeriod(month.StartUtc, month.EndUtc))).ToList();
        _priorMonths = AssetPerformanceCalculator.Months(previous, utcNow).Select(month => new Window(this, WindowPeriod(month.StartUtc, month.EndUtc))).ToList();
    }

    public DashboardPeriod Period => _period;

    public IReadOnlyList<string> MonthLabels => _monthStarts.Select(month => month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    public static KpiDashboardCalculator Create(IDashboardDataRepository repository, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow)
    {
        var previous = Resolve(period.PreviousFromUtc, period.PreviousToUtc, period, utcNow);
        var cache = new KpiDashboardDataCache(repository, previous.PreviousFromUtc, period.ToUtc);
        return new KpiDashboardCalculator(cache, scope, period, previous, utcNow);
    }

    /// <summary>Every definition for the period; withHistory names the KPIs (the view's tiles) that also get monthly values.</summary>
    public async Task<KpiEvaluation> EvaluateAsync(IReadOnlyList<KpiDefinition> definitions, IReadOnlySet<string> withHistory, CancellationToken cancellationToken)
    {
        var results = new List<Evaluated>();
        foreach (var definition in definitions)
        {
            results.Add(await EvaluateAsync(definition, withHistory.Contains(definition.Id), cancellationToken));
        }

        return new KpiEvaluation(this, results);
    }

    private async Task<Evaluated> EvaluateAsync(KpiDefinition definition, bool history, CancellationToken cancellationToken)
    {
        if (definition.Metric is null)
        {
            var manual = definition.ManualValue;
            return new Evaluated(Build(definition, manual, null, definition.Target, "target", manual is null ? [] : [manual]), [], [], [], []);
        }

        var value = await _current.ValueAsync(definition.Metric, true, cancellationToken);
        var (target, basis) = await PeriodTargetAsync(definition, cancellationToken);
        if (!definition.History)
        {
            return new Evaluated(Build(definition, value, null, target, basis, value is null ? [] : [value]), [], [], [], []);
        }

        var previous = await _previous.ValueAsync(definition.Metric, false, cancellationToken);
        if (!history)
        {
            return new Evaluated(Build(definition, value, previous, target, basis, value is null ? [] : [value]), [], [], [], []);
        }

        var perDay = target / Math.Max(1, EffectiveDays(_period.FromUtc, _period.ToUtc));
        double TargetOf(Window window) => definition.Flow ? perDay * EffectiveDays(window.Period.FromUtc, window.Period.ToUtc) : target;

        var monthly = new List<double?>();
        foreach (var month in _months)
        {
            monthly.Add(await month.ValueAsync(definition.Metric, false, cancellationToken));
        }

        var prior = new List<double?>();
        foreach (var month in _priorMonths)
        {
            prior.Add(await month.ValueAsync(definition.Metric, false, cancellationToken));
        }

        return new Evaluated(
            Build(definition, value, previous, target, basis, monthly),
            monthly,
            _months.Select(TargetOf).ToList(),
            prior,
            _priorMonths.Select(TargetOf).ToList());
    }

    /// <summary>The target for the whole period: flow targets are annual amounts pro-rated to the period (to date), or the recorded budget.</summary>
    private async Task<(double Target, string Basis)> PeriodTargetAsync(KpiDefinition definition, CancellationToken cancellationToken)
    {
        if (!definition.Flow)
        {
            return (definition.Target, "target");
        }

        if (!definition.TargetSet && definition.Metric == "cost"
            && (await _current.MaintenanceAsync(cancellationToken)).CostTrend().Totals.Budget is { } budget && budget > 0)
        {
            return (Round2(budget), "budget");
        }

        return (Round2(definition.Target / 365 * EffectiveDays(_period.FromUtc, _period.ToUtc)), "target");
    }

    private KpiState Build(KpiDefinition definition, double? value, double? previous, double target, string basis, IReadOnlyList<double?> spark)
    {
        var percentUnit = definition.Unit == KpiDashboardCatalog.Percent;
        double? change = value is null || previous is null
            ? null
            : percentUnit
                ? Round1(value.Value - previous.Value)
                : previous.Value == 0 ? null : Round1((value.Value - previous.Value) / Math.Abs(previous.Value) * 100);

        double? variance = null;
        var varianceUnit = "percent";
        if (value is not null)
        {
            switch (definition.Unit)
            {
                case KpiDashboardCatalog.Percent:
                    variance = Round1(value.Value - target);
                    varianceUnit = "points";
                    break;
                case KpiDashboardCatalog.Count:
                    variance = Math.Round(value.Value) - Math.Round(target);
                    varianceUnit = "count";
                    break;
                case KpiDashboardCatalog.Ratio:
                    variance = Round1(value.Value - target);
                    varianceUnit = "x";
                    break;
                default:
                    variance = target == 0 ? null : Math.Round((value.Value - target) / target * 100);
                    break;
            }
        }

        return new KpiState(
            definition,
            value,
            previous,
            change,
            percentUnit ? "points" : "percent",
            target,
            basis,
            value is null ? NoData : StatusOf(value.Value, target, definition.Direction, definition.Unit),
            value is null ? null : Round1(Attainment(value.Value, target, definition.Direction)),
            variance,
            varianceUnit,
            spark);
    }

    public static string StatusOf(double value, double target, string direction, string unit)
    {
        if (direction == KpiDashboardCatalog.Higher)
        {
            return value >= target ? OnTrack : value >= target * 0.97 ? Watch : AtRisk;
        }

        if (value <= target) return OnTrack;
        if (unit == KpiDashboardCatalog.Currency) return OverBudget;
        return value <= target * 1.05 ? Watch : AtRisk;
    }

    /// <summary>% of target, both directions (100 = on target).</summary>
    public static double Attainment(double value, double target, string direction)
    {
        if (direction == KpiDashboardCatalog.Higher)
        {
            return target != 0 ? value / target * 100 : 0;
        }

        return value != 0 ? Math.Min(LowerCap, target / value * 100) : LowerCap;
    }

    // ===== Metrics =====

    private async Task<double?> MetricAsync(Window window, string metric, bool isCurrent, CancellationToken cancellationToken)
    {
        switch (metric)
        {
            case "health": return (await window.AssetSummaryAsync(cancellationToken)).AverageHealthScore.Value;
            case "utilization": return (await window.AssetSummaryAsync(cancellationToken)).UtilizationRate.Value;
            case "availability": return (await window.AssetSummaryAsync(cancellationToken)).Availability.Value;
            case "mtbf": return (await window.AssetSummaryAsync(cancellationToken)).Mtbf.Value;
            case "mttr": return (await window.AssetSummaryAsync(cancellationToken)).Mttr.Value;
            case "pm": return (await window.MaintenanceSummaryAsync(cancellationToken)).PreventiveCompliance.Value;
            case "openWo": return (await window.MaintenanceSummaryAsync(cancellationToken)).OpenWorkOrders.Value;
            case "cost": return (await window.MaintenanceSummaryAsync(cancellationToken)).MaintenanceCost.Value;
            case "overdueWo":
                return (await window.MaintenanceAsync(cancellationToken)).WorkOrderStatus().Items
                    .FirstOrDefault(item => item.Label == MaintenanceAnalyticsCalculator.Overdue)?.Count ?? 0;
            case "inspection": return (await window.InspectionSummaryAsync(cancellationToken)).CompletionRate.Value;
            case "openFindings": return (await window.InspectionSummaryAsync(cancellationToken)).OpenFindings.Value;
            case "criticalFindings": return (await window.InspectionSummaryAsync(cancellationToken)).CriticalFindings.Value;
            case "compliance": return (await window.InspectionAsync(cancellationToken)).Compliance().Value;
            case "capa":
            {
                var raised = (await window.InspectionAsync(cancellationToken)).FindingsByCategory().Total;
                var open = (await window.InspectionSummaryAsync(cancellationToken)).OpenFindings.Value ?? 0;
                return raised == 0 ? null : Round1(100 * (raised - open) / raised);
            }
            case "oee": return (await window.ProductionSummaryAsync(cancellationToken)).Oee.Value;
            case "onTime": return (await window.ProductionSummaryAsync(cancellationToken)).OnTimeCompletion.Value;
            case "wip": return (await window.ProductionSummaryAsync(cancellationToken)).WipValue.Value;
            case "turnover":
            {
                var stock = StockValue(await SparePartsAsync(cancellationToken));
                var days = EffectiveDays(window.Period.FromUtc, window.Period.ToUtc);
                if (stock <= 0 || days <= 0) return null;
                var used = (await window.MaintenanceAsync(cancellationToken)).CostTrend().Totals.SparePartsCost;
                return Round2(used * 365 / days / stock);
            }
        }

        // Point-in-time figures exist only as of now.
        if (!isCurrent)
        {
            return null;
        }

        switch (metric)
        {
            case "missing":
                return (await AssetsAsync(cancellationToken)).Count(asset =>
                    asset.Status?.Trim().ToLowerInvariant() is { } status && (status.Contains("missing") || status.Contains("lost")));
            case "reorder":
                return (await SparePartsAsync(cancellationToken)).Count(part => part.QuantityInStock <= 0 || part.QuantityInStock <= part.MinimumStockLevel);
            case "inventoryValue":
            {
                var parts = await SparePartsAsync(cancellationToken);
                return parts.Count == 0 ? null : Round2(StockValue(parts));
            }
            case "overdueCapa":
                return (await window.InspectionAsync(cancellationToken)).OpenFindings().Count(row => row.IsOverdue);
        }

        return null;
    }

    private static double StockValue(IReadOnlyList<DashboardSparePart> parts) => parts.Sum(part => Math.Max(0, part.QuantityInStock) * part.UnitCost);

    private async Task<IReadOnlyList<DashboardAsset>> AssetsAsync(CancellationToken cancellationToken) =>
        _assets ??= await _data.GetAssetsAsync(_scope, cancellationToken);

    private async Task<IReadOnlyList<DashboardSparePart>> SparePartsAsync(CancellationToken cancellationToken)
    {
        if (_spareParts is null)
        {
            var assets = await AssetsAsync(cancellationToken);
            IReadOnlyCollection<string>? keys = _scope.FiltersAssets ? assets.SelectMany(asset => asset.Keys()).Distinct().ToList() : null;
            _spareParts = keys is { Count: 0 } ? [] : await _data.GetSparePartsAsync(_scope, keys, DateTime.MaxValue, cancellationToken);
        }

        return _spareParts;
    }

    // ===== Periods =====

    /// <summary>Days of [fromUtc, toUtc) up to now.</summary>
    private double EffectiveDays(DateTime fromUtc, DateTime toUtc)
    {
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        return Math.Max(0, (end - fromUtc).TotalDays);
    }

    private DashboardPeriod WindowPeriod(DateTime fromUtc, DateTime toUtc) => Resolve(fromUtc, toUtc, _period, _utcNow);

    private static DashboardPeriod Resolve(DateTime fromUtc, DateTime toUtc, DashboardPeriod period, DateTime utcNow)
    {
        var from = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(fromUtc, DateTimeKind.Utc), period.Zone));
        var to = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(toUtc, DateTimeKind.Utc), period.Zone)).AddDays(-1);
        if (to < from)
        {
            to = from;
        }

        return DashboardPeriods.Resolve(InteractiveDashboardOptions.CustomDatePreset, from, to, period.Zone, period.TimeZone, utcNow);
    }

    internal IReadOnlyList<(string Label, IReadOnlyList<int> Months)> Quarters()
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(_utcNow, _period.Zone));
        return _monthStarts
            .Select((month, index) => (Month: month, Index: index))
            .GroupBy(item => (item.Month.Year, Quarter: (item.Month.Month - 1) / 3 + 1))
            .Select(group =>
            {
                var quarterEnd = new DateOnly(group.Key.Year, group.Key.Quarter * 3, 1).AddMonths(1).AddDays(-1);
                var toDate = quarterEnd > today || quarterEnd > _period.To;
                var label = $"Q{group.Key.Quarter}{(toDate ? " (QTD)" : string.Empty)} {group.Key.Year}";
                return (label, (IReadOnlyList<int>)group.Select(item => item.Index).ToList());
            })
            .ToList();
    }

    internal DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(_utcNow, _period.Zone));

    private static double Round1(double value) => Math.Round(value, 1);

    private static double Round2(double value) => Math.Round(value, 2);

    internal sealed record Evaluated(
        KpiState State,
        IReadOnlyList<double?> Monthly,
        IReadOnlyList<double> MonthlyTargets,
        IReadOnlyList<double?> Prior,
        IReadOnlyList<double> PriorTargets);

    /// <summary>One date range and the calculators run over it, created when a metric first needs them.</summary>
    private sealed class Window(KpiDashboardCalculator owner, DashboardPeriod period)
    {
        private readonly Dictionary<string, double?> _values = new();
        private AssetPerformanceCalculator? _asset;
        private AssetPerformanceSummary? _assetSummary;
        private MaintenanceAnalyticsCalculator? _maintenance;
        private MaintenanceSummary? _maintenanceSummary;
        private InspectionAnalyticsCalculator? _inspection;
        private InspectionSummary? _inspectionSummary;
        private ProductionAnalyticsCalculator? _production;
        private ProductionSummary? _productionSummary;

        public DashboardPeriod Period => period;

        public async Task<double?> ValueAsync(string metric, bool isCurrent, CancellationToken cancellationToken)
        {
            if (!_values.TryGetValue(metric, out var value))
            {
                value = await owner.MetricAsync(this, metric, isCurrent, cancellationToken);
                value = value is { } known ? Math.Round(known, 2) : null;
                _values[metric] = value;
            }

            return value;
        }

        public async Task<AssetPerformanceSummary> AssetSummaryAsync(CancellationToken cancellationToken)
        {
            _asset ??= await AssetPerformanceCalculator.LoadAsync(
                owner._data, owner._scope, period,
                new AssetPerformanceThresholds(AssetPerformanceOptions.DefaultHealthThreshold, AssetPerformanceOptions.DefaultUtilizationTarget),
                owner._utcNow, cancellationToken);
            return _assetSummary ??= _asset.Summary();
        }

        public async Task<MaintenanceAnalyticsCalculator> MaintenanceAsync(CancellationToken cancellationToken) =>
            _maintenance ??= await MaintenanceAnalyticsCalculator.LoadAsync(
                owner._data, owner._scope, period,
                new MaintenanceAnalyticsSettings(null, MaintenanceAnalyticsOptions.DefaultComplianceTarget, null, MaintenanceAnalyticsOptions.DefaultFailureHealthThreshold),
                owner._utcNow, cancellationToken);

        public async Task<MaintenanceSummary> MaintenanceSummaryAsync(CancellationToken cancellationToken) =>
            _maintenanceSummary ??= (await MaintenanceAsync(cancellationToken)).Summary();

        public async Task<InspectionAnalyticsCalculator> InspectionAsync(CancellationToken cancellationToken) =>
            _inspection ??= await InspectionAnalyticsCalculator.LoadAsync(
                owner._data, owner._scope, period,
                new InspectionAnalyticsSettings(
                    null, null, InspectionAnalyticsOptions.DefaultComplianceTarget, InspectionAnalyticsOptions.DefaultDueWithinDays, InspectionAnalyticsOptions.DefaultRepeatWindowDays),
                owner._utcNow, cancellationToken);

        public async Task<InspectionSummary> InspectionSummaryAsync(CancellationToken cancellationToken) =>
            _inspectionSummary ??= (await InspectionAsync(cancellationToken)).Summary();

        public async Task<ProductionSummary> ProductionSummaryAsync(CancellationToken cancellationToken)
        {
            _production ??= await ProductionAnalyticsCalculator.LoadAsync(
                owner._data, owner._scope, period,
                new ProductionAnalyticsSettings(null, null, null, null, ProductionAnalyticsOptions.DefaultUtilizationTarget, null, ProductionAnalyticsOptions.DefaultAtRiskGap),
                owner._utcNow, cancellationToken);
            return _productionSummary ??= _production.Summary();
        }
    }

    /// <summary>The evaluated KPIs and the page sections worked out from them.</summary>
    public sealed class KpiEvaluation
    {
        private readonly KpiDashboardCalculator _calculator;
        private readonly List<Evaluated> _results;
        private readonly Dictionary<string, Evaluated> _byId;

        internal KpiEvaluation(KpiDashboardCalculator calculator, List<Evaluated> results)
        {
            _calculator = calculator;
            _results = results;
            _byId = results.GroupBy(result => result.State.Kpi.Id, StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        }

        public IReadOnlyList<KpiState> States => _results.Select(result => result.State).ToList();

        public KpiState? Find(string id) => _byId.TryGetValue(id, out var result) ? result.State : null;

        /// <summary>The tiles in order (unknown ids are skipped).</summary>
        public IReadOnlyList<KpiState> Tiles(IEnumerable<string> ids) => ids.Where(_byId.ContainsKey).Select(id => _byId[id].State).ToList();

        public KpiTrend Trend(IEnumerable<string> ids, string granularity)
        {
            var shown = ids.Where(_byId.ContainsKey).Select(id => _byId[id]).Where(result => result.State.Status != NoData && result.Monthly.Count > 0).ToList();
            var count = _calculator._months.Count;

            double? Score(int index, bool prior)
            {
                var values = shown
                    .Select(result =>
                    {
                        var list = prior ? result.Prior : result.Monthly;
                        var targets = prior ? result.PriorTargets : result.MonthlyTargets;
                        return index < list.Count && list[index] is { } value && targets[index] > 0
                            ? Math.Min(TrendCap, Attainment(value, targets[index], result.State.Kpi.Direction))
                            : (double?)null;
                    })
                    .OfType<double>()
                    .ToList();
                return values.Count == 0 ? null : Round1(values.Average());
            }

            var overall = Enumerable.Range(0, count).Select(index => Score(index, false)).ToList();
            var previous = Enumerable.Range(0, count).Select(index => Score(index, true)).ToList();

            if (granularity == Quarterly)
            {
                var quarters = _calculator.Quarters();
                static double? Average(IReadOnlyList<double?> values, IReadOnlyList<int> indexes)
                {
                    var known = indexes.Select(index => values[index]).OfType<double>().ToList();
                    return known.Count == 0 ? null : Round1(known.Average());
                }

                return new KpiTrend(
                    Quarterly,
                    quarters.Select(quarter => quarter.Label).ToList(),
                    quarters.Select(quarter => Average(overall, quarter.Months)).ToList(),
                    quarters.Select(_ => (double?)100).ToList(),
                    quarters.Select(quarter => Average(previous, quarter.Months)).ToList());
            }

            return new KpiTrend(Monthly, _calculator.MonthLabels, overall, overall.Select(_ => (double?)100).ToList(), previous);
        }

        /// <summary>Average attainment per module of the view's KPIs that have data.</summary>
        public IReadOnlyList<KpiModuleAttainment> Targets(IEnumerable<string> ids)
        {
            var shown = Shown(ids);
            return KpiDashboardCatalog.Modules
                .Select(module => (Module: module, List: shown.Where(state => state.Kpi.Module == module).ToList()))
                .Where(item => item.List.Count > 0)
                .Select(item => new KpiModuleAttainment(item.Module, item.List.Count, Round1(item.List.Average(state => state.Attainment ?? 0)), 100))
                .ToList();
        }

        /// <summary>The view's KPIs that are not on track (KPIs without data are left out), optionally of one status.</summary>
        public IReadOnlyList<KpiState> Exceptions(IEnumerable<string> ids, string? status) => Shown(ids)
            .Where(state => state.Status != OnTrack && (status is null || state.Status == status))
            .OrderByDescending(state => StatusRank(state.Status))
            .ThenByDescending(state => Math.Abs(100 - (state.Attainment ?? 100)))
            .ToList();

        public IReadOnlyList<KpiInsight> Insights(IEnumerable<string> ids)
        {
            var exceptions = Exceptions(ids, null);
            var below = exceptions.Where(state => state.Status != OverBudget).ToList();
            var over = exceptions.Where(state => state.Status == OverBudget).OrderByDescending(state => state.Value - state.Target).FirstOrDefault();
            var atRisk = exceptions.Where(state => state.Status == AtRisk).OrderBy(state => state.Attainment).FirstOrDefault();
            var dueBy = _calculator.Today.AddDays(DueSoonDays);
            var dueWeek = exceptions.Where(state => state.Kpi.ReviewDueDate is { } due && due <= dueBy).ToList();
            var owners = dueWeek.Select(state => state.Kpi.Owner ?? string.Empty).Distinct(StringComparer.OrdinalIgnoreCase).Count();

            var insights = new List<KpiInsight>
            {
                below.Count > 0
                    ? new KpiInsight("below_target", "red", $"{Plural(below.Count, "KPI")} below target",
                        $"{Names(below)} {(below.Count == 1 ? "is" : "are")} below target.", "View exceptions", "exceptions", null, below.Select(state => state.Kpi.Id).ToList())
                    : new KpiInsight("below_target", "green", "All KPIs on target",
                        "Every KPI in this view with data meets its target for the selected filters.", "View exceptions", "exceptions", null, [])
            };

            if (over is not null)
            {
                var amount = over.Value!.Value - over.Target;
                insights.Add(new("over_budget", "red",
                    $"{over.Kpi.Name} is {Money(amount)} over budget",
                    $"{over.Kpi.Name} is {over.Variance:+0;-0;0}% over its {(over.TargetBasis == "budget" ? "budget" : "target")} for the selected period.",
                    "Create action plan", "plan", over.Kpi.Id, [over.Kpi.Id]));
            }

            if (atRisk is not null)
            {
                var gap = Round1(100 - (atRisk.Attainment ?? 0));
                var worsening = atRisk.Change is { } change && (atRisk.Kpi.Direction == KpiDashboardCatalog.Higher ? change < 0 : change > 0);
                insights.Add(new("at_risk", "orange",
                    $"{atRisk.Kpi.Name} requires attention",
                    $"{atRisk.Kpi.Name} is {gap.ToString("0.#", CultureInfo.InvariantCulture)}% off target{(worsening ? " and trending the wrong way against the previous period" : string.Empty)}.",
                    "Open KPI settings", "settings", atRisk.Kpi.Id, [atRisk.Kpi.Id]));
            }

            insights.Add(new("due_this_week", "blue",
                $"{owners} KPI owner{(owners == 1 ? " has" : "s have")} actions due this week",
                $"There {(dueWeek.Count == 1 ? "is" : "are")} {dueWeek.Count} off-target KPI{(dueWeek.Count == 1 ? "" : "s")} with a review due within the next {DueSoonDays} days (or overdue).",
                "View exceptions", "due-week", null, dueWeek.Select(state => state.Kpi.Id).ToList()));

            return insights;
        }

        public IReadOnlyList<KpiLibraryModule> Library() => KpiDashboardCatalog.Modules
            .Select(module => new KpiLibraryModule(module, _results.Count(result => result.State.Kpi.Module == module)))
            .ToList();

        private List<KpiState> Shown(IEnumerable<string> ids) => Tiles(ids).Where(state => state.Status != NoData).ToList();

        private static int StatusRank(string status) => status switch
        {
            AtRisk => 4,
            OverBudget => 3,
            Watch => 2,
            OnTrack => 1,
            _ => 0
        };

        private static string Names(IReadOnlyList<KpiState> list)
        {
            var names = list.Select(state => state.Kpi.Name).ToList();
            return names.Count > 1 ? $"{string.Join(", ", names.Take(names.Count - 1))} and {names[^1]}" : string.Join(string.Empty, names);
        }

        private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

        private static string Money(double value)
        {
            var abs = Math.Abs(value);
            var text = abs >= 1_000_000
                ? $"{(abs / 1_000_000).ToString("0.##", CultureInfo.InvariantCulture)}M"
                : abs >= 1_000 ? $"{(abs / 1_000).ToString(abs >= 100_000 ? "0" : "0.#", CultureInfo.InvariantCulture)}K" : abs.ToString("0", CultureInfo.InvariantCulture);
            return $"{(value < 0 ? "-" : string.Empty)}{KpiDashboardCatalog.Currency} {text}";
        }
    }
}
