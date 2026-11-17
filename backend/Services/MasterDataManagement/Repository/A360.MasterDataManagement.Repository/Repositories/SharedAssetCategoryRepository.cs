using A360.MasterDataManagement.Domain.Entities;
using A360.Repository.Repositories;
using MongoDB.Driver;

namespace A360.MasterDataManagement.Repository.Repositories;

/// <summary>Reads the Asset service's asset categories (same database, collection owned by the Asset service).</summary>
public interface ISharedAssetCategoryRepository : IMongoRepository<SharedAssetCategory>
{
}

public sealed class SharedAssetCategoryRepository : MongoRepository<SharedAssetCategory>, ISharedAssetCategoryRepository
{
    public const string CollectionName = "AssetCategory";

    public SharedAssetCategoryRepository(IMongoDatabase database)
        : base(database.GetCollection<SharedAssetCategory>(CollectionName))
    {
    }
}
