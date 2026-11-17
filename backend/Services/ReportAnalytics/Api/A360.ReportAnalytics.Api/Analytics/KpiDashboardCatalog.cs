namespace A360.ReportAnalytics.Api.Analytics;

/// <summary>
/// A KPI the dashboard can work out from live records. History is false for figures that only exist as of now (stock on hand,
/// missing assets, overdue corrective actions): those have no monthly values and no previous-period value.
/// Flow figures accumulate over the period (cost); their target is an annual amount pro-rated to the period.
/// </summary>
public sealed record KpiCatalogItem(
    string Id,
    string Name,
    string Module,
    string Unit,
    string Direction,
    double DefaultTarget,
    bool Flow,
    bool History,
    string Source,
    string Info);

/// <summary>A built-in view and its default tiles, in order.</summary>
public sealed record KpiBuiltInView(string Key, string Label, string Dashboard, IReadOnlyList<string> KpiIds);

public static class KpiDashboardCatalog
{
    public const string Higher = "higher";
    public const string Lower = "lower";

    public const string Percent = "%";
    public const string Count = "count";
    public const string Currency = "AED";
    public const string Ratio = "x";
    public const string Hours = "hrs";

    public static readonly IReadOnlyList<string> Modules = ["Asset", "Maintenance", "Inspection", "Inventory", "Operations", "Compliance", "Financial"];
    public static readonly IReadOnlyList<string> Units = [Percent, Count, Currency, Ratio, Hours];
    public static readonly IReadOnlyList<string> Directions = [Higher, Lower];

    public const string AssetPerformance = "Asset Performance";
    public const string MaintenanceAnalytics = "Maintenance Analytics";
    public const string InspectionAnalytics = "Inspection Analytics";
    public const string ProductionAnalytics = "WIP / Production Analytics";
    public const string SpareParts = "Spare parts";

    /// <summary>The built-in KPIs; their ids are also the metric keys a custom KPI can measure.</summary>
    public static readonly IReadOnlyList<KpiCatalogItem> Items =
    [
        // Asset
        new("health", "Asset Health Score", "Asset", Percent, Higher, 85, false, true, AssetPerformance, "Average latest condition-assessment health score of the assets"),
        new("utilization", "Asset Utilization", "Asset", Percent, Higher, 80, false, true, AssetPerformance, "Planned utilization × availability, averaged over assets with a planned utilization"),
        new("availability", "Asset Availability", "Asset", Percent, Higher, 95, false, true, AssetPerformance, "Time in service not lost to downtime ÷ time in service"),
        new("mtbf", "MTBF", "Asset", Hours, Higher, 1200, false, true, AssetPerformance, "Mean time between failures: up hours ÷ unplanned failures"),
        new("missing", "Missing Assets", "Asset", Count, Lower, 40, false, false, "Asset register", "Assets whose register status is missing or lost (as of now)"),
        // Maintenance
        new("pm", "Preventive Compliance", "Maintenance", Percent, Higher, 90, false, true, MaintenanceAnalytics, "Preventive work orders completed ÷ due in the period"),
        new("openWo", "Open Work Orders", "Maintenance", Count, Lower, 100, false, true, MaintenanceAnalytics, "Work orders scheduled in the period that are not yet completed"),
        new("overdueWo", "Overdue Work Orders", "Maintenance", Count, Lower, 15, false, true, MaintenanceAnalytics, "Unfinished work orders scheduled in the period and past their scheduled date"),
        new("mttr", "MTTR", "Maintenance", Hours, Lower, 8, false, true, AssetPerformance, "Mean time to repair: average length of unplanned downtime that ended"),
        new("cost", "Maintenance Cost", "Maintenance", Currency, Lower, 2_000_000, true, true, MaintenanceAnalytics, "Maintenance spend against the recorded budget allocation (else the annual target, pro-rated)"),
        // Inspection
        new("inspection", "Inspection Completion", "Inspection", Percent, Higher, 95, false, true, InspectionAnalytics, "Completed ÷ planned inspections in the period"),
        new("openFindings", "Open Findings", "Inspection", Count, Lower, 130, false, true, InspectionAnalytics, "Findings raised in the period that are not yet resolved"),
        new("criticalFindings", "Critical Findings", "Inspection", Count, Lower, 10, false, true, InspectionAnalytics, "Open findings rated critical"),
        // Inventory
        new("turnover", "Inventory Turnover", "Inventory", Ratio, Higher, 6, false, true, SpareParts, "Spare parts cost used in maintenance (annualised) ÷ current stock value"),
        new("reorder", "Items Below Reorder", "Inventory", Count, Lower, 200, false, false, SpareParts, "Spare parts out of stock or at or below their minimum level (as of now)"),
        // Operations
        new("oee", "Overall Equipment Effectiveness", "Operations", Percent, Higher, 85, false, true, ProductionAnalytics, "Availability × performance × quality of production orders"),
        new("onTime", "On-Time Production", "Operations", Percent, Higher, 95, false, true, ProductionAnalytics, "Production orders completed by their due date"),
        // Compliance
        new("compliance", "Inspection Compliance", "Compliance", Percent, Higher, 90, false, true, InspectionAnalytics, "Assets with an inspection schedule whose inspections are up to date"),
        new("capa", "CAPA Closure Rate", "Compliance", Percent, Higher, 90, false, true, InspectionAnalytics, "Findings raised in the period that are resolved ÷ raised"),
        new("overdueCapa", "Overdue CAPA Actions", "Compliance", Count, Lower, 5, false, false, InspectionAnalytics, "Unresolved findings past their corrective-action due date (as of now)"),
        // Financial
        new("inventoryValue", "Inventory Value", "Financial", Currency, Lower, 5_000_000, false, false, SpareParts, "Spare parts on hand at unit cost vs. the holding ceiling (as of now)"),
        new("wip", "WIP Value", "Financial", Currency, Lower, 3_600_000, false, true, ProductionAnalytics, "Work in progress at cost at the end of the period vs. the ceiling")
    ];

    public static readonly IReadOnlyList<KpiBuiltInView> Views =
    [
        new("executive", "Executive", "Executive KPI Overview",
            ["health", "pm", "utilization", "cost", "openWo", "inspection", "turnover", "oee", "compliance", "onTime", "availability", "capa"]),
        new("operations", "Operations", "Operations KPI Overview",
            ["oee", "onTime", "utilization", "availability", "openWo", "inspection", "overdueWo", "mttr"]),
        new("maintenance", "Maintenance", "Maintenance KPI Overview",
            ["pm", "openWo", "overdueWo", "cost", "mttr", "mtbf", "health", "availability"]),
        new("finance", "Finance", "Finance KPI Overview",
            ["cost", "inventoryValue", "wip", "turnover"])
    ];

    public const string DefaultViewKey = "executive";

    public static KpiCatalogItem? Find(string? id) =>
        id is null ? null : Items.FirstOrDefault(item => string.Equals(item.Id, id.Trim(), StringComparison.OrdinalIgnoreCase));

    public static KpiBuiltInView? FindView(string? key) =>
        key is null ? null : Views.FirstOrDefault(view => string.Equals(view.Key, key.Trim(), StringComparison.OrdinalIgnoreCase));
}
