using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// Plant, ProductionLine, WorkCenter and Product narrow the production orders. UtilizationTarget (percent) drives the line insight;
/// OutputTarget (units per month) adds a Target line to the output trend; AtRiskGap is how many progress points behind schedule an order
/// may fall before it is At Risk.
/// </summary>
public sealed record ProductionAnalyticsSettings(
    string? Plant,
    string? ProductionLine,
    string? WorkCenter,
    string? Product,
    double UtilizationTarget,
    double? OutputTarget,
    double AtRiskGap);

public sealed record ProductionSummary(
    KpiWidgetData ProductionOutput,
    string OutputUnit,
    KpiWidgetData WipValue,
    KpiWidgetData OnTimeCompletion,
    KpiWidgetData EquipmentUtilization,
    KpiWidgetData Oee);

/// <summary>WIP value at each month end by stage: Raw Material, In Process, Quality Inspection, Ready for Dispatch.</summary>
public sealed record WipByStage(double CurrentValue, IReadOnlyList<CategoryItem> Current, PerformanceSeries Trend);

public sealed record LineUtilization(string Line, int WorkCenters, double? Utilization, double Target, bool? MeetsTarget);

public sealed record ProductionDowntime(double TotalHours, IReadOnlyList<DowntimeCauseTotal> Causes, PerformanceSeries Trend);

public sealed record InsightOrder(string Id, string? OrderNo, string Product, string Line, DateTime? DueDate, double Progress, string Schedule);

/// <summary>A Production Insights card. Actions name its buttons; Query is what "View orders" passes to /orders.</summary>
public sealed record ProductionInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    double? Value,
    IReadOnlyList<InsightOrder> Orders,
    IReadOnlyList<string> Lines,
    IReadOnlyList<string> Actions,
    string Query);

public sealed record ProductionOrderRow(
    string Id,
    string? OrderNo,
    string Product,
    string Plant,
    string Line,
    string WorkCenter,
    string? AssetId,
    double? PlannedQty,
    double? CompletedQty,
    double? WipQty,
    string Unit,
    double Progress,
    DateTime? DueDate,
    string Status,
    string Stage,
    string Schedule,
    double WipValue,
    string? Priority);

public sealed record BottleneckRow(
    string WorkCenter,
    string Line,
    int Queue,
    int InProgress,
    double? AvgWaitDays,
    double? Utilization,
    string Risk);

public sealed record ProductionFilterOptions(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<string> Plants,
    IReadOnlyList<string> ProductionLines,
    IReadOnlyList<string> WorkCenters,
    IReadOnlyList<string> Products);

/// <summary>
/// WIP / Production Analytics for one filter bar and date range. Production orders are WIP jobs (job_masters).
/// Product, line, work centre, plant, stage, quantities and WIP value come from the job when it carries them; otherwise product is the job
/// name, work centre the job's asset, plant the location master site (else the asset's site), line the location master building
/// (else zone), and WIP value the material cost booked to the job (material_consumptions).
/// Status maps to Not Started, In Progress, On Hold, Completed or Cancelled (configured closed statuses count as Completed); a job finishes
/// at its actual end date, else its last task's actual end, else its last update.
/// Utilization = hours a work centre had a task (or started job) running ÷ hours in the window. OEE = Availability (downtime records of the
/// production assets) × Performance (planned ÷ actual duration of completed orders) × Quality (good ÷ completed units, or completed orders
/// without a quality issue).
/// </summary>
public sealed class ProductionAnalyticsCalculator
{
    public const string NotStarted = "Not Started";
    public const string InProgress = "In Progress";
    public const string OnHold = "On Hold";
    public const string Completed = "Completed";
    public const string Cancelled = "Cancelled";

    public const string RawMaterial = "Raw Material";
    public const string InProcess = "In Process";
    public const string QualityInspection = "Quality Inspection";
    public const string ReadyForDispatch = "Ready for Dispatch";

    public const string OnTrack = "On Track";
    public const string AtRisk = "At Risk";
    public const string Delayed = "Delayed";

    public const string MaterialShortage = "Material Shortage";

    public static readonly IReadOnlyList<string> Statuses = [NotStarted, InProgress, OnHold, Completed];
    public static readonly IReadOnlyList<string> Stages = [RawMaterial, InProcess, QualityInspection, ReadyForDispatch];
    public static readonly IReadOnlyList<string> Schedules = [Delayed, AtRisk, OnTrack];
    public static readonly IReadOnlyList<string> DowntimeCauses = ["Mechanical", MaterialShortage, "Changeover", "Quality Hold", "Unplanned"];
    public static readonly IReadOnlyList<string> Risks = ["High", "Medium", "Low"];

    private readonly DashboardPeriod _period;
    private readonly ProductionAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly List<OrderItem> _orders;
    private readonly IReadOnlyList<DashboardDowntime> _downtime;
    private readonly bool _hasQuantities;
    private readonly string _unit;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;

    private ProductionAnalyticsCalculator(
        DashboardPeriod period,
        ProductionAnalyticsSettings settings,
        DateTime utcNow,
        List<OrderItem> orders,
        IReadOnlyList<DashboardDowntime> downtime)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _orders = orders;
        _downtime = downtime;
        _hasQuantities = orders.Any(order => order.PlannedQty is not null || order.Job.CompletedQuantity is not null);
        _unit = _hasQuantities
            ? orders.Select(order => order.Job.Unit).FirstOrDefault(unit => !string.IsNullOrWhiteSpace(unit)) ?? "units"
            : "orders";
        _months = AssetPerformanceCalculator.Months(period, utcNow);
    }

    public DashboardPeriod Period => _period;

    public static async Task<ProductionAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
        DashboardPeriod period,
        ProductionAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var (orders, assetsByKey) = await LoadOrdersAsync(repository, scope, utcNow, cancellationToken);
        orders = orders.Where(order => Matches(order.Plant, settings.Plant) && Matches(order.Line, settings.ProductionLine)
            && Matches(order.WorkCenter, settings.WorkCenter) && Matches(order.Product, settings.Product)).ToList();

        // Downtime of the machines the (filtered) orders run on.
        var productionAssets = orders.Where(order => order.Asset is not null).Select(order => order.Asset!).DistinctBy(asset => asset.MongoId).ToList();
        IReadOnlyList<DashboardDowntime> downtime = [];
        if (productionAssets.Count > 0)
        {
            var keys = productionAssets.SelectMany(asset => asset.Keys()).ToList();
            var months = AssetPerformanceCalculator.Months(period, utcNow);
            var from = months.Count > 0 && months[0].StartUtc < period.PreviousFromUtc ? months[0].StartUtc : period.PreviousFromUtc;
            downtime = (await repository.GetDowntimeAsync(scope, keys, from, period.ToUtc, cancellationToken))
                .Where(record => record.AssetId is not null && assetsByKey.ContainsKey(record.AssetId))
                .Select(record => record with { AssetId = assetsByKey[record.AssetId!].MongoId })
                .ToList();
        }

        return new ProductionAnalyticsCalculator(period, settings, utcNow, orders, downtime);
    }

    /// <summary>Plant, line, work centre and product values found on the tenant's production orders.</summary>
    public static async Task<ProductionFilterOptions> FilterOptionsAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
        CancellationToken cancellationToken)
    {
        var organizations = (await repository.GetFilterOptionsAsync(scope.TenantId, scope.ClientId, cancellationToken)).Organizations;
        var (orders, _) = await LoadOrdersAsync(repository, scope, DateTime.UtcNow, cancellationToken);

        static List<string> Distinct(IEnumerable<string> values) =>
            values.Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToList();

        return new ProductionFilterOptions(
            organizations,
            Distinct(orders.Select(order => order.Plant)),
            Distinct(orders.Select(order => order.Line)),
            Distinct(orders.Select(order => order.WorkCenter)),
            Distinct(orders.Select(order => order.Product)));
    }

    public ProductionSummary Summary()
    {
        var current = Efficiency(_period.FromUtc, _period.ToUtc);
        var previous = Efficiency(_period.PreviousFromUtc, _period.PreviousToUtc);

        return new ProductionSummary(
            DashboardWidgetCalculator.Kpi(Output(_period.FromUtc, _period.ToUtc), Output(_period.PreviousFromUtc, _period.PreviousToUtc), "number", percentChange: true),
            _unit,
            DashboardWidgetCalculator.Kpi(WipValueAt(Moment(_period.ToUtc)), WipValueAt(Moment(_period.PreviousToUtc)), "currency", percentChange: true),
            DashboardWidgetCalculator.Kpi(OnTime(_period.FromUtc, _period.ToUtc), OnTime(_period.PreviousFromUtc, _period.PreviousToUtc), "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(Utilization(_orders, _period.FromUtc, _period.ToUtc), Utilization(_orders, _period.PreviousFromUtc, _period.PreviousToUtc), "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(current.Oee, previous.Oee, "percent", percentChange: false));
    }

    /// <summary>Output completed per month against output planned (orders due that month), plus Target when OutputTarget is set.</summary>
    public PerformanceSeries OutputTrend()
    {
        var lines = new List<PerformanceSeriesLine>
        {
            new("Actual", _months.Select(month => (double?)Output(month.StartUtc, month.EndUtc)).ToList()),
            new("Planned", _months.Select(month => (double?)PlannedOutput(month.StartUtc, month.EndUtc)).ToList())
        };

        if (_settings.OutputTarget is { } target)
        {
            lines.Add(new("Target", _months.Select(_ => (double?)target).ToList()));
        }

        return new PerformanceSeries(MonthLabels(), lines);
    }

    public WipByStage WipByStage()
    {
        var at = Moment(_period.ToUtc);
        var current = Stages
            .Select(stage => (Label: stage, Value: Round2(OpenAt(at).Where(order => StageAt(order, at) == stage).Sum(order => WipValueOf(order, at)))))
            .ToList();
        var total = Round2(current.Sum(item => item.Value));

        return new WipByStage(
            total,
            current.Select(item => new CategoryItem(item.Label, item.Value, total == 0 ? 0 : Round1(100 * item.Value / total))).ToList(),
            new PerformanceSeries(MonthLabels(), Stages
                .Select(stage => new PerformanceSeriesLine(stage, _months
                    .Select(month => Moment(month.EndUtc))
                    .Select(end => (double?)Round2(OpenAt(end).Where(order => StageAt(order, end) == stage).Sum(order => WipValueOf(order, end))))
                    .ToList()))
                .ToList()));
    }

    /// <summary>Orders active in the period (raised by its end and not finished before it began), by current status.</summary>
    public CountBreakdown WorkOrderStatus()
    {
        var orders = ActiveIn(_period.FromUtc, _period.ToUtc).ToList();
        var counts = Statuses.Select(status => (status, orders.Count(order => order.Status == status))).ToList();
        var total = counts.Sum(item => item.Item2);

        return new CountBreakdown(total, counts.Select(item => new CountItem(item.status, item.Item2, total == 0 ? 0 : Round1(100d * item.Item2 / total))).ToList());
    }

    public IReadOnlyList<LineUtilization> UtilizationByLine() => _orders
        .GroupBy(order => order.Line, StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var utilization = Utilization(group.ToList(), _period.FromUtc, _period.ToUtc);
            return new LineUtilization(
                group.Key,
                group.Select(order => order.WorkCenter).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
                utilization,
                _settings.UtilizationTarget,
                utilization is null ? null : utilization >= _settings.UtilizationTarget);
        })
        .OrderBy(line => line.Line, StringComparer.OrdinalIgnoreCase)
        .ToList();

    public ProductionDowntime DowntimeByCause()
    {
        var causes = DowntimeCauses.ToList();
        foreach (var cause in _downtime.Select(record => CauseOf(record.Reason)).Distinct().Where(cause => !causes.Contains(cause)))
        {
            causes.Add(cause);
        }

        var totals = causes.Select(cause => (Cause: cause, Hours: Round1(DowntimeHours(_period.FromUtc, _period.ToUtc, cause)))).ToList();
        var total = Round1(totals.Sum(item => item.Hours));

        return new ProductionDowntime(
            total,
            totals.Select(item => new DowntimeCauseTotal(item.Cause, item.Hours, total == 0 ? 0 : Round1(100 * item.Hours / total))).ToList(),
            new PerformanceSeries(MonthLabels(), causes
                .Select(cause => new PerformanceSeriesLine(cause, _months.Select(month => (double?)Round1(DowntimeHours(month.StartUtc, month.EndUtc, cause))).ToList()))
                .ToList()));
    }

    /// <summary>OEE, Availability, Performance and Quality per month.</summary>
    public PerformanceSeries EfficiencyTrend()
    {
        var months = _months.Select(month => Efficiency(month.StartUtc, month.EndUtc)).ToList();

        return new PerformanceSeries(MonthLabels(),
        [
            new("OEE", months.Select(month => month.Oee).ToList()),
            new("Availability", months.Select(month => month.Availability).ToList()),
            new("Performance", months.Select(month => month.Performance).ToList()),
            new("Quality", months.Select(month => month.Quality).ToList())
        ]);
    }

    public IReadOnlyList<ProductionInsight> Insights()
    {
        var target = _settings.UtilizationTarget;
        var lowLines = UtilizationByLine().Where(line => line.Utilization < target).OrderBy(line => line.Utilization).ToList();
        var (lineTitle, lineMessage) = lowLines.Count switch
        {
            0 => ("Every line meets its utilization target", $"All production lines are at or above {target:0.#}% utilization."),
            1 => ($"{lowLines[0].Line} utilization below target",
                $"{lowLines[0].Line} is operating at {lowLines[0].Utilization:0.#}% utilization, below the target of {target:0.#}%."),
            _ => ($"{lowLines.Count} lines below utilization target",
                $"{JoinNames(lowLines.Select(line => $"{line.Line} ({line.Utilization:0.#}%)").ToList())} are below the target of {target:0.#}%.")
        };

        var active = Unfinished().ToList();
        var atRisk = active
            .Where(order => ScheduleOf(order) != OnTrack)
            .OrderBy(order => Array.IndexOf(Schedules.ToArray(), ScheduleOf(order)))
            .ThenBy(order => order.Job.PlannedEndDate)
            .Select(InsightOf)
            .ToList();
        var share = active.Count == 0 ? 0 : Round1(100d * atRisk.Count / active.Count);

        var held = active.Where(IsQualityHold).ToList();
        var heldValue = Round2(held.Sum(order => WipValueOf(order, _utcNow)));

        var shortage = Round1(DowntimeHours(_period.FromUtc, _period.ToUtc, MaterialShortage));

        return
        [
            new("line_utilization", lowLines.Count > 0 ? "critical" : "success", lineTitle, lineMessage,
                lowLines.Count, lowLines.FirstOrDefault()?.Utilization, [], lowLines.Select(line => line.Line).ToList(),
                ["view_orders", "open_work_center"],
                lowLines.Count == 1 ? $"productionLine={Uri.EscapeDataString(lowLines[0].Line)}" : string.Empty),
            new("orders_at_risk", "warning",
                $"{Plural(atRisk.Count, "production order")} at risk of late completion",
                $"{Plural(atRisk.Count, "order")} ({share:0.#}% of active orders) {(atRisk.Count == 1 ? "is" : "are")} at risk due to current WIP and resource constraints.",
                atRisk.Count, share, atRisk, [], ["view_orders", "create_action_plan"], $"schedule={Uri.EscapeDataString($"{AtRisk},{Delayed}")}"),
            new("quality_hold", held.Count > 0 ? "warning" : "success",
                held.Count > 0 ? $"Quality hold affecting {Money(heldValue)} WIP" : "No WIP on quality hold",
                held.Count > 0
                    ? $"{Money(heldValue)} of WIP across {Plural(held.Count, "order")} is on hold for quality inspection."
                    : "No production orders are on hold for quality inspection.",
                held.Count, heldValue, held.Select(InsightOf).ToList(), [], ["view_orders", "create_action_plan"], $"stage={Uri.EscapeDataString(QualityInspection)}"),
            new("material_shortage", shortage > 0 ? "info" : "success",
                shortage > 0 ? $"Material shortage causing {shortage:0.#} hours downtime" : "No downtime from material shortage",
                shortage > 0
                    ? $"Material shortage has caused {shortage:0.#} hours of downtime in the current period."
                    : "No material shortage downtime was recorded in the current period.",
                shortage > 0 ? 1 : 0, shortage, [], [], ["view_orders", "create_action_plan"], $"cause={Uri.EscapeDataString(MaterialShortage)}")
        ];
    }

    /// <summary>Every unfinished order (not limited to the period): delayed first, then at risk, then by due date.</summary>
    public IReadOnlyList<ProductionOrderRow> ActiveOrders() => Unfinished()
        .Select(order => new ProductionOrderRow(
            order.Job.Id,
            order.Job.JobId,
            order.Product,
            order.Plant,
            order.Line,
            order.WorkCenter,
            order.Asset?.AssetId ?? order.Job.AssetId,
            order.PlannedQty,
            order.CompletedQty,
            order.PlannedQty is { } planned ? Math.Max(0, planned - (order.CompletedQty ?? 0)) : null,
            _unit,
            order.Progress,
            order.Job.PlannedEndDate,
            order.Status,
            order.Stage,
            ScheduleOf(order),
            Round2(WipValueOf(order, _utcNow)),
            order.Job.Priority))
        .OrderBy(row => Array.IndexOf(Schedules.ToArray(), row.Schedule))
        .ThenBy(row => row.DueDate ?? DateTime.MaxValue)
        .ToList();

    /// <summary>
    /// Work centres with waiting work: queue = unfinished orders not started or on hold; average wait = days from raising an unfinished
    /// order to its start (or now). Risk is High at 90%+ utilization, 10+ queued or 7+ days' wait; Medium at 75%, 5 or 3.
    /// </summary>
    public IReadOnlyList<BottleneckRow> Bottlenecks() => _orders
        .GroupBy(order => order.WorkCenter, StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var open = group.Where(order => order.Status is not (Completed or Cancelled)).ToList();
            var waits = open
                .Where(order => order.Job.CreatedAt is not null)
                .Select(order => ((order.StartedAt ?? _utcNow) - order.Job.CreatedAt!.Value).TotalDays)
                .Where(days => days >= 0)
                .ToList();
            var queue = open.Count(order => order.Status is NotStarted or OnHold);
            var wait = waits.Count == 0 ? (double?)null : Round1(waits.Average());
            var utilization = Utilization(group.ToList(), _period.FromUtc, _period.ToUtc);
            var risk = utilization >= 90 || queue >= 10 || wait >= 7
                ? "High"
                : utilization >= 75 || queue >= 5 || wait >= 3 ? "Medium" : "Low";

            return new BottleneckRow(
                group.Key,
                group.GroupBy(order => order.Line).OrderByDescending(line => line.Count()).First().Key,
                queue,
                open.Count(order => order.Status == InProgress),
                wait,
                utilization,
                risk);
        })
        .OrderBy(row => Array.IndexOf(Risks.ToArray(), row.Risk))
        .ThenByDescending(row => row.Utilization ?? -1)
        .ThenByDescending(row => row.Queue)
        .ToList();

    public static string CauseOf(string? reason)
    {
        var text = reason?.ToLowerInvariant() ?? string.Empty;
        if (!text.Contains("unplanned") && !text.Contains("unscheduled")
            && (text.Contains("planned") || text.Contains("preventive") || text.Contains("scheduled"))) return "Planned";
        if (text.Contains("material") || text.Contains("shortage") || text.Contains("part") || text.Contains("stock") || text.Contains("supply")) return MaterialShortage;
        if (text.Contains("changeover") || text.Contains("change over") || text.Contains("setup") || text.Contains("set-up") || text.Contains("tool change")) return "Changeover";
        if (text.Contains("quality") || text.Contains("qc") || text.Contains("inspection") || text.Contains("reject")) return "Quality Hold";
        if (text.Contains("mechanic") || text.Contains("engine") || text.Contains("bearing") || text.Contains("leak") || text.Contains("wear")
            || text.Contains("vibration") || text.Contains("hydraulic") || text.Contains("gear") || text.Contains("belt") || text.Contains("breakdown")
            || text.Contains("failure") || text.Contains("electric") || text.Contains("motor")) return "Mechanical";
        return "Unplanned";
    }

    private string ScheduleOf(OrderItem order)
    {
        var job = order.Job;
        if (job.PlannedEndDate is { } due && due < _utcNow)
        {
            return Delayed;
        }

        if (job.PlannedStartDate is { } start && job.PlannedEndDate is { } end && end > start)
        {
            var expected = Math.Clamp((_utcNow - start).TotalHours / (end - start).TotalHours * 100, 0, 100);
            if (expected - order.Progress >= _settings.AtRiskGap)
            {
                return AtRisk;
            }
        }

        return OnTrack;
    }

    private static async Task<(List<OrderItem> Orders, Dictionary<string, DashboardAsset> AssetsByKey)> LoadOrdersAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
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
        var jobs = await repository.GetJobsAsync(scope, keys, cancellationToken);
        var jobIds = jobs.Select(job => job.JobId ?? job.Id).Distinct().ToList();

        var tasks = (await repository.GetJobTasksAsync(scope, jobIds, cancellationToken)).Where(task => task.JobId is not null).ToLookup(task => task.JobId!);
        var materials = (await repository.GetMaterialUsesAsync(scope, jobIds, cancellationToken)).Where(use => use.JobId is not null).ToLookup(use => use.JobId!);
        var issues = (await repository.GetJobIssuesAsync(scope, jobIds, cancellationToken)).Where(issue => issue.JobId is not null).ToLookup(issue => issue.JobId!);
        var statuses = await repository.GetWipStatusesAsync(scope, cancellationToken);
        var locations = (await repository.GetLocationMastersAsync(scope, cancellationToken))
            .Where(location => location.LocationId is not null)
            .GroupBy(location => location.LocationId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        var orders = jobs.Select(job =>
        {
            var key = job.JobId ?? job.Id;
            var asset = job.AssetId is not null && assetsByKey.TryGetValue(job.AssetId, out var found) ? found : null;
            var location = job.LocationId is not null ? locations.GetValueOrDefault(job.LocationId) : null;
            var jobTasks = tasks[key].ToList();
            var startedAt = job.ActualStartDate ?? jobTasks.Select(task => task.ActualStart).Min();
            var status = StatusOf(job, statuses, startedAt);
            var completedAt = status == Completed
                ? job.ActualEndDate ?? jobTasks.Select(task => task.ActualEnd).Max() ?? job.UpdatedAt ?? job.PlannedEndDate
                : null;
            var plannedQty = job.PlannedQuantity;
            var completedQty = job.CompletedQuantity
                ?? (plannedQty is null ? null : status == Completed ? plannedQty : plannedQty * Math.Clamp(job.ProgressPercentage ?? 0, 0, 100) / 100);
            var progress = Math.Clamp(
                job.ProgressPercentage
                    ?? (plannedQty > 0 && job.CompletedQuantity is not null ? job.CompletedQuantity / plannedQty * 100 : null)
                    ?? (status == Completed ? 100 : 0),
                0,
                100);

            return new OrderItem(
                job,
                asset,
                Label(job.Product ?? job.JobName, "Unspecified product"),
                Label(job.Plant ?? location?.Site ?? asset?.Site, "Unassigned plant"),
                Label(job.ProductionLine ?? location?.Building ?? location?.Zone, "Unassigned line"),
                Label(job.WorkCenter ?? (asset is null ? job.AssetId : $"{asset.AssetId ?? asset.MongoId} ({asset.AssetName ?? "Asset"})"), "Unassigned work center"),
                status,
                StageOf(job, status),
                startedAt,
                completedAt,
                plannedQty,
                completedQty,
                Math.Round(progress, 1),
                jobTasks,
                materials[key].ToList(),
                issues[key].Any(issue => IsQualityText(issue.IssueType) || IsQualityText(issue.Description)));
        }).ToList();

        return (orders, assetsByKey);
    }

    private static string StatusOf(DashboardJob job, IReadOnlyList<DashboardWipStatus> statuses, DateTime? startedAt)
    {
        var text = job.Status?.Trim().ToLowerInvariant() ?? string.Empty;
        if (text.Contains("cancel")) return Cancelled;

        var closed = statuses.Any(status => status.IsClosed
            && (string.Equals(status.Name?.Trim(), job.Status?.Trim(), StringComparison.OrdinalIgnoreCase)
                || string.Equals(status.Code?.Trim(), job.Status?.Trim(), StringComparison.OrdinalIgnoreCase)));
        if (closed || text is "completed" or "complete" or "closed" or "done" or "finished" or "dispatched" or "delivered" || job.ProgressPercentage >= 100)
        {
            return Completed;
        }

        if (text.Contains("hold") || text.Contains("pause") || text.Contains("block") || text.Contains("wait") || text.Contains("suspend")) return OnHold;

        var started = job.ProgressPercentage > 0 || startedAt is not null;
        if (text is "" or "active" or "new" or "draft" or "planned" or "scheduled" or "open" or "pending" or "released" or "created" or "not started")
        {
            return started ? InProgress : NotStarted;
        }

        return InProgress;
    }

    private static string StageOf(DashboardJob job, string status)
    {
        if (status is Completed or Cancelled) return status;
        if (Stages.FirstOrDefault(stage => string.Equals(stage, job.Stage?.Trim(), StringComparison.OrdinalIgnoreCase)) is { } named) return named;

        var text = $"{job.Stage} {job.Status}".ToLowerInvariant();
        if (IsQualityText(text)) return QualityInspection;
        if (text.Contains("ready") || text.Contains("pack") || text.Contains("dispatch")) return ReadyForDispatch;
        return status == NotStarted ? RawMaterial : InProcess;
    }

    private static bool IsQualityText(string? text) => text is not null
        && (text.Contains("quality", StringComparison.OrdinalIgnoreCase) || text.Contains("qc", StringComparison.OrdinalIgnoreCase)
            || text.Contains("inspection", StringComparison.OrdinalIgnoreCase) || text.Contains("defect", StringComparison.OrdinalIgnoreCase)
            || text.Contains("reject", StringComparison.OrdinalIgnoreCase) || text.Contains("scrap", StringComparison.OrdinalIgnoreCase)
            || text.Contains("nonconform", StringComparison.OrdinalIgnoreCase));

    private static bool IsQualityHold(OrderItem order) => order.Stage == QualityInspection || order.Status == OnHold && IsQualityText(order.Job.Status);

    private IEnumerable<OrderItem> Unfinished() => _orders.Where(order => order.Status is not (Completed or Cancelled));

    private IEnumerable<OrderItem> ActiveIn(DateTime fromUtc, DateTime toUtc) => _orders.Where(order => order.Status != Cancelled
        && (order.Job.CreatedAt ?? order.Job.PlannedStartDate) is { } raised && raised < toUtc
        && (order.CompletedAt is null || order.CompletedAt >= fromUtc));

    private IEnumerable<OrderItem> OpenAt(DateTime at) => _orders.Where(order => order.Status != Cancelled
        && (order.Job.CreatedAt ?? order.Job.PlannedStartDate) is { } raised && raised <= at
        && (order.CompletedAt is null || order.CompletedAt > at));

    // An order finished since then was somewhere in process at that moment.
    private static string StageAt(OrderItem order, DateTime at) => order.Stage is Completed or Cancelled ? InProcess : order.Stage;

    /// <summary>The job's own WIP value while unfinished, else material cost booked to it by that moment.</summary>
    private static double WipValueOf(OrderItem order, DateTime at) => order.Status is not (Completed or Cancelled) && order.Job.WipValue is { } value
        ? value
        : order.Materials.Where(use => use.CreatedAt is null || use.CreatedAt <= at).Sum(use => use.Cost);

    private double WipValueAt(DateTime at) => Round2(OpenAt(at).Sum(order => WipValueOf(order, at)));

    private double Output(DateTime fromUtc, DateTime toUtc)
    {
        var completed = _orders.Where(order => order.CompletedAt >= fromUtc && order.CompletedAt < toUtc).ToList();
        return _hasQuantities ? Round1(completed.Sum(order => order.CompletedQty ?? 0)) : completed.Count;
    }

    private double PlannedOutput(DateTime fromUtc, DateTime toUtc)
    {
        var due = _orders.Where(order => order.Status != Cancelled && order.Job.PlannedEndDate >= fromUtc && order.Job.PlannedEndDate < toUtc).ToList();
        return _hasQuantities ? Round1(due.Sum(order => order.PlannedQty ?? 0)) : due.Count;
    }

    /// <summary>Completed orders with a due date that finished by the end of their due day.</summary>
    private double? OnTime(DateTime fromUtc, DateTime toUtc)
    {
        var completed = _orders
            .Where(order => order.CompletedAt >= fromUtc && order.CompletedAt < toUtc && order.Job.PlannedEndDate is not null)
            .ToList();
        return completed.Count == 0
            ? null
            : Round1(100d * completed.Count(order => order.CompletedAt < order.Job.PlannedEndDate!.Value.Date.AddDays(1)) / completed.Count);
    }

    /// <summary>Running hours ÷ window hours over the work centres of the orders (tasks with actual times, else the started job).</summary>
    private double? Utilization(IReadOnlyList<OrderItem> orders, DateTime fromUtc, DateTime toUtc)
    {
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        if (end <= fromUtc)
        {
            return null;
        }

        var hours = (end - fromUtc).TotalHours;
        var centers = orders.GroupBy(order => order.WorkCenter, StringComparer.OrdinalIgnoreCase).ToList();
        if (centers.Count == 0)
        {
            return null;
        }

        var busy = centers.Sum(center =>
        {
            var intervals = new List<(DateTime Start, DateTime End)>();
            foreach (var order in center)
            {
                var running = order.Tasks.Where(task => task.ActualStart is not null).ToList();
                if (running.Count > 0)
                {
                    intervals.AddRange(running.Select(task => (task.ActualStart!.Value, task.ActualEnd ?? (order.CompletedAt ?? _utcNow))));
                }
                else if (order.StartedAt is { } started)
                {
                    intervals.Add((started, order.CompletedAt ?? _utcNow));
                }
            }

            return UnionHours(intervals, fromUtc, end);
        });

        return Round1(Math.Min(100, 100 * busy / (hours * centers.Count)));
    }

    private EfficiencyFigures Efficiency(DateTime fromUtc, DateTime toUtc)
    {
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        var assets = _orders.Where(order => order.Asset is not null).Select(order => order.Asset!.MongoId).Distinct().ToList();

        double? availability = null;
        if (assets.Count > 0 && end > fromUtc)
        {
            var hours = (end - fromUtc).TotalHours * assets.Count;
            var down = assets.Sum(asset => UnionHours(
                _downtime.Where(record => record.AssetId == asset).Select(record => (record.Start, record.End ?? _utcNow)).ToList(), fromUtc, end));
            availability = Round1(100 * (hours - Math.Min(hours, down)) / hours);
        }

        var completed = _orders.Where(order => order.CompletedAt >= fromUtc && order.CompletedAt < toUtc).ToList();

        double? performance = null;
        var timed = completed
            .Where(order => order.Job.PlannedStartDate is not null && order.Job.PlannedEndDate > order.Job.PlannedStartDate
                && order.StartedAt is not null && order.CompletedAt > order.StartedAt)
            .ToList();
        if (timed.Count > 0)
        {
            var planned = timed.Sum(order => (order.Job.PlannedEndDate!.Value - order.Job.PlannedStartDate!.Value).TotalHours);
            var actual = timed.Sum(order => (order.CompletedAt!.Value - order.StartedAt!.Value).TotalHours);
            performance = Round1(Math.Min(100, 100 * planned / actual));
        }
        else if (completed.Any(order => order.PlannedQty > 0))
        {
            var withQty = completed.Where(order => order.PlannedQty > 0).ToList();
            performance = Round1(Math.Min(100, 100 * withQty.Sum(order => order.CompletedQty ?? 0) / withQty.Sum(order => order.PlannedQty!.Value)));
        }

        double? quality = null;
        var counted = completed.Where(order => order.CompletedQty > 0).ToList();
        if (counted.Count > 0 && counted.Any(order => order.Job.RejectedQuantity is not null))
        {
            var made = counted.Sum(order => order.CompletedQty!.Value);
            quality = Round1(100 * (made - counted.Sum(order => order.Job.RejectedQuantity ?? 0)) / made);
        }
        else if (completed.Count > 0)
        {
            quality = Round1(100d * completed.Count(order => !order.HasQualityIssue) / completed.Count);
        }

        var oee = availability is null || performance is null || quality is null
            ? (double?)null
            : Round1(availability.Value * performance.Value * quality.Value / 10_000);

        return new EfficiencyFigures(oee, availability, performance, quality);
    }

    private double DowntimeHours(DateTime fromUtc, DateTime toUtc, string cause)
    {
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        return _downtime
            .Where(record => CauseOf(record.Reason) == cause)
            .Sum(record => Math.Max(0, ((record.End ?? _utcNow) < end ? record.End ?? _utcNow : end).Subtract(record.Start > fromUtc ? record.Start : fromUtc).TotalHours));
    }

    private static double UnionHours(List<(DateTime Start, DateTime End)> intervals, DateTime fromUtc, DateTime toUtc)
    {
        var clipped = intervals
            .Select(interval => (Start: interval.Start > fromUtc ? interval.Start : fromUtc, End: interval.End < toUtc ? interval.End : toUtc))
            .Where(interval => interval.End > interval.Start)
            .OrderBy(interval => interval.Start)
            .ToList();

        double total = 0;
        DateTime? currentStart = null, currentEnd = null;
        foreach (var (start, end) in clipped)
        {
            if (currentEnd is null || start > currentEnd)
            {
                if (currentEnd is not null) total += (currentEnd.Value - currentStart!.Value).TotalHours;
                currentStart = start;
                currentEnd = end;
            }
            else if (end > currentEnd)
            {
                currentEnd = end;
            }
        }

        if (currentEnd is not null) total += (currentEnd.Value - currentStart!.Value).TotalHours;
        return total;
    }

    private InsightOrder InsightOf(OrderItem order) =>
        new(order.Job.Id, order.Job.JobId, order.Product, order.Line, order.Job.PlannedEndDate, order.Progress, ScheduleOf(order));

    private DateTime Moment(DateTime utc) => utc < _utcNow ? utc : _utcNow;

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static bool Matches(string value, string? filter) => filter is null || string.Equals(value, filter, StringComparison.OrdinalIgnoreCase);

    private static string Label(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string Money(double value) => value >= 1_000_000
        ? $"{value / 1_000_000:0.##}M"
        : value >= 1_000 ? $"{value / 1_000:0.#}K" : value.ToString("0.##", CultureInfo.InvariantCulture);

    private static double Round1(double value) => Math.Round(value, 1);

    private static double Round2(double value) => Math.Round(value, 2);

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private static string JoinNames(IReadOnlyList<string> names) =>
        names.Count == 1 ? names[0] : $"{string.Join(", ", names.Take(names.Count - 1))} and {names[^1]}";

    private sealed record OrderItem(
        DashboardJob Job,
        DashboardAsset? Asset,
        string Product,
        string Plant,
        string Line,
        string WorkCenter,
        string Status,
        string Stage,
        DateTime? StartedAt,
        DateTime? CompletedAt,
        double? PlannedQty,
        double? CompletedQty,
        double Progress,
        IReadOnlyList<DashboardJobTask> Tasks,
        IReadOnlyList<DashboardMaterialUse> Materials,
        bool HasQualityIssue);

    private sealed record EfficiencyFigures(double? Oee, double? Availability, double? Performance, double? Quality);
}
