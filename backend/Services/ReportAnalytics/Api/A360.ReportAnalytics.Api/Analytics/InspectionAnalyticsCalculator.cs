using System.Globalization;
using System.Text.RegularExpressions;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// InspectionType and Inspector narrow inspections, and findings to those raised by the narrowed inspections. ComplianceTarget is in percent.
/// DueWithinDays is the corrective-action horizon; RepeatWindowDays how close two findings must be to count as a repeat.
/// </summary>
public sealed record InspectionAnalyticsSettings(string? InspectionType, string? Inspector, double ComplianceTarget, int DueWithinDays, int RepeatWindowDays);

public sealed record InspectionSummary(
    KpiWidgetData TotalInspections,
    KpiWidgetData CompletionRate,
    KpiWidgetData OpenFindings,
    KpiWidgetData CriticalFindings,
    KpiWidgetData CorrectiveActionsDue);

public sealed record InspectionComplianceSummary(
    double? Value,
    double Target,
    bool? MeetsTarget,
    double? PreviousValue,
    double? Change,
    int CompliantAssets,
    int ScheduledAssets,
    PerformanceSeries Trend);

public sealed record InsightFinding(string Id, string? FindingId, string? AssetId, string? AssetName, string Severity, string? Category, DateTime? DueDate, IReadOnlyList<string> Reasons);

/// <summary>An Inspection Insights card. Actions name its buttons; Query is what "View findings" passes to /findings.</summary>
public sealed record InspectionInsight(
    string Key,
    string Severity,
    string Title,
    string Message,
    int Count,
    IReadOnlyList<InsightFinding> Findings,
    IReadOnlyList<InsightAsset> Assets,
    IReadOnlyList<string> Locations,
    IReadOnlyList<string> Actions,
    string Query);

public sealed record FindingRow(
    string Id,
    string? FindingId,
    string? AssetRecordId,
    string? AssetId,
    string? AssetName,
    string? Location,
    string Category,
    string Severity,
    string? Description,
    DateTime? RaisedAt,
    DateTime? DueDate,
    string? Owner,
    string Status,
    bool IsOverdue,
    int? AgeDays,
    string? InspectionId);

public sealed record InspectorPerformanceRow(
    string Inspector,
    int Inspections,
    int Completed,
    double? AvgDurationHours,
    double? FindingRate,
    double? ClosureRate);

/// <summary>
/// Inspection Analytics for one filter bar and date range.
/// Inspections (compliance_inspections) belong to the period by scheduled date, else creation date. Their status maps to Completed,
/// In Progress, Scheduled or Cancelled (a record with a result and no other status is Completed); an unfinished inspection past its
/// scheduled date is Overdue. A completed inspection's updated_at is taken as its completion time.
/// Findings (issue_reports) belong to the period by creation date; Resolved, In Progress or Open by status; due by their own due date, else
/// raised date + the severity's resolution SLA. A finding comes from the inspection it names, else the latest inspection of the same asset
/// in the 7 days before it was raised.
/// Compliance at a moment = assets whose latest completed inspection's next inspection date has not passed ÷ assets with one.
/// </summary>
public sealed class InspectionAnalyticsCalculator
{
    public const string Completed = "Completed";
    public const string InProgress = "In Progress";
    public const string Scheduled = "Scheduled";
    public const string Overdue = "Overdue";
    public const string Cancelled = "Cancelled";

    public const string Open = "Open";
    public const string Resolved = "Resolved";

    public static readonly IReadOnlyList<string> InspectionStatuses = [Completed, InProgress, Scheduled, Overdue, Cancelled];
    public static readonly IReadOnlyList<string> FindingStatuses = [Open, InProgress, Resolved];
    public static readonly IReadOnlyList<string> Severities = ["Critical", "High", "Medium", "Low"];

    private const int LinkWindowDays = 7;
    private static readonly Regex SlaPattern = new(@"(\d+(?:\.\d+)?)\s*([a-z]*)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly DashboardPeriod _period;
    private readonly InspectionAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly IReadOnlyList<DashboardAsset> _assets;
    private readonly Dictionary<string, DashboardAsset> _assetsByKey;
    private readonly List<InspectionItem> _inspections;
    private readonly List<FindingItem> _findings;
    private readonly IReadOnlyList<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;

    private InspectionAnalyticsCalculator(
        DashboardPeriod period,
        InspectionAnalyticsSettings settings,
        DateTime utcNow,
        IReadOnlyList<DashboardAsset> assets,
        Dictionary<string, DashboardAsset> assetsByKey,
        List<InspectionItem> inspections,
        List<FindingItem> findings)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _assets = assets;
        _assetsByKey = assetsByKey;
        _inspections = inspections;
        _findings = findings;
        _months = AssetPerformanceCalculator.Months(period, utcNow);
    }

    public DashboardPeriod Period => _period;

    public static async Task<InspectionAnalyticsCalculator> LoadAsync(
        IDashboardDataRepository repository,
        DashboardDataScope scope,
        DashboardPeriod period,
        InspectionAnalyticsSettings settings,
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
        var records = await repository.GetInspectionRecordsAsync(scope, keys, cancellationToken);
        var findingRecords = await repository.GetFindingsAsync(scope, keys, cancellationToken);
        var severityRules = await repository.GetSeverityRulesAsync(scope, cancellationToken);

        string? AssetKey(string? assetId) => assetId is null ? null : assetsByKey.TryGetValue(assetId, out var asset) ? asset.MongoId : assetId;

        var inspections = records.Select(record =>
        {
            var planned = record.ScheduledDate ?? record.CreatedAt;
            var status = BaseStatusOf(record.Status, record.Result);
            if (status is not (Completed or Cancelled) && planned < utcNow)
            {
                status = Overdue;
            }

            var matches = (settings.InspectionType is null || string.Equals(record.InspectionType?.Trim(), settings.InspectionType, StringComparison.OrdinalIgnoreCase))
                && (settings.Inspector is null || string.Equals(record.InspectorName?.Trim(), settings.Inspector, StringComparison.OrdinalIgnoreCase));

            return new InspectionItem(record, AssetKey(record.AssetId), planned, status, status == Completed ? record.UpdatedAt ?? planned : null, matches);
        }).ToList();

        var byInspectionId = new Dictionary<string, InspectionItem>(StringComparer.OrdinalIgnoreCase);
        foreach (var inspection in inspections)
        {
            byInspectionId.TryAdd(inspection.Record.Id, inspection);
            if (inspection.Record.InspectionId is { } inspectionId)
            {
                byInspectionId.TryAdd(inspectionId, inspection);
            }
        }

        var findings = new List<FindingItem>();
        foreach (var record in findingRecords)
        {
            var assetKey = AssetKey(record.AssetId);
            var severity = SeverityLabel(record.Severity);
            var status = FindingStatusOf(record.Status);
            var source = record.InspectionId is not null && byInspectionId.TryGetValue(record.InspectionId, out var named)
                ? named
                : record.CreatedAt is null
                    ? null
                    : inspections
                        .Where(inspection => inspection.AssetKey == assetKey && inspection.ReferenceDate is { } date
                            && date <= record.CreatedAt && date >= record.CreatedAt.Value.AddDays(-LinkWindowDays))
                        .MaxBy(inspection => inspection.ReferenceDate);

            // With an inspection type or inspector chosen, only findings from those inspections count.
            if ((settings.InspectionType is not null || settings.Inspector is not null) && source?.Matches != true)
            {
                continue;
            }

            findings.Add(new FindingItem(
                record,
                assetKey,
                severity,
                string.IsNullOrWhiteSpace(record.Category) ? "Uncategorised" : record.Category.Trim(),
                status,
                record.DueDate ?? (record.CreatedAt is null ? null : record.CreatedAt.Value.Add(ResolutionTime(severity, severityRules))),
                status == Resolved ? record.UpdatedAt ?? record.CreatedAt : null,
                source));
        }

        return new InspectionAnalyticsCalculator(period, settings, utcNow, assets, assetsByKey, inspections.Where(inspection => inspection.Matches).ToList(), findings);
    }

    public InspectionSummary Summary()
    {
        var at = Moment(_period.ToUtc);
        var previousAt = Moment(_period.PreviousToUtc);

        double? Completion(DateTime fromUtc, DateTime toUtc)
        {
            var inspections = InspectionsBetween(fromUtc, toUtc).ToList();
            return inspections.Count == 0 ? null : Round1(100d * inspections.Count(inspection => inspection.Status == Completed) / inspections.Count);
        }

        return new InspectionSummary(
            DashboardWidgetCalculator.Kpi(InspectionsBetween(_period.FromUtc, _period.ToUtc).Count(), InspectionsBetween(_period.PreviousFromUtc, _period.PreviousToUtc).Count(), "number", percentChange: true),
            DashboardWidgetCalculator.Kpi(Completion(_period.FromUtc, _period.ToUtc), Completion(_period.PreviousFromUtc, _period.PreviousToUtc), "percent", percentChange: false),
            DashboardWidgetCalculator.Kpi(
                RaisedBetween(_period.FromUtc, _period.ToUtc).Count(finding => IsUnresolvedAt(finding, at)),
                RaisedBetween(_period.PreviousFromUtc, _period.PreviousToUtc).Count(finding => IsUnresolvedAt(finding, previousAt)),
                "number",
                percentChange: true),
            DashboardWidgetCalculator.Kpi(
                RaisedBetween(_period.FromUtc, _period.ToUtc).Count(finding => finding.Severity == "Critical" && IsUnresolvedAt(finding, at)),
                RaisedBetween(_period.PreviousFromUtc, _period.PreviousToUtc).Count(finding => finding.Severity == "Critical" && IsUnresolvedAt(finding, previousAt)),
                "number",
                percentChange: true),
            DashboardWidgetCalculator.Kpi(CorrectiveActionsDueAt(at).Count, CorrectiveActionsDueAt(previousAt).Count, "number", percentChange: true));
    }

    /// <summary>Inspections planned, completed and overdue per month (by planned date).</summary>
    public PerformanceSeries CompletionTrend()
    {
        var months = _months.Select(month => InspectionsBetween(month.StartUtc, month.EndUtc).ToList()).ToList();

        return new PerformanceSeries(MonthLabels(),
        [
            new("Planned", months.Select(month => (double?)month.Count).ToList()),
            new(Completed, months.Select(month => (double?)month.Count(inspection => inspection.Status == Completed)).ToList()),
            new(Overdue, months.Select(month => (double?)month.Count(inspection => inspection.Status == Overdue)).ToList())
        ]);
    }

    /// <summary>Findings raised per month by severity.</summary>
    public PerformanceSeries FindingsBySeverity()
    {
        var severities = Severities.Concat(_findings.Select(finding => finding.Severity).Where(severity => !Severities.Contains(severity)).Distinct().Order()).ToList();
        var months = _months.Select(month => RaisedBetween(month.StartUtc, month.EndUtc).ToList()).ToList();

        return new PerformanceSeries(MonthLabels(), severities
            .Select(severity => new PerformanceSeriesLine(severity, months.Select(month => (double?)month.Count(finding => finding.Severity == severity)).ToList()))
            .Where(line => Severities.Contains(line.Name) || line.Values.Any(value => value > 0))
            .ToList());
    }

    public CountBreakdown InspectionStatus()
    {
        var inspections = InspectionsBetween(_period.FromUtc, _period.ToUtc, includeCancelled: true).ToList();
        var counts = InspectionStatuses
            .Select(status => (status, inspections.Count(inspection => inspection.Status == status)))
            .Where(item => item.status != Cancelled || item.Item2 > 0)
            .ToList();

        var total = counts.Sum(item => item.Item2);
        return new CountBreakdown(total, counts.Select(item => new CountItem(item.status, item.Item2, total == 0 ? 0 : Round1(100d * item.Item2 / total))).ToList());
    }

    public CountBreakdown FindingsByCategory()
    {
        var findings = RaisedBetween(_period.FromUtc, _period.ToUtc).ToList();
        var counts = findings
            .GroupBy(finding => finding.Category, StringComparer.OrdinalIgnoreCase)
            .Select(group => (Label: group.Key, Count: group.Count()))
            .OrderByDescending(item => item.Count)
            .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new CountBreakdown(findings.Count, counts.Select(item => new CountItem(item.Label, item.Count, findings.Count == 0 ? 0 : Round1(100d * item.Count / findings.Count))).ToList());
    }

    public InspectionComplianceSummary Compliance()
    {
        var current = ComplianceAt(Moment(_period.ToUtc), _assets);
        var previous = ComplianceAt(Moment(_period.PreviousToUtc), _assets);
        var target = _settings.ComplianceTarget;

        return new InspectionComplianceSummary(
            current.Value,
            target,
            current.Value is null ? null : current.Value >= target,
            previous.Value,
            current.Value is null || previous.Value is null ? null : Round1(current.Value.Value - previous.Value.Value),
            current.Compliant,
            current.Total,
            new PerformanceSeries(MonthLabels(),
            [
                new("Compliance (%)", _months.Select(month => ComplianceAt(Moment(month.EndUtc), _assets).Value).ToList()),
                new("Target (%)", _months.Select(_ => (double?)target).ToList())
            ]));
    }

    /// <summary>Per month: findings that repeat an earlier finding (same asset and category within the window) and findings resolved.</summary>
    public PerformanceSeries RepeatFindingsTrend() => new(MonthLabels(),
    [
        new("Repeated Defects", _months.Select(month => (double?)RaisedBetween(month.StartUtc, month.EndUtc).Count(IsRepeat)).ToList()),
        new("Resolved Defects", _months.Select(month => (double?)_findings.Count(finding => finding.ResolvedAt >= month.StartUtc && finding.ResolvedAt < month.EndUtc)).ToList())
    ]);

    public IReadOnlyList<InspectionInsight> Insights()
    {
        var critical = _findings
            .Where(finding => finding.Status != Resolved && finding.Severity == "Critical")
            .OrderBy(finding => finding.DueDate)
            .Select(finding => InsightOf(finding, [finding.DueDate < _utcNow ? "Overdue" : $"Due {finding.DueDate:dd MMM yyyy}"]))
            .ToList();

        var due = CorrectiveActionsDueAt(_utcNow)
            .OrderBy(finding => finding.DueDate)
            .Select(finding => InsightOf(finding, [finding.DueDate < _utcNow ? "Overdue" : $"Due {finding.DueDate:dd MMM yyyy}"]))
            .ToList();

        var since = _utcNow.AddDays(-_settings.RepeatWindowDays);
        var recurring = _findings
            .Where(finding => finding.Record.CreatedAt >= since && finding.AssetKey is not null)
            .GroupBy(finding => finding.AssetKey!)
            .Select(group => (Asset: group.Key, Repeats: group
                .GroupBy(finding => finding.Category, StringComparer.OrdinalIgnoreCase)
                .Where(category => category.Count() >= 2)
                .Select(category => $"{category.Count()} {category.Key} findings")
                .ToList(), Sample: group.First()))
            .Where(item => item.Repeats.Count > 0)
            .Select(item =>
            {
                var asset = AssetOf(item.Sample.Record.AssetId);
                return new InsightAsset(asset?.MongoId ?? item.Asset, asset?.AssetId ?? item.Sample.Record.AssetId, asset?.AssetName ?? item.Sample.Record.AssetName, asset?.Location, null, item.Repeats);
            })
            .ToList();

        var target = _settings.ComplianceTarget;
        var safetyLocations = _assets
            .GroupBy(asset => string.IsNullOrWhiteSpace(asset.Location) ? "Unknown" : asset.Location.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => (Location: group.Key, Compliance: ComplianceAt(_utcNow, group.ToList(), safetyOnly: true)))
            .Where(item => item.Compliance.Total > 0 && item.Compliance.Value < target)
            .OrderBy(item => item.Compliance.Value)
            .Select(item => item.Location)
            .ToList();
        var safetyTypes = _inspections
            .Select(inspection => inspection.Record.InspectionType?.Trim())
            .Where(type => type?.Contains("safety", StringComparison.OrdinalIgnoreCase) == true)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return
        [
            new("critical_findings", "critical",
                $"{Plural(critical.Count, "critical finding")} require{(critical.Count == 1 ? "s" : "")} immediate action",
                "Critical findings pose high risk and require immediate attention.",
                critical.Count, critical, [], [], ["view_findings", "create_action_plan"], "severity=Critical"),
            new("corrective_actions_due", "warning",
                $"{Plural(due.Count, "corrective action")} due within {_settings.DueWithinDays} days",
                "Corrective actions are due soon and may impact compliance.",
                due.Count, due, [], [], ["view_findings", "create_action_plan"], $"dueWithinDays={_settings.DueWithinDays}"),
            new("recurring_findings", "info",
                $"{Plural(recurring.Count, "asset")} {(recurring.Count == 1 ? "has" : "have")} recurring findings",
                $"These assets have repeat findings in the same category in the last {_settings.RepeatWindowDays} days.",
                recurring.Count, [], recurring, [], ["view_assets", "open_asset_details"], "repeatOnly=true"),
            new("safety_compliance", safetyLocations.Count > 0 ? "warning" : "success",
                safetyLocations.Count > 0
                    ? $"Safety compliance below target in {Plural(safetyLocations.Count, "location")}"
                    : "Safety compliance on target in every location",
                safetyLocations.Count > 0
                    ? $"Safety inspection compliance is below {target:0.#}% in {JoinNames(safetyLocations)}."
                    : $"Every location with safety inspections is at or above {target:0.#}%.",
                safetyLocations.Count, [], [], safetyLocations, ["view_details", "create_action_plan"],
                safetyTypes.Count == 1 ? $"inspectionType={Uri.EscapeDataString(safetyTypes[0]!)}" : string.Empty)
        ];
    }

    /// <summary>Every unresolved finding (not limited to the period): most severe first, then earliest due.</summary>
    public IReadOnlyList<FindingRow> OpenFindings() => _findings
        .Where(finding => finding.Status != Resolved)
        .Select(Row)
        .OrderBy(row => SeverityRank(row.Severity))
        .ThenBy(row => row.DueDate ?? DateTime.MaxValue)
        .ToList();

    public bool IsRepeat(FindingRow row) => _findings.Any(finding => finding.Record.Id == row.Id && IsRepeat(finding));

    public IReadOnlyList<InspectorPerformanceRow> Inspectors() => InspectionsBetween(_period.FromUtc, _period.ToUtc)
        .Where(inspection => !string.IsNullOrWhiteSpace(inspection.Record.InspectorName))
        .GroupBy(inspection => inspection.Record.InspectorName!.Trim(), StringComparer.OrdinalIgnoreCase)
        .Select(group =>
        {
            var completed = group.Where(inspection => inspection.Status == Completed).ToList();
            var durations = completed
                .Where(inspection => inspection.Record.CreatedAt is not null && inspection.CompletedAt > inspection.Record.CreatedAt)
                .Select(inspection => (inspection.CompletedAt!.Value - inspection.Record.CreatedAt!.Value).TotalHours)
                .ToList();
            var findings = _findings.Where(finding => finding.Source is not null && completed.Contains(finding.Source)).ToList();

            return new InspectorPerformanceRow(
                group.Key,
                group.Count(),
                completed.Count,
                durations.Count == 0 ? null : Round1(durations.Average()),
                completed.Count == 0 ? null : Round1(100d * findings.Count / completed.Count),
                findings.Count == 0 ? null : Round1(100d * findings.Count(finding => finding.Status == Resolved) / findings.Count));
        })
        .OrderByDescending(row => row.Completed)
        .ThenBy(row => row.Inspector, StringComparer.OrdinalIgnoreCase)
        .ToList();

    public static string BaseStatusOf(string? status, string? result) => status?.Trim().ToLowerInvariant().Replace('-', ' ').Replace('_', ' ') switch
    {
        "completed" or "complete" or "closed" or "done" or "passed" or "failed" or "approved" => Completed,
        "in progress" or "inprogress" or "ongoing" or "started" => InProgress,
        "cancelled" or "canceled" => Cancelled,
        "scheduled" or "planned" or "pending" or "open" or "new" or "assigned" => Scheduled,
        _ => string.IsNullOrWhiteSpace(result) ? Scheduled : Completed
    };

    public static string FindingStatusOf(string? status) => status?.Trim().ToLowerInvariant().Replace('-', ' ').Replace('_', ' ') switch
    {
        "resolved" or "closed" or "completed" or "done" or "fixed" or "verified" => Resolved,
        "in progress" or "inprogress" or "ongoing" or "under review" or "assigned" => InProgress,
        _ => Open
    };

    public static string SeverityLabel(string? severity) =>
        string.IsNullOrWhiteSpace(severity) ? "Unspecified" : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(severity.Trim().ToLowerInvariant());

    public static int SeverityRank(string? severity)
    {
        var index = Severities.ToList().FindIndex(item => string.Equals(item, severity, StringComparison.OrdinalIgnoreCase));
        return index < 0 ? Severities.Count : index;
    }

    /// <summary>The severity master's resolution SLA ("24 hours", "3 days", "1 week"); otherwise 1, 3, 7 or 14 days by severity.</summary>
    private static TimeSpan ResolutionTime(string severity, IReadOnlyList<DashboardSeverityRule> rules)
    {
        var sla = rules.FirstOrDefault(rule => string.Equals(rule.Name?.Trim(), severity, StringComparison.OrdinalIgnoreCase))?.ResolutionSla;
        if (sla is not null && SlaPattern.Match(sla) is { Success: true } match
            && double.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var amount))
        {
            var unit = match.Groups[2].Value.ToLowerInvariant();
            if (unit.StartsWith("m") && !unit.StartsWith("mo")) return TimeSpan.FromMinutes(amount);
            if (unit.StartsWith("d")) return TimeSpan.FromDays(amount);
            if (unit.StartsWith("w")) return TimeSpan.FromDays(7 * amount);
            if (unit.StartsWith("mo")) return TimeSpan.FromDays(30 * amount);
            return TimeSpan.FromHours(amount);
        }

        return TimeSpan.FromDays(severity switch
        {
            "Critical" => 1,
            "High" => 3,
            "Medium" => 7,
            _ => 14
        });
    }

    private IEnumerable<InspectionItem> InspectionsBetween(DateTime fromUtc, DateTime toUtc, bool includeCancelled = false) => _inspections
        .Where(inspection => inspection.Planned >= fromUtc && inspection.Planned < toUtc && (includeCancelled || inspection.Status != Cancelled));

    private IEnumerable<FindingItem> RaisedBetween(DateTime fromUtc, DateTime toUtc) =>
        _findings.Where(finding => finding.Record.CreatedAt >= fromUtc && finding.Record.CreatedAt < toUtc);

    private static bool IsUnresolvedAt(FindingItem finding, DateTime at) =>
        finding.Record.CreatedAt <= at && (finding.Status != Resolved || finding.ResolvedAt > at);

    private List<FindingItem> CorrectiveActionsDueAt(DateTime at) => _findings
        .Where(finding => IsUnresolvedAt(finding, at) && finding.DueDate <= at.AddDays(_settings.DueWithinDays))
        .ToList();

    private bool IsRepeat(FindingItem finding) => finding.Record.CreatedAt is { } raised && _findings.Any(other => other != finding
        && other.AssetKey == finding.AssetKey && finding.AssetKey is not null
        && string.Equals(other.Category, finding.Category, StringComparison.OrdinalIgnoreCase)
        && other.Record.CreatedAt is { } earlier && earlier < raised && earlier >= raised.AddDays(-_settings.RepeatWindowDays));

    private (double? Value, int Compliant, int Total) ComplianceAt(DateTime at, IReadOnlyList<DashboardAsset> assets, bool safetyOnly = false)
    {
        var compliant = 0;
        var total = 0;
        foreach (var asset in assets)
        {
            var latest = _inspections
                .Where(inspection => inspection.AssetKey == asset.MongoId && inspection.CompletedAt <= at && inspection.Record.NextInspectionDate is not null
                    && (!safetyOnly || inspection.Record.InspectionType?.Contains("safety", StringComparison.OrdinalIgnoreCase) == true))
                .MaxBy(inspection => inspection.CompletedAt);
            if (latest is null)
            {
                continue;
            }

            total++;
            if (latest.Record.NextInspectionDate >= at)
            {
                compliant++;
            }
        }

        return (total == 0 ? null : Round1(100d * compliant / total), compliant, total);
    }

    private DateTime Moment(DateTime utc) => utc < _utcNow ? utc : _utcNow;

    private FindingRow Row(FindingItem finding)
    {
        var asset = AssetOf(finding.Record.AssetId);
        var raised = finding.Record.CreatedAt;
        return new FindingRow(
            finding.Record.Id,
            finding.Record.FindingId,
            asset?.MongoId,
            asset?.AssetId ?? finding.Record.AssetId,
            finding.Record.AssetName ?? asset?.AssetName,
            asset?.Location,
            finding.Category,
            finding.Severity,
            finding.Record.Description,
            raised,
            finding.DueDate,
            finding.Record.Owner ?? finding.Record.ReportedBy,
            finding.Status,
            finding.Status != Resolved && finding.DueDate < _utcNow,
            raised is null ? null : Math.Max(0, (int)(_utcNow - raised.Value).TotalDays),
            finding.Source?.Record.InspectionId ?? finding.Record.InspectionId);
    }

    private InsightFinding InsightOf(FindingItem finding, IReadOnlyList<string> reasons)
    {
        var asset = AssetOf(finding.Record.AssetId);
        return new InsightFinding(finding.Record.Id, finding.Record.FindingId, asset?.AssetId ?? finding.Record.AssetId,
            finding.Record.AssetName ?? asset?.AssetName, finding.Severity, finding.Category, finding.DueDate, reasons);
    }

    private DashboardAsset? AssetOf(string? key) => key is not null && _assetsByKey.TryGetValue(key, out var asset) ? asset : null;

    private IReadOnlyList<string> MonthLabels() =>
        _months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static double Round1(double value) => Math.Round(value, 1);

    private static string Plural(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private static string JoinNames(IReadOnlyList<string> names) =>
        names.Count == 1 ? names[0] : $"{string.Join(", ", names.Take(names.Count - 1))} and {names[^1]}";

    private sealed record InspectionItem(
        DashboardInspectionRecord Record,
        string? AssetKey,
        DateTime? Planned,
        string Status,
        DateTime? CompletedAt,
        bool Matches)
    {
        public DateTime? ReferenceDate => CompletedAt ?? Planned;
    }

    private sealed record FindingItem(
        DashboardFinding Record,
        string? AssetKey,
        string Severity,
        string Category,
        string Status,
        DateTime? DueDate,
        DateTime? ResolvedAt,
        InspectionItem? Source);
}
