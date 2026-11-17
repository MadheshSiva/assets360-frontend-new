using System.Globalization;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

// ----- Saved views (Save View on Compliance Analytics) -----

public interface IComplianceAnalyticsViewRepository : IMongoRepository<ComplianceAnalyticsView>
{
    Task<ComplianceAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default);

    /// <summary>The owner's views in the tenant, default first then by name.</summary>
    Task<IReadOnlyList<ComplianceAnalyticsView>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Clears the default flag on the owner's other views.</summary>
    Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default);
}

public sealed class ComplianceAnalyticsViewRepository
    : MongoRepository<ComplianceAnalyticsView>, IComplianceAnalyticsViewRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "ComplianceAnalyticsView";

    public ComplianceAnalyticsViewRepository(IMongoDatabase database)
        : base(database.GetCollection<ComplianceAnalyticsView>(CollectionName))
    {
    }

    public async Task<ComplianceAnalyticsView?> GetByViewIdAsync(string viewId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(viewId))
        {
            return null;
        }

        return await Collection.Find(view => view.ViewId == viewId.Trim() && !view.IsDeleted).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ComplianceAnalyticsView>> GetOwnedAsync(string? ownerId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await Collection
            .Find(OwnedFilter(ownerId, tenantId, clientId))
            .Sort(Builders<ComplianceAnalyticsView>.Sort.Descending(view => view.IsDefault).Ascending(view => view.ViewName))
            .ToListAsync(cancellationToken);

    public async Task ClearDefaultAsync(string? ownerId, string? tenantId, string? clientId, string exceptId, CancellationToken cancellationToken = default)
    {
        var filter = OwnedFilter(ownerId, tenantId, clientId) & Builders<ComplianceAnalyticsView>.Filter.Ne(view => view.Id, exceptId);
        await Collection.UpdateManyAsync(filter, Builders<ComplianceAnalyticsView>.Update.Set(view => view.IsDefault, false), cancellationToken: cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<ComplianceAnalyticsView>(
                Builders<ComplianceAnalyticsView>.IndexKeys.Ascending(view => view.ViewId),
                new CreateIndexOptions { Name = "ux_compliance_analytics_view_view_id", Unique = true }),
            new CreateIndexModel<ComplianceAnalyticsView>(
                Builders<ComplianceAnalyticsView>.IndexKeys.Ascending(view => view.TenantId).Ascending(view => view.OwnerId).Ascending(view => view.ViewName),
                new CreateIndexOptions { Name = "ix_compliance_analytics_view_tenant_id_owner_id_view_name" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }

    private static FilterDefinition<ComplianceAnalyticsView> OwnedFilter(string? ownerId, string? tenantId, string? clientId)
    {
        var builder = Builders<ComplianceAnalyticsView>.Filter;
        var filter = builder.Eq(view => view.IsDeleted, false) & builder.Eq(view => view.OwnerId, ownerId);
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(view => view.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(view => view.ClientId, clientId.Trim());
        }

        return filter;
    }
}

// ----- Action plans ("Create action plan") -----

public sealed record ComplianceActionPlanQuery(
    string? TenantId,
    string? ClientId,
    string? Status,
    string? SourceType,
    string? SourceId,
    string? Location,
    string? Search,
    int Page,
    int PageSize);

public interface IComplianceActionPlanRepository : IMongoRepository<ComplianceActionPlan>
{
    Task<ComplianceActionPlan?> GetByActionPlanIdAsync(string actionPlanId, CancellationToken cancellationToken = default);

    /// <summary>Plans in the tenant, soonest due first.</summary>
    Task<(IReadOnlyList<ComplianceActionPlan> Items, long Total)> QueryAsync(ComplianceActionPlanQuery query, CancellationToken cancellationToken = default);
}

public sealed class ComplianceActionPlanRepository
    : MongoRepository<ComplianceActionPlan>, IComplianceActionPlanRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "compliance_action_plans";

    public ComplianceActionPlanRepository(IMongoDatabase database)
        : base(database.GetCollection<ComplianceActionPlan>(CollectionName))
    {
    }

    public async Task<ComplianceActionPlan?> GetByActionPlanIdAsync(string actionPlanId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(actionPlanId))
        {
            return null;
        }

        return await Collection.Find(plan => plan.ActionPlanId == actionPlanId.Trim() && !plan.IsDeleted).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<(IReadOnlyList<ComplianceActionPlan> Items, long Total)> QueryAsync(ComplianceActionPlanQuery query, CancellationToken cancellationToken = default)
    {
        var builder = Builders<ComplianceActionPlan>.Filter;
        var filter = builder.Eq(plan => plan.IsDeleted, false);
        if (!string.IsNullOrWhiteSpace(query.TenantId))
        {
            filter &= builder.Eq(plan => plan.TenantId, query.TenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.ClientId))
        {
            filter &= builder.Eq(plan => plan.ClientId, query.ClientId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            filter &= builder.Eq(plan => plan.Status, query.Status.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.SourceType))
        {
            filter &= builder.Eq(plan => plan.SourceType, query.SourceType.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.SourceId))
        {
            filter &= builder.Eq(plan => plan.SourceId, query.SourceId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Location))
        {
            filter &= builder.Regex(plan => plan.Location, new BsonRegularExpression($"^{System.Text.RegularExpressions.Regex.Escape(query.Location.Trim())}$", "i"));
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = new BsonRegularExpression(System.Text.RegularExpressions.Regex.Escape(query.Search.Trim()), "i");
            filter &= builder.Or(
                builder.Regex(plan => plan.Title, term),
                builder.Regex(plan => plan.Owner, term),
                builder.Regex(plan => plan.ActionPlanId, term),
                builder.Regex(plan => plan.SourceId, term));
        }

        var total = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        var items = await Collection
            .Find(filter)
            .Sort(Builders<ComplianceActionPlan>.Sort.Ascending(plan => plan.DueDate).Ascending(plan => plan.ActionPlanId))
            .Skip((query.Page - 1) * query.PageSize)
            .Limit(query.PageSize)
            .ToListAsync(cancellationToken);

        return (items, total);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<ComplianceActionPlan>(
                Builders<ComplianceActionPlan>.IndexKeys.Ascending(plan => plan.ActionPlanId),
                new CreateIndexOptions { Name = "ux_compliance_action_plans_action_plan_id", Unique = true }),
            new CreateIndexModel<ComplianceActionPlan>(
                Builders<ComplianceActionPlan>.IndexKeys.Ascending(plan => plan.TenantId).Ascending(plan => plan.Status).Ascending(plan => plan.DueDate),
                new CreateIndexOptions { Name = "ix_compliance_action_plans_tenant_id_status_due_date" }),
            new CreateIndexModel<ComplianceActionPlan>(
                Builders<ComplianceActionPlan>.IndexKeys.Ascending(plan => plan.SourceType).Ascending(plan => plan.SourceId),
                new CreateIndexOptions { Name = "ix_compliance_action_plans_source_type_source_id" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }
}

// ----- Read-only compliance records -----

/// <summary>
/// A compliance obligation check: an inspection from the Inspection service's inspections or the Maintenance service's
/// compliance_inspections. Regulation is the reference standard; Category / Type are the inspection category and type.
/// Result is read when a record carries one (Pass, Fail, Conditional, …).
/// </summary>
public sealed record ComplianceInspectionRecord(
    string Id,
    string? Code,
    string? AssetId,
    string? AssetName,
    string? Type,
    string? Category,
    string? Regulation,
    string? Site,
    string? Location,
    string? Status,
    string? Result,
    string? Priority,
    DateTime? DueDate,
    DateTime? CompletedAt,
    DateTime? CreatedAt);

/// <summary>An inspection / audit finding (Inspection service inspection_findings) with its corrective action.</summary>
public sealed record ComplianceFindingRecord(
    string Id,
    string? Code,
    string? InspectionCode,
    string? AssetId,
    string? AssetName,
    string? Title,
    string? Severity,
    string? Status,
    string? CorrectiveAction,
    string? WorkOrder,
    string? Owner,
    DateTime? DueDate,
    DateTime? CreatedAt,
    DateTime? ClosedAt);

/// <summary>
/// Something that expires: a permit (WIP permit_masters), a calibration certificate (calibration_instruments), a person's
/// certification (master_technicians / master_employees) or an asset document with an expiry date (AssetDocument).
/// Type is Permits, Certifications, Licenses or Other.
/// </summary>
public sealed record ComplianceExpiryRecord(
    string Id,
    string Reference,
    string Name,
    string Type,
    string Source,
    string? AssetId,
    string? Site,
    string? Category,
    DateTime? ExpiresAt,
    string? Status);

/// <summary>A preventive maintenance schedule (Maintenance service preventive_maintenance_schedules).</summary>
public sealed record CompliancePreventiveRecord(
    string Id,
    string? ScheduleId,
    string? Name,
    string? AssetId,
    string? AssetName,
    string? Site,
    string? Priority,
    string? Status,
    string? AssignedTo,
    DateTime? NextDueDate);

/// <summary>A regulation from Master Data Management (master_regulations); Category is e.g. Safety or Environment.</summary>
public sealed record ComplianceRegulationRecord(string Name, string? Code, string? Category, IReadOnlyList<string> StandardCodes);

/// <summary>An inspection type and its category (inspection_types).</summary>
public sealed record ComplianceInspectionTypeRecord(string Name, string? Category);

public sealed record ComplianceRecords(
    IReadOnlyList<ComplianceInspectionRecord> Inspections,
    IReadOnlyList<ComplianceFindingRecord> Findings,
    IReadOnlyList<ComplianceExpiryRecord> Expiries,
    IReadOnlyList<CompliancePreventiveRecord> Preventive,
    IReadOnlyList<ComplianceRegulationRecord> Regulations,
    IReadOnlyList<ComplianceInspectionTypeRecord> InspectionTypes);

/// <summary>Reads the records Compliance Analytics summarises. Nothing is written.</summary>
public interface IComplianceAnalyticsDataRepository
{
    /// <summary>Every compliance record in the tenant; the caller applies the filter bar.</summary>
    Task<ComplianceRecords> GetRecordsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ComplianceRegulationRecord>> GetRegulationsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Distinct sites named on inspections (site_name, else location).</summary>
    Task<IReadOnlyList<string>> GetSitesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Distinct reference standards named on inspections.</summary>
    Task<IReadOnlyList<string>> GetReferenceStandardsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class ComplianceAnalyticsDataRepository : IComplianceAnalyticsDataRepository
{
    public const string InspectionCollection = "inspections";
    public const string MaintenanceInspectionCollection = "compliance_inspections";
    public const string FindingCollection = "inspection_findings";
    public const string CalibrationCollection = "calibration_instruments";
    public const string PermitCollection = "permit_masters";
    public const string AssetDocumentCollection = "AssetDocument";
    public const string TechnicianCollection = "master_technicians";
    public const string EmployeeCollection = "master_employees";
    public const string PreventiveCollection = "preventive_maintenance_schedules";
    public const string RegulationCollection = "master_regulations";
    public const string InspectionTypeCollection = "inspection_types";

    private readonly IMongoDatabase _database;

    public ComplianceAnalyticsDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<ComplianceRecords> GetRecordsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var inspections = ReadAsync(InspectionCollection, tenantId, clientId, cancellationToken);
        var maintenanceInspections = ReadAsync(MaintenanceInspectionCollection, tenantId, clientId, cancellationToken);
        var findings = ReadAsync(FindingCollection, tenantId, clientId, cancellationToken);
        var calibrations = ReadAsync(CalibrationCollection, tenantId, clientId, cancellationToken);
        var permits = ReadAsync(PermitCollection, tenantId, clientId, cancellationToken);
        var documents = ReadAsync(AssetDocumentCollection, tenantId, clientId, cancellationToken, new BsonDocument("expiry_date", new BsonDocument("$ne", BsonNull.Value)));
        var technicians = ReadAsync(TechnicianCollection, tenantId, clientId, cancellationToken, new BsonDocument("certifications.0", new BsonDocument("$exists", true)));
        var employees = ReadAsync(EmployeeCollection, tenantId, clientId, cancellationToken, new BsonDocument("certifications.0", new BsonDocument("$exists", true)));
        var preventive = ReadAsync(PreventiveCollection, tenantId, clientId, cancellationToken);
        var regulations = GetRegulationsAsync(tenantId, clientId, cancellationToken);
        var types = ReadAsync(InspectionTypeCollection, tenantId, clientId, cancellationToken);

        await Task.WhenAll(inspections, maintenanceInspections, findings, calibrations, permits, documents, technicians, employees, preventive, regulations, types);

        var inspectionRows = (await inspections).Select(document => new ComplianceInspectionRecord(
                document["_id"].ToString()!,
                Text(document, "inspection_code"),
                Text(document, "asset_code") ?? Text(document, "asset_id"),
                Text(document, "asset_name"),
                Text(document, "inspection_type_name") ?? Text(document, "type_short"),
                Text(document, "category"),
                Text(document, "reference_standard") ?? Text(document, "regulation"),
                Text(document, "site_name"),
                Text(document, "location"),
                Text(document, "status"),
                Text(document, "result") ?? Text(document, "overall_result"),
                Text(document, "priority"),
                Date(document, "due_date") ?? Date(document, "scheduled_start"),
                Date(document, "completed_at"),
                Date(document, "created_at")))
            .Concat((await maintenanceInspections).Select(document => new ComplianceInspectionRecord(
                document["_id"].ToString()!,
                Text(document, "inspection_id"),
                Text(document, "asset_id"),
                Text(document, "asset_name"),
                Text(document, "inspection_type"),
                Text(document, "category"),
                Text(document, "regulation") ?? Text(document, "reference_standard"),
                Text(document, "site_name") ?? Text(document, "site"),
                Text(document, "location"),
                Text(document, "status"),
                Text(document, "result"),
                Text(document, "priority"),
                Date(document, "scheduled_date") ?? Date(document, "inspection_date") ?? Date(document, "due_date"),
                Date(document, "completed_at") ?? Date(document, "inspection_date"),
                Date(document, "created_at"))))
            .ToList();

        var findingRows = (await findings).Select(document => new ComplianceFindingRecord(
            document["_id"].ToString()!,
            Text(document, "finding_code"),
            Text(document, "inspection_code"),
            Text(document, "asset_code") ?? Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "title") ?? Text(document, "observation"),
            Text(document, "severity"),
            Text(document, "status"),
            Text(document, "corrective_action"),
            Text(document, "work_order"),
            Text(document, "owner") ?? Text(document, "assigned_to"),
            Date(document, "due_date"),
            Date(document, "created_at"),
            Date(document, "closed_at") ?? Date(document, "verified_at"))).ToList();

        var expiries = new List<ComplianceExpiryRecord>();
        expiries.AddRange((await calibrations).Select(document =>
        {
            var name = Text(document, "instrument_name") ?? Text(document, "instrument_code") ?? "Instrument";
            return new ComplianceExpiryRecord(
                document["_id"].ToString()!,
                Text(document, "certificate") ?? Text(document, "instrument_code") ?? document["_id"].ToString()!,
                $"Calibration certificate – {name}",
                "Certifications",
                "Calibration",
                Text(document, "instrument_code"),
                Text(document, "location"),
                "Quality",
                Date(document, "next_due"),
                Text(document, "status"));
        }));

        expiries.AddRange((await permits).Select(document => new ComplianceExpiryRecord(
            document["_id"].ToString()!,
            Text(document, "permit_id") ?? document["_id"].ToString()!,
            Text(document, "permit_type") is { } permitType ? $"{permitType} permit" : "Permit",
            "Permits",
            "Permit",
            Text(document, "asset_id"),
            Text(document, "location") ?? Text(document, "site"),
            "Operations",
            Date(document, "valid_to"),
            Text(document, "status"))));

        expiries.AddRange((await documents).Select(document =>
        {
            var type = Text(document, "document_type") ?? string.Empty;
            var lowered = type.ToLowerInvariant();
            var kind = lowered.Contains("licen") ? "Licenses" : lowered.Contains("permit") ? "Permits" : lowered.Contains("certif") ? "Certifications" : "Other";
            return new ComplianceExpiryRecord(
                document["_id"].ToString()!,
                Text(document, "asset_tag") ?? Text(document, "asset_registration_id") ?? document["_id"].ToString()!,
                Text(document, "document_name") ?? (type.Length > 0 ? type : "Asset document"),
                kind,
                "Asset document",
                Text(document, "asset_registration_id"),
                null,
                type.Length > 0 ? type : null,
                Date(document, "expiry_date"),
                Text(document, "status"));
        }));

        foreach (var (rows, nameField, idField, siteField, source) in new[]
                 {
                     (await technicians, "technician_name", "technician_id", "team", "Technician"),
                     (await employees, "employee_name", "employee_id", "site", "Employee")
                 })
        {
            foreach (var document in rows)
            {
                if (!document.TryGetValue("certifications", out var list) || !list.IsBsonArray)
                {
                    continue;
                }

                var index = 0;
                foreach (var item in list.AsBsonArray.Where(item => item.IsBsonDocument).Select(item => item.AsBsonDocument))
                {
                    index++;
                    var certificate = Text(item, "name") ?? "Certification";
                    var person = Text(document, nameField) ?? Text(document, idField) ?? source;
                    expiries.Add(new ComplianceExpiryRecord(
                        $"{document["_id"]}-{index}",
                        $"{Text(document, idField) ?? document["_id"].ToString()}-{index}",
                        $"{certificate} – {person}",
                        "Certifications",
                        source,
                        null,
                        source == "Employee" ? Text(document, siteField) : null,
                        "Safety",
                        Date(item, "expiry"),
                        null));
                }
            }
        }

        var preventiveRows = (await preventive).Select(document => new CompliancePreventiveRecord(
            document["_id"].ToString()!,
            Text(document, "pm_schedule_id"),
            Text(document, "schedule_name"),
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "location"),
            Text(document, "priority"),
            Text(document, "status"),
            Text(document, "assigned_to"),
            Date(document, "next_due_date"))).ToList();

        var typeRows = (await types)
            .Select(document => (Name: Text(document, "inspection_type_name"), Category: Text(document, "category")))
            .Where(row => row.Name is not null)
            .Select(row => new ComplianceInspectionTypeRecord(row.Name!, row.Category))
            .ToList();

        return new ComplianceRecords(inspectionRows, findingRows, expiries, preventiveRows, await regulations, typeRows);
    }

    public async Task<IReadOnlyList<ComplianceRegulationRecord>> GetRegulationsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        (await ReadAsync(RegulationCollection, tenantId, clientId, cancellationToken))
            .Select(document => (Name: Text(document, "regulation_name"), Document: document))
            .Where(row => row.Name is not null)
            .Select(row => new ComplianceRegulationRecord(
                row.Name!,
                Text(row.Document, "code"),
                Text(row.Document, "category"),
                row.Document.TryGetValue("standard_codes", out var codes) && codes.IsBsonArray
                    ? codes.AsBsonArray.Where(code => code.IsString).Select(code => code.AsString).ToList()
                    : []))
            .OrderBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public async Task<IReadOnlyList<string>> GetSitesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        (await ReadAsync(InspectionCollection, tenantId, clientId, cancellationToken))
            .Select(document => Text(document, "site_name") ?? Text(document, "location"))
            .Where(site => site is not null)
            .Select(site => site!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(site => site, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public async Task<IReadOnlyList<string>> GetReferenceStandardsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        (await ReadAsync(InspectionCollection, tenantId, clientId, cancellationToken))
            .Select(document => Text(document, "reference_standard"))
            .Where(standard => standard is not null)
            .Select(standard => standard!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(standard => standard, StringComparer.OrdinalIgnoreCase)
            .ToList();

    private async Task<List<BsonDocument>> ReadAsync(
        string collection,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken,
        BsonDocument? extra = null)
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

        if (extra is not null)
        {
            match.AddRange(extra);
        }

        return await _database.GetCollection<BsonDocument>(collection).Find(match).ToListAsync(cancellationToken);
    }

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
        Value(document, path) is { } value && !value.IsBsonNull && !value.IsBsonDocument && !value.IsBsonArray
        && value.ToString() is { } text && !string.IsNullOrWhiteSpace(text)
            ? text.Trim()
            : null;

    /// <summary>A BSON date, or text such as "2026-11-12" / "2026-11-12T08:00:00" (read as UTC).</summary>
    private static DateTime? Date(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsValidDateTime: true } value => value.ToUniversalTime(),
        { IsString: true } value when DateTime.TryParse(
            value.AsString,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var parsed) => parsed,
        _ => null
    };
}
