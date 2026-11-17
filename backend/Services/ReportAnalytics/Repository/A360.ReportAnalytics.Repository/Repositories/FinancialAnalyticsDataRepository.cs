using System.Globalization;
using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>
/// The financial side of an asset register entry: purchase cost (total cost incl. tax when recorded), purchase date, cost center
/// and department, the expected lifespan and the operating profile.
/// </summary>
public sealed record FinancialAssetRecord(
    string MongoId,
    string? AssetId,
    string? AssetName,
    string? Category,
    string? AssetType,
    string? Site,
    string? Status,
    string? CostCenter,
    string? Department,
    DateTime? PurchaseDate,
    double? PurchaseCost,
    string? Currency,
    double? ExpectedLifespan,
    string? ExpectedLifespanUnit,
    double? OperatingHoursPerDay,
    string? Utilization,
    DateTime? CreatedAt)
{
    public IEnumerable<string> Keys()
    {
        yield return MongoId;
        if (!string.IsNullOrWhiteSpace(AssetId))
        {
            yield return AssetId;
        }
    }
}

/// <summary>A work order's own cost lines: labour (hours × rate), parts (quantity × unit cost) and additional (external) cost.</summary>
public sealed record FinancialWorkOrderRecord(
    string Id,
    string? WorkOrderId,
    string? AssetId,
    string? AssetName,
    string? Site,
    string? Department,
    string? WorkType,
    string? Status,
    string? Vendor,
    DateTime? CostDate,
    double Labour,
    double Parts,
    double Additional);

/// <summary>A department from Master Data: its cost center code and annual budget.</summary>
public sealed record FinancialCostCenterRecord(string? Code, string? Name, string? CostCenter, double? AnnualBudget, string? Currency);

/// <summary>Useful life and residual value of an asset type or category from Master Data (months; residual in percent).</summary>
public sealed record FinancialUsefulLifeRecord(string Kind, string? Name, string? Code, int? UsefulLifeMonths, double? ResidualPercent, string? DepreciationMethod);

/// <summary>An asset named on a disposal request, with the request's status.</summary>
public sealed record FinancialDisposalRecord(string? AssetRegistrationId, string? RequestStatus);

/// <summary>Read-only queries behind Financial Analytics, on top of what <see cref="IDashboardDataRepository"/> already reads.</summary>
public interface IFinancialAnalyticsDataRepository
{
    /// <summary>Asset register financials; mongoIds narrows them to the assets the filter bar selected (null for every asset).</summary>
    Task<IReadOnlyList<FinancialAssetRecord>> GetAssetFinancialsAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? mongoIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Work orders with cost lines, not cancelled ones. assetKeys narrows them to the selected assets (null for every work order);
    /// location also keeps work orders recorded against that site.
    /// </summary>
    Task<IReadOnlyList<FinancialWorkOrderRecord>> GetWorkOrderCostsAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? assetKeys,
        string? location,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FinancialCostCenterRecord>> GetCostCentersAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FinancialUsefulLifeRecord>> GetUsefulLivesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FinancialDisposalRecord>> GetDisposalAssetsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class FinancialAnalyticsDataRepository : IFinancialAnalyticsDataRepository
{
    public const string DepartmentCollection = "master_departments";
    public const string AssetTypeCollection = "master_asset_types";
    public const string AssetCategoryCollection = "master_asset_categories";
    public const string DisposalCollection = "AssetDisposalRequest";

    private static readonly BsonRegularExpression CancelledStatus = new("^\\s*(cancelled|canceled)\\s*$", "i");

    private readonly IMongoDatabase _database;

    public FinancialAnalyticsDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<IReadOnlyList<FinancialAssetRecord>> GetAssetFinancialsAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? mongoIds,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(tenantId, clientId);
        if (mongoIds is not null)
        {
            var ids = new BsonArray();
            foreach (var id in mongoIds)
            {
                if (ObjectId.TryParse(id, out var objectId))
                {
                    ids.Add(objectId);
                }
                else
                {
                    ids.Add(id);
                }
            }

            match["_id"] = new BsonDocument("$in", ids);
        }

        var projection = new BsonDocument
        {
            { "asset_registration_id", 1 },
            { "status", 1 },
            { "created_at", 1 },
            { "basic_information.asset_name", 1 },
            { "basic_information.status", 1 },
            { "classification.category", 1 },
            { "classification.asset_type", 1 },
            { "classification.cost_center", 1 },
            { "classification.department", 1 },
            { "location_assignment.location.site_name", 1 },
            { "location_assignment.location.location_path", 1 },
            { "purchase_warranty.purchase.purchase_date", 1 },
            { "purchase_warranty.purchase.purchase_cost", 1 },
            { "purchase_warranty.purchase.total_cost", 1 },
            { "purchase_warranty.purchase.currency", 1 },
            { "additional_information.technical.expected_lifespan", 1 },
            { "additional_information.technical.expected_lifespan_unit", 1 },
            { "additional_information.operational.operating_hours_per_day", 1 },
            { "additional_information.operational.utilization", 1 }
        };

        var documents = await _database.GetCollection<BsonDocument>(DashboardDataRepository.AssetCollection)
            .Find(match)
            .Project(projection)
            .ToListAsync(cancellationToken);

        return documents.Select(document => new FinancialAssetRecord(
            document["_id"].ToString()!,
            Text(document, "asset_registration_id"),
            Text(document, "basic_information.asset_name"),
            Text(document, "classification.category"),
            Text(document, "classification.asset_type"),
            Text(document, "location_assignment.location.site_name") ?? Text(document, "location_assignment.location.location_path"),
            Text(document, "basic_information.status") ?? Text(document, "status"),
            Text(document, "classification.cost_center"),
            Text(document, "classification.department"),
            Date(document, "purchase_warranty.purchase.purchase_date"),
            Number(document, "purchase_warranty.purchase.total_cost") ?? Number(document, "purchase_warranty.purchase.purchase_cost"),
            Text(document, "purchase_warranty.purchase.currency"),
            Number(document, "additional_information.technical.expected_lifespan"),
            Text(document, "additional_information.technical.expected_lifespan_unit"),
            Number(document, "additional_information.operational.operating_hours_per_day"),
            Text(document, "additional_information.operational.utilization"),
            Date(document, "created_at"))).ToList();
    }

    public async Task<IReadOnlyList<FinancialWorkOrderRecord>> GetWorkOrderCostsAsync(
        string? tenantId,
        string? clientId,
        IReadOnlyCollection<string>? assetKeys,
        string? location,
        CancellationToken cancellationToken = default)
    {
        var match = TenantMatch(tenantId, clientId);
        match["status"] = new BsonDocument("$not", CancelledStatus);
        if (assetKeys is not null)
        {
            var scoped = new BsonArray { new BsonDocument("asset_id", new BsonDocument("$in", new BsonArray(assetKeys))) };
            if (!string.IsNullOrWhiteSpace(location))
            {
                scoped.Add(new BsonDocument("site", new BsonRegularExpression($"^{Regex.Escape(location.Trim())}$", "i")));
            }

            match["$or"] = scoped;
        }

        var documents = await _database.GetCollection<BsonDocument>(DashboardDataRepository.WorkOrderCollection)
            .Find(match)
            .Project(new BsonDocument
            {
                { "work_order_id", 1 }, { "asset_id", 1 }, { "asset_name", 1 }, { "site", 1 }, { "department", 1 }, { "work_type", 1 }, { "status", 1 },
                { "vendor", 1 }, { "actual_end_date", 1 }, { "scheduled_date", 1 }, { "created_at", 1 }, { "labour", 1 }, { "parts", 1 }, { "additional_cost", 1 }
            })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new FinancialWorkOrderRecord(
            document["_id"].ToString()!,
            Text(document, "work_order_id"),
            Text(document, "asset_id"),
            Text(document, "asset_name"),
            Text(document, "site"),
            Text(document, "department"),
            Text(document, "work_type"),
            Text(document, "status"),
            Text(document, "vendor"),
            Date(document, "actual_end_date") ?? Date(document, "scheduled_date") ?? Date(document, "created_at"),
            Lines(document, "labour", "hours", "hourly_rate"),
            Lines(document, "parts", "quantity", "unit_cost"),
            Number(document, "additional_cost") ?? 0)).ToList();
    }

    public async Task<IReadOnlyList<FinancialCostCenterRecord>> GetCostCentersAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(DepartmentCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument { { "code", 1 }, { "department_name", 1 }, { "cost_center", 1 }, { "annual_budget", 1 }, { "currency", 1 } })
            .ToListAsync(cancellationToken);

        return documents.Select(document => new FinancialCostCenterRecord(
            Text(document, "code"),
            Text(document, "department_name"),
            Text(document, "cost_center"),
            Number(document, "annual_budget"),
            Text(document, "currency"))).ToList();
    }

    public async Task<IReadOnlyList<FinancialUsefulLifeRecord>> GetUsefulLivesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var types = await _database.GetCollection<BsonDocument>(AssetTypeCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument
            {
                { "asset_type_name", 1 }, { "code", 1 }, { "useful_life_months", 1 }, { "default_lifetime", 1 }, { "residual_percent", 1 }, { "depreciation_method", 1 }
            })
            .ToListAsync(cancellationToken);

        var categories = await _database.GetCollection<BsonDocument>(AssetCategoryCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument { { "category_name", 1 }, { "code", 1 }, { "useful_life_years", 1 }, { "depreciation_method", 1 } })
            .ToListAsync(cancellationToken);

        static int? Months(double? value, int factor) => value is > 0 ? (int)Math.Round(value.Value * factor) : null;

        return types
            .Select(document => new FinancialUsefulLifeRecord(
                "type",
                Text(document, "asset_type_name"),
                Text(document, "code"),
                Months(Number(document, "useful_life_months"), 1) ?? Months(Number(document, "default_lifetime"), 12),
                Number(document, "residual_percent"),
                Text(document, "depreciation_method")))
            .Concat(categories.Select(document => new FinancialUsefulLifeRecord(
                "category",
                Text(document, "category_name"),
                Text(document, "code"),
                Months(Number(document, "useful_life_years"), 12),
                null,
                Text(document, "depreciation_method"))))
            .ToList();
    }

    public async Task<IReadOnlyList<FinancialDisposalRecord>> GetDisposalAssetsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(DisposalCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument { { "status", 1 }, { "assets.asset_registration_id", 1 } })
            .ToListAsync(cancellationToken);

        var result = new List<FinancialDisposalRecord>();
        foreach (var document in documents)
        {
            var status = Text(document, "status");
            if (document.TryGetValue("assets", out var assets) && assets.IsBsonArray)
            {
                result.AddRange(assets.AsBsonArray.OfType<BsonDocument>().Select(asset => new FinancialDisposalRecord(Text(asset, "asset_registration_id"), status)));
            }
        }

        return result;
    }

    /// <summary>Sum of quantity × rate over an array of cost lines.</summary>
    private static double Lines(BsonDocument document, string field, string quantity, string rate)
    {
        if (!document.TryGetValue(field, out var value) || !value.IsBsonArray)
        {
            return 0;
        }

        return value.AsBsonArray.OfType<BsonDocument>().Sum(line => (Number(line, quantity) ?? 0) * (Number(line, rate) ?? 0));
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
        { IsDecimal128: true } value => (double)value.AsDecimal128,
        { IsString: true } value when double.TryParse(value.AsString, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };
}
