using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// MaintenanceType narrows work orders and costs (Preventive, Corrective, Emergency or Inspection). ComplianceTarget is the
/// preventive compliance target in percent. EmergencyCostTarget is an amount; without it the previous period's emergency cost is the baseline.
/// FailureHealthThreshold marks assets approaching failure.
/// </summary>
public sealed record MaintenanceAnalyticsSettings(string? MaintenanceType, double ComplianceTarget, double? EmergencyCostTarget, double FailureHealthThreshold);

public sealed record MaintenanceSummary(
    KpiWidgetData MaintenanceCost,
    KpiWidgetData OpenWorkOrders,
    KpiWidgetData PreventiveCompliance,
    KpiWidgetData Mttr,
    KpiWidgetData Mtbf);

public sealed record MaintenanceCostTotals(
    double Planned,
    double Corrective,
    double Emergency,
    double Unassigned,
    double Total,
    double LaborCost,
    double SparePartsCost,
    double? Budget);

/// <summary>Monthly cost by Planned (preventive and inspection), Corrective and Emergency work, plus Total Cost.</summary>
public sealed record MaintenanceCostTrend(PerformanceSeries Trend, MaintenanceCostTotals Totals);

public sealed record CountItem(string Label, int Count, double Percentage);

public sealed record CountBreakdown(int Total, IReadOnlyList<CountItem> Items);

public sealed record PreventiveComplianceSummary(
    double? Value,
    double Target,
    bool? MeetsTarget,
    double? PreviousValue,
    double? Change,
    int Completed,
    int Due,
    PerformanceSeries Trend);

public sealed record DowntimeCauseTotal(string Cause, double Hours, double Percentage);

public sealed record DowntimeByCause(double TotalHours, IReadOnlyList<DowntimeCauseTotal> Causes, PerformanceSeries Trend);

public sealed record InsightWorkOrder(string Id, string? WorkOrderId, string? AssetId, string? AssetName, string? Priority, string Status, IReadOnlyList<string> Reasons);

/// <summary>A Maintenance Insights card. Actions name its buttons; Query is what "View work orders" passes to /backlog.</summary>
public sealed record MaintenanceInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    IReadOnlyList<InsightWorkOrder> WorkOrders,
    IReadOnlyList<InsightAsset> Assets,
    IReadOnlyList<string> Parts,
    IReadOnlyList<string> Actions,
    string Query);

public sealed record BacklogRow(
    string Id,
    string? WorkOrderId,
    string WorkType,
    string Priority,
    string? AssetRecordId,
    string? AssetId,
    string? AssetName,
    string? Location,
    int? AgeDays,
    string? AssignedTo,
    string Status,
    DateTime? DueDate,
    bool IsOverdue,
    bool PartsShortage);

public sealed record TechnicianPerformanceRow(
    string Technician,
    string? TechnicianId,
    int Assigned,
    int Completed,
    double? FirstTimeFixRate,
    double? AvgResponseHours,
    double? SlaCompliance);

/// <summary>
/// Maintenance Analytics for one filter bar and date range. Work orders belong to the period by scheduled date (or creation date).
/// Work types map to Preventive, Corrective, Emergency or Inspection; statuses to Open, In Progress, On Hold, Completed or Cancelled,
/// and an unfinished work order past its scheduled date is Overdue. A completed work order's updated_at is taken as its completion time.
/// A cost record's type comes from its own maintenance type, else its work order, else the asset's work orders that month (split by count).
/// </summary>
public sealed class MaintenanceAnalyticsCalculator
{
    public const string Preventive = "Preventive";
    public const string Corrective = "Corrective";
    public const string Emergency = "Emergency";
    public const string Inspection = "Inspection";
    public const string OtherType = "Other";

    public const string Open = "Open";
    public const string InProgress = "In Progress";
    public const string OnHold = "On Hold";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";
    public const string Overdue = "Overdue";

    public const string Planned = "Planned";
    public const string Unassigned = "Unassigned";

    public static readonly IReadOnlyList<string> WorkTypes = [Preventive, Corrective, Emergency, Inspection];
    public static readonly IReadOnlyList<string> Statuses = [Open, InProgress, OnHold, Completed, Overdue, Cancelled];
    public static readonly IReadOnlyList<string> Priorities = ["Critical", "High", "Medium", "Low"];
    public static readonly IReadOnlyList<string> DowntimeCauses = ["Mechanical", "Electrical", "Operational", "Parts Unavailable"];

    private const int FirstTimeFixDays = 30;

    private readonly DashboardPeriod _period;
    private readonly MaintenanceAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly Dictionary<string, DashboardAsset> _assetsByKey;
    private readonly IReadOnlyList<DashboardWorkOrder> _workOrders;
    private readonly IReadOnlyList<DashboardCostRecord> _costs;
    private readonly IReadOnlyList<DashboardDowntime> _downtime;
    private readonly IReadOnlyList<DashboardSparePart> _spareParts;
    private readonly IReadOnlyList<DashboardSlaRule> _slaRules;
    private readonly Dictionary<string, string> _technicianNames;
    private readonly AssetPerformanceCalculator _reliability;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;

    private MaintenanceAnalyticsCalculator(
        DashboardPeriod period,
        MaintenanceAnalyticsSettings settings,
        DateTime utcNow,
        Dictionary<string, DashboardAsset> assetsByKey,
        IReadOnlyList<DashboardWorkOrder> workOrders,
        IReadOnlyList<DashboardCostRecord> costs,
        IReadOnlyList<DashboardDowntime> downtime,
        IReadOnlyList<DashboardSparePart> spareParts,
        IReadOnlyList<DashboardSlaRule> slaRules,
        Dictionary<string, string> technicianNames,
        AssetPerformanceCalculator reliability)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _assetsByKey = assetsByKey;
        _workOrders = workOrders;
        _costs = costs;
        _downtime = downtime;
        _spareParts = spareParts;
        _slaRules = slaRules;
        _technicianNames = technicianNames;
        _reliability = reliability;
        _months = AssetPerformanceCalculator.Months(period, utcNow);
    }

    public DashboardPeriod Period => _period;

    public static async Task<MaintenanceAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
        DashboardPeriod period,
        MaintenanceAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var assets = await repository.GetAssetsAsync(scope, cancellationToken);
        var assetsByKey = new Dictionary<string, DashboardAsset>();
        foreach (var asset in assets)
        {
            foreach (var key in asset.Keys())
            {
                assetsByKey.TryAdd(key, asset);
            }
        }

        IReadOnlyCollection<string>? keys = scope.FiltersAssets ? assetsByKey.Keys : null;
        var months = AssetPerformanceCalculator.Months(period, utcNow);
        var loadFrom = months.Count > 0 && months[0].StartUtc < period.PreviousFromUtc ? months[0].StartUtc : period.PreviousFromUtc;

        // Every work order is read: the backlog and overdue counts are not limited to the period.
        var workOrders = await repository.GetWorkOrdersAsync(scope, keys, null, null, openOnly: false, cancellationToken);
        var costs = await repository.GetCostRecordsAsync(scope, keys, loadFrom, period.ToUtc, cancellationToken);
        var downtime = await repository.GetDowntimeAsync(scope, keys, period.FromUtc, period.ToUtc, cancellationToken);
        var spareParts = await repository.GetSparePartsAsync(scope, keys, DateTime.MaxValue, cancellationToken);
        var slaRules = await repository.GetSlaRulesAsync(scope, cancellationToken);

        var technicianNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var technician in await repository.GetTechniciansAsync(scope, cancellationToken))
        {
            if (!string.IsNullOrWhiteSpace(technician.TechnicianId) && !string.IsNullOrWhiteSpace(technician.Name))
            {
                technicianNames.TryAdd(technician.TechnicianId, technician.Name);
            }
        }

        var reliability = await AssetPerformanceCalculator.LoadAsync(
            repository,
            scope,
            period,
            new AssetPerformanceThresholds(settings.FailureHealthThreshold, AssetPerformanceOptions.DefaultUtilizationTarget),
            utcNow,
            cancellationToken);

        return new MaintenanceAnalyticsCalculator(
            period, settings, utcNow, assetsByKey, workOrders, costs, downtime, spareParts, slaRules, technicianNames, reliability);
    }

    public MaintenanceSummary Summary()
    {
        var reliability = _reliability.Summary();

        return new MaintenanceSummary(
            DashboardWidgetCalculator.Kpi(
                Round2(CostBetween(_period.FromUtc, _period.ToUtc).Sum(cost => cost.Amount)),
                Round2(CostBetween(_period.PreviousFromUtc, _period.PreviousToUtc).Sum(cost => cost.Amount)),
                "currency",
                percentChange: true),
            DashboardWidgetCalculator.Kpi(
                InPeriod(_period.FromUtc, _period.ToUtc).Count(IsUnfinished),
                InPeriod(_period.PreviousFromUtc, _period.PreviousToUtc).Count(IsUnfinished),
                "number",
                percentChange: true),
            DashboardWidgetCalculator.Kpi(
                Compliance(_period.FromUtc, _period.ToUtc).Value,
                Compliance(_period.PreviousFromUtc, _period.PreviousToUtc).Value,
                "percent",
                percentChange: false),
            reliability.Mttr,
            reliability.Mtbf);
    }

    public MaintenanceCostTrend CostTrend()
    {
        var series = new Dictionary<string, List<double?>> { [Planned] = [], [Corrective] = [], [Emergency] = [], [Unassigned] = [] };
        var totals = new List<double?>();

        foreach (var (_, startUtc, endUtc) in _months)
        {
            var month = CostBetween(startUtc, endUtc);
            foreach (var (name, values) in series)
            {
                values.Add(Round2(month.Where(cost => cost.Series == name).Sum(cost => cost.Amount)));
            }

            totals.Add(Round2(month.Sum(cost => cost.Amount)));
        }

        var period = CostBetween(_period.FromUtc, _period.ToUtc);
        var records = period.Select(cost => cost.Record).Distinct().ToList();
        double Sum(string name) => Round2(period.Where(cost => cost.Series == name).Sum(cost => cost.Amount));
        var budgets = records.Select(record => record.BudgetAllocation).OfType<double>().ToList();
        var share = TypeShareOfRecords(period);

        var lines = series
            .Where(line => line.Key != Unassigned || line.Value.Any(value => value > 0))
            .Select(line => new PerformanceSeriesLine(line.Key, line.Value))
            .Append(new PerformanceSeriesLine("Total Cost", totals))
            .ToList();

        return new MaintenanceCostTrend(
            new PerformanceSeries(MonthLabels(), lines),
            new MaintenanceCostTotals(
                Sum(Planned),
                Sum(Corrective),
                Sum(Emergency),
                Sum(Unassigned),
                Round2(period.Sum(cost => cost.Amount)),
                Round2(records.Sum(record => record.LaborCost * share(record))),
                Round2(records.Sum(record => record.SparePartsCost * share(record))),
                budgets.Count == 0 ? null : Round2(budgets.Sum())));
    }

    public CountBreakdown WorkOrdersByType()
    {
        var workOrders = InPeriod(_period.FromUtc, _period.ToUtc).ToList();
        var counts = WorkTypes.Append(OtherType)
            .Select(type => (Label: type, Count: workOrders.Count(workOrder => TypeOf(workOrder.WorkType) == type)))
            .Where(item => item.Label != OtherType || item.Count > 0)
            .ToList();

        return Breakdown(counts);
    }

    public CountBreakdown WorkOrderStatus()
    {
        var workOrders = InPeriod(_period.FromUtc, _period.ToUtc).ToList();
        var counts = Statuses
            .Select(status => (Label: status, Count: workOrders.Count(workOrder => StatusOf(workOrder) == status)))
            .Where(item => item.Label != Cancelled || item.Count > 0)
            .ToList();

        return Breakdown(counts);
    }

    public PreventiveComplianceSummary PreventiveCompliance()
    {
        var current = Compliance(_period.FromUtc, _period.ToUtc);
        var previous = Compliance(_period.PreviousFromUtc, _period.PreviousToUtc);
        var target = _settings.ComplianceTarget;

        return new PreventiveComplianceSummary(
            current.Value,
            target,
            current.Value is null ? null : current.Value >= target,
            previous.Value,
            current.Value is null || previous.Value is null ? null : Math.Round(current.Value.Value - previous.Value.Value, 1),
            current.Completed,
            current.Due,
            new PerformanceSeries(MonthLabels(),
            [
                new("Compliance (%)", _months.Select(month => Compliance(month.StartUtc, month.EndUtc).Value).ToList()),
                new("Target (%)", _months.Select(_ => (double?)target).ToList())
            ]));
    }

    public ReliabilitySummary Reliability() => _reliability.Reliability();

    public DowntimeByCause DowntimeByCause()
    {
        var causes = DowntimeCauses.ToList();
        foreach (var cause in _downtime.Select(record => CauseOf(record.Reason)).Distinct().Where(cause => !causes.Contains(cause)).Order())
        {
            causes.Add(cause);
        }

        double Hours(DateTime fromUtc, DateTime toUtc, string cause)
        {
            var end = toUtc < _utcNow ? toUtc : _utcNow;
            return _downtime
                .Where(record => CauseOf(record.Reason) == cause)
                .Sum(record =>
                {
                    var recordEnd = record.End ?? _utcNow;
                    var overlap = ((recordEnd < end ? recordEnd : end) - (record.Start > fromUtc ? record.Start : fromUtc)).TotalHours;
                    return Math.Max(0, overlap);
                });
        }

        var totals = causes.Select(cause => (Cause: cause, Hours: Round1(Hours(_period.FromUtc, _period.ToUtc, cause)))).ToList();
        var total = Round1(totals.Sum(item => item.Hours));

        return new DowntimeByCause(
            total,
            totals.Select(item => new DowntimeCauseTotal(item.Cause, item.Hours, total == 0 ? 0 : Round1(100 * item.Hours / total))).ToList(),
            new PerformanceSeries(MonthLabels(), causes
                .Select(cause => new PerformanceSeriesLine(cause, _months.Select(month => (double?)Round1(Hours(month.StartUtc, month.EndUtc, cause))).ToList()))
                .ToList()));
    }

    public IReadOnlyList<MaintenanceInsight> Insights()
    {
        var overdue = Unfinished()
            .Where(workOrder => StatusOf(workOrder) == Overdue)
            .OrderBy(workOrder => PriorityRank(workOrder.Priority))
            .ThenBy(workOrder => workOrder.ScheduledDate)
            .Select(workOrder => InsightOf(workOrder, [$"Due {workOrder.ScheduledDate:dd MMM yyyy}"]))
            .ToList();

        var emergency = Round2(CostBetween(_period.FromUtc, _period.ToUtc).Where(cost => cost.Series == Emergency).Sum(cost => cost.Amount));
        var baseline = _settings.EmergencyCostTarget
            ?? Round2(CostBetween(_period.PreviousFromUtc, _period.PreviousToUtc).Where(cost => cost.Series == Emergency).Sum(cost => cost.Amount));
        var baselineName = _settings.EmergencyCostTarget is null ? "the previous period" : "target";
        var difference = baseline > 0 ? Round1((emergency - baseline) / baseline * 100) : (double?)null;
        var (emergencySeverity, emergencyTitle, emergencyMessage) = difference switch
        {
            null => ("info", "No emergency maintenance cost baseline",
                $"Emergency maintenance cost this period is {emergency.ToString("N0", CultureInfo.InvariantCulture)}; there is no {baselineName} cost to compare with."),
            > 0 => ("warning", $"Emergency maintenance cost is {difference:0.#}% above {(_settings.EmergencyCostTarget is null ? "the previous period" : "target")}",
                $"Current period emergency costs are {difference:0.#}% higher than {baselineName}."),
            _ => ("success", $"Emergency maintenance cost is within {(_settings.EmergencyCostTarget is null ? "the previous period" : "target")}",
                $"Current period emergency costs are {Math.Abs(difference.Value):0.#}% lower than {baselineName}.")
        };

        var atRisk = _reliability.Rows()
            .Select(row => (Row: row, Reasons: FailureReasons(row)))
            .Where(item => item.Reasons.Count > 0)
            .OrderBy(item => item.Row.HealthScore ?? double.MaxValue)
            .ThenByDescending(item => item.Reasons.Count)
            .Select(item => new InsightAsset(item.Row.Id, item.Row.AssetId, item.Row.AssetName, item.Row.Location, item.Row.HealthScore, item.Reasons))
            .ToList();

        var shortages = Unfinished()
            .Select(workOrder => (WorkOrder: workOrder, Parts: ShortParts(workOrder)))
            .Where(item => item.Parts.Count > 0)
            .ToList();

        return
        [
            new("overdue_work_orders", "critical",
                $"{Plural(overdue.Count, "overdue work order")}",
                "Work orders are past due and require immediate attention.",
                overdue.Count, overdue, [], [], ["view_work_orders", "create_action_plan"], $"status={Overdue}"),
            new("emergency_cost", emergencySeverity, emergencyTitle, emergencyMessage,
                difference is > 0 ? 1 : 0, [], [], [], ["view_details", "create_action_plan"], $"maintenanceType={Emergency}"),
            new("assets_approaching_failure", "warning",
                $"{Plural(atRisk.Count, "asset")} approaching failure threshold",
                "Assets show high risk of failure based on condition and maintenance history.",
                atRisk.Count, [], atRisk, [], ["view_assets", "create_action_plan"], "interventionOnly=true"),
            new("spare_parts_shortage", "info",
                $"Spare parts availability affecting {Plural(shortages.Count, "work order")}",
                "Required parts are unavailable, causing delays in maintenance completion.",
                shortages.Count,
                shortages.Select(item => InsightOf(item.WorkOrder, item.Parts)).ToList(),
                [],
                shortages.SelectMany(item => item.Parts).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                ["view_work_orders", "open_inventory"],
                "partsShortage=true")
        ];
    }

    /// <summary>Every unfinished work order (not limited to the period), most urgent first: priority, then oldest.</summary>
    public IReadOnlyList<BacklogRow> Backlog() => Unfinished()
        .Select(workOrder =>
        {
            var asset = AssetOf(workOrder.AssetId);
            var opened = workOrder.CreatedAt ?? workOrder.ScheduledDate;
            var status = StatusOf(workOrder);

            return new BacklogRow(
                workOrder.Id ?? string.Empty,
                workOrder.WorkOrderId,
                TypeOf(workOrder.WorkType),
                PriorityLabel(workOrder.Priority),
                asset?.MongoId,
                asset?.AssetId ?? workOrder.AssetId,
                workOrder.AssetName ?? asset?.AssetName,
                asset?.Location,
                opened is null ? null : Math.Max(0, (int)(_utcNow - opened.Value).TotalDays),
                TechnicianName(workOrder.AssignedTechnician),
                status,
                workOrder.ScheduledDate,
                status == Overdue,
                ShortParts(workOrder).Count > 0);
        })
        .OrderBy(row => PriorityRank(row.Priority))
        .ThenByDescending(row => row.AgeDays ?? -1)
        .ToList();

    /// <summary>
    /// Work orders in the period by assignee. First-time fix: a completed job not followed within 30 days by corrective or emergency work
    /// on the same asset. Avg response: hours from creation to the last update of jobs that have left Open (no start time is recorded).
    /// SLA compliance: completed jobs resolved within their SLA resolution time, or by their scheduled date when no SLA applies.
    /// </summary>
    public IReadOnlyList<TechnicianPerformanceRow> Technicians() => InPeriod(_period.FromUtc, _period.ToUtc)
        .Where(workOrder => !string.IsNullOrWhiteSpace(workOrder.AssignedTechnician))
        .GroupBy(workOrder => TechnicianName(workOrder.AssignedTechnician)!, StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var completed = group.Where(workOrder => StatusOf(workOrder) == Completed).ToList();
            var fixedFirstTime = completed.Count(IsFirstTimeFix);
            var responses = group
                .Where(workOrder => StatusOf(workOrder) is InProgress or OnHold or Completed
                    && workOrder.CreatedAt is not null && workOrder.UpdatedAt > workOrder.CreatedAt)
                .Select(workOrder => (workOrder.UpdatedAt!.Value - workOrder.CreatedAt!.Value).TotalHours)
                .ToList();
            var sla = completed.Select(MetSla).OfType<bool>().ToList();
            var ids = group.Select(workOrder => workOrder.AssignedTechnician!.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            return new TechnicianPerformanceRow(
                group.Key,
                ids.FirstOrDefault(id => _technicianNames.ContainsKey(id)),
                group.Count(),
                completed.Count,
                completed.Count == 0 ? null : Round1(100d * fixedFirstTime / completed.Count),
                responses.Count == 0 ? null : Round1(responses.Average()),
                sla.Count == 0 ? null : Round1(100d * sla.Count(met => met) / sla.Count));
        })
        .OrderByDescending(row => row.Completed)
        .ThenByDescending(row => row.FirstTimeFixRate ?? -1)
        .ThenBy(row => row.Technician, StringComparer.OrdinalIgnoreCase)
        .ToList();

    public static string TypeOf(string? workType)
    {
        var text = workType?.Trim().ToLowerInvariant() ?? string.Empty;
        if (text.Length == 0) return OtherType;
        if (text.Contains("emerg") || text.Contains("breakdown") || text.Contains("urgent")) return Emergency;
        if (text.Contains("inspect")) return Inspection;
        if (text.Contains("prevent") || text == "pm" || text.Contains("planned") || text.Contains("scheduled")) return Preventive;
        if (text.Contains("correct") || text.Contains("repair") || text.Contains("reactive") || text.Contains("fix")) return Corrective;
        return OtherType;
    }

    public static string BaseStatusOf(string? status) => status?.Trim().ToLowerInvariant().Replace('-', ' ').Replace('_', ' ') switch
    {
        "in progress" or "inprogress" or "started" or "ongoing" or "work in progress" => InProgress,
        "on hold" or "onhold" or "hold" or "paused" or "waiting" or "waiting for parts" => OnHold,
        "completed" or "complete" or "closed" or "done" or "resolved" => Completed,
        "cancelled" or "canceled" => Cancelled,
        _ => Open
    };

    public string StatusOf(DashboardWorkOrder workOrder)
    {
        var status = BaseStatusOf(workOrder.Status);
        return status is not (Completed or Cancelled) && workOrder.ScheduledDate < _utcNow ? Overdue : status;
    }

    public static string PriorityLabel(string? priority) =>
        string.IsNullOrWhiteSpace(priority) ? "Unspecified" : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(priority.Trim().ToLowerInvariant());

    public static int PriorityRank(string? priority)
    {
        var index = Priorities.ToList().FindIndex(item => string.Equals(item, priority?.Trim(), StringComparison.OrdinalIgnoreCase));
        return index < 0 ? Priorities.Count : index;
    }

    public static string CauseOf(string? reason)
    {
        var text = reason?.ToLowerInvariant() ?? string.Empty;
        if (!text.Contains("unplanned") && !text.Contains("unscheduled")
            && (text.Contains("planned") || text.Contains("preventive") || text.Contains("scheduled"))) return Planned;
        if (text.Contains("part") || text.Contains("spare") || text.Contains("stock") || text.Contains("supply")) return "Parts Unavailable";
        if (text.Contains("electric") || text.Contains("power") || text.Contains("voltage") || text.Contains("wiring") || text.Contains("circuit")
            || text.Contains("motor")) return "Electrical";
        if (text.Contains("operat") || text.Contains("human") || text.Contains("setup") || text.Contains("process") || text.Contains("misuse")) return "Operational";
        if (text.Contains("mechanic") || text.Contains("engine") || text.Contains("bearing") || text.Contains("leak") || text.Contains("wear")
            || text.Contains("vibration") || text.Contains("hydraulic") || text.Contains("gear") || text.Contains("belt") || text.Contains("breakdown")
            || text.Contains("failure")) return "Mechanical";
        return OtherType;
    }

    private IEnumerable<DashboardWorkOrder> Typed() => _settings.MaintenanceType is null
        ? _workOrders
        : _workOrders.Where(workOrder => TypeOf(workOrder.WorkType) == _settings.MaintenanceType);

    private IEnumerable<DashboardWorkOrder> InPeriod(DateTime fromUtc, DateTime toUtc) => Typed()
        .Where(workOrder => (workOrder.ScheduledDate ?? workOrder.CreatedAt) is { } date && date >= fromUtc && date < toUtc);

    private IEnumerable<DashboardWorkOrder> Unfinished() => Typed().Where(IsUnfinished);

    private bool IsUnfinished(DashboardWorkOrder workOrder) => StatusOf(workOrder) is not (Completed or Cancelled);

    /// <summary>Completed ÷ due preventive work orders (cancelled ones excluded); null without any, or when another type is filtered.</summary>
    private (double? Value, int Completed, int Due) Compliance(DateTime fromUtc, DateTime toUtc)
    {
        if (_settings.MaintenanceType is not null && _settings.MaintenanceType != Preventive)
        {
            return (null, 0, 0);
        }

        var due = InPeriod(fromUtc, toUtc)
            .Where(workOrder => TypeOf(workOrder.WorkType) == Preventive && StatusOf(workOrder) != Cancelled)
            .ToList();
        var completed = due.Count(workOrder => StatusOf(workOrder) == Completed);

        return (due.Count == 0 ? null : Round1(100d * completed / due.Count), completed, due.Count);
    }

    /// <summary>Cost records in the window split into chart series, narrowed to the maintenance type filter.</summary>
    private List<(DashboardCostRecord Record, string Type, string Series, double Amount)> CostBetween(DateTime fromUtc, DateTime toUtc)
    {
        var result = new List<(DashboardCostRecord, string, string, double)>();
        foreach (var record in _costs.Where(cost => cost.CreatedAt >= fromUtc && cost.CreatedAt < toUtc))
        {
            foreach (var (type, share) in Allocate(record))
            {
                if (_settings.MaintenanceType is null || type == _settings.MaintenanceType)
                {
                    result.Add((record, type, SeriesOf(type), record.Total * share));
                }
            }
        }

        return result;
    }

    /// <summary>The type shares of a cost record: its own type, its work order's, or its asset's work orders that month.</summary>
    private IReadOnlyList<(string Type, double Share)> Allocate(DashboardCostRecord record)
    {
        if (!string.IsNullOrWhiteSpace(record.MaintenanceType))
        {
            return [(TypeOf(record.MaintenanceType), 1)];
        }

        if (!string.IsNullOrWhiteSpace(record.WorkOrderId)
            && _workOrders.FirstOrDefault(workOrder => string.Equals(workOrder.WorkOrderId, record.WorkOrderId.Trim(), StringComparison.OrdinalIgnoreCase)) is { } linked)
        {
            return [(TypeOf(linked.WorkType), 1)];
        }

        var asset = AssetOf(record.AssetId);
        if (asset is null || record.CreatedAt is null)
        {
            return [(Unassigned, 1)];
        }

        var month = MonthOf(record.CreatedAt.Value);
        var sameAsset = _workOrders
            .Where(workOrder => AssetOf(workOrder.AssetId)?.MongoId == asset.MongoId && StatusOf(workOrder) != Cancelled)
            .ToList();
        var sameMonth = sameAsset.Where(workOrder => (workOrder.ScheduledDate ?? workOrder.CreatedAt) is { } date && MonthOf(date) == month).ToList();
        var basis = sameMonth.Count > 0 ? sameMonth : sameAsset;

        return basis.Count == 0
            ? [(Unassigned, 1)]
            : basis.GroupBy(workOrder => TypeOf(workOrder.WorkType)).Select(group => (group.Key, (double)group.Count() / basis.Count)).ToList();
    }

    private static Func<DashboardCostRecord, double> TypeShareOfRecords(List<(DashboardCostRecord Record, string Type, string Series, double Amount)> costs)
    {
        // Labor and parts follow the same share of a record as its total.
        var shares = costs.GroupBy(cost => cost.Record).ToDictionary(group => group.Key, group => group.Key.Total == 0 ? 1 : group.Sum(cost => cost.Amount) / group.Key.Total);
        return record => shares.GetValueOrDefault(record, 0);
    }

    private static string SeriesOf(string type) => type switch
    {
        Preventive or Inspection => Planned,
        Corrective or Emergency => type,
        _ => Unassigned
    };

    private IReadOnlyList<string> FailureReasons(AssetPerformanceRow row)
    {
        var reasons = new List<string>();
        if (row.HealthScore < _settings.FailureHealthThreshold) reasons.Add($"Health score {row.HealthScore:0.#}");
        reasons.AddRange(_reliability.InterventionReasons(row).Where(reason => reason.Contains("prediction") || reason.Contains("failures")));
        return reasons;
    }

    /// <summary>Parts of the work order's asset that are out of stock or at or below their minimum level.</summary>
    private IReadOnlyList<string> ShortParts(DashboardWorkOrder workOrder)
    {
        var asset = AssetOf(workOrder.AssetId);
        if (asset is null && workOrder.AssetId is null)
        {
            return [];
        }

        return _spareParts
            .Where(part => part.AssetId is not null
                && (asset is null ? part.AssetId == workOrder.AssetId : asset.Keys().Contains(part.AssetId))
                && (part.QuantityInStock <= 0 || part.QuantityInStock <= part.MinimumStockLevel))
            .Select(part => part.PartName ?? part.PartId ?? "Unnamed part")
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private bool IsFirstTimeFix(DashboardWorkOrder workOrder)
    {
        var completedAt = CompletedAt(workOrder);
        var asset = AssetOf(workOrder.AssetId)?.MongoId ?? workOrder.AssetId;
        return !_workOrders.Any(other => other != workOrder
            && (AssetOf(other.AssetId)?.MongoId ?? other.AssetId) == asset
            && TypeOf(other.WorkType) is Corrective or Emergency
            && (other.CreatedAt ?? other.ScheduledDate) is { } raised
            && raised > completedAt && raised <= completedAt.AddDays(FirstTimeFixDays));
    }

    /// <summary>True or false against the SLA (or the scheduled date); null when neither applies.</summary>
    private bool? MetSla(DashboardWorkOrder workOrder)
    {
        var completedAt = CompletedAt(workOrder);
        var rule = _slaRules
            .Where(rule => rule.ResolutionMinutes > 0
                && (rule.WorkType is null || TypeOf(rule.WorkType) == TypeOf(workOrder.WorkType))
                && (rule.Priority is null || string.Equals(rule.Priority, workOrder.Priority?.Trim(), StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(rule => (rule.WorkType is null ? 0 : 1) + (rule.Priority is null ? 0 : 1))
            .FirstOrDefault();

        if (rule is not null && workOrder.CreatedAt is not null)
        {
            return (completedAt - workOrder.CreatedAt.Value).TotalMinutes <= rule.ResolutionMinutes;
        }

        return workOrder.ScheduledDate is null ? null : completedAt < workOrder.ScheduledDate.Value.Date.AddDays(1);
    }

    private static DateTime CompletedAt(DashboardWorkOrder workOrder) =>
        workOrder.UpdatedAt ?? workOrder.ScheduledDate ?? workOrder.CreatedAt ?? DateTime.MinValue;

    private InsightWorkOrder InsightOf(DashboardWorkOrder workOrder, IReadOnlyList<string> reasons)
    {
        var asset = AssetOf(workOrder.AssetId);
        return new InsightWorkOrder(
            workOrder.Id ?? string.Empty,
            workOrder.WorkOrderId,
            asset?.AssetId ?? workOrder.AssetId,
            workOrder.AssetName ?? asset?.AssetName,
            PriorityLabel(workOrder.Priority),
            StatusOf(workOrder),
            reasons);
    }

    private DashboardAsset? AssetOf(string? key) => key is not null && _assetsByKey.TryGetValue(key, out var asset) ? asset : null;

    private string? TechnicianName(string? assigned) =>
        string.IsNullOrWhiteSpace(assigned) ? null : _technicianNames.GetValueOrDefault(assigned.Trim()) ?? assigned.Trim();

    private DateOnly MonthOf(DateTime utc)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), _period.Zone);
        return new DateOnly(local.Year, local.Month, 1);
    }

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static CountBreakdown Breakdown(IReadOnlyList<(string Label, int Count)> counts)
    {
        var total = counts.Sum(item => item.Count);
        return new CountBreakdown(total, counts.Select(item => new CountItem(item.Label, item.Count, total == 0 ? 0 : Round1(100d * item.Count / total))).ToList());
    }

    private static double Round1(double value) => Math.Round(value, 1);

    private static double Round2(double value) => Math.Round(value, 2);

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";
}
