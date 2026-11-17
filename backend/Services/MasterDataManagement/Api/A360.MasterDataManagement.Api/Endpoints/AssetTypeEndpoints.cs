using A360.MasterDataManagement.Api.Contracts;
using A360.MasterDataManagement.Api.Validation;
using A360.MasterDataManagement.Repository.Repositories;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Repositories;

namespace A360.MasterDataManagement.Api.Endpoints;

public static class AssetTypeEndpoints
{
    public static RouteGroupBuilder MapAssetTypeEndpoints(
        this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/master-data/asset-types")
            .WithTags("AssetTypes");

        group.MapGet("", GetAssetTypesAsync)
            .WithName("GetAssetTypes");

        group.MapGet("/{id}", GetAssetTypeByIdAsync)
            .WithName("GetAssetTypeById");

        group.MapPost("", CreateAssetTypeAsync)
            .WithName("CreateAssetType");

        group.MapPut("/{id}", UpdateAssetTypeAsync)
            .WithName("UpdateAssetType");

        group.MapPatch("/{id}/status", UpdateAssetTypeStatusAsync)
            .WithName("UpdateAssetTypeStatus");

        group.MapDelete("/{id}", DeleteAssetTypeAsync)
            .WithName("DeleteAssetType");

        return group;
    }

    private static async Task<IResult> GetAssetTypesAsync(
        string? search,
        string? status,
        string? categoryId,
        string? assetClass,
        string? depreciationMethod,
        string? clientId,
        IAssetTypeRepository repository,
        CancellationToken cancellationToken)
    {
        var assetTypes = await repository.SearchAsync(
            new AssetTypeFilter(search, status, categoryId, assetClass, depreciationMethod, clientId),
            cancellationToken);

        return Results.Ok(
            assetTypes.Select(AssetTypeResponse.FromEntity));
    }

    private static async Task<IResult> GetAssetTypeByIdAsync(
        string id,
        IAssetTypeRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset type id." });
        }

        var assetType = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (assetType is null)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetType",
            assetType.Id,
            assetType.AssetTypeName,
            EventAction.Viewed,
            cancellationToken);

        return Results.Ok(AssetTypeResponse.FromEntity(assetType));
    }

    private static async Task<IResult> CreateAssetTypeAsync(
        CreateAssetTypeRequest request,
        IAssetTypeRepository repository,
        ISharedAssetCategoryRepository categories,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var assetType = request.ToEntity();

        var existing = await repository.GetByCodeAsync(
            assetType.Code,
            assetType.ClientId,
            cancellationToken);

        if (existing is not null)
        {
            return Results.Conflict(
                new { message = $"An asset type with code '{assetType.Code}' already exists." });
        }

        var categoryError = await MasterDataReferenceResolver.ResolveAssetCategoryAsync(
            assetType.Category,
            categories,
            cancellationToken);

        if (categoryError is not null)
        {
            return categoryError;
        }

        assetType = await repository.CreateAsync(
            assetType,
            cancellationToken);

        await eventLogger.LogAsync(
            "AssetType",
            assetType.Id,
            assetType.AssetTypeName,
            EventAction.Created,
            cancellationToken);

        return Results.Created(
            $"/api/master-data/asset-types/{assetType.Id}",
            AssetTypeResponse.FromEntity(assetType));
    }

    private static async Task<IResult> UpdateAssetTypeAsync(
        string id,
        UpdateAssetTypeRequest request,
        IAssetTypeRepository repository,
        ISharedAssetCategoryRepository categories,
        IAssetModelRepository assetModels,
        IAmcVendorRepository amcVendors,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset type id." });
        }

        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var assetType = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (assetType is null)
        {
            return Results.NotFound();
        }

        var previousName = assetType.AssetTypeName;

        request.ApplyTo(assetType);

        var existing = await repository.GetByCodeAsync(
            assetType.Code,
            assetType.ClientId,
            cancellationToken);

        if (existing is not null && existing.Id != id)
        {
            return Results.Conflict(
                new { message = $"An asset type with code '{assetType.Code}' already exists." });
        }

        var categoryError = await MasterDataReferenceResolver.ResolveAssetCategoryAsync(
            assetType.Category,
            categories,
            cancellationToken);

        if (categoryError is not null)
        {
            return categoryError;
        }

        var updated = await repository.UpdateAsync(
            id,
            assetType,
            cancellationToken);

        if (!updated)
        {
            return Results.NotFound();
        }

        if (previousName != assetType.AssetTypeName)
        {
            await assetModels.UpdateAssetTypeNameAsync(
                id,
                assetType.AssetTypeName,
                cancellationToken);

            await amcVendors.UpdateAssetTypeNameAsync(
                id,
                assetType.AssetTypeName,
                cancellationToken);
        }

        await eventLogger.LogAsync(
            "AssetType",
            assetType.Id,
            assetType.AssetTypeName,
            EventAction.Updated,
            cancellationToken);

        return Results.Ok(AssetTypeResponse.FromEntity(assetType));
    }

    private static async Task<IResult> UpdateAssetTypeStatusAsync(
        string id,
        UpdateAssetTypeStatusRequest request,
        IAssetTypeRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset type id." });
        }

        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var assetType = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (assetType is null)
        {
            return Results.NotFound();
        }

        assetType.Status = request.Status;
        assetType.UpdatedBy = request.UpdatedBy;
        assetType.UpdatedAt = DateTime.UtcNow;

        var updated = await repository.UpdateAsync(
            id,
            assetType,
            cancellationToken);

        if (!updated)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetType",
            assetType.Id,
            assetType.AssetTypeName,
            EventAction.Updated,
            cancellationToken);

        return Results.Ok(AssetTypeResponse.FromEntity(assetType));
    }

    private static async Task<IResult> DeleteAssetTypeAsync(
        string id,
        IAssetTypeRepository repository,
        IAssetModelRepository assetModels,
        IAmcVendorRepository amcVendors,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset type id." });
        }

        var assetType = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (assetType is null)
        {
            return Results.NotFound();
        }

        if (await assetModels.AnyWithAssetTypeAsync(id, cancellationToken))
        {
            return Results.Conflict(
                new { message = "Asset models still use this asset type. Delete or move them first." });
        }

        if (await amcVendors.AnyWithAssetTypeAsync(id, cancellationToken))
        {
            return Results.Conflict(
                new { message = "AMC vendors still cover this asset type. Change or delete them first." });
        }

        var deleted = await repository.DeleteAsync(
            id,
            cancellationToken);

        if (!deleted)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetType",
            assetType.Id,
            assetType.AssetTypeName,
            EventAction.Deleted,
            cancellationToken);

        return Results.NoContent();
    }
}
