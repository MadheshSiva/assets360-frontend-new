using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using Output = (string Measure, string Dimension, string Unit, double? Total, System.Collections.Generic.IReadOnlyList<A360.ReportAnalytics.Api.Analytics.StandardReportOutputRow> Rows, string? Note);

namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>One row of a report's output. Share is the row's percent of the total (null for averaged measures such as rates).</summary>
public sealed record StandardReportOutputRow(string Label, double Value, double? Share);

/// <summary>
/// What the Standard Reports viewer shows: one measure (Unit count, money or percent) broken down by Dimension (category, site or
/// month). Aggregate says whether Total is the sum of the rows or the overall average. DefaultPeriod is true when the report has no
/// period of its own and this year was used.
/// </summary>
public sealed record StandardReportOutputResponse(
    string ReportId,
    string ReportName,
    string Category,
    string Measure,
    string Dimension,
    string Unit,
    double? Total,
    string Aggregate,
    DateOnly PeriodFrom,
    DateOnly PeriodTo,
    string TimeZone,
    bool DefaultPeriod,
    IReadOnlyList<StandardReportOutputRow> Rows,
    string? Note,
    DateTime GeneratedAt);

/// <summary>The repositories a Standard Report's output may read, depending on its category.</summary>
public sealed record StandardReportOutputSources(
    IDashboardDataRepository Dashboard,
    IInventoryAnalyticsDataRepository Inventory,
    IComplianceAnalyticsDataRepository Compliance,
    IFinancialAnalyticsDataRepository Financial,
    IFinancialAnalyticsCapexRequestRepository Capex);

/// <summary>
/// Works out what a Standard Report shows in the viewer: one measure broken down by asset category, site or month, read from the
/// same calculators as the analytics pages so a figure matches everywhere. The period is the report's own period, or this year when
/// it has none. Nothing is written.
/// </summary>
public static class StandardReportOutputCalculator
{
    public const string CountUnit = "count";
    public const string MoneyUnit = "money";
    public const string PercentUnit = "percent";

    public const string CategoryDimension = "category";
    public const string SiteDimension = "site";
    public const string MonthDimension = "month";

    private const string DefaultPreset = "This year";

    public static async Task<StandardReportOutputResponse> CalculateAsync(
        StandardReport report,
        StandardReportOutputSources sources,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var timeZoneId = string.IsNullOrWhiteSpace(report.TimeZone) ? "UTC" : report.TimeZone;
        if (!ReportPeriods.TryGetTimeZone(timeZoneId, out var zone))
        {
            zone = TimeZoneInfo.Utc;
            timeZoneId = "UTC";
        }

        var period = ResolvePeriod(report, zone, timeZoneId, utcNow);
        var scope = new DashboardDataScope(report.TenantId, report.ClientId, null, null, null);

        var (measure, dimension, unit, total, rows, note) = report.Category switch
        {
            "Assets" => await AssetsByCategoryAsync(sources, scope, period, cancellationToken),
            "Movement & Custody" => await AssetsBySiteAsync(sources, scope, period, cancellationToken),
            "Maintenance" => await MaintenanceCostAsync(sources, scope, period, utcNow, cancellationToken),
            "Inspection" => await InspectionCompletionAsync(sources, scope, period, utcNow, cancellationToken),
            "Inventory" => await InventoryValueAsync(sources, report, period, utcNow, cancellationToken),
            "WIP / Operations" => await ProductionOutputAsync(sources, scope, period, utcNow, cancellationToken),
            "Audit & Compliance" => await ComplianceScoreAsync(sources, scope, period, utcNow, cancellationToken),
            "Financial" => await FinancialCostAsync(sources, scope, period, utcNow, cancellationToken),
            _ => ("Records", CategoryDimension, CountUnit, (double?)null, (IReadOnlyList<StandardReportOutputRow>)[],
                (string?)$"No output is defined for the '{report.Category}' category.")
        };

        return new StandardReportOutputResponse(
            report.ReportId,
            report.ReportName,
            report.Category,
            measure,
            dimension,
            unit,
            total,
            unit == PercentUnit ? "average" : "sum",
            period.From,
            period.To,
            timeZoneId,
            report.ReportPeriodFrom is null || report.ReportPeriodTo is null,
            rows,
            rows.Count == 0 ? note ?? "No records were found for this period." : note,
            utcNow);
    }

    /// <summary>The report's period as whole days in its zone (the end day included), or this year.</summary>
    private static DashboardPeriod ResolvePeriod(StandardReport report, TimeZoneInfo zone, string timeZoneId, DateTime utcNow)
    {
        if (report.ReportPeriodFrom is not { } fromUtc || report.ReportPeriodTo is not { } toUtc || toUtc <= fromUtc)
        {
            return DashboardPeriods.Resolve(DefaultPreset, null, null, zone, timeZoneId, utcNow);
        }

        DateOnly Local(DateTime value) =>
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(value, DateTimeKind.Utc), zone));

        // A period ending at midnight is stored end-exclusive; step back a tick so it ends on the previous day.
        var from = Local(fromUtc);
        var to = Local(toUtc.AddTicks(-1));
        return DashboardPeriods.Resolve(InteractiveDashboardOptions.CustomDatePreset, from, to < from ? from : to, zone, timeZoneId, utcNow);
    }

    private static async Task<Output> AssetsByCategoryAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, CancellationToken cancellationToken)
    {
        var assets = await AssetsAtAsync(sources, scope, period, cancellationToken);
        var rows = Shares(assets.GroupBy(asset => Label(asset.Category, "Uncategorised")).Select(group => (group.Key, (double)group.Count())).OrderByDescending(item => item.Item2));
        return ("Assets", CategoryDimension, CountUnit, assets.Count, rows, null);
    }

    private static async Task<Output> AssetsBySiteAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, CancellationToken cancellationToken)
    {
        var assets = await AssetsAtAsync(sources, scope, period, cancellationToken);
        var rows = Shares(assets.GroupBy(asset => Label(asset.Site ?? asset.Location, "Unassigned")).Select(group => (group.Key, (double)group.Count())).OrderByDescending(item => item.Item2));
        return ("Assets in custody", SiteDimension, CountUnit, assets.Count, rows,
            "Custody snapshot: assets held at each site at the end of the period. Movement history is not recorded yet.");
    }

    private static async Task<Output> MaintenanceCostAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await MaintenanceAnalyticsCalculator.LoadAsync(
            sources.Dashboard, scope, period,
            new MaintenanceAnalyticsSettings(null, MaintenanceAnalyticsOptions.DefaultComplianceTarget, null, MaintenanceAnalyticsOptions.DefaultFailureHealthThreshold),
            utcNow, cancellationToken);
        var trend = calculator.CostTrend();
        var rows = Shares(Line(trend.Trend, "Total Cost"));
        return ("Maintenance cost", MonthDimension, MoneyUnit, trend.Totals.Total, rows, null);
    }

    private static async Task<Output> InspectionCompletionAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await InspectionAnalyticsCalculator.LoadAsync(
            sources.Dashboard, scope, period,
            new InspectionAnalyticsSettings(
                null, null, InspectionAnalyticsOptions.DefaultComplianceTarget, InspectionAnalyticsOptions.DefaultDueWithinDays, InspectionAnalyticsOptions.DefaultRepeatWindowDays),
            utcNow, cancellationToken);
        var trend = calculator.CompletionTrend();
        var planned = Line(trend, "Planned").ToList();
        var completed = Line(trend, InspectionAnalyticsCalculator.Completed).ToDictionary(item => item.Label, item => item.Value);

        var rows = planned
            .Where(item => item.Value > 0)
            .Select(item => new StandardReportOutputRow(item.Label, Round(100d * completed.GetValueOrDefault(item.Label) / item.Value, 1), null))
            .ToList();
        var totalPlanned = planned.Sum(item => item.Value);
        double? total = totalPlanned > 0 ? Round(100d * completed.Values.Sum() / totalPlanned, 1) : null;
        return ("Completion rate", MonthDimension, PercentUnit, total, rows, null);
    }

    private static async Task<Output> InventoryValueAsync(
        StandardReportOutputSources sources, StandardReport report, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await InventoryAnalyticsCalculator.LoadAsync(
            sources.Inventory, period,
            new InventoryAnalyticsSettings(
                report.TenantId, report.ClientId, null, null, null, null, null, null,
                InventoryAnalyticsOptions.DefaultSlowMovingDays, InventoryAnalyticsOptions.DefaultUsageWindowDays),
            utcNow, cancellationToken);
        var stock = calculator.StockByCategory();
        var rows = Shares(stock.Categories.Select(category => (category.Category, category.Value)).OrderByDescending(item => item.Value));
        return ("Stock value", CategoryDimension, MoneyUnit, Round(stock.TotalValue, 2), rows,
            "Stock is a snapshot: values are current on-hand stock, not as of the period end.");
    }

    private static async Task<Output> ProductionOutputAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await ProductionAnalyticsCalculator.LoadAsync(
            sources.Dashboard, scope, period,
            new ProductionAnalyticsSettings(null, null, null, null, ProductionAnalyticsOptions.DefaultUtilizationTarget, null, ProductionAnalyticsOptions.DefaultAtRiskGap),
            utcNow, cancellationToken);
        var actual = Line(calculator.OutputTrend(), "Actual").ToList();
        return ("Output units", MonthDimension, CountUnit, actual.Sum(item => item.Value), Shares(actual), null);
    }

    private static async Task<Output> ComplianceScoreAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await ComplianceAnalyticsCalculator.LoadAsync(
            sources.Compliance, sources.Dashboard, scope, period,
            new ComplianceAnalyticsSettings(null, null, null, ComplianceAnalyticsOptions.DefaultScoreTarget, ComplianceAnalyticsOptions.DefaultCapaTarget),
            utcNow, cancellationToken);
        var rows = calculator.Locations()
            .Where(location => location.Score is not null)
            .OrderByDescending(location => location.Score)
            .Select(location => new StandardReportOutputRow(location.Location, Round(location.Score!.Value, 1), null))
            .ToList();
        var score = calculator.ScoreTrend().Score;
        return ("Compliance score", SiteDimension, PercentUnit, score is { } value ? Round(value, 1) : null, rows, null);
    }

    private static async Task<Output> FinancialCostAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, DateTime utcNow, CancellationToken cancellationToken)
    {
        var calculator = await FinancialAnalyticsCalculator.LoadAsync(
            sources.Dashboard, sources.Financial, sources.Capex, scope, period,
            new FinancialAnalyticsSettings(
                null,
                FinancialAnalyticsOptions.DefaultBudgetTarget,
                FinancialAnalyticsOptions.DefaultUsefulLifeYears,
                FinancialAnalyticsOptions.DefaultMaintenanceRatioLimit,
                FinancialAnalyticsOptions.DefaultUtilizationThreshold),
            utcNow, cancellationToken);
        var costs = calculator.CategoryCosts();
        var rows = Shares(costs.Items.Select(item => (item.Category, item.Total)).OrderByDescending(item => item.Total));
        return ("Total cost", CategoryDimension, MoneyUnit, Round(costs.Total, 2), rows, "Acquisition plus maintenance cost per asset category.");
    }

    private static async Task<IReadOnlyList<DashboardAsset>> AssetsAtAsync(
        StandardReportOutputSources sources, DashboardDataScope scope, DashboardPeriod period, CancellationToken cancellationToken) =>
        (await sources.Dashboard.GetAssetsAsync(scope, cancellationToken))
            .Where(asset => asset.CreatedAt is null || asset.CreatedAt < period.ToUtc)
            .ToList();

    private static IEnumerable<(string Label, double Value)> Line(PerformanceSeries series, string name)
    {
        var line = series.Series.FirstOrDefault(item => string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase));
        return line is null
            ? []
            : series.Categories.Zip(line.Values, (label, value) => (label, value ?? 0d));
    }

    /// <summary>Rows in the given order with each value's share of the total, in percent.</summary>
    private static IReadOnlyList<StandardReportOutputRow> Shares(IEnumerable<(string Label, double Value)> items)
    {
        var list = items.ToList();
        var total = list.Sum(item => item.Value);
        return list
            .Select(item => new StandardReportOutputRow(item.Label, Round(item.Value, 2), total > 0 ? Round(100d * item.Value / total, 1) : null))
            .ToList();
    }

    private static string Label(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    private static double Round(double value, int digits) => Math.Round(value, digits, MidpointRounding.AwayFromZero);
}
