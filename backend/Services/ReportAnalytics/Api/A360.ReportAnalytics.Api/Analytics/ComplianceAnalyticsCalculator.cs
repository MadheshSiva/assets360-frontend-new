using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>Compliance Area / Regulation / Risk Level picks (null means all) and the score and CAPA targets in percent.</summary>
public sealed record ComplianceAnalyticsSettings(string? Area, string? Regulation, string? RiskLevel, double ScoreTarget, double CapaTarget);

public sealed record ComplianceSummary(
    KpiWidgetData ComplianceScore,
    KpiWidgetData OpenFindings,
    KpiWidgetData ExpiringItems,
    KpiWidgetData OverdueCapa,
    KpiWidgetData ActiveRisks,
    double ScoreTarget);

/// <summary>Monthly score lines (Overall, Regulatory, Safety, Environmental) and the previous period's Overall line, month by month.</summary>
public sealed record ComplianceScoreTrend(PerformanceSeries Trend, PerformanceSeries PreviousTrend, double? Score, double? PreviousScore, double Target);

public sealed record ComplianceSeverityTrend(PerformanceSeries Trend, int Total);

public sealed record ComplianceStatusBreakdown(int Compliant, int PartiallyCompliant, int NonCompliant, int NotAssessed, int Total);

public sealed record ComplianceAreaCount(string Area, int OpenFindings);

public sealed record ComplianceFindingRow(
    string Id,
    string FindingId,
    string Requirement,
    string? Regulation,
    string Area,
    string? AssetId,
    string? AssetName,
    string? Location,
    string Severity,
    string Status,
    DateTime? DueDate,
    int? DueInDays,
    bool IsOverdue,
    string? Owner,
    string? InspectionId,
    string? CorrectiveAction,
    string? WorkOrder,
    DateTime? RaisedAt);

public sealed record ComplianceCapaRow(
    string Id,
    string CapaId,
    string Action,
    string FindingId,
    string? Location,
    string? Owner,
    DateTime? DueDate,
    int? DueInDays,
    int DaysOverdue,
    string? WorkOrder,
    string Status);

public sealed record ComplianceCapaSummary(
    double? ClosureRate,
    double Target,
    int Total,
    int Closed,
    int Open,
    int Overdue,
    PerformanceSeries Trend,
    IReadOnlyList<ComplianceCapaRow> OpenActions);

public sealed record ComplianceExpiryRow(
    string Id,
    string Reference,
    string Name,
    string Type,
    string Source,
    string? AssetId,
    string? Location,
    string Area,
    DateTime ExpiresAt,
    int DaysLeft,
    int MonthIndex,
    string? Status);

public sealed record ComplianceExpirySummary(
    IReadOnlyList<string> Months,
    IReadOnlyList<string> Types,
    PerformanceSeries Trend,
    int ExpiringWithin90Days,
    int Expired,
    IReadOnlyList<ComplianceExpiryRow> Items);

public sealed record ComplianceRiskRow(
    string Id,
    string Title,
    string Source,
    string? Regulation,
    string Area,
    string? Location,
    string Level,
    string? Owner,
    string? Reference,
    DateTime? Since);

public sealed record ComplianceLocationRow(
    string Location,
    double? Score,
    double? EnvironmentalScore,
    int OpenFindings,
    int CriticalFindings,
    int ExpiringItems,
    int ActiveRisks,
    string Risk,
    string Status);

public sealed record ComplianceEnvironmentalRow(string Location, double? Score, bool? MeetsTarget);

public sealed record ComplianceInsight(string Key, string Severity, string Title, string Message, int Count, IReadOnlyList<string> Locations, IReadOnlyList<string> Actions);

/// <summary>
/// Works out Compliance Analytics from live Inspection, Maintenance, WIP, Asset and Master Data records for one filter bar.
/// An inspection due in the period is Compliant when it was completed without findings (or passed), Partially Compliant when it found
/// non-critical issues (or passed with conditions) and Non-Compliant when it failed, found a critical issue or is overdue. The score is
/// the average of 100 / 50 / 0 over those inspections. Corrective actions (CAPA) are findings with a corrective action or work order.
/// </summary>
public sealed class ComplianceAnalyticsCalculator
{
    public static readonly IReadOnlyList<string> Areas = ["Safety", "Environmental", "Quality", "Maintenance", "Operations"];
    public static readonly IReadOnlyList<string> RiskLevels = ["Critical", "High", "Medium", "Low"];
    public static readonly IReadOnlyList<string> ExpiryTypes = ["Permits", "Certifications", "Licenses", "Other"];
    public const int ExpiryMonths = 10;
    public const int ExpirySoonDays = 90;

    private const string Compliant = "Compliant";
    private const string Partial = "Partially Compliant";
    private const string NonCompliant = "Non-Compliant";

    private readonly DashboardPeriod _period;
    private readonly ComplianceAnalyticsSettings _settings;
    private readonly DateTime _utcNow;
    private readonly DateTime _asOf;
    private readonly DateTime _previousAsOf;
    private readonly List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _months;
    private readonly List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> _previousMonths;
    private readonly List<Inspection> _inspections;
    private readonly List<Finding> _findings;
    private readonly List<ExpiryEntry> _expiries;
    private readonly List<CompliancePreventiveRecord> _preventive;
    private readonly HashSet<string> _registerAssets;
    private readonly ILookup<string, Finding> _findingsByInspection;

    private sealed record Inspection(ComplianceInspectionRecord Record, string Area, bool Regulatory, string? Site);

    private sealed record Finding(ComplianceFindingRecord Record, string Area, string? Regulation, string? Site, string Severity, bool Closed)
    {
        public bool IsCapa => !string.IsNullOrWhiteSpace(Record.CorrectiveAction) || !string.IsNullOrWhiteSpace(Record.WorkOrder);

        public DateTime? ClosedAt => Closed ? Record.ClosedAt ?? Record.CreatedAt ?? DateTime.MinValue : null;

        public bool OpenAt(DateTime time) => (Record.CreatedAt is null || Record.CreatedAt < time) && !(ClosedAt is { } closed && closed < time);
    }

    private sealed record ExpiryEntry(ComplianceExpiryRecord Record, string Area);

    private ComplianceAnalyticsCalculator(
        DashboardPeriod period,
        ComplianceAnalyticsSettings settings,
        DateTime utcNow,
        List<Inspection> inspections,
        List<Finding> findings,
        List<ExpiryEntry> expiries,
        List<CompliancePreventiveRecord> preventive,
        HashSet<string> registerAssets)
    {
        _period = period;
        _settings = settings;
        _utcNow = utcNow;
        _asOf = period.ToUtc < utcNow ? period.ToUtc : utcNow;
        _previousAsOf = period.PreviousToUtc < utcNow ? period.PreviousToUtc : utcNow;
        _months = AssetPerformanceCalculator.Months(period, utcNow);
        var days = period.To.DayNumber - period.From.DayNumber + 1;
        var previous = period with
        {
            From = period.From.AddDays(-days),
            To = period.From.AddDays(-1),
            FromUtc = period.PreviousFromUtc,
            ToUtc = period.PreviousToUtc
        };
        _previousMonths = AssetPerformanceCalculator.Months(previous, utcNow);
        _inspections = inspections;
        _findings = findings;
        _expiries = expiries;
        _preventive = preventive;
        _registerAssets = registerAssets;
        _findingsByInspection = findings
            .Where(finding => finding.Record.InspectionCode is not null)
            .ToLookup(finding => finding.Record.InspectionCode!, StringComparer.OrdinalIgnoreCase);
    }

    public DashboardPeriod Period => _period;

    public ComplianceAnalyticsSettings Settings => _settings;

    public static async Task<ComplianceAnalyticsCalculator> LoadAsync(
        IComplianceAnalyticsDataRepository repository,
        IDashboardDataRepository dashboardRepository,
        DashboardDataScope scope,
        DashboardPeriod period,
        ComplianceAnalyticsSettings settings,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var records = await repository.GetRecordsAsync(scope.TenantId, scope.ClientId, cancellationToken);

        // Organization narrows to the assets it owns; Location matches the record's site / location or the assets at that site.
        HashSet<string>? organizationAssets = null;
        HashSet<string>? locationAssets = null;
        if (!string.IsNullOrWhiteSpace(scope.Organization))
        {
            organizationAssets = Keys(await dashboardRepository.GetAssetsAsync(scope with { Location = null, AssetCategory = null, AssetType = null }, cancellationToken));
        }

        if (!string.IsNullOrWhiteSpace(scope.Location))
        {
            locationAssets = Keys(await dashboardRepository.GetAssetsAsync(scope with { Organization = null, AssetCategory = null, AssetType = null }, cancellationToken));
        }

        var registerAssets = string.IsNullOrWhiteSpace(settings.Area) && string.IsNullOrWhiteSpace(settings.Regulation)
            ? Keys(await dashboardRepository.GetAssetsAsync(scope with { AssetCategory = null, AssetType = null }, cancellationToken), businessOnly: true)
            : [];

        bool InScope(string? assetId, params string?[] places)
        {
            if (organizationAssets is not null && (assetId is null || !organizationAssets.Contains(assetId)))
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(scope.Location))
            {
                return true;
            }

            return places.Any(place => Same(place, scope.Location)) || assetId is not null && locationAssets!.Contains(assetId);
        }

        var regulationCategories = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var regulation in records.Regulations)
        {
            if (regulation.Category is null)
            {
                continue;
            }

            regulationCategories.TryAdd(regulation.Name, regulation.Category);
            if (regulation.Code is not null)
            {
                regulationCategories.TryAdd(regulation.Code, regulation.Category);
            }

            foreach (var code in regulation.StandardCodes)
            {
                regulationCategories.TryAdd(code, regulation.Category);
            }
        }

        var typeCategories = records.InspectionTypes
            .GroupBy(type => type.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First().Category, StringComparer.OrdinalIgnoreCase);

        string AreaOfInspection(ComplianceInspectionRecord record)
        {
            if (record.Regulation is not null && regulationCategories.TryGetValue(record.Regulation, out var category) && MapArea(category) is { } fromMaster)
            {
                return fromMaster;
            }

            return MapArea(record.Regulation)
                ?? (record.Type is not null && typeCategories.TryGetValue(record.Type, out var typeCategory) ? MapArea(typeCategory) : null)
                ?? MapArea(record.Category)
                ?? MapArea(record.Type)
                ?? "Maintenance";
        }

        var allInspections = records.Inspections
            .Select(record => new Inspection(
                record,
                AreaOfInspection(record),
                record.Regulation is not null || Contains(record.Category, "statutory", "regulatory") || Contains(record.Type, "statutory", "regulatory"),
                record.Site ?? record.Location))
            .ToList();
        var inspectionByCode = allInspections
            .Where(inspection => inspection.Record.Code is not null)
            .GroupBy(inspection => inspection.Record.Code!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        bool Matches(string area, string? regulation) =>
            (settings.Area is null || Same(area, settings.Area)) && (settings.Regulation is null || Same(regulation, settings.Regulation));

        var inspections = allInspections
            .Where(inspection => !IsCancelled(inspection.Record.Status)
                && Matches(inspection.Area, inspection.Record.Regulation)
                && InScope(inspection.Record.AssetId, inspection.Record.Site, inspection.Record.Location))
            .ToList();

        var findings = new List<Finding>();
        foreach (var record in records.Findings)
        {
            Inspection? parent = null;
            if (record.InspectionCode is not null)
            {
                inspectionByCode.TryGetValue(record.InspectionCode, out parent);
            }

            var area = parent?.Area ?? MapArea(record.Title) ?? "Maintenance";
            var regulation = parent?.Record.Regulation;
            if (!Matches(area, regulation) || !InScope(record.AssetId ?? parent?.Record.AssetId, parent?.Record.Site, parent?.Record.Location))
            {
                continue;
            }

            findings.Add(new Finding(record, area, regulation, parent?.Site, Severity(record.Severity), IsClosed(record.Status)));
        }

        var expiries = records.Expiries
            .Select(record => new ExpiryEntry(record, MapArea(record.Category) ?? "Operations"))
            .Where(expiry => Matches(expiry.Area, null) && InScope(expiry.Record.AssetId, expiry.Record.Site))
            .ToList();

        // Preventive schedules are maintenance obligations with no regulation.
        var preventive = records.Preventive
            .Where(schedule => Matches("Maintenance", null) && InScope(schedule.AssetId, schedule.Site))
            .ToList();

        return new ComplianceAnalyticsCalculator(period, settings, utcNow, inspections, findings, expiries, preventive, registerAssets);
    }

    // ----- Sections -----

    public ComplianceSummary Summary()
    {
        var score = Score(_inspections, _period.FromUtc, _asOf);
        var previousScore = Score(_inspections, _period.PreviousFromUtc, _previousAsOf);

        return new ComplianceSummary(
            DashboardWidgetCalculator.Kpi(score, previousScore, "percent", false),
            DashboardWidgetCalculator.Kpi(OpenFindingsAt(_asOf).Count(), OpenFindingsAt(_previousAsOf).Count(), "number", true),
            DashboardWidgetCalculator.Kpi(ExpiringSoon(_asOf).Count(), ExpiringSoon(_previousAsOf).Count(), "number", true),
            DashboardWidgetCalculator.Kpi(OverdueCapaAt(_asOf).Count(), OverdueCapaAt(_previousAsOf).Count(), "number", true),
            DashboardWidgetCalculator.Kpi(RisksAt(_asOf).Count, RisksAt(_previousAsOf).Count, "number", true),
            _settings.ScoreTarget);
    }

    public ComplianceScoreTrend ScoreTrend()
    {
        IReadOnlyList<double?> Line(Func<Inspection, bool> include, List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> months, DateTime asOf) =>
            months.Select(month => Score(_inspections.Where(include), month.StartUtc, month.EndUtc < asOf ? month.EndUtc : asOf)).ToList();

        var trend = new PerformanceSeries(
            MonthLabels(_months),
            [
                new PerformanceSeriesLine("Overall", Line(_ => true, _months, _asOf)),
                new PerformanceSeriesLine("Regulatory", Line(inspection => inspection.Regulatory, _months, _asOf)),
                new PerformanceSeriesLine("Safety", Line(inspection => inspection.Area == "Safety", _months, _asOf)),
                new PerformanceSeriesLine("Environmental", Line(inspection => inspection.Area == "Environmental", _months, _asOf))
            ]);
        var previous = new PerformanceSeries(MonthLabels(_previousMonths), [new PerformanceSeriesLine("Overall", Line(_ => true, _previousMonths, _previousAsOf))]);

        return new ComplianceScoreTrend(trend, previous, Score(_inspections, _period.FromUtc, _asOf), Score(_inspections, _period.PreviousFromUtc, _previousAsOf), _settings.ScoreTarget);
    }

    public ComplianceSeverityTrend FindingsBySeverity()
    {
        IReadOnlyList<string> levels = _settings.RiskLevel is null ? RiskLevels : [_settings.RiskLevel];
        var raised = _findings.Where(finding => finding.Record.CreatedAt is { } created && created >= _period.FromUtc && created < _asOf).ToList();
        var lines = RiskLevels
            .Select(level => new PerformanceSeriesLine(level, _months
                .Select(month => levels.Contains(level)
                    ? (double?)raised.Count(finding => finding.Severity == level && finding.Record.CreatedAt >= month.StartUtc && finding.Record.CreatedAt < month.EndUtc)
                    : 0)
                .ToList()))
            .ToList();

        return new ComplianceSeverityTrend(new PerformanceSeries(MonthLabels(_months), lines), raised.Count(finding => levels.Contains(finding.Severity)));
    }

    /// <summary>Every asset in scope by the outcome of its latest inspection that has fallen due; assets never assessed are Not Assessed.</summary>
    public ComplianceStatusBreakdown ComplianceStatus()
    {
        var latest = _inspections
            .Where(inspection => inspection.Record.AssetId is not null && Outcome(inspection, _asOf) is not null)
            .GroupBy(inspection => inspection.Record.AssetId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => Outcome(group.OrderByDescending(inspection => inspection.Record.CompletedAt ?? inspection.Record.DueDate).First(), _asOf)!,
                StringComparer.OrdinalIgnoreCase);

        var assets = new HashSet<string>(_registerAssets, StringComparer.OrdinalIgnoreCase);
        foreach (var inspection in _inspections.Where(inspection => inspection.Record.AssetId is not null))
        {
            assets.Add(inspection.Record.AssetId!);
        }

        int Count(string outcome) => latest.Values.Count(value => value == outcome);
        var compliant = Count(Compliant);
        var partial = Count(Partial);
        var nonCompliant = Count(NonCompliant);
        var notAssessed = assets.Count(asset => !latest.ContainsKey(asset));

        return new ComplianceStatusBreakdown(compliant, partial, nonCompliant, notAssessed, compliant + partial + nonCompliant + notAssessed);
    }

    public IReadOnlyList<ComplianceAreaCount> FindingsByArea()
    {
        var open = OpenFindings().ToList();
        return Areas.Select(area => new ComplianceAreaCount(area, open.Count(finding => finding.Area == area))).ToList();
    }

    /// <summary>Open findings at the end of the period, most severe first, then soonest due.</summary>
    public IReadOnlyList<ComplianceFindingRow> Findings() =>
        OpenFindings()
            .OrderByDescending(finding => Rank(finding.Severity))
            .ThenBy(finding => finding.Record.DueDate ?? DateTime.MaxValue)
            .Select(ToRow)
            .ToList();

    public ComplianceCapaSummary Capa()
    {
        var capa = _findings.Where(finding => finding.IsCapa && (_settings.RiskLevel is null || finding.Severity == _settings.RiskLevel)).ToList();
        (int Closed, int Open) At(DateTime from, DateTime time) =>
            (capa.Count(finding => finding.ClosedAt is { } closed && closed >= from && closed < time), capa.Count(finding => finding.OpenAt(time)));

        double? Rate((int Closed, int Open) counts) =>
            counts.Closed + counts.Open == 0 ? null : Math.Round(counts.Closed * 100.0 / (counts.Closed + counts.Open), 1);

        var current = At(_period.FromUtc, _asOf);
        var open = capa.Where(finding => finding.OpenAt(_asOf)).ToList();
        var trend = new PerformanceSeries(
            MonthLabels(_months),
            [new PerformanceSeriesLine("Closure rate", _months.Select(month => Rate(At(_period.FromUtc, month.EndUtc < _asOf ? month.EndUtc : _asOf))).ToList())]);

        return new ComplianceCapaSummary(
            Rate(current),
            _settings.CapaTarget,
            current.Closed + current.Open,
            current.Closed,
            current.Open,
            open.Count(finding => finding.Record.DueDate < _asOf),
            trend,
            open.OrderBy(finding => finding.Record.DueDate ?? DateTime.MaxValue).Select(ToCapa).ToList());
    }

    public ComplianceExpirySummary Expiry()
    {
        var today = DayStart(_asOf);
        var first = new DateOnly(DateOnly.FromDateTime(today).Year, DateOnly.FromDateTime(today).Month, 1);
        var months = Enumerable.Range(0, ExpiryMonths).Select(index => first.AddMonths(index)).ToList();
        var end = DashboardPeriods.StartOfDayUtc(first.AddMonths(ExpiryMonths), _period.Zone);

        var items = _expiries
            .Where(expiry => expiry.Record.ExpiresAt is { } expires && expires >= today && expires < end)
            .Select(expiry =>
            {
                var expires = expiry.Record.ExpiresAt!.Value;
                var local = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(expires, _period.Zone));
                var index = (local.Year - first.Year) * 12 + local.Month - first.Month;
                return new ComplianceExpiryRow(
                    expiry.Record.Id,
                    expiry.Record.Reference,
                    expiry.Record.Name,
                    expiry.Record.Type,
                    expiry.Record.Source,
                    expiry.Record.AssetId,
                    expiry.Record.Site,
                    expiry.Area,
                    expires,
                    (int)Math.Floor((expires - today).TotalDays),
                    Math.Clamp(index, 0, ExpiryMonths - 1),
                    expiry.Record.Status);
            })
            .OrderBy(row => row.ExpiresAt)
            .ToList();

        var trend = new PerformanceSeries(
            months.Select(month => month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList(),
            ExpiryTypes.Select(type => new PerformanceSeriesLine(type, Enumerable.Range(0, ExpiryMonths)
                .Select(index => (double?)items.Count(item => item.Type == type && item.MonthIndex == index)).ToList())).ToList());

        return new ComplianceExpirySummary(
            trend.Categories,
            ExpiryTypes,
            trend,
            items.Count(item => item.DaysLeft <= ExpirySoonDays),
            _expiries.Count(expiry => expiry.Record.ExpiresAt < today),
            items);
    }

    public IReadOnlyList<ComplianceRiskRow> Risks() => RisksAt(_asOf);

    public IReadOnlyList<ComplianceLocationRow> Locations()
    {
        var open = OpenFindings().ToList();
        var soon = ExpiringSoon(_asOf).ToList();
        var risks = Risks();
        var sites = _inspections.Select(inspection => inspection.Site)
            .Concat(open.Select(finding => finding.Site))
            .Concat(soon.Select(expiry => expiry.Record.Site))
            .Where(site => !string.IsNullOrWhiteSpace(site))
            .Select(site => site!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(site => site, StringComparer.OrdinalIgnoreCase);

        return sites.Select(site =>
        {
            var score = Score(_inspections.Where(inspection => Same(inspection.Site, site)), _period.FromUtc, _asOf);
            var environmental = Score(_inspections.Where(inspection => Same(inspection.Site, site) && inspection.Area == "Environmental"), _period.FromUtc, _asOf);
            var siteFindings = open.Where(finding => Same(finding.Site, site)).ToList();
            var critical = siteFindings.Count(finding => finding.Severity == "Critical");
            var risk = score < _settings.ScoreTarget || critical > 1
                ? "High"
                : score < _settings.ScoreTarget + 3 || critical > 0 || score is null && siteFindings.Count > 0 ? "Medium" : "Low";

            return new ComplianceLocationRow(
                site,
                score,
                environmental,
                siteFindings.Count,
                critical,
                soon.Count(expiry => Same(expiry.Record.Site, site)),
                risks.Count(row => Same(row.Location, site)),
                risk,
                risk == "High" ? "At Risk" : "Compliant");
        }).ToList();
    }

    public IReadOnlyList<ComplianceEnvironmentalRow> Environmental() =>
        Locations().Select(row => new ComplianceEnvironmentalRow(row.Location, row.EnvironmentalScore, row.EnvironmentalScore is null ? null : row.EnvironmentalScore >= _settings.ScoreTarget)).ToList();

    public IReadOnlyList<ComplianceInsight> Insights()
    {
        var capa = Capa();
        var expiry = Expiry();
        var findings = Findings();
        var critical = findings.Where(row => row.Severity == "Critical").ToList();
        var environmental = Environmental().Where(row => row.MeetsTarget == false).ToList();
        string Plural(int count, string word) => $"{count} {word}{(count == 1 ? string.Empty : "s")}";
        var soonSites = expiry.Items.Where(item => item.DaysLeft <= ExpirySoonDays && item.Location is not null).Select(item => item.Location!).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        return
        [
            new("overdue_capa", capa.Overdue > 0 ? "critical" : "success",
                $"{Plural(capa.Overdue, "CAPA action")} overdue",
                capa.Overdue > 0 ? $"{Plural(capa.Overdue, "corrective action")} {(capa.Overdue == 1 ? "is" : "are")} past due and need attention to maintain compliance." : "No corrective actions are past due.",
                capa.Overdue, [], ["view_actions", "create_action_plan"]),
            new("expiring_items", expiry.ExpiringWithin90Days > 0 ? "warning" : "success",
                $"{expiry.ExpiringWithin90Days} permits or certifications expire within {ExpirySoonDays} days",
                $"{expiry.ExpiringWithin90Days} permits or certifications will expire in the next {ExpirySoonDays} days across {Plural(soonSites.Count, "location")}.",
                expiry.ExpiringWithin90Days, soonSites, ["open_register", "create_action_plan"]),
            new("critical_findings", critical.Count > 0 ? "critical" : "success",
                $"{Plural(critical.Count, "critical finding")} require{(critical.Count == 1 ? "s" : string.Empty)} management review",
                critical.Count > 0 ? "Critical audit findings are open and need management review and approval of corrective actions." : "No critical audit findings are open.",
                critical.Count, critical.Select(row => row.Location).Where(site => site is not null).Select(site => site!).Distinct().ToList(), ["view_findings", "create_action_plan"]),
            new("environmental_compliance", environmental.Count > 0 ? "warning" : "success",
                environmental.Count > 0 ? $"Environmental compliance below target in {Plural(environmental.Count, "location")}" : "Environmental compliance on target",
                environmental.Count > 0
                    ? $"Environmental compliance is below the {_settings.ScoreTarget}% target at {string.Join(" and ", environmental.Select(row => row.Location))}."
                    : $"Every location with environmental checks in scope meets the {_settings.ScoreTarget}% target.",
                environmental.Count, environmental.Select(row => row.Location).ToList(), ["view_details", "create_action_plan"])
        ];
    }

    // ----- Building blocks -----

    private IEnumerable<Finding> OpenFindings() => OpenFindingsAt(_asOf);

    private IEnumerable<Finding> OpenFindingsAt(DateTime time) =>
        _findings.Where(finding => finding.OpenAt(time) && (_settings.RiskLevel is null || finding.Severity == _settings.RiskLevel));

    private IEnumerable<Finding> OverdueCapaAt(DateTime time) =>
        OpenFindingsAt(time).Where(finding => finding.IsCapa && finding.Record.DueDate < time);

    private IEnumerable<ExpiryEntry> ExpiringSoon(DateTime time)
    {
        var today = DayStart(time);
        return _expiries.Where(expiry => expiry.Record.ExpiresAt is { } expires && expires >= today && expires < today.AddDays(ExpirySoonDays + 1));
    }

    /// <summary>
    /// Active compliance risks at a time: overdue compliance inspections and preventive maintenance (level from their priority),
    /// overdue Critical / High findings, expired permits and certificates (High) and instruments out of tolerance (Medium).
    /// </summary>
    private List<ComplianceRiskRow> RisksAt(DateTime time)
    {
        var rows = new List<ComplianceRiskRow>();
        foreach (var inspection in _inspections.Where(inspection => Outcome(inspection, time) == NonCompliant && !Completed(inspection.Record, time)))
        {
            var record = inspection.Record;
            rows.Add(new ComplianceRiskRow(
                $"RSK-INS-{record.Code ?? record.Id}",
                $"{(inspection.Regulatory ? "Statutory inspection" : "Inspection")} overdue: {record.Type ?? "Inspection"} – {record.AssetName ?? record.AssetId ?? "asset"}",
                "Inspection",
                record.Regulation,
                inspection.Area,
                inspection.Site,
                Severity(record.Priority),
                null,
                record.Code,
                record.DueDate));
        }

        foreach (var finding in _findings.Where(finding => finding.OpenAt(time) && finding.Record.DueDate < time && Rank(finding.Severity) >= 3))
        {
            var record = finding.Record;
            rows.Add(new ComplianceRiskRow(
                $"RSK-FND-{record.Code ?? record.Id}",
                $"Overdue {finding.Severity.ToLowerInvariant()} finding: {record.Title ?? record.Code}",
                "Finding",
                finding.Regulation,
                finding.Area,
                finding.Site,
                finding.Severity,
                record.Owner,
                record.Code,
                record.DueDate));
        }

        var today = DayStart(time);
        foreach (var expiry in _expiries)
        {
            var record = expiry.Record;
            if (record.ExpiresAt is { } expires && expires < today)
            {
                rows.Add(new ComplianceRiskRow($"RSK-EXP-{record.Reference}", $"Expired: {record.Name}", record.Source, null, expiry.Area, record.Site, "High", null, record.Reference, expires));
            }
            else if (record.ExpiresAt is null && Contains(record.Status, "tolerance", "fail", "suspend"))
            {
                rows.Add(new ComplianceRiskRow($"RSK-EXP-{record.Reference}", $"{record.Name}: {record.Status}", record.Source, null, expiry.Area, record.Site, "Medium", null, record.Reference, null));
            }
        }

        foreach (var schedule in _preventive.Where(schedule => schedule.NextDueDate < today && !Contains(schedule.Status, "inactive", "paused", "suspend", "cancel")))
        {
            rows.Add(new ComplianceRiskRow(
                $"RSK-PM-{schedule.ScheduleId ?? schedule.Id}",
                $"Preventive maintenance overdue: {schedule.Name ?? schedule.ScheduleId} – {schedule.AssetName ?? schedule.AssetId}",
                "Preventive maintenance",
                null,
                "Maintenance",
                schedule.Site,
                Severity(schedule.Priority),
                schedule.AssignedTo,
                schedule.ScheduleId,
                schedule.NextDueDate));
        }

        return rows
            .Where(row => _settings.RiskLevel is null || row.Level == _settings.RiskLevel)
            .OrderByDescending(row => Rank(row.Level))
            .ThenBy(row => row.Since ?? DateTime.MaxValue)
            .ToList();
    }

    /// <summary>Average of 100 (compliant) / 50 (partial) / 0 (non-compliant) over the inspections due in [from, to); null when none fell due.</summary>
    private double? Score(IEnumerable<Inspection> inspections, DateTime from, DateTime to)
    {
        var values = inspections
            .Where(inspection => inspection.Record.DueDate is { } due && due >= from && due < to)
            .Select(inspection => Outcome(inspection, to))
            .Where(outcome => outcome is not null)
            .Select(outcome => outcome == Compliant ? 100.0 : outcome == Partial ? 50.0 : 0.0)
            .ToList();

        return values.Count == 0 ? null : Math.Round(values.Average(), 1);
    }

    /// <summary>The inspection's outcome at a time; null when it is not yet due or not yet decided.</summary>
    private string? Outcome(Inspection inspection, DateTime time)
    {
        var record = inspection.Record;
        if (Completed(record, time))
        {
            var result = record.Result?.ToLowerInvariant();
            if (result is not null)
            {
                if (result.Contains("fail") || result.Contains("non")) return NonCompliant;
                if (result.Contains("condition") || result.Contains("partial") || result.Contains("observation")) return Partial;
                if (result.Contains("pass") || result.Contains("compliant") || result.Contains("satisf")) return Compliant;
            }

            List<Finding> raised = record.Code is null ? [] : _findingsByInspection[record.Code].ToList();
            if (raised.Count == 0) return Compliant;
            return raised.Any(finding => finding.Severity == "Critical") ? NonCompliant : Partial;
        }

        return record.DueDate is { } due && due.AddDays(1) <= time ? NonCompliant : null;
    }

    private static bool Completed(ComplianceInspectionRecord record, DateTime time) =>
        record.CompletedAt is { } completed ? completed < time : Contains(record.Status, "completed", "closed", "approved", "passed", "failed");

    private ComplianceFindingRow ToRow(Finding finding)
    {
        var record = finding.Record;
        return new ComplianceFindingRow(
            record.Id,
            record.Code ?? record.Id,
            record.Title ?? "Finding",
            finding.Regulation,
            finding.Area,
            record.AssetId,
            record.AssetName,
            finding.Site,
            finding.Severity,
            record.Status ?? "Open",
            record.DueDate,
            DaysFrom(record.DueDate),
            record.DueDate < _asOf,
            record.Owner,
            record.InspectionCode,
            record.CorrectiveAction,
            string.IsNullOrWhiteSpace(record.WorkOrder) ? null : record.WorkOrder,
            record.CreatedAt);
    }

    private ComplianceCapaRow ToCapa(Finding finding)
    {
        var record = finding.Record;
        var days = DaysFrom(record.DueDate);
        return new ComplianceCapaRow(
            record.Id,
            string.IsNullOrWhiteSpace(record.WorkOrder) ? $"CAPA-{record.Code ?? record.Id}" : record.WorkOrder!,
            record.CorrectiveAction ?? $"{record.Title} – corrective action",
            record.Code ?? record.Id,
            finding.Site,
            record.Owner,
            record.DueDate,
            days,
            days is < 0 ? -days.Value : 0,
            string.IsNullOrWhiteSpace(record.WorkOrder) ? null : record.WorkOrder,
            record.Status ?? "Open");
    }

    private int? DaysFrom(DateTime? date) => date is null ? null : (int)Math.Floor((date.Value - DayStart(_asOf)).TotalDays);

    private DateTime DayStart(DateTime utc) =>
        DashboardPeriods.StartOfDayUtc(DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, _period.Zone)), _period.Zone);

    private static IReadOnlyList<string> MonthLabels(List<(DateOnly Month, DateTime StartUtc, DateTime EndUtc)> months) =>
        months.Select(month => month.Month.ToString("MMM yyyy", CultureInfo.InvariantCulture)).ToList();

    private static HashSet<string> Keys(IEnumerable<DashboardAsset> assets, bool businessOnly = false)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var asset in assets)
        {
            if (businessOnly)
            {
                keys.Add(asset.AssetId ?? asset.MongoId);
                continue;
            }

            foreach (var key in asset.Keys())
            {
                keys.Add(key);
            }
        }

        return keys;
    }

    /// <summary>Critical, High, Medium or Low from a severity or priority (Major → High, Minor / Observation → Low; unknown → Medium).</summary>
    public static string Severity(string? value)
    {
        var text = value?.Trim().ToLowerInvariant() ?? string.Empty;
        return text switch
        {
            _ when text.Contains("critical") || text.Contains("urgent") || text.Contains("emergency") => "Critical",
            _ when text.Contains("high") || text.Contains("major") => "High",
            _ when text.Contains("low") || text.Contains("minor") || text.Contains("observation") => "Low",
            _ => "Medium"
        };
    }

    public static int Rank(string level) => level switch
    {
        "Critical" => 4,
        "High" => 3,
        "Medium" => 2,
        _ => 1
    };

    /// <summary>The page's compliance area for a regulation, inspection category or type; null when the text does not say.</summary>
    public static string? MapArea(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var value = text.ToLowerInvariant();
        if (Areas.FirstOrDefault(area => area.Equals(text.Trim(), StringComparison.OrdinalIgnoreCase)) is { } exact) return exact;
        if (Has(value, "environment", "emission", "waste", "14001", "spill", "pollution")) return "Environmental";
        if (Has(value, "quality", "9001", "calibration", "audit", "verification", "accreditation")) return "Quality";
        if (Has(value, "safety", "fire", "nfpa", "electrical", "45001", "osh", "ppe", "hse", "health")) return "Safety";
        if (Has(value, "operation", "pre-use", "pre use", "licen", "permit", "trade")) return "Operations";
        if (Has(value, "maintenance", "condition", "statutory", "regulatory", "lifting", "pressure", "asme", "boiler", "loler")) return "Maintenance";
        return null;
    }

    private static bool Has(string value, params string[] words) => words.Any(value.Contains);

    private static bool Contains(string? value, params string[] words) =>
        value is not null && words.Any(word => value.Contains(word, StringComparison.OrdinalIgnoreCase));

    private static bool IsClosed(string? status) => Contains(status, "closed", "verified", "resolved", "completed", "cancelled", "canceled", "rejected")
        && !Contains(status, "pending");

    private static bool IsCancelled(string? status) => Contains(status, "cancelled", "canceled");

    private static bool Same(string? left, string? right) =>
        left is not null && right is not null && string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase);
}
