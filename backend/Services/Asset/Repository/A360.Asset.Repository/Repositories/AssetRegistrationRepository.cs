using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Asset.Domain.Entities;
using A360.Repository.Repositories;

namespace A360.Asset.Repository.Repositories;

public sealed class AssetRegistrationRepository
    : MongoRepository<AssetRegistration>, IAssetRegistrationRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "AssetRegistration";

    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 200;

    // List columns that can be sorted, mapped to their stored fields.
    private static readonly Dictionary<string, string> SortFields = new(StringComparer.OrdinalIgnoreCase)
    {
        ["assetName"] = "basic_information.asset_name",
        ["assetTag"] = "basic_information.asset_tag",
        ["category"] = "classification.category",
        ["assetType"] = "classification.asset_type",
        ["location"] = "location_assignment.location.location_path",
        ["custodian"] = "location_assignment.assignment.assigned_to_name",
        ["status"] = "basic_information.status",
        ["criticality"] = CriticalityRankField,
        ["nextMaintenance"] = "additional_information.operational.next_maintenance_date",
        ["createdAt"] = "created_at"
    };

    // Criticality sorts by severity (Low → Critical) rather than alphabetically.
    private const string CriticalityRankField = "criticality_rank";

    private const string SortValueMissingField = "sort_value_missing";

    private static readonly BsonDocument AddCriticalityRankStage = new(
        "$addFields",
        new BsonDocument(CriticalityRankField, new BsonDocument("$switch", new BsonDocument
        {
            ["branches"] = new BsonArray(
                new[] { "low", "medium", "high", "critical" }.Select((level, rank) => new BsonDocument
                {
                    ["case"] = new BsonDocument("$eq", new BsonArray { new BsonDocument("$toLower", "$classification.criticality"), level }),
                    ["then"] = rank + 1
                })),
            ["default"] = 0
        })));

    public AssetRegistrationRepository(IMongoDatabase database)
        : base(database.GetCollection<AssetRegistration>(CollectionName))
    {
    }

    public async Task<bool> AssetTagExistsAsync(string assetTag, CancellationToken cancellationToken = default)
    {
        return await Collection
            .Find(asset => asset.BasicInformation.AssetTag == assetTag && !asset.IsDeleted)
            .AnyAsync(cancellationToken);
    }

    public async Task<AssetRegistration?> GetByAssetRegistrationIdAsync(string assetRegistrationId, CancellationToken cancellationToken = default)
    {
        return await Collection
            .Find(asset => asset.AssetRegistrationId == assetRegistrationId && !asset.IsDeleted)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AssetRegistration>> FindByTagsOrSerialsAsync(IReadOnlyCollection<string> tagsOrSerials, CancellationToken cancellationToken = default)
    {
        if (tagsOrSerials.Count == 0)
        {
            return [];
        }

        var filter = Builders<AssetRegistration>.Filter.And(
            Builders<AssetRegistration>.Filter.Eq(asset => asset.IsDeleted, false),
            Builders<AssetRegistration>.Filter.Or(
                Builders<AssetRegistration>.Filter.In(asset => asset.BasicInformation.AssetTag, tagsOrSerials),
                Builders<AssetRegistration>.Filter.In(asset => asset.BasicInformation.SerialNumber, tagsOrSerials)));

        return await Collection.Find(filter).ToListAsync(cancellationToken);
    }

    public async Task<AssetRegistrationQueryResult> QueryAsync(AssetRegistrationQuery query, CancellationToken cancellationToken = default)
    {
        var filters = new List<FilterDefinition<AssetRegistration>>
        {
            Builders<AssetRegistration>.Filter.Eq(asset => asset.IsDeleted, false)
        };

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filters.Add(Builders<AssetRegistration>.Filter.Or(
                Builders<AssetRegistration>.Filter.Regex(asset => asset.BasicInformation.AssetName, pattern),
                Builders<AssetRegistration>.Filter.Regex(asset => asset.BasicInformation.AssetTag, pattern),
                Builders<AssetRegistration>.Filter.Regex(asset => asset.BasicInformation.SerialNumber, pattern),
                Builders<AssetRegistration>.Filter.Regex(asset => asset.BasicInformation.Barcode, pattern),
                Builders<AssetRegistration>.Filter.Regex(asset => asset.AssetRegistrationId, pattern)));
        }

        AddEquals(filters, asset => asset.Classification.Category, query.Category);
        AddEquals(filters, asset => asset.Classification.AssetType, query.AssetType);
        AddEquals(filters, asset => asset.Classification.Department, query.Department);
        AddEquals(filters, asset => asset.Classification.Criticality, query.Criticality);
        AddEquals(filters, asset => asset.LocationAssignment.Assignment.AssignedToUserId, query.CustodianUserId);
        AddEquals(filters, asset => asset.PurchaseWarranty.Purchase.Manufacturer, query.Manufacturer);
        // Condition accepts a comma-separated list, e.g. "Poor,Critical".
        var conditions = (query.Condition ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (conditions.Length == 1)
        {
            AddEquals(filters, asset => asset.BasicInformation.Condition, conditions[0]);
        }
        else if (conditions.Length > 1)
        {
            filters.Add(Builders<AssetRegistration>.Filter.In(asset => asset.BasicInformation.Condition, conditions));
        }

        // A location picked anywhere in the hierarchy matches every asset at or below it.
        if (!string.IsNullOrWhiteSpace(query.LocationId))
        {
            var locationId = query.LocationId.Trim();
            filters.Add(Builders<AssetRegistration>.Filter.Or(
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.CountryId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.SiteId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.BuildingId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.FloorId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.ZoneId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.RoomId, locationId)));
        }

        var filterWithoutStatus = Builders<AssetRegistration>.Filter.And(filters);

        AddEquals(filters, asset => asset.BasicInformation.Status, query.Status);
        var filter = Builders<AssetRegistration>.Filter.And(filters);

        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize is < 1 or > MaxPageSize ? DefaultPageSize : query.PageSize;

        var sortField = query.SortBy is not null && SortFields.TryGetValue(query.SortBy, out var field) ? field : "created_at";
        var sortDescending = query.SortBy is null || query.SortDescending;
        // Rows without a value (e.g. no next maintenance date) go last in either direction.
        var sort = Builders<AssetRegistration>.Sort.Ascending(SortValueMissingField);
        sort = sortDescending ? sort.Descending(sortField) : sort.Ascending(sortField);

        var pipeline = Collection.Aggregate().Match(filter);
        if (sortField == CriticalityRankField)
        {
            pipeline = pipeline.AppendStage<AssetRegistration>(AddCriticalityRankStage);
        }

        var sortValueField = sortField == CriticalityRankField ? "$classification.criticality" : $"${sortField}";
        pipeline = pipeline.AppendStage<AssetRegistration>(new BsonDocument(
            "$addFields",
            new BsonDocument(SortValueMissingField, new BsonDocument("$cond", new BsonArray
            {
                new BsonDocument("$in", new BsonArray { sortValueField, new BsonArray { BsonNull.Value, string.Empty } }),
                1,
                0
            }))));

        var items = await pipeline
            .Sort(sort.Ascending(asset => asset.Id))
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(cancellationToken);

        var totalCount = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);

        var statusGroups = await Collection.Aggregate()
            .Match(filterWithoutStatus)
            .Group(new BsonDocument
            {
                ["_id"] = "$basic_information.status",
                ["count"] = new BsonDocument("$sum", 1)
            })
            .ToListAsync(cancellationToken);

        var statusCounts = statusGroups.ToDictionary(
            group => group["_id"].IsBsonNull ? string.Empty : group["_id"].AsString,
            group => (long)group["count"].ToInt32());

        return new AssetRegistrationQueryResult(items, totalCount, statusCounts);
    }

    public async Task<IReadOnlyCollection<AssetRegistration>> FindInScopeAsync(AssetScopeQuery query, int limit, CancellationToken cancellationToken = default)
    {
        var filters = new List<FilterDefinition<AssetRegistration>>
        {
            Builders<AssetRegistration>.Filter.Eq(asset => asset.IsDeleted, false)
        };

        if (!string.IsNullOrWhiteSpace(query.LocationId))
        {
            var locationId = query.LocationId.Trim();
            filters.Add(Builders<AssetRegistration>.Filter.Or(
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.CountryId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.SiteId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.BuildingId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.FloorId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.ZoneId, locationId),
                Builders<AssetRegistration>.Filter.Eq(asset => asset.LocationAssignment.Location.RoomId, locationId)));
        }

        AddEquals(filters, asset => asset.Classification.Department, query.Department);
        AddEquals(filters, asset => asset.Classification.Category, query.Category);
        AddEquals(filters, asset => asset.BasicInformation.Status, query.Status);
        AddEquals(filters, asset => asset.Classification.AssetType, query.AssetType);
        AddEquals(filters, asset => asset.Classification.Criticality, query.Criticality);

        if (!string.IsNullOrWhiteSpace(query.TagFrom))
        {
            filters.Add(Builders<AssetRegistration>.Filter.Gte(asset => asset.BasicInformation.AssetTag, query.TagFrom.Trim()));
        }

        if (!string.IsNullOrWhiteSpace(query.TagTo))
        {
            filters.Add(Builders<AssetRegistration>.Filter.Lte(asset => asset.BasicInformation.AssetTag, query.TagTo.Trim()));
        }

        if (query.AssetRegistrationIds is not null)
        {
            filters.Add(Builders<AssetRegistration>.Filter.In(asset => asset.AssetRegistrationId, query.AssetRegistrationIds));
        }

        return await Collection
            .Find(Builders<AssetRegistration>.Filter.And(filters))
            .Sort(Builders<AssetRegistration>.Sort.Ascending(asset => asset.BasicInformation.AssetTag).Ascending(asset => asset.AssetRegistrationId))
            .Limit(limit)
            .ToListAsync(cancellationToken);
    }

    private static void AddEquals(
        List<FilterDefinition<AssetRegistration>> filters,
        System.Linq.Expressions.Expression<Func<AssetRegistration, string?>> field,
        string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            filters.Add(Builders<AssetRegistration>.Filter.Eq(field, value.Trim()));
        }
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var indexes = new[]
        {
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.AssetRegistrationId),
                new CreateIndexOptions { Name = "ix_asset_registration_asset_registration_id", Unique = true }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.BasicInformation.AssetTag),
                new CreateIndexOptions { Name = "ix_asset_registration_asset_tag" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.BasicInformation.SerialNumber),
                new CreateIndexOptions { Name = "ix_asset_registration_serial_number" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys
                    .Ascending(asset => asset.BasicInformation.Status)
                    .Descending(asset => asset.CreatedAt),
                new CreateIndexOptions { Name = "ix_asset_registration_status_created_at" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Descending(asset => asset.CreatedAt),
                new CreateIndexOptions { Name = "ix_asset_registration_created_at" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.BasicInformation.Barcode),
                new CreateIndexOptions { Name = "ix_asset_registration_barcode" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.BasicInformation.RfidTagId),
                new CreateIndexOptions { Name = "ix_asset_registration_rfid_tag_id" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys
                    .Ascending(asset => asset.Classification.Category)
                    .Ascending(asset => asset.Classification.SubCategory)
                    .Ascending(asset => asset.Classification.AssetType),
                new CreateIndexOptions { Name = "ix_asset_registration_category_sub_category_asset_type" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys
                    .Ascending(asset => asset.LocationAssignment.Location.BuildingId)
                    .Ascending(asset => asset.LocationAssignment.Location.FloorId)
                    .Ascending(asset => asset.LocationAssignment.Location.ZoneId),
                new CreateIndexOptions { Name = "ix_asset_registration_building_floor_zone" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.LocationAssignment.Assignment.AssignedToUserId),
                new CreateIndexOptions { Name = "ix_asset_registration_assigned_to_user_id" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.PurchaseWarranty.Purchase.PurchaseOrderNumber),
                new CreateIndexOptions { Name = "ix_asset_registration_purchase_order_number" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.PurchaseWarranty.Purchase.InvoiceNumber),
                new CreateIndexOptions { Name = "ix_asset_registration_invoice_number" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.PurchaseWarranty.Warranty.WarrantyEndDate),
                new CreateIndexOptions { Name = "ix_asset_registration_warranty_end_date" }),
            new CreateIndexModel<AssetRegistration>(
                Builders<AssetRegistration>.IndexKeys.Ascending(asset => asset.AdditionalInformation.Operational.NextMaintenanceDate),
                new CreateIndexOptions { Name = "ix_asset_registration_next_maintenance_date" })
        };

        await Collection.Indexes.CreateManyAsync(indexes, cancellationToken);
    }
}
