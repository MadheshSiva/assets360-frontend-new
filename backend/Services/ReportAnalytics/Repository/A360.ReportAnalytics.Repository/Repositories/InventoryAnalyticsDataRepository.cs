using System.Globalization;
using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>
/// A stock line: an MDM inventory item (master_items, Source "Item") or a Maintenance spare part (spare_parts, Source "Spare Part").
/// Spare parts have no warehouse, store or bin.
/// </summary>
public sealed record InventoryStockRecord(
    string Id,
    string Source,
    string Code,
    string Name,
    string? Category,
    string? WarehouseId,
    string? WarehouseName,
    string? StoreId,
    string? StoreName,
    string? BinId,
    string? BinName,
    double Quantity,
    double? ReorderLevel,
    double? MinStock,
    double? MaxStock,
    double? ReorderQuantity,
    double UnitCost,
    string? Supplier,
    bool CriticalSpare,
    DateTime? CreatedAt,
    string? PartNumber = null);

public sealed record InventoryWarehouseRecord(string Id, string Code, string Name, string? Location, string? City, string? Manager);

public sealed record InventoryStoreRecord(string Id, string Code, string Name, string? WarehouseId, string? WarehouseName, string? Keeper);

public sealed record InventoryBinRecord(string Id, string Code, string Name, string? StoreId, string? WarehouseId, string? WarehouseName, double? Capacity);

public sealed record InventorySupplierRecord(string Id, string Code, string Name, string? Category, double? Rating, bool Preferred);

/// <summary>
/// Stock issued: a material consumption (WIP job, Department "Production") or a part on a work order (Department is the work
/// order's department, else "Maintenance"). Value is the recorded cost, or quantity × unit cost.
/// </summary>
public sealed record InventoryIssueRecord(
    string Source,
    string? ItemCode,
    string? ItemName,
    double Quantity,
    double? Value,
    double? UnitCost,
    DateTime? IssuedAt,
    string Department,
    string? Reference,
    string? Vendor);

/// <summary>The sites (ids and names) of an organization; Found is false when no such organization exists.</summary>
public sealed record InventoryOrganizationSites(bool Found, IReadOnlyCollection<string> Sites);

public interface IInventoryAnalyticsDataRepository
{
    Task<IReadOnlyList<InventoryStockRecord>> GetStockAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InventoryWarehouseRecord>> GetWarehousesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InventoryStoreRecord>> GetStoresAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InventoryBinRecord>> GetBinsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<InventorySupplierRecord>> GetSuppliersAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> GetItemCategoriesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Every issue up to toUtc (the slow-moving check needs each item's last issue, however old).</summary>
    Task<IReadOnlyList<InventoryIssueRecord>> GetIssuesAsync(string? tenantId, string? clientId, DateTime toUtc, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> GetOrganizationNamesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<InventoryOrganizationSites> GetOrganizationSitesAsync(string? tenantId, string? clientId, string organization, CancellationToken cancellationToken = default);
}

/// <summary>Read-only access to the MDM inventory masters, Maintenance spare parts, WIP material consumption and work order parts.</summary>
public sealed class InventoryAnalyticsDataRepository : IInventoryAnalyticsDataRepository
{
    public const string ItemCollection = "master_items";
    public const string WarehouseCollection = "master_warehouses";
    public const string StoreCollection = "master_stores";
    public const string BinCollection = "master_bins";
    public const string SupplierCollection = "master_suppliers";
    public const string ItemCategoryCollection = "master_item_categories";
    public const string SparePartCollection = "spare_parts";
    public const string MaterialCollection = "material_consumptions";
    public const string WorkOrderCollection = "work_orders";
    public const string OrganizationCollection = "master_organizations";

    public const string ItemSource = "Item";
    public const string SparePartSource = "Spare Part";
    public const string ProductionDepartment = "Production";
    public const string MaintenanceDepartment = "Maintenance";

    private static readonly BsonRegularExpression CancelledStatus = new("^\\s*(cancelled|canceled)\\s*$", "i");

    private readonly IMongoDatabase _database;

    public InventoryAnalyticsDataRepository(IMongoDatabase database)
    {
        _database = database;
    }

    public async Task<IReadOnlyList<InventoryStockRecord>> GetStockAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var items = await _database.GetCollection<BsonDocument>(ItemCollection)
            .Find(ActiveMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        var parts = await _database.GetCollection<BsonDocument>(SparePartCollection)
            .Find(TenantMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        var records = items.Select(document => new InventoryStockRecord(
            document["_id"].ToString()!,
            ItemSource,
            Text(document, "item_code") ?? document["_id"].ToString()!,
            Text(document, "item_name") ?? Text(document, "item_code") ?? "Unnamed item",
            Text(document, "category.name"),
            Text(document, "warehouse.id"),
            Text(document, "warehouse.name"),
            Text(document, "store.id"),
            Text(document, "store.name"),
            Text(document, "bin.id"),
            Text(document, "bin.name"),
            Number(document, "current_stock") ?? 0,
            Number(document, "reorder_level"),
            Number(document, "min_stock"),
            Number(document, "max_stock"),
            Number(document, "reorder_qty"),
            Number(document, "unit_cost") ?? 0,
            Text(document, "supplier.name") ?? Text(document, "supplier"),
            Bool(document, "critical_spare"),
            Date(document, "created_at"),
            Text(document, "part_number"))).ToList();

        records.AddRange(parts.Select(document => new InventoryStockRecord(
            document["_id"].ToString()!,
            SparePartSource,
            Text(document, "part_id") ?? document["_id"].ToString()!,
            Text(document, "part_name") ?? Text(document, "part_id") ?? "Unnamed part",
            Text(document, "category"),
            null,
            null,
            null,
            null,
            null,
            null,
            Number(document, "quantity_in_stock") ?? 0,
            Number(document, "minimum_stock_level"),
            Number(document, "minimum_stock_level"),
            null,
            null,
            Number(document, "unit_cost") ?? 0,
            Text(document, "supplier"),
            false,
            Date(document, "created_at"))));

        return records;
    }

    public async Task<IReadOnlyList<InventoryWarehouseRecord>> GetWarehousesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(WarehouseCollection)
            .Find(ActiveMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        return documents.Select(document => new InventoryWarehouseRecord(
            document["_id"].ToString()!,
            Text(document, "code") ?? document["_id"].ToString()!,
            Text(document, "warehouse_name") ?? Text(document, "code") ?? "Unnamed warehouse",
            Text(document, "location"),
            Text(document, "city"),
            Text(document, "manager.name"))).ToList();
    }

    public async Task<IReadOnlyList<InventoryStoreRecord>> GetStoresAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(StoreCollection)
            .Find(ActiveMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        return documents.Select(document => new InventoryStoreRecord(
            document["_id"].ToString()!,
            Text(document, "code") ?? document["_id"].ToString()!,
            Text(document, "store_name") ?? Text(document, "code") ?? "Unnamed store",
            Text(document, "warehouse.id"),
            Text(document, "warehouse.name"),
            Text(document, "keeper.name"))).ToList();
    }

    public async Task<IReadOnlyList<InventoryBinRecord>> GetBinsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(BinCollection)
            .Find(ActiveMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        return documents.Select(document => new InventoryBinRecord(
            document["_id"].ToString()!,
            Text(document, "code") ?? document["_id"].ToString()!,
            Text(document, "bin_name") ?? Text(document, "code") ?? "Unnamed bin",
            Text(document, "store.id"),
            Text(document, "warehouse.id"),
            Text(document, "warehouse.name"),
            Number(document, "capacity"))).ToList();
    }

    public async Task<IReadOnlyList<InventorySupplierRecord>> GetSuppliersAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(SupplierCollection)
            .Find(TenantMatch(tenantId, clientId))
            .ToListAsync(cancellationToken);

        return documents.Select(document => new InventorySupplierRecord(
            document["_id"].ToString()!,
            Text(document, "code") ?? document["_id"].ToString()!,
            Text(document, "supplier_name") ?? Text(document, "code") ?? "Unnamed supplier",
            Text(document, "category"),
            Number(document, "rating"),
            Bool(document, "preferred"))).ToList();
    }

    public async Task<IReadOnlyList<string>> GetItemCategoriesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(ItemCategoryCollection)
            .Find(ActiveMatch(tenantId, clientId))
            .Project(new BsonDocument("category_name", 1))
            .ToListAsync(cancellationToken);

        return documents
            .Select(document => Text(document, "category_name"))
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<IReadOnlyList<InventoryIssueRecord>> GetIssuesAsync(string? tenantId, string? clientId, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        var materialMatch = TenantMatch(tenantId, clientId);
        materialMatch["created_at"] = new BsonDocument("$lt", toUtc);
        var materials = await _database.GetCollection<BsonDocument>(MaterialCollection)
            .Find(materialMatch)
            .Project(new BsonDocument
            {
                { "material_id", 1 }, { "job_id", 1 }, { "item_code", 1 }, { "item_name", 1 }, { "quantity_used", 1 }, { "cost", 1 },
                { "created_at", 1 }, { "vendor_id", 1 }
            })
            .ToListAsync(cancellationToken);

        var issues = materials
            .Select(document => new InventoryIssueRecord(
                "Material Consumption",
                Text(document, "item_code"),
                Text(document, "item_name"),
                Number(document, "quantity_used") ?? 0,
                Number(document, "cost"),
                null,
                Date(document, "created_at"),
                ProductionDepartment,
                Text(document, "job_id") ?? Text(document, "material_id"),
                Text(document, "vendor_id")))
            .Where(issue => issue.Quantity > 0 || issue.Value > 0)
            .ToList();

        var workOrderMatch = TenantMatch(tenantId, clientId);
        workOrderMatch["parts.0"] = new BsonDocument("$exists", true);
        workOrderMatch["status"] = new BsonDocument("$not", CancelledStatus);
        var workOrders = await _database.GetCollection<BsonDocument>(WorkOrderCollection)
            .Find(workOrderMatch)
            .Project(new BsonDocument
            {
                { "work_order_id", 1 }, { "department", 1 }, { "parts", 1 }, { "actual_end_date", 1 }, { "actual_start_date", 1 },
                { "scheduled_date", 1 }, { "created_at", 1 }, { "vendor", 1 }
            })
            .ToListAsync(cancellationToken);

        foreach (var workOrder in workOrders)
        {
            // The parts were issued when the work was done; planned work orders fall back to their schedule or creation date.
            var issuedAt = Date(workOrder, "actual_end_date") ?? Date(workOrder, "actual_start_date")
                ?? Date(workOrder, "scheduled_date") ?? Date(workOrder, "created_at");
            if (issuedAt is null || issuedAt >= toUtc || !workOrder.TryGetValue("parts", out var parts) || !parts.IsBsonArray)
            {
                continue;
            }

            var department = Text(workOrder, "department") ?? MaintenanceDepartment;
            foreach (var part in parts.AsBsonArray.OfType<BsonDocument>())
            {
                var quantity = Number(part, "quantity") ?? 0;
                if (quantity <= 0)
                {
                    continue;
                }

                var unitCost = Number(part, "unit_cost");
                issues.Add(new InventoryIssueRecord(
                    "Work Order",
                    Text(part, "part_number") ?? Text(part, "part_id") ?? Text(part, "item_code"),
                    Text(part, "part_name") ?? Text(part, "item_name"),
                    quantity,
                    Number(part, "total_cost") ?? (unitCost is null ? null : quantity * unitCost.Value),
                    unitCost,
                    issuedAt,
                    department,
                    Text(workOrder, "work_order_id") ?? workOrder["_id"].ToString(),
                    Text(workOrder, "vendor")));
            }
        }

        return issues;
    }

    public async Task<IReadOnlyList<string>> GetOrganizationNamesAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default)
    {
        var documents = await _database.GetCollection<BsonDocument>(OrganizationCollection)
            .Find(TenantMatch(tenantId, clientId))
            .Project(new BsonDocument("organization_name", 1))
            .ToListAsync(cancellationToken);

        return documents
            .Select(document => Text(document, "organization_name"))
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<InventoryOrganizationSites> GetOrganizationSitesAsync(
        string? tenantId,
        string? clientId,
        string organization,
        CancellationToken cancellationToken = default)
    {
        var value = organization.Trim();
        var byName = new BsonDocument("organization_name", new BsonRegularExpression($"^{Regex.Escape(value)}$", "i"));
        var lookup = ObjectId.TryParse(value, out var objectId)
            ? new BsonDocument("$or", new BsonArray { new BsonDocument("_id", objectId), byName })
            : byName;

        var match = TenantMatch(tenantId, clientId);
        match.Add("$and", new BsonArray { lookup });

        var document = await _database.GetCollection<BsonDocument>(OrganizationCollection)
            .Find(match)
            .FirstOrDefaultAsync(cancellationToken);

        if (document is null)
        {
            return new InventoryOrganizationSites(false, []);
        }

        var sites = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (document.TryGetValue("sites", out var list) && list.IsBsonArray)
        {
            foreach (var site in list.AsBsonArray)
            {
                if (site.IsString && !string.IsNullOrWhiteSpace(site.AsString))
                {
                    sites.Add(site.AsString.Trim());
                }
                else if (site.IsBsonDocument)
                {
                    if (Text(site.AsBsonDocument, "id") is { } id)
                    {
                        sites.Add(id);
                    }

                    if (Text(site.AsBsonDocument, "name") is { } name)
                    {
                        sites.Add(name);
                    }
                }
            }
        }

        return new InventoryOrganizationSites(true, sites);
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

    /// <summary>Master records that are not switched off (Inactive / Archived masters are left out).</summary>
    private static BsonDocument ActiveMatch(string? tenantId, string? clientId)
    {
        var match = TenantMatch(tenantId, clientId);
        match["status"] = new BsonDocument("$not", new BsonRegularExpression("^\\s*(inactive|archived|deleted)\\s*$", "i"));
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
        Value(document, path) is { } value && !value.IsBsonNull && !value.IsBsonDocument && !value.IsBsonArray
            && value.ToString() is { Length: > 0 } text && !string.IsNullOrWhiteSpace(text)
            ? (value.IsString ? value.AsString.Trim() : text)
            : null;

    private static DateTime? Date(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsValidDateTime: true } value => value.ToUniversalTime(),
        { IsString: true } value when DateTime.TryParse(value.AsString, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var parsed) => parsed,
        _ => null
    };

    private static double? Number(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsNumeric: true } value => value.ToDouble(),
        { IsDecimal128: true } value => (double)value.AsDecimal,
        { IsString: true } value when double.TryParse(value.AsString, NumberStyles.Any, CultureInfo.InvariantCulture, out var parsed) => parsed,
        _ => null
    };

    private static bool Bool(BsonDocument document, string path) => Value(document, path) switch
    {
        { IsBoolean: true } value => value.AsBoolean,
        { IsString: true } value => bool.TryParse(value.AsString, out var parsed) && parsed,
        _ => false
    };
}
