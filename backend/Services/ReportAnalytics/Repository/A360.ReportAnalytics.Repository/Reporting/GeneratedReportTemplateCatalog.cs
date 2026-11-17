using System.Globalization;
using MongoDB.Bson;

namespace A360.ReportAnalytics.Repository.Reporting;

/// <summary>
/// A Generated Reports template: one Data Export dataset and the ordered fields of it that become the report's columns.
/// DateField is the dataset field the time range filters on; null when the template is a current snapshot (the range does not apply).
/// A template without a data source is listed with Available false and the reason, and cannot be generated.
/// </summary>
public sealed record GeneratedReportTemplate(
    string Id,
    string Name,
    string Module,
    string? DatasetId,
    IReadOnlyList<string> Columns,
    string? DateField,
    bool Available,
    string? UnavailableReason,
    string? Note)
{
    public DataExportDataset? Dataset => DataExportDatasetCatalog.Find(DatasetId);
}

public sealed record GeneratedReportModule(string Id, string Name, IReadOnlyList<GeneratedReportTemplate> Templates);

/// <summary>The report templates of the Generated Reports page, grouped by module. Every column is a real field of the template's dataset.</summary>
public static class GeneratedReportTemplateCatalog
{
    public static readonly IReadOnlyList<GeneratedReportModule> Modules = Build();

    public static IEnumerable<GeneratedReportTemplate> Templates => Modules.SelectMany(module => module.Templates);

    /// <summary>A template by id or by name, ignoring case.</summary>
    public static GeneratedReportTemplate? Find(string? idOrName)
    {
        var value = idOrName?.Trim();
        return string.IsNullOrEmpty(value)
            ? null
            : Templates.FirstOrDefault(template =>
                string.Equals(template.Id, value, StringComparison.OrdinalIgnoreCase) || string.Equals(template.Name, value, StringComparison.OrdinalIgnoreCase));
    }

    public static GeneratedReportModule? FindModule(string? idOrName)
    {
        var value = idOrName?.Trim();
        return string.IsNullOrEmpty(value)
            ? null
            : Modules.FirstOrDefault(module =>
                string.Equals(module.Id, value, StringComparison.OrdinalIgnoreCase) || string.Equals(module.Name, value, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Records whose date field falls in [fromUtc, toUtc]. Dates stored as ISO text are matched as text, like the Export Builder does.</summary>
    public static BsonDocument RangeFilter(DataExportDatasetField field, DateTime fromUtc, DateTime toUtc)
    {
        var fromText = fromUtc.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        var toText = toUtc.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        return new BsonDocument("$or", new BsonArray(field.Paths.SelectMany(path => new[]
        {
            new BsonDocument(path, new BsonDocument { { "$gte", fromUtc }, { "$lte", toUtc } }),
            new BsonDocument(path, new BsonDocument { { "$type", "string" }, { "$gte", fromText }, { "$lte", toText } })
        })));
    }

    private static List<GeneratedReportModule> Build()
    {
        const string tracking = "Asset Tracking";
        const string management = "Asset Management";
        const string maintenance = "Maintenance Management";
        const string inspection = "Inspection Management";
        const string wip = "Work in Progress (WIP)";

        static GeneratedReportTemplate Ready(string module, string name, string datasetId, string? dateField, string? note, params string[] columns) =>
            new(Slug(name), name, module, datasetId, columns, dateField, true, null, note);

        static GeneratedReportTemplate Missing(string module, string name, string reason) =>
            new(Slug(name), name, module, null, [], null, false, reason, null);

        return
        [
            new("asset-tracking", tracking,
            [
                Ready(tracking, "Asset Location & Movement Report", "DS-ASSETS", null,
                    "Current location, site and custodian from the asset register; movement history is not recorded in any exportable dataset.",
                    "Asset ID", "Asset Name", "Asset Tag", "Location", "Site", "Department", "Custodian", "Status"),
                Missing(tracking, "Asset Location History / Trail Report",
                    "No location-history, check-in/out or trail dataset is available to reports yet."),
                Ready(tracking, "Asset Missing / Not-Seen Report", "DS-IOT-DEVICES", null,
                    "Tracking devices with the asset they are linked to and when each was last seen; sort by Last Seen to find assets not seen recently.",
                    "Device ID", "Device Name", "Asset ID", "Asset Name", "Gateway", "Status", "Battery", "Last Seen"),
                Missing(tracking, "Asset Movement & Exception Report",
                    "Geofence violations and movement alerts are not available to reports yet."),
                Missing(tracking, "Asset Utilization & Dwell-Time Report",
                    "Dwell time per zone and utilization are not available as a report dataset; see IoT & Utilization Analytics.")
            ]),
            new("asset-management", management,
            [
                Ready(management, "Asset Register Report", "DS-ASSETS", "Registered On", null,
                    "Asset ID", "Asset Name", "Asset Tag", "Category", "Asset Type", "Manufacturer", "Model", "Serial Number", "Status", "Condition",
                    "Location", "Custodian", "Purchase Date", "Purchase Cost"),
                Ready(management, "Asset Lifecycle Report", "DS-ASSETS", "Registered On",
                    "Key lifecycle dates and the current status of each asset; individual lifecycle events are not exported.",
                    "Asset ID", "Asset Name", "Category", "Status", "Condition", "Purchase Date", "Warranty End", "Registered On"),
                Ready(management, "Asset Allocation & Custodian Report", "DS-ASSETS", null,
                    "Current allocation of each asset; transfer history and acknowledgements are not exported.",
                    "Asset ID", "Asset Name", "Custodian", "Department", "Site", "Location", "Status"),
                Ready(management, "Asset Valuation & Depreciation Report", "DS-ASSETS", "Purchase Date",
                    "Purchase value and date only; depreciation and net book value are not stored, so they are not shown.",
                    "Asset ID", "Asset Name", "Category", "Purchase Date", "Purchase Cost", "Condition", "Status"),
                Ready(management, "Warranty / AMC / Contract Expiry Report", "DS-AMC-CONTRACTS", null,
                    "Vendor AMC contracts with their start and end dates; asset warranty end dates are in the Asset Register / Lifecycle reports.",
                    "Contract ID", "Vendor", "Asset ID", "Asset Name", "Assets Covered", "Start Date", "End Date", "SLA Terms")
            ]),
            new("maintenance", maintenance,
            [
                Ready(maintenance, "Preventive Maintenance Compliance Report", "DS-PM-SCHEDULES", null,
                    "Preventive maintenance schedules with their last maintenance and next due dates.",
                    "PM Schedule ID", "Schedule Name", "Asset ID", "Asset Name", "Frequency", "Priority", "Assigned To", "Status",
                    "Last Maintenance", "Next Due"),
                Ready(maintenance, "Maintenance Work Order Report", "DS-WORK-ORDERS", "Opened On", null,
                    "Work Order ID", "Title", "Asset ID", "Asset Name", "Work Type", "Technician", "Priority", "Status", "Scheduled Date",
                    "Due Date", "Actual Start", "Actual End", "Estimated Hours", "Additional Cost", "Progress"),
                Ready(maintenance, "Asset Maintenance History Report", "DS-WORK-ORDERS", "Opened On", null,
                    "Asset ID", "Asset Name", "Work Order ID", "Title", "Work Type", "Category", "Status", "Actual End", "Additional Cost"),
                Ready(maintenance, "Breakdown & Reliability Report", "DS-DOWNTIME", "Downtime Start",
                    "Downtime events; MTBF and MTTR are calculated in Maintenance Analytics.",
                    "Asset ID", "Asset Name", "Downtime Start", "Downtime End", "Total Downtime", "Reason", "Impact Level"),
                Ready(maintenance, "Maintenance Cost Report", "DS-COSTS", "Recorded On",
                    "Vendor cost is not tracked separately.",
                    "Asset ID", "Asset Name", "Work Order ID", "Labour Cost", "Spare Parts Cost", "Total Maintenance Cost", "Budget Allocation",
                    "Recorded On")
            ]),
            new("inspection", inspection,
            [
                Ready(inspection, "Detailed Inspection Report / Certificate", "DS-INSPECTIONS", "Due Date",
                    "Inspection records; checkpoint results, photos and signatures are not exported.",
                    "Inspection ID", "Title", "Inspection Type", "Asset ID", "Asset Name", "Site", "Location", "Inspector", "Checklist",
                    "Reference Standard", "Status", "Findings", "Due Date", "Completed On"),
                Ready(inspection, "Inspection Compliance Summary Report", "DS-COMPLIANCE", "Inspected On",
                    "One row per compliance inspection with its result.",
                    "Inspection ID", "Asset ID", "Asset Name", "Inspection Type", "Checklist", "Inspector", "Result", "Next Inspection",
                    "Inspected On"),
                Ready(inspection, "Failed Inspection & Findings Report", "DS-FINDINGS", "Recorded On", null,
                    "Finding ID", "Title", "Inspection ID", "Asset ID", "Asset Name", "Severity", "Status", "Assigned To", "Corrective Action",
                    "Recorded On"),
                Ready(inspection, "Corrective Action & Reinspection Report", "DS-FINDINGS", "Recorded On",
                    "Corrective actions on findings; reinspection results are not exported.",
                    "Finding ID", "Title", "Corrective Action", "Owner", "Assigned To", "Due Date", "Work Order ID", "Status"),
                Missing(inspection, "Inspection & Approval Audit Trail Report",
                    "Inspection approval steps and the audit trail are not available to reports yet.")
            ]),
            new("wip", wip,
            [
                Ready(wip, "WIP Status Summary Report", "DS-WIP-JOBS", "Planned Start", null,
                    "Job ID", "Job Name", "Asset ID", "Asset Category", "Work Type", "Priority", "Status", "Assigned To", "Progress",
                    "Planned Start", "Planned Finish"),
                Ready(wip, "WIP Ageing Report", "DS-WIP-JOBS", "Planned Start",
                    "Age follows from Planned Start; stage entry dates are not exported.",
                    "Job ID", "Job Name", "Asset ID", "Status", "Assigned To", "Planned Start", "Progress"),
                Missing(wip, "WIP Movement & Stage History Report",
                    "Stage-to-stage movement history is not available to reports yet."),
                Ready(wip, "WIP Delay / Bottleneck Report", "DS-WIP-JOBS", "Planned Start",
                    "Compare Planned Finish with Progress to spot delayed jobs; delay reasons are not exported.",
                    "Job ID", "Job Name", "Priority", "Status", "Assigned To", "Planned Finish", "Progress"),
                Ready(wip, "WIP Completion & Turnaround-Time Report", "DS-WIP-JOBS", "Planned Start",
                    "Planned dates and progress; actual completion dates are not exported.",
                    "Job ID", "Job Name", "Work Type", "Status", "Planned Start", "Planned Finish", "Progress")
            ])
        ];
    }

    private static string Slug(string value)
    {
        var slug = new string(value.ToLowerInvariant().Select(character => char.IsAsciiLetterOrDigit(character) ? character : '-').ToArray());
        while (slug.Contains("--"))
        {
            slug = slug.Replace("--", "-");
        }

        return slug.Trim('-');
    }
}
