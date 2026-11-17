using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>HealthThreshold drives the "below health threshold" insight; UtilizationTarget the "utilization below target" one.</summary>
public sealed record AssetPerformanceThresholds(double HealthThreshold, double UtilizationTarget);

public sealed record AssetPerformanceRow(
    string Id,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? AssetType,
    string? Location,
    double? HealthScore,
    string? HealthStatus,
    double? Utilization,
    double? Availability,
    double? MtbfHours,
    double? MttrHours,
    double DowntimeHours,
    double PlannedDowntimeHours,
    double UnplannedDowntimeHours,
    int Failures,
    double? PerformanceScore,
    string? PerformanceBand,
    string Status);

public sealed record AssetPerformanceSummary(
    KpiWidgetData TotalAssets,
    KpiWidgetData AverageHealthScore,
    KpiWidgetData UtilizationRate,
    KpiWidgetData Availability,
    KpiWidgetData Mtbf,
    KpiWidgetData Mttr);

/// <summary>Values are null for a month with nothing to measure (e.g. MTBF without failures).</summary>
public sealed record PerformanceSeriesLine(string Name, IReadOnlyList<double?> Values);

public sealed record PerformanceSeries(IReadOnlyList<string> Categories, IReadOnlyList<PerformanceSeriesLine> Series);

/// <summary>Share of time per category: Active (in use), Idle (available but unused) and Maintenance (down).</summary>
public sealed record CategoryUtilization(string Category, int AssetCount, double Active, double Idle, double Maintenance, double Utilization);

public sealed record ScoreBand(string Band, double Min, double Max, int Count, double Percentage);

public sealed record ScoreDistribution(IReadOnlyList<ScoreBand> Bands, int RatedAssets, int NotRated);

public sealed record ReliabilitySummary(KpiWidgetData Mtbf, KpiWidgetData Mttr, PerformanceSeries Trend);

public sealed record DowntimeSummary(double PlannedHours, double UnplannedHours, double TotalHours, int Events, PerformanceSeries Trend);

public sealed record InsightAsset(string Id, string? AssetId, string? AssetName, string? Location, double? HealthScore, IReadOnlyList<string> Reasons);

/// <summary>A Performance Insights card. Actions name the buttons; Query is what "View assets" / "View locations" pass to /assets or /locations.</summary>
public sealed record PerformanceInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    IReadOnlyList<InsightAsset> Assets,
    IReadOnlyList<string> Locations,
    IReadOnlyList<string> Actions,
    string Query);

public sealed record LocationPerformanceRow(
    string Location,
    int AssetCount,
    double? AverageHealthScore,
    double? Utilization,
    double? Availability,
    double? PerformanceScore,
    string Status);

public sealed record TopBottomAssets(IReadOnlyList<AssetPerformanceRow> Top, IReadOnlyList<AssetPerformanceRow> Bottom);

public sealed record AssetComparison(
    AssetPerformanceRow Asset,
    IReadOnlyList<string> Months,
    IReadOnlyList<double?> HealthScore,
    IReadOnlyList<double?> Availability,
    IReadOnlyList<double?> Utilization,
    IReadOnlyList<double?> DowntimeHours);

/// <summary>
/// Asset Performance for one filter bar and date range. Records are read once in LoadAsync; every section is worked out from them.
/// Availability = time not down ÷ time in service (from the asset's creation, never past now).
/// Utilization = the asset's planned utilization (its utilization field, else operating hours per day ÷ 24) × availability.
/// MTBF = up hours ÷ unplanned failures; MTTR = average length of unplanned downtime that ended.
/// Downtime is planned when its reason mentions planned, preventive or scheduled work.
/// Performance score = health 50%, availability 30%, utilization 20% (re-weighted over what is known; needs health or utilization).
/// </summary>
public sealed class AssetPerformanceCalculator
{
    public const string TopPerformer = "Top Performer";
    public const string OnTrack = "On Track";
    public const string Underperforming = "Underperforming";
    public const string NotRated = "Not rated";

    public const int MaxTrendMonths = 24;
    private const double AtRiskHealth = 70;

    public static readonly IReadOnlyList<(string Band, double Min, double Max)> Bands =
    [
        ("Excellent", 80, 100),
        ("Good", 60, 79.99),
        ("Watch", 40, 59.99),
        ("Critical", 0, 39.99)
    ];

    private readonly DashboardPeriod _period;
    private readonly AssetPerformanceThresholds _thresholds;
    private readonly DateTime _utcNow;
    private readonly IReadOnlyList<DashboardAsset> _assets;
    private readonly Dictionary<string, List<DashboardDowntime>> _downtime;
    private readonly Dictionary<string, List<DashboardHealthAssessment>> _assessments;
    private readonly HashSet<string> _highRiskPredictions;
    private readonly HashSet<string> _overduePreventive;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;
    private IReadOnlyList<AssetPerformanceRow>? _rows;

    private AssetPerformanceCalculator(
        DashboardPeriod period,
        AssetPerformanceThresholds thresholds,
        DateTime utcNow,
        IReadOnlyList<DashboardAsset> assets,
        Dictionary<string, List<DashboardDowntime>> downtime,
        Dictionary<string, List<DashboardHealthAssessment>> assessments,
        HashSet<string> highRiskPredictions,
        HashSet<string> overduePreventive,
        IReadOnlyList<(DateOnly, DateTime, DateTime)> months)
    {
        _period = period;
        _thresholds = thresholds;
        _utcNow = utcNow;
        _assets = assets;
        _downtime = downtime;
        _assessments = assessments;
        _highRiskPredictions = highRiskPredictions;
        _overduePreventive = overduePreventive;
        _months = months;
    }

    public DashboardPeriod Period => _period;

    public static async Task<AssetPerformanceCalculator> LoadAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
        DashboardPeriod period,
        AssetPerformanceThresholds thresholds,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var months = Months(period, utcNow);
        var assets = await repository.GetAssetsAsync(scope, cancellationToken);

        // Other services may reference an asset by business id or Mongo _id; everything is filed under the Mongo _id.
        var owner = new Dictionary<string, string>();
        foreach (var asset in assets)
        {
            foreach (var key in asset.Keys())
            {
                owner.TryAdd(key, asset.MongoId);
            }
        }

        IReadOnlyCollection<string>? keys = scope.FiltersAssets ? owner.Keys : null;
        var loadFrom = months.Count > 0 && months[0].StartUtc < period.PreviousFromUtc ? months[0].StartUtc : period.PreviousFromUtc;

        var downtime = (await repository.GetDowntimeAsync(scope, keys, loadFrom, period.ToUtc, cancellationToken))
            .Where(record => record.AssetId is not null && owner.ContainsKey(record.AssetId))
            .GroupBy(record => owner[record.AssetId!])
            .ToDictionary(group => group.Key, group => group.ToList());

        var assessments = (await repository.GetHealthAssessmentsAsync(scope, keys, period.ToUtc, cancellationToken))
            .Where(assessment => assessment.AssetId is not null && owner.ContainsKey(assessment.AssetId))
            .GroupBy(assessment => owner[assessment.AssetId!])
            .ToDictionary(group => group.Key, group => group.OrderBy(assessment => assessment.AssessmentDate).ToList());

        var highRisk = (await repository.GetPredictiveAlertsAsync(scope, keys, cancellationToken))
            .Where(alert => alert.AssetId is not null && owner.ContainsKey(alert.AssetId)
                && alert.RiskLevel?.Trim().ToLowerInvariant() is "high" or "critical" or "very high")
            .Select(alert => owner[alert.AssetId!])
            .ToHashSet();

        var overdue = (await repository.GetPreventiveSchedulesAsync(scope, keys, cancellationToken))
            .Where(schedule => schedule.AssetId is not null && owner.ContainsKey(schedule.AssetId) && schedule.NextDueDate < utcNow)
            .Select(schedule => owner[schedule.AssetId!])
            .ToHashSet();

        return new AssetPerformanceCalculator(period, thresholds, utcNow, assets, downtime, assessments, highRisk, overdue, months);
    }

    /// <summary>Every asset's figures for the selected period.</summary>
    public IReadOnlyList<AssetPerformanceRow> Rows() => _rows ??= _assets
        .Select(asset => Row(asset, Measure(asset, _period.FromUtc, _period.ToUtc), HealthAt(asset, _period.ToUtc)))
        .ToList();

    public AssetPerformanceSummary Summary()
    {
        var current = Fleet(_period.FromUtc, _period.ToUtc);
        var previous = Fleet(_period.PreviousFromUtc, _period.PreviousToUtc);

        return new AssetPerformanceSummary(
            DashboardWidgetCalculator.Kpi(current.AssetCount, previous.AssetCount, "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(current.AverageHealth, previous.AverageHealth, "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(current.Utilization, previous.Utilization, "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(current.Availability, previous.Availability, "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(current.Mtbf, previous.Mtbf, "hours", percentChange: true),
            DashboardWidgetCalculator.Kpi(current.Mttr, previous.Mttr, "hours", percentChange: true));
    }

    /// <summary>Assessed assets by health band (Healthy 70+, At Risk 40–69, Critical under 40) at each month end.</summary>
    public PerformanceSeries HealthTrend()
    {
        var healthy = new List<double?>();
        var atRisk = new List<double?>();
        var critical = new List<double?>();

        foreach (var (_, _, endUtc) in _months)
        {
            var bands = _assets
                .Select(asset => HealthAt(asset, endUtc))
                .OfType<double>()
                .Select(DashboardWidgetCalculator.HealthBand)
                .ToList();

            healthy.Add(bands.Count(band => band == DashboardWidgetCalculator.Healthy));
            atRisk.Add(bands.Count(band => band == DashboardWidgetCalculator.AtRisk));
            critical.Add(bands.Count(band => band == DashboardWidgetCalculator.Critical));
        }

        return new PerformanceSeries(MonthLabels(),
        [
            new(DashboardWidgetCalculator.Healthy, healthy),
            new(DashboardWidgetCalculator.AtRisk, atRisk),
            new(DashboardWidgetCalculator.Critical, critical)
        ]);
    }

    /// <summary>Averages over the category's assets that have a planned utilization.</summary>
    public IReadOnlyList<CategoryUtilization> UtilizationByCategory() => _assets
        .Select(asset => (Asset: asset, Measure: Measure(asset, _period.FromUtc, _period.ToUtc)))
        .Where(item => item.Measure.Utilization is not null)
        .GroupBy(item => Label(item.Asset.Category, "Uncategorised"), StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var active = Round(group.Average(item => item.Measure.Utilization!.Value));
            var maintenance = Round(group.Average(item => 100 - item.Measure.Availability!.Value));
            return new CategoryUtilization(group.Key, group.Count(), active, Round(Math.Max(0, 100 - active - maintenance)), maintenance, active);
        })
        .OrderByDescending(item => item.AssetCount)
        .ThenBy(item => item.Category, StringComparer.OrdinalIgnoreCase)
        .ToList();

    public ScoreDistribution ScoreDistribution()
    {
        var scores = Rows().Select(row => row.PerformanceScore).OfType<double>().ToList();

        return new ScoreDistribution(
            Bands.Select(band =>
            {
                var count = scores.Count(score => BandOf(score) == band.Band);
                return new ScoreBand(band.Band, band.Min, Math.Floor(band.Max), count, scores.Count == 0 ? 0 : Round(100d * count / scores.Count));
            }).ToList(),
            scores.Count,
            _assets.Count - scores.Count);
    }

    public ReliabilitySummary Reliability()
    {
        var summary = Summary();
        var windows = _months.Select(month => Fleet(month.StartUtc, month.EndUtc)).ToList();

        return new ReliabilitySummary(summary.Mtbf, summary.Mttr, new PerformanceSeries(MonthLabels(),
        [
            new("MTBF (hrs)", windows.Select(window => window.Mtbf).ToList()),
            new("MTTR (hrs)", windows.Select(window => window.Mttr).ToList())
        ]));
    }

    public DowntimeSummary Downtime()
    {
        var current = Fleet(_period.FromUtc, _period.ToUtc);
        var windows = _months.Select(month => Fleet(month.StartUtc, month.EndUtc)).ToList();

        return new DowntimeSummary(
            Round(current.PlannedHours),
            Round(current.UnplannedHours),
            Round(current.PlannedHours + current.UnplannedHours),
            current.Events,
            new PerformanceSeries(MonthLabels(),
            [
                new("Planned", windows.Select(window => (double?)Round(window.PlannedHours)).ToList()),
                new("Unplanned", windows.Select(window => (double?)Round(window.UnplannedHours)).ToList())
            ]));
    }

    public IReadOnlyList<PerformanceInsight> Insights()
    {
        var rows = Rows();
        var health = _thresholds.HealthThreshold;
        var target = _thresholds.UtilizationTarget;

        var belowHealth = rows
            .Where(row => row.HealthScore < health)
            .OrderBy(row => row.HealthScore)
            .Select(row => Insight(row, [$"Health score {row.HealthScore:0.#}"]))
            .ToList();

        var intervention = rows
            .Select(row => (Row: row, Reasons: InterventionReasons(row)))
            .Where(item => item.Reasons.Count > 0)
            .OrderByDescending(item => item.Reasons.Count)
            .ThenBy(item => item.Row.HealthScore ?? double.MaxValue)
            .Select(item => Insight(item.Row, item.Reasons))
            .ToList();

        var lowLocations = Locations()
            .Where(location => location.Utilization < target)
            .OrderBy(location => location.Utilization)
            .Select(location => location.Location)
            .ToList();

        return
        [
            new("below_health_threshold", "critical",
                $"{Plural(belowHealth.Count, "asset")} below health threshold",
                $"Assets with health score < {health:0.#} require immediate attention.",
                belowHealth.Count, belowHealth, [], ["view_assets", "create_work_order"],
                $"healthBelow={health.ToString(CultureInfo.InvariantCulture)}"),
            new("maintenance_intervention", "warning",
                $"Maintenance intervention recommended for {Plural(intervention.Count, "asset")}",
                "Based on usage, condition and predicted failures.",
                intervention.Count, intervention, [], ["view_assets", "create_work_order"],
                "interventionOnly=true"),
            new("utilization_below_target", "info",
                $"Utilization below target in {Plural(lowLocations.Count, "location")}",
                lowLocations.Count == 0
                    ? $"Every location averages {target:0.#}% utilization or more."
                    : $"Average utilization is below {target:0.#}% in {JoinNames(lowLocations)}.",
                lowLocations.Count, [], lowLocations, ["view_locations"],
                $"utilizationBelow={target.ToString(CultureInfo.InvariantCulture)}")
        ];
    }

    public IReadOnlyList<string> InterventionReasons(AssetPerformanceRow row)
    {
        var reasons = new List<string>();
        if (row.HealthScore < AtRiskHealth) reasons.Add("Health score at risk");
        if (_highRiskPredictions.Contains(row.Id)) reasons.Add("High-risk failure prediction");
        if (_overduePreventive.Contains(row.Id)) reasons.Add("Preventive maintenance overdue");
        if (row.Failures >= 2) reasons.Add($"{row.Failures} unplanned failures");

        return reasons;
    }

    public IReadOnlyList<LocationPerformanceRow> Locations()
    {
        var rows = Rows();
        var measures = _assets.ToDictionary(asset => asset.MongoId, asset => Measure(asset, _period.FromUtc, _period.ToUtc));

        return rows
            .GroupBy(row => Label(row.Location), StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var hours = group.Sum(row => measures[row.Id].Hours);
                var up = group.Sum(row => measures[row.Id].UpHours);
                var performance = Average(group.Select(row => row.PerformanceScore));

                return new LocationPerformanceRow(
                    group.Key,
                    group.Count(),
                    Average(group.Select(row => row.HealthScore)),
                    Average(group.Select(row => row.Utilization)),
                    hours > 0 ? Round(100 * up / hours) : null,
                    performance,
                    StatusOf(performance));
            })
            .OrderByDescending(location => location.AverageHealthScore ?? -1)
            .ThenBy(location => location.Location, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Best rated assets first; the bottom list holds the lowest rated ones (not already in the top list), worst last.</summary>
    public TopBottomAssets TopBottom(int topCount, int bottomCount)
    {
        var rated = Rows()
            .Where(row => row.PerformanceScore is not null)
            .OrderByDescending(row => row.PerformanceScore)
            .ThenBy(row => row.AssetId ?? row.Id, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var top = rated.Take(topCount).ToList();
        var bottom = rated.Skip(top.Count).TakeLast(bottomCount).ToList();

        return new TopBottomAssets(top, bottom);
    }

    public AssetComparison Compare(DashboardAsset asset)
    {
        var row = Rows().First(item => item.Id == asset.MongoId);
        var windows = _months.Select(month => Measure(asset, month.StartUtc, month.EndUtc)).ToList();

        return new AssetComparison(
            row,
            MonthLabels(),
            _months.Select(month => HealthAt(asset, month.EndUtc)).ToList(),
            windows.Select(window => window.Availability).ToList(),
            windows.Select(window => window.Utilization).ToList(),
            windows.Select(window => window.InService ? (double?)Round(window.PlannedHours + window.UnplannedHours) : null).ToList());
    }

    public DashboardAsset? FindAsset(string idOrAssetId) =>
        _assets.FirstOrDefault(asset => asset.MongoId == idOrAssetId.Trim()
            || string.Equals(asset.AssetId, idOrAssetId.Trim(), StringComparison.OrdinalIgnoreCase));

    public static string? BandOf(double? score) => score is null ? null : Bands.First(band => score >= band.Min || band.Min == 0).Band;

    public static string StatusOf(double? score) => score switch
    {
        null => NotRated,
        >= 80 => TopPerformer,
        >= 60 => OnTrack,
        _ => Underperforming
    };

    private AssetPerformanceRow Row(DashboardAsset asset, AssetWindow measure, double? health)
    {
        var score = PerformanceScore(health, measure.Availability, measure.Utilization);

        return new AssetPerformanceRow(
            asset.MongoId,
            asset.AssetId,
            asset.AssetName,
            asset.Category,
            asset.AssetType,
            asset.Location,
            health,
            health is { } value ? DashboardWidgetCalculator.HealthBand(value) : null,
            measure.Utilization,
            measure.Availability,
            measure.Failures > 0 ? Round(measure.UpHours / measure.Failures) : null,
            measure.Repairs > 0 ? Round(measure.RepairHours / measure.Repairs) : null,
            Round(measure.PlannedHours + measure.UnplannedHours),
            Round(measure.PlannedHours),
            Round(measure.UnplannedHours),
            measure.Failures,
            score,
            BandOf(score),
            StatusOf(score));
    }

    private static double? PerformanceScore(double? health, double? availability, double? utilization)
    {
        if (health is null && utilization is null)
        {
            return null;
        }

        var parts = new List<(double Value, double Weight)>();
        if (health is not null) parts.Add((health.Value, 0.5));
        if (availability is not null) parts.Add((availability.Value, 0.3));
        if (utilization is not null) parts.Add((utilization.Value, 0.2));

        return Round(parts.Sum(part => part.Value * part.Weight) / parts.Sum(part => part.Weight));
    }

    /// <summary>One asset over [fromUtc, toUtc), clipped to its time in service and to now.</summary>
    private AssetWindow Measure(DashboardAsset asset, DateTime fromUtc, DateTime toUtc)
    {
        var start = asset.CreatedAt > fromUtc ? asset.CreatedAt.Value : fromUtc;
        var end = toUtc < _utcNow ? toUtc : _utcNow;
        if (end <= start)
        {
            return AssetWindow.NotInService;
        }

        var hours = (end - start).TotalHours;
        double planned = 0, unplanned = 0, repairHours = 0;
        int failures = 0, repairs = 0, events = 0;

        foreach (var record in _downtime.GetValueOrDefault(asset.MongoId) ?? [])
        {
            var recordEnd = record.End ?? _utcNow;
            var overlap = ((recordEnd < end ? recordEnd : end) - (record.Start > start ? record.Start : start)).TotalHours;
            if (overlap <= 0 && !(record.Start >= start && record.Start < end))
            {
                continue;
            }

            events += record.Start >= start && record.Start < end ? 1 : 0;
            var isPlanned = IsPlanned(record.Reason);
            if (isPlanned)
            {
                planned += Math.Max(0, overlap);
                continue;
            }

            unplanned += Math.Max(0, overlap);
            if (record.Start >= start && record.Start < end)
            {
                failures++;
            }

            if (record.End is { } ended && ended >= start && ended < end && ended > record.Start)
            {
                repairs++;
                repairHours += (ended - record.Start).TotalHours;
            }
        }

        // Overlapping records must not push downtime past the time in service.
        var down = Math.Min(hours, planned + unplanned);
        if (planned + unplanned > hours)
        {
            var scale = hours / (planned + unplanned);
            planned *= scale;
            unplanned *= scale;
        }

        var availability = Round(100 * (hours - down) / hours);
        var plannedUtilization = PlannedUtilization(asset);

        return new AssetWindow(
            true,
            hours,
            hours - down,
            planned,
            unplanned,
            failures,
            repairs,
            repairHours,
            events,
            availability,
            plannedUtilization is null ? null : Round(plannedUtilization.Value * availability / 100));
    }

    /// <summary>The whole fleet over a window: in-service hours are pooled, so long-lived assets weigh more.</summary>
    private FleetWindow Fleet(DateTime fromUtc, DateTime toUtc)
    {
        var measures = _assets.Select(asset => Measure(asset, fromUtc, toUtc)).Where(measure => measure.InService).ToList();
        var hours = measures.Sum(measure => measure.Hours);
        var up = measures.Sum(measure => measure.UpHours);
        var failures = measures.Sum(measure => measure.Failures);
        var repairs = measures.Sum(measure => measure.Repairs);
        var cutoff = toUtc < _period.ToUtc ? toUtc : _period.ToUtc;

        return new FleetWindow(
            _assets.Count(asset => asset.CreatedAt is null || asset.CreatedAt < toUtc),
            Average(_assets.Select(asset => HealthAt(asset, cutoff))),
            Average(measures.Select(measure => measure.Utilization)),
            hours > 0 ? Round(100 * up / hours) : null,
            failures > 0 ? Round(up / failures) : null,
            repairs > 0 ? Round(measures.Sum(measure => measure.RepairHours) / repairs) : null,
            measures.Sum(measure => measure.PlannedHours),
            measures.Sum(measure => measure.UnplannedHours),
            measures.Sum(measure => measure.Events));
    }

    /// <summary>The latest assessment before the cutoff; one saved without a score falls back to its overall condition.</summary>
    private double? HealthAt(DashboardAsset asset, DateTime cutoffUtc)
    {
        var latest = _assessments.GetValueOrDefault(asset.MongoId)?.LastOrDefault(assessment => assessment.AssessmentDate < cutoffUtc);
        if (latest is null)
        {
            return null;
        }

        if (latest.HealthScore is > 0)
        {
            return Round(Math.Clamp(latest.HealthScore.Value, 0, 100));
        }

        return latest.OverallCondition?.Trim().ToLowerInvariant() switch
        {
            "excellent" => 95,
            "good" => 80,
            "fair" => 60,
            "poor" => 35,
            "very poor" => 20,
            "critical" => 15,
            _ => latest.HealthScore
        };
    }

    /// <summary>"78%", "78" or "0.78"; High / Medium / Low as 85 / 60 / 30; else operating hours per day ÷ 24.</summary>
    public static double? PlannedUtilization(DashboardAsset asset)
    {
        var text = asset.Utilization?.Trim().TrimEnd('%').Trim();
        if (!string.IsNullOrEmpty(text))
        {
            if (double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value))
            {
                return Math.Clamp(value is > 0 and <= 1 && text.Contains('.') ? value * 100 : value, 0, 100);
            }

            switch (text.ToLowerInvariant())
            {
                case "high": return 85;
                case "medium": return 60;
                case "low": return 30;
            }
        }

        return asset.OperatingHoursPerDay is > 0 and var hours ? Math.Clamp(hours / 24 * 100, 0, 100) : null;
    }

    private static bool IsPlanned(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return false;
        }

        var text = reason.ToLowerInvariant();
        return !text.Contains("unplanned") && !text.Contains("unscheduled")
            && (text.Contains("planned") || text.Contains("preventive") || text.Contains("scheduled"));
    }

    /// <summary>
    /// Calendar months (in the period's zone) covering the range up to the current month, at most the last 24, each clipped to the range.
    /// </summary>
    internal static List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> Months(DashboardPeriod period, DateTime utcNow)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, period.Zone));
        var lastDay = period.To < today ? period.To : today;
        var first = new DateOnly(period.From.Year, period.From.Month, 1);
        var last = new DateOnly(lastDay.Year, lastDay.Month, 1);
        var months = new List<(DateOnly, DateTime, DateTime)>();

        for (var month = first; month <= last; month = month.AddMonths(1))
        {
            var start = DashboardPeriods.StartOfDayUtc(month, period.Zone);
            var end = DashboardPeriods.StartOfDayUtc(month.AddMonths(1), period.Zone);
            months.Add((month, start < period.FromUtc ? period.FromUtc : start, end > period.ToUtc ? period.ToUtc : end));
        }

        return months.Count > MaxTrendMonths ? months.Skip(months.Count - MaxTrendMonths).ToList() : months;
    }

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static InsightAsset Insight(AssetPerformanceRow row, IReadOnlyList<string> reasons) =>
        new(row.Id, row.AssetId, row.AssetName, row.Location, row.HealthScore, reasons);

    private static double? Average(IEnumerable<double?> values)
    {
        var known = values.OfType<double>().ToList();
        return known.Count == 0 ? null : Round(known.Average());
    }

    private static double Round(double value) => Math.Round(value, 1);

    private static string Label(string? value, string fallback = "Unknown") => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private static string JoinNames(IReadOnlyList<string> names) =>
        names.Count == 1 ? names[0] : $"{string.Join(", ", names.Take(names.Count - 1))} and {names[^1]}";

    private sealed record AssetWindow(
        bool InService,
        double Hours,
        double UpHours,
        double PlannedHours,
        double UnplannedHours,
        int Failures,
        int Repairs,
        double RepairHours,
        int Events,
        double? Availability,
        double? Utilization)
    {
        public static readonly AssetWindow NotInService = new(false, 0, 0, 0, 0, 0, 0, 0, 0, null, null);
    }

    private sealed record FleetWindow(
        int AssetCount,
        double? AverageHealth,
        double? Utilization,
        double? Availability,
        double? Mtbf,
        double? Mttr,
        double PlannedHours,
        double UnplannedHours,
        int Events);
}
