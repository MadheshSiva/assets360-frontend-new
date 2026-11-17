using MongoDB.Bson;

namespace A360.ReportAnalytics.Repository.Reporting;

public static class ReportDataSources
{
    public const string Assets = "assets";
    public const string Maintenance = "maintenance";
    public const string Inspection = "inspection";
}

public static class ReportFieldTypes
{
    public const string String = "string";
    public const string Number = "number";
    public const string Currency = "currency";
    public const string Date = "date";

    public static bool IsNumeric(string dataType) => dataType is Number or Currency;
}

public sealed record ReportDataSource(string Key, string Label, string Description, bool Required);

/// <summary>A field on the Select Fields step. Expression computes it for one asset row.</summary>
public sealed record ReportField(
    string Key,
    string Label,
    string Group,
    string DataSource,
    string DataType,
    BsonValue Expression,
    IReadOnlyList<string> Lookups);

/// <summary>A collection joined to each asset by asset_id, exposed to field expressions as $Alias.</summary>
public sealed record ReportLookup(string Alias, string Collection, IReadOnlyList<string> Fields);

/// <summary>
/// Report rows are assets from the Asset service's AssetRegistration collection. Maintenance and Inspection
/// records are joined on asset_id, which may hold either the asset_registration_id or the asset's Mongo _id.
/// </summary>
public static class ReportFieldCatalog
{
    public const string AssetCollection = "AssetRegistration";

    private const string WorkOrders = "_wo";
    private const string Costs = "_cost";
    private const string Downtime = "_dt";
    private const string Inspections = "_ci";
    private const string InspectionTasks = "_it";

    public static readonly IReadOnlyList<ReportDataSource> DataSources =
    [
        new(ReportDataSources.Assets, "Assets", "Asset register: identity, classification, location and purchase details", true),
        new(ReportDataSources.Maintenance, "Maintenance", "Work orders, maintenance costs, downtime and compliance inspections", false),
        new(ReportDataSources.Inspection, "Inspection", "Inspection results and inspection tasks", false)
    ];

    public static readonly IReadOnlyDictionary<string, ReportLookup> Lookups = new Dictionary<string, ReportLookup>
    {
        [WorkOrders] = new(WorkOrders, "work_orders", ["status", "scheduled_date"]),
        [Costs] = new(Costs, "cost_tracking_records", ["total_maintenance_cost", "labor_cost", "spare_parts_cost"]),
        [Downtime] = new(Downtime, "downtime_records", ["downtime_start", "downtime_end"]),
        [Inspections] = new(Inspections, "compliance_inspections", ["created_at", "next_inspection_date", "result"]),
        [InspectionTasks] = new(InspectionTasks, "inspection_tasks", ["is_active", "is_critical_task"])
    };

    public static readonly IReadOnlyList<ReportField> Fields = BuildFields();

    private static readonly Dictionary<string, ReportField> FieldsByKey =
        Fields.ToDictionary(field => field.Key, StringComparer.OrdinalIgnoreCase);

    public static ReportField? Find(string? key) =>
        key is not null && FieldsByKey.TryGetValue(key.Trim(), out var field) ? field : null;

    private static List<ReportField> BuildFields()
    {
        const string assetInformation = "Asset Information";
        const string maintenance = "Maintenance";
        const string inspection = "Inspection";

        ReportField Asset(string key, string label, string dataType, BsonValue expression) =>
            new(key, label, assetInformation, ReportDataSources.Assets, dataType, expression, []);

        ReportField Joined(string key, string label, string group, string source, string dataType, BsonValue expression, params string[] lookups) =>
            new(key, label, group, source, dataType, expression, lookups);

        return
        [
            Asset("asset_id", "Asset ID", ReportFieldTypes.String, "$asset_registration_id"),
            Asset("asset_name", "Asset Name", ReportFieldTypes.String, "$basic_information.asset_name"),
            Asset("asset_tag", "Asset Tag", ReportFieldTypes.String, "$basic_information.asset_tag"),
            Asset("asset_category", "Asset Category", ReportFieldTypes.String, "$classification.category"),
            Asset("asset_type", "Asset Type", ReportFieldTypes.String, "$classification.asset_type"),
            Asset("location", "Location", ReportFieldTypes.String,
                IfNull("$location_assignment.location.location_path", "$location_assignment.location.site_name")),
            Asset("site", "Site", ReportFieldTypes.String, "$location_assignment.location.site_name"),
            Asset("department", "Department", ReportFieldTypes.String, "$classification.department"),
            Asset("condition", "Condition", ReportFieldTypes.String, "$basic_information.condition"),
            Asset("criticality", "Criticality", ReportFieldTypes.String, "$basic_information.criticality"),
            Asset("asset_status", "Asset Status", ReportFieldTypes.String, "$basic_information.status"),
            Asset("manufacturer", "Manufacturer", ReportFieldTypes.String, "$basic_information.manufacturer"),
            Asset("model", "Model", ReportFieldTypes.String, "$basic_information.model"),
            Asset("serial_number", "Serial Number", ReportFieldTypes.String, "$basic_information.serial_number"),
            Asset("assigned_to", "Assigned To", ReportFieldTypes.String, "$location_assignment.assignment.assigned_to_name"),
            Asset("purchase_date", "Purchase Date", ReportFieldTypes.Date, "$purchase_warranty.purchase.purchase_date"),
            Asset("purchase_cost", "Purchase Cost", ReportFieldTypes.Currency, ToDouble("$purchase_warranty.purchase.purchase_cost")),
            Asset("warranty_end_date", "Warranty End Date", ReportFieldTypes.Date, "$purchase_warranty.warranty.warranty_end_date"),

            Joined("maintenance_cost", "Maintenance Cost", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Currency,
                new BsonDocument("$sum", $"${Costs}.total_maintenance_cost"), Costs),
            Joined("labor_cost", "Labor Cost", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Currency,
                new BsonDocument("$sum", $"${Costs}.labor_cost"), Costs),
            Joined("spare_parts_cost", "Spare Parts Cost", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Currency,
                new BsonDocument("$sum", $"${Costs}.spare_parts_cost"), Costs),
            // Compliance inspections are recorded in the Maintenance service.
            Joined("last_inspection_date", "Last Inspection Date", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Date,
                new BsonDocument("$max", $"${Inspections}.created_at"), Inspections),
            Joined("open_work_orders", "Open Work Orders", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Number,
                new BsonDocument("$size", OpenWorkOrders()), WorkOrders),
            Joined("total_work_orders", "Total Work Orders", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Number,
                new BsonDocument("$size", $"${WorkOrders}"), WorkOrders),
            Joined("last_work_order_date", "Last Work Order Date", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Date,
                new BsonDocument("$max", $"${WorkOrders}.scheduled_date"), WorkOrders),
            Joined("mtbf_hours", "Mean Time Between Failure (MTBF, hours)", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Number,
                MeanTimeBetweenFailureHours(), Downtime),
            Joined("downtime_events", "Downtime Events", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Number,
                new BsonDocument("$size", $"${Downtime}"), Downtime),
            Joined("total_downtime_hours", "Total Downtime (hours)", maintenance, ReportDataSources.Maintenance, ReportFieldTypes.Number,
                TotalDowntimeHours(), Downtime),

            Joined("total_inspections", "Total Inspections", inspection, ReportDataSources.Inspection, ReportFieldTypes.Number,
                new BsonDocument("$size", $"${Inspections}"), Inspections),
            Joined("failed_inspections", "Failed Inspections", inspection, ReportDataSources.Inspection, ReportFieldTypes.Number,
                new BsonDocument("$size", FailedInspections()), Inspections),
            Joined("last_inspection_result", "Last Inspection Result", inspection, ReportDataSources.Inspection, ReportFieldTypes.String,
                LastInspectionResult(), Inspections),
            Joined("next_inspection_date", "Next Inspection Date", inspection, ReportDataSources.Inspection, ReportFieldTypes.Date,
                new BsonDocument("$max", $"${Inspections}.next_inspection_date"), Inspections),
            Joined("inspection_tasks", "Inspection Tasks", inspection, ReportDataSources.Inspection, ReportFieldTypes.Number,
                new BsonDocument("$size", ArrayFilter($"${InspectionTasks}", new BsonDocument("$ne", new BsonArray { "$$this.is_active", false }))), InspectionTasks),
            Joined("critical_inspection_tasks", "Critical Inspection Tasks", inspection, ReportDataSources.Inspection, ReportFieldTypes.Number,
                new BsonDocument("$size", ArrayFilter($"${InspectionTasks}", new BsonDocument("$eq", new BsonArray { "$$this.is_critical_task", true }))), InspectionTasks)
        ];
    }

    private static BsonDocument IfNull(params BsonValue[] values) => new("$ifNull", new BsonArray(values));

    private static BsonDocument ToDouble(string path) =>
        new("$convert", new BsonDocument { { "input", path }, { "to", "double" }, { "onError", BsonNull.Value }, { "onNull", BsonNull.Value } });

    private static BsonDocument ArrayFilter(string input, BsonValue condition) =>
        new("$filter", new BsonDocument { { "input", input }, { "cond", condition } });

    private static BsonDocument LowerOf(string path) => new("$toLower", IfNull(path, ""));

    // Work orders whose status is not completed, closed or cancelled.
    private static BsonDocument OpenWorkOrders() =>
        ArrayFilter($"${WorkOrders}", new BsonDocument("$not", new BsonArray
        {
            new BsonDocument("$in", new BsonArray { LowerOf("$$this.status"), new BsonArray { "completed", "closed", "cancelled", "canceled" } })
        }));

    private static BsonDocument FailedInspections() =>
        ArrayFilter($"${Inspections}", new BsonDocument("$in", new BsonArray { LowerOf("$$this.result"), new BsonArray { "fail", "failed" } }));

    // Result of the inspection with the latest created_at.
    private static BsonDocument LastInspectionResult() =>
        new("$arrayElemAt", new BsonArray
        {
            $"${Inspections}.result",
            new BsonDocument("$indexOfArray", new BsonArray { $"${Inspections}.created_at", new BsonDocument("$max", $"${Inspections}.created_at") })
        });

    private static BsonDocument TotalDowntimeHours()
    {
        var durations = new BsonDocument("$map", new BsonDocument
        {
            { "input", $"${Downtime}" },
            {
                "in", new BsonDocument("$cond", new BsonArray
                {
                    new BsonDocument("$and", new BsonArray { "$$this.downtime_start", "$$this.downtime_end" }),
                    new BsonDocument("$subtract", new BsonArray { "$$this.downtime_end", "$$this.downtime_start" }),
                    0
                })
            }
        });

        return new BsonDocument("$round", new BsonArray
        {
            new BsonDocument("$divide", new BsonArray { new BsonDocument("$sum", durations), 3_600_000 }),
            2
        });
    }

    // Average gap between consecutive downtime starts: (last - first) / (failures - 1); null with fewer than two failures.
    private static BsonDocument MeanTimeBetweenFailureHours()
    {
        var starts = ArrayFilter($"${Downtime}.downtime_start", new BsonDocument("$ne", new BsonArray { "$$this", BsonNull.Value }));

        return new BsonDocument("$let", new BsonDocument
        {
            { "vars", new BsonDocument("starts", starts) },
            {
                "in", new BsonDocument("$cond", new BsonArray
                {
                    new BsonDocument("$gt", new BsonArray { new BsonDocument("$size", "$$starts"), 1 }),
                    new BsonDocument("$round", new BsonArray
                    {
                        new BsonDocument("$divide", new BsonArray
                        {
                            new BsonDocument("$subtract", new BsonArray { new BsonDocument("$max", "$$starts"), new BsonDocument("$min", "$$starts") }),
                            new BsonDocument("$multiply", new BsonArray
                            {
                                3_600_000,
                                new BsonDocument("$subtract", new BsonArray { new BsonDocument("$size", "$$starts"), 1 })
                            })
                        }),
                        2
                    }),
                    BsonNull.Value
                })
            }
        });
    }
}
