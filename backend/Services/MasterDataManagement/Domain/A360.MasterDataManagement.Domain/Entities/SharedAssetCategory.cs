using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.MasterDataManagement.Domain.Entities;

/// <summary>
/// Read-only view of an asset category owned by the Asset service (`AssetCategory` collection).
/// The Master Data pages pick categories from that shared list, so asset types and models reference its ids.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class SharedAssetCategory : BaseEntity
{
    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("code")]
    public string Code { get; set; } = string.Empty;
}
