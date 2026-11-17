using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Asset.Domain.Entities;
using A360.Repository.Repositories;

namespace A360.Asset.Repository.Repositories;

/// <summary>Status &amp; condition change requests of registered assets.</summary>
public sealed class AssetStatusConditionChangeRepository
    : MongoRepository<AssetStatusConditionChange>, IAssetStatusConditionChangeRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "AssetStatusConditionChange";

    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 200;

    public const string StatePendingApproval = "Pending Approval";
    public const string StateApproved = "Approved";

    private static readonly SortDefinition<AssetStatusConditionChange> LatestFirst =
        Builders<AssetStatusConditionChange>.Sort
            .Descending(change => change.ConditionAssessmentDate)
            .Descending(change => change.AppliedAt)
            .Descending(change => change.CreatedAt);

    public AssetStatusConditionChangeRepository(IMongoDatabase database)
        : base(database.GetCollection<AssetStatusConditionChange>(CollectionName))
    {
    }

    public async Task<AssetStatusConditionChangeQueryResult> QueryAsync(AssetStatusConditionChangeQuery query, CancellationToken cancellationToken = default)
    {
        var builder = Builders<AssetStatusConditionChange>.Filter;
        var filters = new List<FilterDefinition<AssetStatusConditionChange>> { builder.Eq(change => change.IsDeleted, false) };

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filters.Add(builder.Or(
                builder.Regex(change => change.AssetTag, pattern),
                builder.Regex(change => change.AssetName, pattern),
                builder.Regex(change => change.SiteName, pattern),
                builder.Regex(change => change.ChangeNumber, pattern),
                builder.Regex(change => change.AssetRegistrationId, pattern)));
        }

        AddEquals(filters, change => change.AssetRegistrationId, query.AssetRegistrationId);
        AddEquals(filters, change => change.NewStatus, query.Status);
        // Condition accepts a comma-separated list, e.g. "Poor,Critical".
        var conditions = (query.Condition ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (conditions.Length > 0)
        {
            filters.Add(builder.In(change => change.NewCondition, conditions));
        }
        AddEquals(filters, change => change.State, query.State);

        var filter = builder.And(filters);
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize is < 1 or > MaxPageSize ? DefaultPageSize : query.PageSize;

        var items = await Collection
            .Find(filter)
            .Sort(Builders<AssetStatusConditionChange>.Sort.Descending(change => change.UpdatedAt).Descending(change => change.CreatedAt))
            .Skip((page - 1) * pageSize)
            .Limit(pageSize)
            .ToListAsync(cancellationToken);

        var totalCount = await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken);
        return new AssetStatusConditionChangeQueryResult(items, totalCount);
    }

    public async Task<AssetStatusConditionChange?> GetPendingAsync(string assetRegistrationId, CancellationToken cancellationToken = default)
    {
        var id = assetRegistrationId.Trim();
        return await Collection
            .Find(change => change.AssetRegistrationId == id && change.State == StatePendingApproval && !change.IsDeleted)
            .SortByDescending(change => change.SubmittedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AssetStatusConditionChange>> GetPendingForAssetsAsync(
        IReadOnlyCollection<string> assetRegistrationIds,
        CancellationToken cancellationToken = default)
    {
        if (assetRegistrationIds.Count == 0)
        {
            return [];
        }

        var builder = Builders<AssetStatusConditionChange>.Filter;
        return await Collection
            .Find(builder.And(
                builder.Eq(change => change.IsDeleted, false),
                builder.Eq(change => change.State, StatePendingApproval),
                builder.In(change => change.AssetRegistrationId, assetRegistrationIds)))
            .ToListAsync(cancellationToken);
    }

    public async Task<AssetStatusConditionChange?> GetLatestApprovedAsync(string assetRegistrationId, CancellationToken cancellationToken = default)
    {
        var id = assetRegistrationId.Trim();
        return await Collection
            .Find(change => change.AssetRegistrationId == id && change.State == StateApproved && !change.IsDeleted)
            .Sort(LatestFirst)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<AssetStatusConditionChange>> GetLatestApprovedPerAssetAsync(
        IReadOnlyCollection<string>? assetRegistrationIds = null,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<AssetStatusConditionChange>.Filter;
        var filter = builder.And(
            builder.Eq(change => change.IsDeleted, false),
            builder.Eq(change => change.State, StateApproved));
        if (assetRegistrationIds is not null)
        {
            filter &= builder.In(change => change.AssetRegistrationId, assetRegistrationIds);
        }

        var latest = await Collection.Aggregate()
            .Match(filter)
            .Sort(LatestFirst)
            .Group(change => change.AssetRegistrationId, group => group.First())
            .ToListAsync(cancellationToken);

        return latest;
    }

    private static void AddEquals(
        List<FilterDefinition<AssetStatusConditionChange>> filters,
        System.Linq.Expressions.Expression<Func<AssetStatusConditionChange, string?>> field,
        string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            filters.Add(Builders<AssetStatusConditionChange>.Filter.Eq(field, value.Trim()));
        }
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<AssetStatusConditionChange>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<AssetStatusConditionChange>(
                keys.Ascending(change => change.AssetRegistrationId).Ascending(change => change.State),
                new CreateIndexOptions { Name = "ix_asset_status_condition_asset_state" }),
            new CreateIndexModel<AssetStatusConditionChange>(
                keys.Ascending(change => change.ChangeNumber),
                new CreateIndexOptions { Name = "ix_asset_status_condition_change_number" })
        ], cancellationToken);
    }
}
