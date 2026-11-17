using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>The filter bar: tenant plus the Organization, Location and Asset Category picks (null means all).</summary>
public sealed record DashboardDataScope(
    string? TenantId,
    string? ClientId,
    string? Organization,
    string? Location,
    string? AssetCategory,
    string? AssetType = null)
{
    public bool FiltersAssets =>
        !string.IsNullOrWhiteSpace(Organization) || !string.IsNullOrWhiteSpace(Location)
        || !string.IsNullOrWhiteSpace(AssetCategory) || !string.IsNullOrWhiteSpace(AssetType);
}

public sealed record DashboardAsset(
    string MongoId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? Status,
    string? Criticality,
    string? Condition,
    string? Location,
    string? Site,
    DateTime? CreatedAt,
    DateTime? NextMaintenanceDate,
    string? AssetType = null,
    string? Utilization = null,
    double? OperatingHoursPerDay = null)
{
    /// <summary>The values other services may hold in asset_id: the business id and the Mongo _id.</summary>
    public IEnumerable<string> Keys()
    {
        yield return MongoId;
        if (!string.IsNullOrWhiteSpace(AssetId))
        {
            yield return AssetId;
        }
    }
}

public sealed record DashboardWorkOrder(
    string? AssetId,
    string? AssetName,
    string? Status,
    string? Priority,
    string? WorkType,
    DateTime? ScheduledDate,
    DateTime? CreatedAt,
    string? Id = null,
    string? WorkOrderId = null,
    string? AssignedTechnician = null,
    DateTime? UpdatedAt = null);

/// <summary>A maintenance cost record. MaintenanceType and WorkOrderId are read when a record carries them.</summary>
public sealed record DashboardCostRecord(
    string? AssetId,
    DateTime? CreatedAt,
    double Total,
    double LaborCost,
    double SparePartsCost,
    double? BudgetAllocation,
    string? WorkOrderId,
    string? MaintenanceType);

/// <summary>An SLA from the WIP service; WorkType and Priority are null when the SLA applies to all.</summary>
public sealed record DashboardSlaRule(string? WorkType, string? Priority, double? ResponseMinutes, double? ResolutionMinutes);

public sealed record DashboardTechnician(string? TechnicianId, string? Name);

/// <summary>
/// An inspection from the Maintenance service's compliance_inspections. ScheduledDate is read from scheduled_date or inspection_date
/// when a record carries one.
/// </summary>
public sealed record DashboardInspectionRecord(
    string Id,
    string? InspectionId,
    string? AssetId,
    string? AssetName,
    string? InspectionType,
    string? InspectorName,
    string? Result,
    string? Status,
    DateTime? ScheduledDate,
    DateTime? NextInspectionDate,
    DateTime? CreatedAt,
    DateTime? UpdatedAt);

/// <summary>
/// An inspection finding, read from the Maintenance service's issue_reports (issue_type is the category).
/// InspectionId, DueDate and Owner are read when a record carries them (inspection_id, due_date, assigned_to or owner).
/// </summary>
public sealed record DashboardFinding(
    string Id,
    string? FindingId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? Severity,
    string? Status,
    string? Description,
    string? ReportedBy,
    string? Owner,
    string? InspectionId,
    DateTime? DueDate,
    DateTime? CreatedAt,
    DateTime? UpdatedAt);

/// <summary>A severity from the Inspection service master data; ResolutionSla is text such as "24 hours" or "3 days".</summary>
public sealed record DashboardSeverityRule(string? Name, int Score, string? ResolutionSla);

/// <summary>
/// A production order: a job from the WIP service's job_masters. Product, line, work centre, plant, stage, quantities, WIP value and
/// actual dates are read when a job carries them (product_name / product, production_line / line, work_center, plant, stage,
/// planned_quantity / quantity, completed_quantity, rejected_quantity / scrap_quantity, unit, wip_value, actual_start_date,
/// actual_end_date / completed_date).
/// </summary>
public sealed record DashboardJob(
    string Id,
    string? JobId,
    string? JobName,
    string? AssetId,
    string? AssetCategory,
    string? LocationId,
    string? WorkType,
    string? Priority,
    string? Status,
    double? ProgressPercentage,
    DateTime? PlannedStartDate,
    DateTime? PlannedEndDate,
    DateTime? ActualStartDate,
    DateTime? ActualEndDate,
    string? Product,
    string? ProductionLine,
    string? WorkCenter,
    string? Plant,
    string? Stage,
    double? PlannedQuantity,
    double? CompletedQuantity,
    double? RejectedQuantity,
    string? Unit,
    double? WipValue,
    DateTime? CreatedAt,
    DateTime? UpdatedAt);

public sealed record DashboardJobTask(string? JobId, string? AssetId, DateTime? ActualStart, DateTime? ActualEnd, DateTime? PlannedStart, DateTime? PlannedEnd);

public sealed record DashboardMaterialUse(string? JobId, string? AssetId, double QuantityPlanned, double QuantityUsed, double Cost, DateTime? CreatedAt);

/// <summary>An issue raised against a job (WIP issue_masters).</summary>
public sealed record DashboardJobIssue(string? JobId, string? AssetId, string? IssueType, string? Severity, string? Description, DateTime? ReportedDate, DateTime? ClosedDate);

/// <summary>A configured WIP status; IsClosed marks statuses that finish a job.</summary>
public sealed record DashboardWipStatus(string? Name, string? Code, bool IsClosed);

public sealed record DashboardLocationMaster(string? LocationId, string? Site, string? Building, string? Floor, string? Zone);

public sealed record DashboardInspectionFilterOptions(IReadOnlyList<DashboardOption> InspectionTypes, IReadOnlyList<DashboardOption> Inspectors);

public sealed record DashboardCost(string? AssetId, double Total);

public sealed record DashboardHealthAssessment(string? AssetId, DateTime AssessmentDate, double? HealthScore, string? OverallCondition);

public sealed record DashboardInspection(string AssetId, DateTime? LastInspectedAt, string? LastResult, DateTime? NextInspectionDate);

public sealed record DashboardPreventiveSchedule(string? AssetId, DateTime? NextDueDate);

/// <summary>A downtime event; End is null while the asset is still down.</summary>
public sealed record DashboardDowntime(string? AssetId, DateTime Start, DateTime? End, string? Reason, string? ImpactLevel);

public sealed record DashboardPredictiveAlert(string? AssetId, string? RiskLevel);

public sealed record DashboardSparePart(
    string? AssetId,
    double QuantityInStock,
    double UnitCost,
    string? PartId = null,
    string? PartName = null,
    double? MinimumStockLevel = null);

public sealed record DashboardOption(string Value, string Label);

public sealed record DashboardFilterOptions(
    IReadOnlyList<DashboardOption> Organizations,
    IReadOnlyList<DashboardOption> Locations,
    IReadOnlyList<DashboardOption> AssetCategories,
    IReadOnlyList<DashboardOption> AssetTypes);

/// <summary>
/// Reads the records Interactive Dashboard widgets summarise: the Asset service's asset register and condition assessments,
/// and the Maintenance service's work orders, costs, inspections, preventive schedules and spare parts. Nothing is written.
/// Every asset-linked query takes the asset keys the filter bar selected, or null for every asset in the tenant.
/// </summary>
public interface IDashboardDataRepository
{
    Task<IReadOnlyList<DashboardAsset>> GetAssetsAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    /// <summary>Work orders scheduled (or, without a schedule, created) in [fromUtc, toUtc); openOnly drops completed, closed and cancelled ones.</summary>
    Task<IReadOnlyList<DashboardWorkOrder>> GetWorkOrdersAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime? fromUtc, DateTime? toUtc, bool openOnly, CancellationToken cancellationToken = default);

    /// <summary>Maintenance cost records created in [fromUtc, toUtc).</summary>
    Task<IReadOnlyList<DashboardCost>> GetMaintenanceCostsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>Condition assessments dated before toUtc.</summary>
    Task<IReadOnlyList<DashboardHealthAssessment>> GetHealthAssessmentsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>One row per asset: its latest compliance inspection and its next inspection date.</summary>
    Task<IReadOnlyList<DashboardInspection>> GetLatestInspectionsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardPreventiveSchedule>> GetPreventiveSchedulesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    /// <summary>Spare parts created before toUtc (parts without a created date count as always held).</summary>
    Task<IReadOnlyList<DashboardSparePart>> GetSparePartsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>Downtime events that overlap [fromUtc, toUtc), including ones still open.</summary>
    Task<IReadOnlyList<DashboardDowntime>> GetDowntimeAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    /// <summary>Maintenance cost records created in [fromUtc, toUtc), with their cost breakdown.</summary>
    Task<IReadOnlyList<DashboardCostRecord>> GetCostRecordsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardSlaRule>> GetSlaRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardTechnician>> GetTechniciansAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    /// <summary>Every inspection of the selected assets (history is needed for compliance as of past dates).</summary>
    Task<IReadOnlyList<DashboardInspectionRecord>> GetInspectionRecordsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    /// <summary>Every finding of the selected assets.</summary>
    Task<IReadOnlyList<DashboardFinding>> GetFindingsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardSeverityRule>> GetSeverityRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    Task<DashboardInspectionFilterOptions> GetInspectionFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Every job of the selected assets (jobs without an asset only when no asset filter is applied).</summary>
    Task<IReadOnlyList<DashboardJob>> GetJobsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardJobTask>> GetJobTasksAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardMaterialUse>> GetMaterialUsesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardJobIssue>> GetJobIssuesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardWipStatus>> GetWipStatusesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardLocationMaster>> GetLocationMastersAsync(DashboardDataScope scope, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DashboardPredictiveAlert>> GetPredictiveAlertsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default);

    Task<DashboardFilterOptions> GetFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class DashboardDataRepository : IDashboardDataRepository
{
    public const string AssetCollection = "AssetRegistration";
    public const string AssessmentCollection = "AssetConditionAssessment";
    public const string WorkOrderCollection = "work_orders";
    public const string CostCollection = "cost_tracking_records";
    public const string InspectionCollection = "compliance_inspections";
    public const string PreventiveCollection = "preventive_maintenance_schedules";
    public const string SparePartCollection = "spare_parts";
    public const string OrganizationCollection = "master_organizations";
    public const string DowntimeCollection = "downtime_records";
    public const string PredictiveCollection = "predictive_maintenance_alerts";
    public const string SlaCollection = "sla_masters";
    public const string TechnicianCollection = "technicians";
    public const string FindingCollection = "issue_reports";
    public const string SeverityCollection = "severities";
    public const string JobCollection = "job_masters";
    public const string TaskCollection = "task_masters";
    public const string MaterialCollection = "material_consumptions";
    public const string JobIssueCollection = "issue_masters";
    public const string WipStatusCollection = "wip_status_masters";
    public const string LocationMasterCollection = "location_masters";

    private static readonly BsonRegularExpression ClosedStatus = new("^\\s*(completed|closed|cancelled|canceled)\\s*$", "i");

    private readonly IMongoDatabase _database;

    public DashboardDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<IReadOnlyList<DashboardAsset>> GetAssetsAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(scope.TenantId, scope.ClientId);

        if (!string.IsNullOrWhiteSpace(scope.Location))
        {
            var location = ExactIgnoreCase(scope.Location);
            match.Add("$and", new BsonArray
            {
                new BsonDocument("$or", new BsonArray
                {
                    new BsonDocument("location_assignment.location.site_name", location),
                    new BsonDocument("location_assignment.location.site_id", scope.Location.Trim()),
                    new BsonDocument("location_assignment.location.location_path", location)
                })
            });
        }

        if (!string.IsNullOrWhiteSpace(scope.AssetCategory))
        {
            match["classification.category"] = ExactIgnoreCase(scope.AssetCategory);
        }

        if (!string.IsNullOrWhiteSpace(scope.AssetType))
        {
            match["classification.asset_type"] = ExactIgnoreCase(scope.AssetType);
        }

        if (!string.IsNullOrWhiteSpace(scope.Organization))
        {
            var organizationMatch = await OrganizationMatchAsync(scope, cancellationToken);
            if (organizationMatch is null)
            {
                return [];
            }

            match.Add("$or", organizationMatch);
        }

        var projection = new BsonDocument
        {
            { "asset_registration_id", 1 },
            { "status", 1 },
            { "created_at", 1 },
            { "basic_information.asset_name", 1 },
            { "basic_information.status", 1 },
            { "basic_information.criticality", 1 },
            { "basic_information.condition", 1 },
            { "classification.category", 1 },
            { "classification.criticality", 1 },
            { "classification.asset_type", 1 },
            { "additional_information.operational.utilization", 1 },
            { "additional_information.operational.operating_hours_per_day", 1 },
            { "location_assignment.location.site_name", 1 },
            { "location_assignment.location.location_path", 1 },
            { "additional_information.operational.next_maintenance_date", 1 }
        };

        var documents = await _database.GetCollection<BsonDocument>(AssetCollection)
            .Find(match)
            .Project(projection)
            .ToListAsync(cancellationToken);

        return documents.Select(document =>
        {
            var site = Text(document, "location_assignment.location.site_name");
            return new DashboardAsset(
                document["_id"].ToString()!,
                Text(document, "asset_registration_id"),
                Text(document, "basic_information.asset_name"),
                Text(document, "classification.category"),
                Text(document, "basic_information.status") ?? Text(document, "status"),
                Text(document, "basic_information.criticality") ?? Text(document, "classification.criticality"),
                Text(document, "basic_information.condition"),
                site ?? Text(document, "location_assignment.location.location_path"),
                site,
                Date(document, "created_at"),
                Date(document, "additional_information.operational.next_maintenance_date"),
                Text(document, "classification.asset_type"),
                Text(document, "additional_information.operational.utilization"),
                Number(document, "additional_information.operational.operating_hours_per_day"));
        }).ToList();
    }

    public async Task<IReadOnlyList<DashboardWorkOrder>> GetWorkOrdersAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime? fromUtc,
        DateTime? toUtc,
        bool openOnly,
        CancellationToken cancellationToken = default)
    {
        var match = LinkedMatch(scope, assetKeys, "asset_id");

        if (fromUtc is not null || toUtc is not null)
        {
            var range = Range(fromUtc, toUtc);
            match.Add("$and", new BsonArray
            {
                new BsonDocument("$or", new BsonArray
                {
                    new BsonDocument("scheduled_date", range),
                    new BsonDocument { { "scheduled_date", BsonNull.Value }, { "created_at", range } }
                })
            });
        }

        if (openOnly)
        {
            match["status"] = new BsonDocument("$not", ClosedStatus);
        }

        var documents = await _database.GetCollection<BsonDocument>(WorkOrderCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "work_order_id", 1 }, { "asset_id", 1 }, { "asset_name", 1 }, { "status", 1 }, { "priority", 1 }, { "work_type", 1 },
                { "scheduled_date", 1 }, { "assigned_technician", 1 }, { "created_at", 1 }, { "updated_at", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardWorkOrder(
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "status"),
            Text(document, "priority"),
            Text(document, "work_type"),
            Date(document, "scheduled_date"),
            Date(document, "created_at"),
            document["_id"].ToString(),
            Text(document, "work_order_id"),
            Text(document, "assigned_technician"),
            Date(document, "updated_at"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardCost>> GetMaintenanceCostsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var match = LinkedMatch(scope, assetKeys, "asset_id");
        match["created_at"] = Range(fromUtc, toUtc);

        var documents = await _database.GetCollection<BsonDocument>(CostCollection)
            .Find(match)
            .Project(new BsonDocument { { "asset_id", 1 }, { "total_maintenance_cost", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardCost(Text(document, "asset_id"), Number(document, "total_maintenance_cost") ?? 0)).ToList();
    }

    public async Task<IReadOnlyList<DashboardHealthAssessment>> GetHealthAssessmentsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        // Assessments are recorded in the Asset service and reference the asset by asset_registration_id.
        var match = LinkedMatch(scope, assetKeys, "asset_registration_id");
        match["assessment_date"] = new BsonDocument("$lt", toUtc);

        var documents = await _database.GetCollection<BsonDocument>(AssessmentCollection)
            .Find(match)
            .Project(new BsonDocument { { "asset_registration_id", 1 }, { "assessment_date", 1 }, { "health_score", 1 }, { "overall_condition", 1 } })
            .ToListAsync(cancellationToken);

        return documents
            .Where(document => Date(document, "assessment_date") is not null)
            .Select(document => new DashboardHealthAssessment(
                Text(document, "asset_registration_id"),
                Date(document, "assessment_date")!.Value,
                Number(document, "health_score"),
                Text(document, "overall_condition")))
            .ToList();
    }

    public async Task<IReadOnlyList<DashboardInspection>> GetLatestInspectionsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var pipeline = new[]
        {
            new BsonDocument("$match", LinkedMatch(scope, assetKeys, "asset_id")),
            new BsonDocument("$sort", new BsonDocument("created_at", -1)),
            new BsonDocument("$group", new BsonDocument
            {
                { "_id", "$asset_id" },
                { "last_inspected_at", new BsonDocument("$first", "$created_at") },
                { "last_result", new BsonDocument("$first", "$result") },
                { "next_inspection_date", new BsonDocument("$max", "$next_inspection_date") }
            })
        };

        var documents = await (await _database.GetCollection<BsonDocument>(InspectionCollection)
                .AggregateAsync<BsonDocument>(pipeline, cancellationToken: cancellationToken))
            .ToListAsync(cancellationToken);

        return documents
            .Where(document => document["_id"].IsString)
            .Select(document => new DashboardInspection(
                document["_id"].AsString,
                Date(document, "last_inspected_at"),
                Text(document, "last_result"),
                Date(document, "next_inspection_date")))
            .ToList();
    }

    public async Task<IReadOnlyList<DashboardPreventiveSchedule>> GetPreventiveSchedulesAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(PreventiveCollection)
            .Find(LinkedMatch(scope, assetKeys, "asset_id"))
            .Project(new BsonDocument { { "asset_id", 1 }, { "next_due_date", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardPreventiveSchedule(Text(document, "asset_id"), Date(document, "next_due_date"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardSparePart>> GetSparePartsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var match = LinkedMatch(scope, assetKeys, "asset_id");
        match.Add("$and", new BsonArray
        {
            new BsonDocument("$or", new BsonArray
            {
                new BsonDocument("created_at", new BsonDocument("$lt", toUtc)),
                new BsonDocument("created_at", BsonNull.Value)
            })
        });

        var documents = await _database.GetCollection<BsonDocument>(SparePartCollection)
            .Find(match)
            .Project(new BsonDocument { { "asset_id", 1 }, { "part_id", 1 }, { "part_name", 1 }, { "quantity_in_stock", 1 }, { "minimum_stock_level", 1 }, { "unit_cost", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardSparePart(
            Text(document, "asset_id"),
            Number(document, "quantity_in_stock") ?? 0,
            Number(document, "unit_cost") ?? 0,
            Text(document, "part_id"),
            Text(document, "part_name"),
            Number(document, "minimum_stock_level"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardDowntime>> GetDowntimeAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var match = LinkedMatch(scope, assetKeys, "asset_id");
        match["downtime_start"] = new BsonDocument("$lt", toUtc);
        match.Add("$or", new BsonArray
        {
            new BsonDocument("downtime_end", BsonNull.Value),
            new BsonDocument("downtime_end", new BsonDocument("$gt", fromUtc))
        });

        var documents = await _database.GetCollection<BsonDocument>(DowntimeCollection)
            .Find(match)
            .Project(new BsonDocument { { "asset_id", 1 }, { "downtime_start", 1 }, { "downtime_end", 1 }, { "reason_for_downtime", 1 }, { "impact_level", 1 } })
            .ToListAsync(cancellationToken);

        return documents
            .Where(document => Date(document, "downtime_start") is not null)
            .Select(document => new DashboardDowntime(
                Text(document, "asset_id"),
                Date(document, "downtime_start")!.Value,
                Date(document, "downtime_end"),
                Text(document, "reason_for_downtime"),
                Text(document, "impact_level")))
            .ToList();
    }

    public async Task<IReadOnlyList<DashboardCostRecord>> GetCostRecordsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken = default)
    {
        var match = LinkedMatch(scope, assetKeys, "asset_id");
        match["created_at"] = Range(fromUtc, toUtc);

        var documents = await _database.GetCollection<BsonDocument>(CostCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "asset_id", 1 }, { "created_at", 1 }, { "total_maintenance_cost", 1 }, { "labor_cost", 1 }, { "spare_parts_cost", 1 },
                { "budget_allocation", 1 }, { "work_order_id", 1 }, { "maintenance_type", 1 }, { "work_type", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardCostRecord(
            Text(document, "asset_id"),
            Date(document, "created_at"),
            Number(document, "total_maintenance_cost") ?? 0,
            Number(document, "labor_cost") ?? 0,
            Number(document, "spare_parts_cost") ?? 0,
            Number(document, "budget_allocation"),
            Text(document, "work_order_id"),
            Text(document, "maintenance_type") ?? Text(document, "work_type"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardSlaRule>> GetSlaRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SlaCollection)
            .Find(TenantMatch(scope.TenantId, scope.ClientId))
            .Project(new BsonDocument { { "work_type", 1 }, { "priority", 1 }, { "response_time_minutes", 1 }, { "resolution_time_minutes", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardSlaRule(
            Text(document, "work_type"),
            Text(document, "priority"),
            Number(document, "response_time_minutes"),
            Number(document, "resolution_time_minutes"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardTechnician>> GetTechniciansAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(TechnicianCollection)
            .Find(TenantMatch(scope.TenantId, scope.ClientId))
            .Project(new BsonDocument { { "technician_id", 1 }, { "name", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardTechnician(Text(document, "technician_id"), Text(document, "name"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardInspectionRecord>> GetInspectionRecordsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(InspectionCollection)
            .Find(LinkedMatch(scope, assetKeys, "asset_id"))
            .Project(new BsonDocument
            {
                { "inspection_id", 1 }, { "asset_id", 1 }, { "asset_name", 1 }, { "inspection_type", 1 }, { "inspector_name", 1 }, { "result", 1 },
                { "status", 1 }, { "scheduled_date", 1 }, { "inspection_date", 1 }, { "next_inspection_date", 1 }, { "created_at", 1 }, { "updated_at", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardInspectionRecord(
            document["_id"].ToString()!,
            Text(document, "inspection_id"),
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "inspection_type"),
            Text(document, "inspector_name"),
            Text(document, "result"),
            Text(document, "status"),
            Date(document, "scheduled_date") ?? Date(document, "inspection_date"),
            Date(document, "next_inspection_date"),
            Date(document, "created_at"),
            Date(document, "updated_at"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardFinding>> GetFindingsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(FindingCollection)
            .Find(LinkedMatch(scope, assetKeys, "asset_id"))
            .Project(new BsonDocument
            {
                { "issue_id", 1 }, { "asset_id", 1 }, { "asset_name", 1 }, { "issue_type", 1 }, { "severity", 1 }, { "status", 1 }, { "description", 1 },
                { "reported_by", 1 }, { "assigned_to", 1 }, { "owner", 1 }, { "inspection_id", 1 }, { "due_date", 1 }, { "created_at", 1 }, { "updated_at", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardFinding(
            document["_id"].ToString()!,
            Text(document, "issue_id"),
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "issue_type"),
            Text(document, "severity"),
            Text(document, "status"),
            Text(document, "description"),
            Text(document, "reported_by"),
            Text(document, "assigned_to") ?? Text(document, "owner"),
            Text(document, "inspection_id"),
            Date(document, "due_date"),
            Date(document, "created_at"),
            Date(document, "updated_at"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardSeverityRule>> GetSeverityRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SeverityCollection)
            .Find(TenantMatch(scope.TenantId, scope.ClientId))
            .Project(new BsonDocument { { "severity_name", 1 }, { "score", 1 }, { "resolution_sla", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardSeverityRule(
            Text(document, "severity_name"),
            (int)(Number(document, "score") ?? 0),
            Text(document, "resolution_sla"))).ToList();
    }

    public async Task<DashboardInspectionFilterOptions> GetInspectionFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var inspections = _database.GetCollection<BsonDocument>(InspectionCollection);
        var types = await DistinctTextAsync(inspections, "inspection_type", TenantMatch(tenantId, clientId), cancellationToken);
        var inspectors = await DistinctTextAsync(inspections, "inspector_name", TenantMatch(tenantId, clientId), cancellationToken);

        return new DashboardInspectionFilterOptions(
            types.Select(type => new DashboardOption(type, type)).ToList(),
            inspectors.Select(inspector => new DashboardOption(inspector, inspector)).ToList());
    }

    public async Task<IReadOnlyList<DashboardJob>> GetJobsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(JobCollection)
            .Find(LinkedMatch(scope, assetKeys, "asset_id"))
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardJob(
            document["_id"].ToString()!,
            Text(document, "job_id"),
            Text(document, "job_name"),
            Text(document, "asset_id"),
            Text(document, "asset_category"),
            Text(document, "location_id"),
            Text(document, "work_type"),
            Text(document, "priority"),
            Text(document, "status"),
            Number(document, "progress_percentage"),
            Date(document, "planned_start_date"),
            Date(document, "planned_end_date"),
            Date(document, "actual_start_date"),
            Date(document, "actual_end_date") ?? Date(document, "completed_date"),
            Text(document, "product_name") ?? Text(document, "product"),
            Text(document, "production_line") ?? Text(document, "line"),
            Text(document, "work_center"),
            Text(document, "plant"),
            Text(document, "stage"),
            Number(document, "planned_quantity") ?? Number(document, "quantity"),
            Number(document, "completed_quantity"),
            Number(document, "rejected_quantity") ?? Number(document, "scrap_quantity"),
            Text(document, "unit"),
            Number(document, "wip_value"),
            Date(document, "created_at"),
            Date(document, "updated_at"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardJobTask>> GetJobTasksAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string> jobIds,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(scope.TenantId, scope.ClientId);
        match["job_id"] = new BsonDocument("$in", new BsonArray(jobIds));

        var documents = await _database.GetCollection<BsonDocument>(TaskCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "job_id", 1 }, { "asset_id", 1 }, { "actual_start_time", 1 }, { "actual_end_time", 1 }, { "planned_start_time", 1 }, { "planned_end_time", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardJobTask(
            Text(document, "job_id"),
            Text(document, "asset_id"),
            Date(document, "actual_start_time"),
            Date(document, "actual_end_time"),
            Date(document, "planned_start_time"),
            Date(document, "planned_end_time"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardMaterialUse>> GetMaterialUsesAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string> jobIds,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(scope.TenantId, scope.ClientId);
        match["job_id"] = new BsonDocument("$in", new BsonArray(jobIds));

        var documents = await _database.GetCollection<BsonDocument>(MaterialCollection)
            .Find(match)
            .Project(new BsonDocument { { "job_id", 1 }, { "asset_id", 1 }, { "quantity_planned", 1 }, { "quantity_used", 1 }, { "cost", 1 }, { "created_at", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardMaterialUse(
            Text(document, "job_id"),
            Text(document, "asset_id"),
            Number(document, "quantity_planned") ?? 0,
            Number(document, "quantity_used") ?? 0,
            Number(document, "cost") ?? 0,
            Date(document, "created_at"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardJobIssue>> GetJobIssuesAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string> jobIds,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(scope.TenantId, scope.ClientId);
        match["job_id"] = new BsonDocument("$in", new BsonArray(jobIds));

        var documents = await _database.GetCollection<BsonDocument>(JobIssueCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "job_id", 1 }, { "asset_id", 1 }, { "issue_type", 1 }, { "severity", 1 }, { "description", 1 }, { "reported_date", 1 }, { "closed_date", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardJobIssue(
            Text(document, "job_id"),
            Text(document, "asset_id"),
            Text(document, "issue_type"),
            Text(document, "severity"),
            Text(document, "description"),
            Date(document, "reported_date"),
            Date(document, "closed_date"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardWipStatus>> GetWipStatusesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(WipStatusCollection)
            .Find(TenantMatch(scope.TenantId, scope.ClientId))
            .Project(new BsonDocument { { "status_name", 1 }, { "status_code", 1 }, { "is_closed_status", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardWipStatus(
            Text(document, "status_name"),
            Text(document, "status_code"),
            document.TryGetValue("is_closed_status", out var closed) && closed.IsBoolean && closed.AsBoolean)).ToList();
    }

    public async Task<IReadOnlyList<DashboardLocationMaster>> GetLocationMastersAsync(DashboardDataScope scope, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(LocationMasterCollection)
            .Find(TenantMatch(scope.TenantId, scope.ClientId))
            .Project(new BsonDocument { { "location_id", 1 }, { "site", 1 }, { "building", 1 }, { "floor", 1 }, { "zone", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardLocationMaster(
            Text(document, "location_id"),
            Text(document, "site"),
            Text(document, "building"),
            Text(document, "floor"),
            Text(document, "zone"))).ToList();
    }

    public async Task<IReadOnlyList<DashboardPredictiveAlert>> GetPredictiveAlertsAsync(
        DashboardDataScope scope,
        IReadOnlyCollection<string>? assetKeys,
        CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(PredictiveCollection)
            .Find(LinkedMatch(scope, assetKeys, "asset_id"))
            .Project(new BsonDocument { { "asset_id", 1 }, { "risk_level", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new DashboardPredictiveAlert(Text(document, "asset_id"), Text(document, "risk_level"))).ToList();
    }

    public async Task<DashboardFilterOptions> GetFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var organizations = await _database.GetCollection<BsonDocument>(OrganizationCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument("organization_name", 1))
            .ToListAsync(cancellationToken);

        var assets = _database.GetCollection<BsonDocument>(AssetCollection);
        var locations = await DistinctTextAsync(assets, "location_assignment.location.site_name", TenantMatch(tenantId, clientId), cancellationToken);
        var categories = await DistinctTextAsync(assets, "classification.category", TenantMatch(tenantId, clientId), cancellationToken);
        var assetTypes = await DistinctTextAsync(assets, "classification.asset_type", TenantMatch(tenantId, clientId), cancellationToken);

        return new DashboardFilterOptions(
            organizations
                .Select(document => (Id: document["_id"].ToString()!, Name: Text(document, "organization_name")))
                .Where(organization => !string.IsNullOrWhiteSpace(organization.Name))
                .OrderBy(organization => organization.Name, StringComparer.OrdinalIgnoreCase)
                .Select(organization => new DashboardOption(organization.Id, organization.Name!))
                .ToList(),
            locations.Select(location => new DashboardOption(location, location)).ToList(),
            categories.Select(category => new DashboardOption(category, category)).ToList(),
            assetTypes.Select(assetType => new DashboardOption(assetType, assetType)).ToList());
    }

    /// <summary>
    /// An organization (by _id or name) covers the assets at its sites or in its business units.
    /// Null when no such organization exists, so the dashboard shows no assets rather than all of them.
    /// </summary>
    private async Task<BsonArray?> OrganizationMatchAsync(DashboardDataScope scope, CancellationToken cancellationToken)
    {
        var value = scope.Organization!.Trim();
        var byName = new BsonDocument("organization_name", ExactIgnoreCase(value));
        var lookup = ObjectId.TryParse(value, out var objectId)
            ? new BsonDocument("$or", new BsonArray { new BsonDocument("_id", objectId), byName })
            : byName;

        var match = TenantMatch(scope.TenantId, scope.ClientId);
        match.Add("$and", new BsonArray { lookup });

        var organization = await _database.GetCollection<BsonDocument>(OrganizationCollection)
            .Find(match)
            .FirstOrDefaultAsync(cancellationToken);

        if (organization is null)
        {
            return null;
        }

        static (BsonArray Ids, BsonArray Names) References(BsonDocument document, string field)
        {
            var ids = new BsonArray();
            var names = new BsonArray();
            if (document.TryGetValue(field, out var value) && value.IsBsonArray)
            {
                foreach (var reference in value.AsBsonArray.OfType<BsonDocument>())
                {
                    if (Text(reference, "id") is { } id)
                    {
                        ids.Add(id);
                    }

                    if (Text(reference, "name") is { } name)
                    {
                        names.Add(name);
                    }
                }
            }

            return (ids, names);
        }

        var (siteIds, siteNames) = References(organization, "sites");
        var (unitIds, unitNames) = References(organization, "business_units");

        return new BsonArray
        {
            new BsonDocument("location_assignment.location.site_id", new BsonDocument("$in", siteIds)),
            new BsonDocument("location_assignment.location.site_name", new BsonDocument("$in", siteNames)),
            new BsonDocument("classification.business_unit", new BsonDocument("$in", new BsonArray(unitIds.Concat(unitNames))))
        };
    }

    private static async Task<List<string>> DistinctTextAsync(
        IMongoCollection<BsonDocument> collection,
        string field,
        BsonDocument match,
        CancellationToken cancellationToken)
    {
        var values = await (await collection.DistinctAsync<BsonValue>(field, match, cancellationToken: cancellationToken)).ToListAsync(cancellationToken);

        return values
            .Where(value => value.IsString && !string.IsNullOrWhiteSpace(value.AsString))
            .Select(value => value.AsString.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static BsonDocument TenantMatch(string? tenantId, string? clientId)
    {
        var match = new BsonDocument("is_deleted", new BsonDocument("$ne", true));
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            match["tenant_id"] = tenantId.Trim();
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            match["client_id"] = clientId.Trim();
        }

        return match;
    }

    private static BsonDocument LinkedMatch(DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, string assetField)
    {
        var match = TenantMatch(scope.TenantId, scope.ClientId);
        if (assetKeys is not null)
        {
            match[assetField] = new BsonDocument("$in", new BsonArray(assetKeys));
        }

        return match;
    }

    private static BsonDocument Range(DateTime? fromUtc, DateTime? toUtc)
    {
        var range = new BsonDocument();
        if (fromUtc is not null)
        {
            range["$gte"] = fromUtc.Value;
        }

        if (toUtc is not null)
        {
            range["$lt"] = toUtc.Value;
        }

        return range;
    }

    private static BsonRegularExpression ExactIgnoreCase(string value) => new($"^{Regex.Escape(value.Trim())}$", "i");

    private static BsonValue? Value(BsonDocument document, string path)
    {
        BsonValue current = document;
        foreach (var part in path.Split('.'))
        {
            if (!current.IsBsonDocument || !current.AsBsonDocument.TryGetValue(part, out current!))
            {
                return null;
            }
        }

        return current;
    }

    private static string? Text(BsonDocument document, string path) =>
        Value(document, path) is { } value && !value.IsBsonNull && value.ToString() is { Length: > 0 } text && !string.IsNullOrWhiteSpace(text)
            ? (value.IsString ? value.AsString.Trim() : text)
            : null;

    private static DateTime? Date(BsonDocument document, string path) =>
        Value(document, path) is { } value && value.IsValidDateTime ? value.ToUniversalTime() : null;

    private static double? Number(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsNumeric: true } value => value.ToDouble(),
        { IsString: true } value when double.TryParse(value.AsString, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };
}
