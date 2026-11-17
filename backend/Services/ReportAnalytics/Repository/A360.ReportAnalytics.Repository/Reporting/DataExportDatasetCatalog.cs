using System.Globalization;
using System.Text.RegularExpressions;
using MongoDB.Bson;

namespace A360.ReportAnalytics.Repository.Reporting;

/// <summary>Field types shown in the Export Builder; they pick the filter operators and the cell format.</summary>
public static class DataExportFieldTypes
{
    public const string Id = "id";
    public const string Text = "text";
    public const string Number = "number";
    public const string Money = "money";
    public const string Percent = "percent";
    public const string Date = "date";

    public static bool IsNumeric(string type) => type is Number or Money or Percent;

    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> Operators = new Dictionary<string, IReadOnlyList<string>>
    {
        [Text] = ["equals", "not equals", "contains"],
        [Id] = ["equals", "starts with"],
        [Number] = ["=", ">", "<", "≥", "≤"],
        [Money] = ["=", ">", "<", "≥", "≤"],
        [Percent] = ["=", ">", "<", "≥", "≤"],
        [Date] = ["in last", "before", "after"]
    };
}

/// <summary>A dataset column. Path is the stored field; "a|b" reads b when a is empty.</summary>
public sealed record DataExportDatasetField(string Name, string Group, string Type, string Path)
{
    public IReadOnlyList<string> Paths { get; } = Path.Split('|', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
}

/// <summary>An exportable dataset: one live collection of another Asset360 service.</summary>
public sealed record DataExportDataset(
    string Id,
    string Name,
    string Description,
    IReadOnlyList<string> Modules,
    string Collection,
    string SourceService,
    IReadOnlyList<DataExportDatasetField> Fields)
{
    public IReadOnlyList<string> Groups => Fields.Select(field => field.Group).Distinct().ToList();

    public DataExportDatasetField? Field(string? name) =>
        name is null ? null : Fields.FirstOrDefault(field => string.Equals(field.Name, name.Trim(), StringComparison.OrdinalIgnoreCase));
}

/// <summary>
/// The datasets Data Export &amp; API can export. Each reads one collection written by another service, scoped by tenant_id / client_id;
/// field paths follow those services' domain entities.
/// </summary>
public static class DataExportDatasetCatalog
{
    public static readonly IReadOnlyList<DataExportDataset> Datasets = Build();

    public static DataExportDataset? Find(string? id) =>
        id is null ? null : Datasets.FirstOrDefault(dataset => string.Equals(dataset.Id, id.Trim(), StringComparison.OrdinalIgnoreCase));

    private static List<DataExportDataset> Build()
    {
        const string id = DataExportFieldTypes.Id;
        const string text = DataExportFieldTypes.Text;
        const string number = DataExportFieldTypes.Number;
        const string money = DataExportFieldTypes.Money;
        const string percent = DataExportFieldTypes.Percent;
        const string date = DataExportFieldTypes.Date;

        static List<DataExportDatasetField> Group(string group, params (string Name, string Type, string Path)[] fields) =>
            fields.Select(field => new DataExportDatasetField(field.Name, group, field.Type, field.Path)).ToList();

        return
        [
            new("DS-ASSETS", "Assets", "Asset register: identity, classification, location, custody and purchase details",
                ["Assets"], "AssetRegistration", "Asset service",
                Group("Assets",
                    ("Asset ID", id, "asset_registration_id"),
                    ("Asset Name", text, "basic_information.asset_name"),
                    ("Asset Tag", text, "basic_information.asset_tag"),
                    ("Category", text, "classification.category"),
                    ("Asset Type", text, "classification.asset_type"),
                    ("Department", text, "classification.department"),
                    ("Location", text, "location_assignment.location.location_path|location_assignment.location.site_name"),
                    ("Site", text, "location_assignment.location.site_name"),
                    ("Status", text, "basic_information.status|status"),
                    ("Condition", text, "basic_information.condition"),
                    ("Criticality", text, "basic_information.criticality|classification.criticality"),
                    ("Manufacturer", text, "basic_information.manufacturer"),
                    ("Model", text, "basic_information.model"),
                    ("Serial Number", text, "basic_information.serial_number"),
                    ("Custodian", text, "location_assignment.assignment.assigned_to_name"),
                    ("Purchase Date", date, "purchase_warranty.purchase.purchase_date"),
                    ("Purchase Cost", money, "purchase_warranty.purchase.purchase_cost"),
                    ("Warranty End", date, "purchase_warranty.warranty.warranty_end_date"),
                    ("Registered On", date, "created_at"))),

            new("DS-WORK-ORDERS", "Work Orders", "Maintenance work orders with schedule, assignment and progress",
                ["Maintenance"], "work_orders", "Maintenance service",
                Group("Maintenance",
                    ("Work Order ID", id, "work_order_id"),
                    ("Title", text, "title"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Work Type", text, "work_type"),
                    ("Priority", text, "priority"),
                    ("Status", text, "status"),
                    ("Category", text, "category"),
                    ("Technician", text, "assigned_technician"),
                    ("Team", text, "team"),
                    ("Site", text, "site"),
                    ("Department", text, "department"),
                    ("Source", text, "source"),
                    ("Scheduled Date", date, "scheduled_date"),
                    ("Due Date", date, "due_date"),
                    ("Actual Start", date, "actual_start_date"),
                    ("Actual End", date, "actual_end_date"),
                    ("Estimated Hours", number, "estimated_hours"),
                    ("Additional Cost", money, "additional_cost"),
                    ("Progress", percent, "progress"),
                    ("Opened On", date, "created_at"))),

            new("DS-PM-SCHEDULES", "Preventive Maintenance", "Preventive maintenance schedules and their next due dates",
                ["Maintenance"], "preventive_maintenance_schedules", "Maintenance service",
                Group("Preventive Maintenance",
                    ("PM Schedule ID", id, "pm_schedule_id"),
                    ("Schedule Name", text, "schedule_name"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Asset Type", text, "asset_type"),
                    ("Location", text, "location"),
                    ("Frequency", text, "frequency"),
                    ("Trigger Type", text, "trigger_type"),
                    ("Priority", text, "priority"),
                    ("Assigned To", text, "assigned_to"),
                    ("Status", text, "status"),
                    ("Last Maintenance", date, "last_maintenance_date"),
                    ("Next Due", date, "next_due_date"),
                    ("Estimated Hours", number, "estimated_hours"))),

            new("DS-ISSUES", "Issues & Service Requests", "Reported issues and service requests with resolution dates",
                ["Maintenance"], "issue_reports", "Maintenance service",
                Group("Issues",
                    ("Issue ID", id, "issue_id"),
                    ("Issue Type", text, "issue_type"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Severity", text, "severity"),
                    ("Category", text, "category"),
                    ("Location", text, "location"),
                    ("Status", text, "status"),
                    ("Reported By", text, "reported_by"),
                    ("Assigned To", text, "assigned_to"),
                    ("Work Order ID", id, "work_order_id"),
                    ("Requested On", date, "requested_date|created_at"),
                    ("Target Date", date, "target_date"),
                    ("Resolved On", date, "resolved_date"))),

            new("DS-DOWNTIME", "Downtime", "Asset downtime events with cause and impact",
                ["Maintenance"], "downtime_records", "Maintenance service",
                Group("Downtime",
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Downtime Start", date, "downtime_start"),
                    ("Downtime End", date, "downtime_end"),
                    ("Total Downtime", number, "total_downtime"),
                    ("Reason", text, "reason_for_downtime"),
                    ("Impact Level", text, "impact_level"))),

            new("DS-PREDICTIVE", "Predictive Alerts", "Sensor-based predictive maintenance alerts and predicted failures",
                ["Maintenance", "Tracking & IoT"], "predictive_maintenance_alerts", "Maintenance service",
                Group("Predictive Alerts",
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Asset Type", text, "asset_type"),
                    ("Location", text, "location"),
                    ("Sensor Type", text, "sensor_type"),
                    ("Device ID", id, "data_source_device_id"),
                    ("Last Reading", number, "last_reading"),
                    ("Threshold", number, "threshold_value"),
                    ("Last Reading At", date, "last_reading_at"),
                    ("Risk Level", text, "risk_level"),
                    ("Health Score", percent, "health_score"),
                    ("Predicted Issue", text, "predicted_issue"),
                    ("Predicted Failure", date, "predicted_failure_date"),
                    ("Confidence", percent, "confidence"),
                    ("Recommended Action", text, "recommended_action"),
                    ("Status", text, "status"))),

            new("DS-INSPECTIONS", "Inspections", "Inspections with type, plan, assignment and findings count",
                ["Inspection"], "inspections", "Inspection service",
                Group("Inspection",
                    ("Inspection ID", id, "inspection_code"),
                    ("Title", text, "title"),
                    ("Inspection Type", text, "inspection_type_name"),
                    ("Category", text, "category"),
                    ("Priority", text, "priority"),
                    ("Status", text, "status"),
                    ("Site", text, "site_name"),
                    ("Location", text, "location"),
                    ("Asset ID", id, "asset_code"),
                    ("Asset Name", text, "asset_name"),
                    ("Inspector", text, "assigned_to"),
                    ("Plan", text, "plan_name"),
                    ("Checklist", text, "checklist_name"),
                    ("Reference Standard", text, "reference_standard"),
                    ("Findings", number, "findings_count"),
                    ("Due Date", date, "due_date"),
                    ("Completed On", date, "completed_at"))),

            new("DS-FINDINGS", "Inspection Findings", "Findings raised by inspections, with severity and corrective action",
                ["Inspection"], "inspection_findings", "Inspection service",
                Group("Findings",
                    ("Finding ID", id, "finding_code"),
                    ("Title", text, "title"),
                    ("Inspection ID", id, "inspection_code"),
                    ("Asset ID", id, "asset_code"),
                    ("Asset Name", text, "asset_name"),
                    ("Severity", text, "severity"),
                    ("Status", text, "status"),
                    ("Owner", text, "owner"),
                    ("Assigned To", text, "assigned_to"),
                    ("Corrective Action", text, "corrective_action"),
                    ("Work Order ID", id, "work_order"),
                    ("Due Date", date, "due_date"),
                    ("Recorded On", date, "created_at"))),

            new("DS-COMPLIANCE", "Compliance Inspections", "Compliance inspections recorded against assets",
                ["Audit & Compliance"], "compliance_inspections", "Maintenance service",
                Group("Audit & Compliance",
                    ("Inspection ID", id, "inspection_id"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Inspection Type", text, "inspection_type"),
                    ("Checklist", text, "checklist"),
                    ("Inspector", text, "inspector_name"),
                    ("Result", text, "result"),
                    ("Next Inspection", date, "next_inspection_date"),
                    ("Inspected On", date, "created_at"))),

            new("DS-SPARE-PARTS", "Spare Parts", "Spare parts stock, reorder levels and unit cost",
                ["Inventory"], "spare_parts", "Maintenance service",
                Group("Inventory",
                    ("Part ID", id, "part_id"),
                    ("Part Name", text, "part_name"),
                    ("Category", text, "category"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("On Hand", number, "quantity_in_stock"),
                    ("Reorder Level", number, "minimum_stock_level"),
                    ("Unit Cost", money, "unit_cost"),
                    ("Supplier", text, "supplier"))),

            new("DS-COSTS", "Maintenance Costs", "Labour, spare parts and total maintenance cost per record",
                ["Financial"], "cost_tracking_records", "Maintenance service",
                Group("Financial",
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Work Order ID", id, "work_order_id"),
                    ("Labour Cost", money, "labor_cost"),
                    ("Spare Parts Cost", money, "spare_parts_cost"),
                    ("Total Maintenance Cost", money, "total_maintenance_cost"),
                    ("Budget Allocation", money, "budget_allocation"),
                    ("Cost per Asset", money, "cost_per_asset"),
                    ("Recorded On", date, "created_at"))),

            new("DS-WIP-JOBS", "WIP Jobs", "Work-in-progress jobs with plan dates and progress",
                ["WIP / Operations"], "job_masters", "WIP service",
                Group("WIP / Operations",
                    ("Job ID", id, "job_id"),
                    ("Job Name", text, "job_name"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Category", text, "asset_category"),
                    ("Work Type", text, "work_type"),
                    ("Priority", text, "priority"),
                    ("Status", text, "status"),
                    ("Assigned To", text, "assigned_to"),
                    ("Progress", percent, "progress_percentage"),
                    ("Planned Start", date, "planned_start_date"),
                    ("Planned Finish", date, "planned_end_date"))),

            new("DS-IOT-DEVICES", "IoT Devices", "Tracking and IoT devices linked to assets",
                ["Tracking & IoT"], "IoTDevice", "Tracking service",
                Group("Tracking & IoT",
                    ("Device ID", id, "device_id"),
                    ("Device Name", text, "device_name"),
                    ("Device Type", text, "device_type"),
                    ("Model", text, "model"),
                    ("Connectivity", text, "connectivity"),
                    ("Asset ID", id, "asset_registration_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Gateway", text, "gateway"),
                    ("Power Source", text, "power_source"),
                    ("Battery", percent, "battery_level"),
                    ("Status", text, "status"),
                    ("Last Seen", date, "last_seen_at"))),

            new("DS-AMC-CONTRACTS", "Vendor AMC Contracts", "Annual maintenance contracts with vendors and covered assets",
                ["Contracts & Warranty"], "vendor_amc_contracts", "Maintenance service",
                Group("Contracts & Warranty",
                    ("Contract ID", id, "contract_id"),
                    ("Vendor", text, "vendor_name"),
                    ("Asset ID", id, "asset_id"),
                    ("Asset Name", text, "asset_name"),
                    ("Assets Covered", text, "assets_covered"),
                    ("Start Date", date, "start_date"),
                    ("End Date", date, "end_date"),
                    ("SLA Terms", text, "sla_terms")))
        ];
    }
}

/// <summary>Turns an Export Builder filter row into a Mongo condition on the field's stored path(s).</summary>
public static class DataExportFilterBuilder
{
    private static readonly Regex InLast = new(@"^(\d{1,4})\s+(day|days|week|weeks|month|months)$", RegexOptions.IgnoreCase);

    /// <summary>Null with an error message when the operator or value does not fit the field type.</summary>
    public static BsonDocument? TryBuild(DataExportDatasetField field, string? op, string? value, DateTime utcNow, out string? error)
    {
        error = null;
        var operators = DataExportFieldTypes.Operators[field.Type];
        var normalizedOp = operators.FirstOrDefault(item => string.Equals(item, op?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (normalizedOp is null)
        {
            error = $"Operator for {field.Name} must be one of: {string.Join(", ", operators)}";
            return null;
        }

        var raw = value?.Trim() ?? string.Empty;
        if (raw.Length == 0)
        {
            error = $"Enter a value for {field.Name}";
            return null;
        }

        if (raw.Length > 200)
        {
            error = $"The value for {field.Name} must be 200 characters or fewer";
            return null;
        }

        BsonDocument Any(Func<string, BsonDocument> condition) =>
            field.Paths.Count == 1 ? condition(field.Paths[0]) : new BsonDocument("$or", new BsonArray(field.Paths.Select(condition)));

        if (DataExportFieldTypes.IsNumeric(field.Type))
        {
            if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
            {
                error = $"{field.Name} needs a number";
                return null;
            }

            var mongoOp = normalizedOp switch { ">" => "$gt", "<" => "$lt", "≥" => "$gte", "≤" => "$lte", _ => "$eq" };
            return Any(path => new BsonDocument(path, new BsonDocument(mongoOp, number)));
        }

        if (field.Type == DataExportFieldTypes.Date)
        {
            DateTime bound;
            string mongoOp;
            if (normalizedOp == "in last")
            {
                var match = InLast.Match(raw);
                if (!match.Success)
                {
                    error = $"Use e.g. \"30 days\" for {field.Name}";
                    return null;
                }

                var count = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture);
                var unit = match.Groups[2].Value.ToLowerInvariant();
                bound = unit.StartsWith("month") ? utcNow.AddMonths(-count) : utcNow.AddDays(-count * (unit.StartsWith("week") ? 7 : 1));
                mongoOp = "$gte";
            }
            else
            {
                if (!DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                {
                    error = $"Use YYYY-MM-DD for {field.Name}";
                    return null;
                }

                bound = day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                if (normalizedOp == "after")
                {
                    bound = bound.AddDays(1);
                    mongoOp = "$gte";
                }
                else
                {
                    mongoOp = "$lt";
                }
            }

            // Some services store dates as ISO text ("2026-10-24"); ISO text sorts like the date it holds.
            var text = bound.ToString(normalizedOp == "in last" ? "yyyy-MM-ddTHH:mm:ss" : "yyyy-MM-dd", CultureInfo.InvariantCulture);
            return new BsonDocument("$or", new BsonArray(field.Paths.SelectMany(path => new[]
            {
                new BsonDocument(path, new BsonDocument(mongoOp, bound)),
                new BsonDocument(path, new BsonDocument { { "$type", "string" }, { mongoOp, text } })
            })));
        }

        var escaped = Regex.Escape(raw);
        return normalizedOp switch
        {
            "not equals" => new BsonDocument("$nor", new BsonArray(field.Paths.Select(path => new BsonDocument(path, new BsonRegularExpression($"^{escaped}$", "i"))))),
            "contains" => Any(path => new BsonDocument(path, new BsonRegularExpression(escaped, "i"))),
            "starts with" => Any(path => new BsonDocument(path, new BsonRegularExpression($"^{escaped}", "i"))),
            _ => Any(path => new BsonDocument(path, new BsonRegularExpression($"^{escaped}$", "i")))
        };
    }
}
