using System.Globalization;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Analytics;

public sealed record KpiWidgetData(
    double? Value,
    string Format,
    double? PreviousValue,
    double? Change,
    string ChangeUnit,
    string Trend,
    string ComparisonLabel);

public sealed record CategoryItem(string Label, double Value, double Percentage);

public sealed record CategoryWidgetData(double Total, string Format, IReadOnlyList<CategoryItem> Items);

public sealed record SeriesLine(string Name, IReadOnlyList<double> Values);

public sealed record SeriesWidgetData(IReadOnlyList<string> Categories, IReadOnlyList<SeriesLine> Series);

public sealed record TableColumn(string Key, string Label, string Type);

public sealed record TableWidgetData(IReadOnlyList<TableColumn> Columns, IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows, long TotalRows);

/// <summary>Coordinates are null: no service stores them yet, so the client places pins by location name.</summary>
public sealed record MapLocation(string Location, double? Latitude, double? Longitude, string State, int TotalAssets, IReadOnlyDictionary<string, int> AssetsByState);

/// <summary>Legend counts locations by their worst state, as the pins show them.</summary>
public sealed record MapWidgetData(IReadOnlyList<MapLocation> Locations, IReadOnlyList<CategoryItem> Legend);

public sealed record MatrixWidgetData(IReadOnlyList<string> Rows, IReadOnlyList<string> Columns, IReadOnlyList<IReadOnlyList<double>> Values, double Max);

/// <summary>
/// Works out widget data for one dashboard view (one filter bar and date range). Source records are read once and shared
/// by every widget that needs them, so a whole dashboard costs a handful of queries.
/// </summary>
public sealed class DashboardWidgetCalculator
{
    public const string Healthy = "Healthy";
    public const string AtRisk = "At Risk";
    public const string Critical = "Critical";

    public const string ActiveState = "Active";
    public const string MaintenanceState = "Maintenance";
    public const string InspectionState = "Inspection";

    private const string Other = "Other";
    private const string Unknown = "Unknown";
    private const string Uncategorised = "Uncategorised";
    private const string ComparisonLabel = "vs. previous period";
    private const int InspectionDueSoonDays = 7;
    private const int DefaultCategoryLimit = 6;
    private const int DefaultMatrixRows = 20;

    private static readonly string[] PriorityOrder = ["Critical", "High", "Medium", "Low"];
    private static readonly string[] StateOrder = [Critical, MaintenanceState, InspectionState, ActiveState];

    private readonly IDashboardDataRepository _repository;
    private readonly DashboardDataScope _scope;
    private readonly DashboardPeriod _period;
    private readonly DateTime _utcNow;

    private IReadOnlyList<DashboardAsset>? _assets;
    private Dictionary<string, DashboardAsset>? _assetsByKey;
    private IReadOnlyList<DashboardWorkOrder>? _openWorkOrders;
    private IReadOnlyList<DashboardHealthAssessment>? _assessments;
    private IReadOnlyList<DashboardInspection>? _inspections;
    private IReadOnlyList<DashboardPreventiveSchedule>? _preventiveSchedules;
    private Dictionary<string, AssetCondition>? _conditions;

    public DashboardWidgetCalculator(IDashboardDataRepository repository, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow)
    {
        _repository = repository;
        _scope = scope;
        _period = period;
        _utcNow = utcNow;
    }

    public async Task<object> CalculateAsync(DashboardWidget widget, CancellationToken cancellationToken)
    {
        var settings = widget.Settings;

        return widget.Metric switch
        {
            "total_assets" => await TotalAssetsAsync(settings, cancellationToken),
            "active_work_orders" => await ActiveWorkOrdersAsync(settings, cancellationToken),
            "preventive_compliance" => await PreventiveComplianceAsync(settings, cancellationToken),
            "inventory_value" => await InventoryValueAsync(settings, cancellationToken),
            "maintenance_cost" => await MaintenanceCostAsync(settings, cancellationToken),
            "asset_health_trend" => await HealthTrendAsync(settings, cancellationToken),
            "maintenance_cost_by_category" => await MaintenanceCostByCategoryAsync(settings, cancellationToken),
            "asset_status_distribution" => Categories((await AssetsAsync(cancellationToken)).Select(asset => (Label(asset.Status), 1d)), settings.Limit, "number"),
            "assets_by_category" => Categories((await AssetsAsync(cancellationToken)).Select(asset => (Label(asset.Category, Uncategorised), 1d)), settings.Limit ?? DefaultCategoryLimit, "number"),
            "open_work_orders_by_priority" => await OpenWorkOrdersByPriorityAsync(cancellationToken),
            "asset_locations" => await AssetLocationsAsync(cancellationToken),
            "asset_location_status_heatmap" => await LocationStatusHeatmapAsync(settings, cancellationToken),
            "assets_requiring_attention" => await AssetsRequiringAttentionAsync(settings, cancellationToken),
            _ => throw new InvalidOperationException($"Unknown metric '{widget.Metric}'")
        };
    }

    private async Task<KpiWidgetData> TotalAssetsAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var assets = await AssetsAsync(cancellationToken);
        double CountBefore(DateTime cutoff) => assets.Count(asset => asset.CreatedAt is null || asset.CreatedAt < cutoff);

        return Kpi(CountBefore(_period.ToUtc), settings.ShowComparison ? CountBefore(_period.PreviousToUtc) : null, "number", percentChange: true);
    }

    private async Task<KpiWidgetData> ActiveWorkOrdersAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var keys = await AssetKeysAsync(cancellationToken);
        var current = await _repository.GetWorkOrdersAsync(_scope, keys, _period.FromUtc, _period.ToUtc, openOnly: true, cancellationToken);
        double? previous = settings.ShowComparison
            ? (await _repository.GetWorkOrdersAsync(_scope, keys, _period.PreviousFromUtc, _period.PreviousToUtc, openOnly: true, cancellationToken)).Count
            : null;

        return Kpi(current.Count, previous, "number", percentChange: true);
    }

    private async Task<KpiWidgetData> PreventiveComplianceAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var keys = await AssetKeysAsync(cancellationToken);

        async Task<double?> ComplianceAsync(DateTime fromUtc, DateTime toUtc)
        {
            var workOrders = (await _repository.GetWorkOrdersAsync(_scope, keys, fromUtc, toUtc, openOnly: false, cancellationToken))
                .Where(workOrder => IsPreventive(workOrder.WorkType) && !IsCancelled(workOrder.Status))
                .ToList();

            return workOrders.Count == 0
                ? null
                : Math.Round(100d * workOrders.Count(workOrder => IsDone(workOrder.Status)) / workOrders.Count, 1);
        }

        var current = await ComplianceAsync(_period.FromUtc, _period.ToUtc);
        var previous = settings.ShowComparison ? await ComplianceAsync(_period.PreviousFromUtc, _period.PreviousToUtc) : null;

        // A rate changes by percentage points, not by a percentage of itself.
        return Kpi(current, previous, "percent", percentChange: false);
    }

    private async Task<KpiWidgetData> InventoryValueAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var keys = await AssetKeysAsync(cancellationToken);

        async Task<double> ValueAsync(DateTime cutoff) =>
            Math.Round((await _repository.GetSparePartsAsync(_scope, keys, cutoff, cancellationToken)).Sum(part => part.QuantityInStock * part.UnitCost), 2);

        return Kpi(
            await ValueAsync(_period.ToUtc),
            settings.ShowComparison ? await ValueAsync(_period.PreviousToUtc) : null,
            "currency",
            percentChange: true);
    }

    private async Task<KpiWidgetData> MaintenanceCostAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var keys = await AssetKeysAsync(cancellationToken);

        async Task<double> CostAsync(DateTime fromUtc, DateTime toUtc) =>
            Math.Round((await _repository.GetMaintenanceCostsAsync(_scope, keys, fromUtc, toUtc, cancellationToken)).Sum(cost => cost.Total), 2);

        return Kpi(
            await CostAsync(_period.FromUtc, _period.ToUtc),
            settings.ShowComparison ? await CostAsync(_period.PreviousFromUtc, _period.PreviousToUtc) : null,
            "currency",
            percentChange: true);
    }

    /// <summary>For each month up to the end of the range: every assessed asset counted by its latest assessment before that month ends.</summary>
    private async Task<SeriesWidgetData> HealthTrendAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var months = settings.Months ?? InteractiveDashboardOptions.DefaultTrendMonths;
        var lastMonth = new DateOnly(_period.To.Year, _period.To.Month, 1);
        var history = (await AssessmentsAsync(cancellationToken))
            .Where(assessment => assessment.AssetId is not null && HealthScoreOf(assessment) is not null)
            .GroupBy(assessment => assessment.AssetId!)
            .Select(group => group.OrderBy(assessment => assessment.AssessmentDate).ToList())
            .ToList();

        var labels = new List<string>();
        var healthy = new List<double>();
        var atRisk = new List<double>();
        var critical = new List<double>();

        for (var index = months - 1; index >= 0; index--)
        {
            var month = lastMonth.AddMonths(-index);
            var monthEndUtc = DashboardPeriods.StartOfDayUtc(month.AddMonths(1), _period.Zone);
            var cutoff = monthEndUtc < _period.ToUtc ? monthEndUtc : _period.ToUtc;

            var counts = new Dictionary<string, int> { [Healthy] = 0, [AtRisk] = 0, [Critical] = 0 };
            foreach (var assessments in history)
            {
                var latest = assessments.LastOrDefault(assessment => assessment.AssessmentDate < cutoff);
                if (latest is not null)
                {
                    counts[HealthBand(HealthScoreOf(latest)!.Value)]++;
                }
            }

            labels.Add(month.ToString("MMM yyyy", CultureInfo.InvariantCulture));
            healthy.Add(counts[Healthy]);
            atRisk.Add(counts[AtRisk]);
            critical.Add(counts[Critical]);
        }

        return new SeriesWidgetData(labels, [new(Healthy, healthy), new(AtRisk, atRisk), new(Critical, critical)]);
    }

    private async Task<CategoryWidgetData> MaintenanceCostByCategoryAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var costs = await _repository.GetMaintenanceCostsAsync(_scope, await AssetKeysAsync(cancellationToken), _period.FromUtc, _period.ToUtc, cancellationToken);
        var assetsByKey = await AssetsByKeyAsync(cancellationToken);

        var values = costs.Select(cost => (
            Label(cost.AssetId is not null && assetsByKey.TryGetValue(cost.AssetId, out var asset) ? asset.Category : null, Uncategorised),
            cost.Total));

        return Categories(values, settings.Limit ?? DefaultCategoryLimit, "currency");
    }

    private async Task<CategoryWidgetData> OpenWorkOrdersByPriorityAsync(CancellationToken cancellationToken)
    {
        var workOrders = await OpenWorkOrdersAsync(cancellationToken);
        var items = workOrders
            .GroupBy(workOrder => Label(workOrder.Priority), StringComparer.OrdinalIgnoreCase)
            .Select(group => (Label: TitleCase(group.Key), Value: (double)group.Count()))
            .OrderBy(item => Array.FindIndex(PriorityOrder, priority => string.Equals(priority, item.Label, StringComparison.OrdinalIgnoreCase)) is var rank and >= 0 ? rank : PriorityOrder.Length)
            .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return CategoryResult(items, "number");
    }

    private async Task<MapWidgetData> AssetLocationsAsync(CancellationToken cancellationToken)
    {
        var conditions = await ConditionsAsync(cancellationToken);
        var locations = (await AssetsAsync(cancellationToken))
            .GroupBy(asset => Label(asset.Location), StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var byState = StateOrder.ToDictionary(state => state, _ => 0);
                foreach (var asset in group)
                {
                    byState[conditions[asset.MongoId].State]++;
                }

                var worst = StateOrder.First(state => byState[state] > 0);
                return new MapLocation(group.Key, null, null, worst, group.Count(), byState);
            })
            .OrderBy(location => location.Location, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var legend = StateOrder.Reverse()
            .Select(state => (state, Count: (double)locations.Count(location => location.State == state)))
            .ToList();

        return new MapWidgetData(locations, CategoryResult(legend, "number").Items);
    }

    private async Task<MatrixWidgetData> LocationStatusHeatmapAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var assets = await AssetsAsync(cancellationToken);
        var columns = assets
            .GroupBy(asset => Label(asset.Status), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .Select(group => group.Key)
            .ToList();

        var rows = assets
            .GroupBy(asset => Label(asset.Location), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
            .Take(settings.Limit ?? DefaultMatrixRows)
            .ToList();

        var values = rows
            .Select(row => (IReadOnlyList<double>)columns
                .Select(column => (double)row.Count(asset => string.Equals(Label(asset.Status), column, StringComparison.OrdinalIgnoreCase)))
                .ToList())
            .ToList();

        return new MatrixWidgetData(rows.Select(row => row.Key).ToList(), columns, values, values.SelectMany(row => row).DefaultIfEmpty(0).Max());
    }

    /// <summary>Assets scoring under 70 or with an open issue, lowest health score first (unassessed last), then most issues.</summary>
    private async Task<TableWidgetData> AssetsRequiringAttentionAsync(DashboardWidgetSettings settings, CancellationToken cancellationToken)
    {
        var conditions = await ConditionsAsync(cancellationToken);
        var flagged = (await AssetsAsync(cancellationToken))
            .Select(asset => (Asset: asset, Condition: conditions[asset.MongoId]))
            .Where(item => item.Condition.Issues.Count > 0 || item.Condition.HealthScore < 70)
            .OrderBy(item => item.Condition.HealthScore ?? double.MaxValue)
            .ThenByDescending(item => item.Condition.Issues.Count)
            .ThenBy(item => item.Asset.AssetId ?? item.Asset.MongoId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var rows = flagged
            .Take(settings.Limit ?? InteractiveDashboardOptions.DefaultTopLimit)
            .Select((item, index) => (IReadOnlyDictionary<string, object?>)new Dictionary<string, object?>
            {
                ["rank"] = index + 1,
                ["id"] = item.Asset.MongoId,
                ["asset_id"] = item.Asset.AssetId,
                ["asset_name"] = item.Asset.AssetName,
                ["location"] = item.Asset.Location,
                ["health_score"] = item.Condition.HealthScore,
                ["health_status"] = item.Condition.HealthScore is { } score ? HealthBand(score) : null,
                ["issue"] = item.Condition.Issues.FirstOrDefault() ?? "Low health score",
                ["issues"] = item.Condition.Issues
            })
            .ToList();

        return new TableWidgetData(
            [
                new("rank", "#", "number"),
                new("asset_id", "Asset ID", "string"),
                new("asset_name", "Asset Name", "string"),
                new("location", "Location", "string"),
                new("health_score", "Health Score", "number"),
                new("issue", "Issue", "string")
            ],
            rows,
            flagged.Count);
    }

    /// <summary>Each asset's latest health score, open issues and map state, worked out once per view.</summary>
    private async Task<Dictionary<string, AssetCondition>> ConditionsAsync(CancellationToken cancellationToken)
    {
        if (_conditions is not null)
        {
            return _conditions;
        }

        var assets = await AssetsAsync(cancellationToken);
        var keys = await AssetKeysAsync(cancellationToken);

        var latestScores = (await AssessmentsAsync(cancellationToken))
            .Where(assessment => assessment.AssetId is not null && HealthScoreOf(assessment) is not null)
            .GroupBy(assessment => assessment.AssetId!)
            .ToDictionary(group => group.Key, group => HealthScoreOf(group.MaxBy(assessment => assessment.AssessmentDate)!)!.Value);

        var openWorkOrders = (await OpenWorkOrdersAsync(cancellationToken))
            .Where(workOrder => workOrder.AssetId is not null)
            .ToLookup(workOrder => workOrder.AssetId!);

        _inspections ??= await _repository.GetLatestInspectionsAsync(_scope, keys, cancellationToken);
        var inspections = _inspections.ToDictionary(inspection => inspection.AssetId);

        _preventiveSchedules ??= await _repository.GetPreventiveSchedulesAsync(_scope, keys, cancellationToken);
        var overduePreventive = _preventiveSchedules
            .Where(schedule => schedule.AssetId is not null && schedule.NextDueDate < _utcNow)
            .Select(schedule => schedule.AssetId!)
            .ToHashSet();

        _conditions = new Dictionary<string, AssetCondition>();
        foreach (var asset in assets)
        {
            var assetKeys = asset.Keys().ToList();
            double? score = assetKeys.Select(key => latestScores.TryGetValue(key, out var value) ? value : (double?)null).FirstOrDefault(value => value is not null);
            var workOrders = assetKeys.SelectMany(key => openWorkOrders[key]).ToList();
            var inspection = assetKeys.Select(key => inspections.GetValueOrDefault(key)).FirstOrDefault(value => value is not null);

            var criticalWork = workOrders.Any(workOrder => string.Equals(workOrder.Priority?.Trim(), "Critical", StringComparison.OrdinalIgnoreCase));
            var overdueMaintenance = assetKeys.Any(overduePreventive.Contains) || asset.NextMaintenanceDate < _utcNow;
            var failedInspection = inspection?.LastResult?.Trim().ToLowerInvariant() is "fail" or "failed";
            var inspectionOverdue = inspection?.NextInspectionDate < _utcNow;
            var inspectionDueSoon = !inspectionOverdue && inspection?.NextInspectionDate < _utcNow.AddDays(InspectionDueSoonDays);
            var underMaintenance = asset.Status?.Contains("maint", StringComparison.OrdinalIgnoreCase) == true;

            var issues = new List<string>();
            if (criticalWork) issues.Add("Critical work order open");
            if (overdueMaintenance) issues.Add("Overdue maintenance");
            if (failedInspection) issues.Add("Failed last inspection");
            if (inspectionOverdue) issues.Add("Inspection overdue");
            if (inspectionDueSoon) issues.Add("Inspection due soon");
            if (workOrders.Count > 0 && !criticalWork) issues.Add(workOrders.Count == 1 ? "1 open work order" : $"{workOrders.Count} open work orders");
            if (score < 40) issues.Add("Critical health score");

            var state = score < 40 || criticalWork
                ? Critical
                : workOrders.Count > 0 || overdueMaintenance || underMaintenance
                    ? MaintenanceState
                    : failedInspection || inspectionOverdue || inspectionDueSoon
                        ? InspectionState
                        : ActiveState;

            _conditions[asset.MongoId] = new AssetCondition(score is null ? null : Math.Round(score.Value, 1), issues, state);
        }

        return _conditions;
    }

    private async Task<IReadOnlyList<DashboardAsset>> AssetsAsync(CancellationToken cancellationToken) =>
        _assets ??= await _repository.GetAssetsAsync(_scope, cancellationToken);

    private async Task<Dictionary<string, DashboardAsset>> AssetsByKeyAsync(CancellationToken cancellationToken)
    {
        if (_assetsByKey is null)
        {
            _assetsByKey = new Dictionary<string, DashboardAsset>();
            foreach (var asset in await AssetsAsync(cancellationToken))
            {
                foreach (var key in asset.Keys())
                {
                    _assetsByKey.TryAdd(key, asset);
                }
            }
        }

        return _assetsByKey;
    }

    /// <summary>Null (every record in the tenant) unless the filter bar narrows the assets.</summary>
    private async Task<IReadOnlyCollection<string>?> AssetKeysAsync(CancellationToken cancellationToken) =>
        _scope.FiltersAssets ? (await AssetsByKeyAsync(cancellationToken)).Keys : null;

    private async Task<IReadOnlyList<DashboardWorkOrder>> OpenWorkOrdersAsync(CancellationToken cancellationToken) =>
        _openWorkOrders ??= await _repository.GetWorkOrdersAsync(_scope, await AssetKeysAsync(cancellationToken), null, null, openOnly: true, cancellationToken);

    private async Task<IReadOnlyList<DashboardHealthAssessment>> AssessmentsAsync(CancellationToken cancellationToken) =>
        _assessments ??= await _repository.GetHealthAssessmentsAsync(_scope, await AssetKeysAsync(cancellationToken), _period.ToUtc, cancellationToken);

    internal static KpiWidgetData Kpi(double? value, double? previous, string format, bool percentChange)
    {
        double? change = null;
        if (value is not null && previous is not null)
        {
            change = percentChange
                ? previous.Value == 0 ? null : Math.Round((value.Value - previous.Value) / previous.Value * 100, 1)
                : Math.Round(value.Value - previous.Value, 1);
        }

        var trend = change switch
        {
            > 0 => "up",
            < 0 => "down",
            _ => "flat"
        };

        return new KpiWidgetData(value, format, previous, change, percentChange ? "percent" : "points", trend, ComparisonLabel);
    }

    /// <summary>Sums values per label, biggest first; past the limit the rest are folded into "Other".</summary>
    private static CategoryWidgetData Categories(IEnumerable<(string Label, double Value)> values, int? limit, string format)
    {
        var groups = values
            .GroupBy(value => value.Label, StringComparer.OrdinalIgnoreCase)
            .Select(group => (Label: group.Key, Value: Math.Round(group.Sum(value => value.Value), 2)))
            .OrderByDescending(group => group.Value)
            .ThenBy(group => group.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (limit is { } max && groups.Count > max)
        {
            var rest = groups.Skip(max - 1).Sum(group => group.Value);
            groups = groups.Take(max - 1).Append((Other, Math.Round(rest, 2))).ToList();
        }

        return CategoryResult(groups, format);
    }

    private static CategoryWidgetData CategoryResult(IReadOnlyList<(string Label, double Value)> items, string format)
    {
        var total = Math.Round(items.Sum(item => item.Value), 2);
        return new CategoryWidgetData(
            total,
            format,
            items.Select(item => new CategoryItem(item.Label, item.Value, total == 0 ? 0 : Math.Round(item.Value / total * 100, 1))).ToList());
    }

    private static double? HealthScoreOf(DashboardHealthAssessment assessment)
    {
        if (assessment.HealthScore is > 0)
        {
            return Math.Clamp(assessment.HealthScore.Value, 0, 100);
        }

        // Assessments saved without a score fall back to their overall condition.
        return assessment.OverallCondition?.Trim().ToLowerInvariant() switch
        {
            "excellent" => 95,
            "good" => 80,
            "fair" => 60,
            "poor" => 35,
            "very poor" => 20,
            "critical" => 15,
            _ => assessment.HealthScore
        };
    }

    public static string HealthBand(double score) => score >= 70 ? Healthy : score >= 40 ? AtRisk : Critical;

    private static bool IsPreventive(string? workType) =>
        workType is not null && (workType.Contains("prevent", StringComparison.OrdinalIgnoreCase) || string.Equals(workType.Trim(), "PM", StringComparison.OrdinalIgnoreCase));

    private static bool IsDone(string? status) => status?.Trim().ToLowerInvariant() is "completed" or "closed";

    private static bool IsCancelled(string? status) => status?.Trim().ToLowerInvariant() is "cancelled" or "canceled";

    private static string Label(string? value, string fallback = Unknown) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static string TitleCase(string value) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(value.ToLowerInvariant());

    private sealed record AssetCondition(double? HealthScore, IReadOnlyList<string> Issues, string State);
}

/// <summary>Flattens any widget's data into rows for the dashboard export.</summary>
public static class DashboardWidgetTables
{
    public static (IReadOnlyList<string> Headers, IReadOnlyList<IReadOnlyList<object?>> Rows) ToRows(object data) => data switch
    {
        KpiWidgetData kpi => (
            ["Value", "Previous Period", "Change", "Change Unit"],
            [[kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit]]),
        CategoryWidgetData category => (
            ["Label", "Value", "Percentage"],
            category.Items.Select(item => (IReadOnlyList<object?>)[item.Label, item.Value, item.Percentage]).ToList()),
        SeriesWidgetData series => (
            new[] { "Period" }.Concat(series.Series.Select(line => line.Name)).ToList(),
            series.Categories.Select((label, index) => (IReadOnlyList<object?>)new object?[] { label }
                .Concat(series.Series.Select(line => (object?)line.Values[index])).ToList()).ToList()),
        TableWidgetData table => (
            table.Columns.Select(column => column.Label).ToList(),
            table.Rows.Select(row => (IReadOnlyList<object?>)table.Columns.Select(column => row.GetValueOrDefault(column.Key)).ToList()).ToList()),
        MapWidgetData map => (
            new[] { "Location", "State", "Total Assets" }.Concat(map.Locations.FirstOrDefault()?.AssetsByState.Keys ?? []).ToList(),
            map.Locations.Select(location => (IReadOnlyList<object?>)new object?[] { location.Location, location.State, location.TotalAssets }
                .Concat(location.AssetsByState.Values.Select(count => (object?)count)).ToList()).ToList()),
        MatrixWidgetData matrix => (
            new[] { "Location" }.Concat(matrix.Columns).ToList(),
            matrix.Rows.Select((label, index) => (IReadOnlyList<object?>)new object?[] { label }
                .Concat(matrix.Values[index].Select(value => (object?)value)).ToList()).ToList()),
        _ => (["Value"], [[data.ToString()]])
    };
}
