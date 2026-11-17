using A360.Asset.Domain.Entities;
using A360.Repository.Repositories;

namespace A360.Asset.Repository.Repositories;

public interface IAssetStatusConditionChangeRepository : IMongoRepository<AssetStatusConditionChange>
{
    Task<AssetStatusConditionChangeQueryResult> QueryAsync(AssetStatusConditionChangeQuery query, CancellationToken cancellationToken = default);

    /// <summary>The asset's change waiting for approval, if any (an asset has at most one).</summary>
    Task<AssetStatusConditionChange?> GetPendingAsync(string assetRegistrationId, CancellationToken cancellationToken = default);

    /// <summary>Changes waiting for approval of any of these assets.</summary>
    Task<IReadOnlyCollection<AssetStatusConditionChange>> GetPendingForAssetsAsync(IReadOnlyCollection<string> assetRegistrationIds, CancellationToken cancellationToken = default);

    /// <summary>The asset's latest approved change (by condition assessment date, then approval time).</summary>
    Task<AssetStatusConditionChange?> GetLatestApprovedAsync(string assetRegistrationId, CancellationToken cancellationToken = default);

    /// <summary>The latest approved change of each asset, for the summary cards and the asset list.</summary>
    Task<IReadOnlyCollection<AssetStatusConditionChange>> GetLatestApprovedPerAssetAsync(
        IReadOnlyCollection<string>? assetRegistrationIds = null,
        CancellationToken cancellationToken = default);
}

/// <summary>Change History filters. Empty values mean "all".</summary>
/// <param name="Search">Asset tag, asset name, site or change number.</param>
/// <param name="Status">New operational status.</param>
/// <param name="Condition">New physical condition.</param>
/// <param name="State">Draft, Pending Approval, Approved or Rejected.</param>
public sealed record AssetStatusConditionChangeQuery(
    string? Search,
    string? AssetRegistrationId,
    string? Status,
    string? Condition,
    string? State,
    int Page,
    int PageSize);

public sealed record AssetStatusConditionChangeQueryResult(
    IReadOnlyCollection<AssetStatusConditionChange> Items,
    long TotalCount);
