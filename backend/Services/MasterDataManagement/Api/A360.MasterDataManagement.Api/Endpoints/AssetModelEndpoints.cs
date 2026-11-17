using AssetModelEntity = A360.MasterDataManagement.Domain.Entities.AssetModel;
using A360.MasterDataManagement.Api.Contracts;
using A360.MasterDataManagement.Api.Validation;
using A360.MasterDataManagement.Domain.ValueObjects;
using A360.MasterDataManagement.Repository.Repositories;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Repositories;

namespace A360.MasterDataManagement.Api.Endpoints;

public static class AssetModelEndpoints
{
    public static RouteGroupBuilder MapAssetModelEndpoints(
        this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/master-data/asset-models")
            .WithTags("AssetModels");

        group.MapGet("", GetAssetModelsAsync)
            .WithName("GetAssetModels");

        group.MapGet("/{id}", GetAssetModelByIdAsync)
            .WithName("GetAssetModelById");

        group.MapPost("", CreateAssetModelAsync)
            .WithName("CreateAssetModel");

        group.MapPut("/{id}", UpdateAssetModelAsync)
            .WithName("UpdateAssetModel");

        group.MapPatch("/{id}/status", UpdateAssetModelStatusAsync)
            .WithName("UpdateAssetModelStatus");

        group.MapDelete("/{id}", DeleteAssetModelAsync)
            .WithName("DeleteAssetModel");

        return group;
    }

    private static async Task<IResult> GetAssetModelsAsync(
        string? search,
        string? status,
        string? manufacturerId,
        string? assetTypeId,
        string? categoryId,
        string? lifecycle,
        string? clientId,
        IAssetModelRepository repository,
        CancellationToken cancellationToken)
    {
        var models = await repository.SearchAsync(
            new AssetModelFilter(search, status, manufacturerId, assetTypeId, categoryId, lifecycle, clientId),
            cancellationToken);

        return Results.Ok(
            models.Select(AssetModelResponse.FromEntity));
    }

    private static async Task<IResult> GetAssetModelByIdAsync(
        string id,
        IAssetModelRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset model id." });
        }

        var model = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (model is null)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetModel",
            model.Id,
            model.ModelName,
            EventAction.Viewed,
            cancellationToken);

        return Results.Ok(AssetModelResponse.FromEntity(model));
    }

    private static async Task<IResult> CreateAssetModelAsync(
        CreateAssetModelRequest request,
        IAssetModelRepository repository,
        IManufacturerRepository manufacturers,
        IAssetTypeRepository assetTypes,
        ISharedAssetCategoryRepository categories,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var model = request.ToEntity();

        var existing = await repository.GetByModelCodeAsync(
            model.ModelCode,
            model.ClientId,
            cancellationToken);

        if (existing is not null)
        {
            return Results.Conflict(
                new { message = $"An asset model with code '{model.ModelCode}' already exists." });
        }

        var referenceError = await ResolveReferencesAsync(
            model,
            manufacturers,
            assetTypes,
            categories,
            cancellationToken);

        if (referenceError is not null)
        {
            return referenceError;
        }

        model = await repository.CreateAsync(
            model,
            cancellationToken);

        await eventLogger.LogAsync(
            "AssetModel",
            model.Id,
            model.ModelName,
            EventAction.Created,
            cancellationToken);

        return Results.Created(
            $"/api/master-data/asset-models/{model.Id}",
            AssetModelResponse.FromEntity(model));
    }

    private static async Task<IResult> UpdateAssetModelAsync(
        string id,
        UpdateAssetModelRequest request,
        IAssetModelRepository repository,
        IManufacturerRepository manufacturers,
        IAssetTypeRepository assetTypes,
        ISharedAssetCategoryRepository categories,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset model id." });
        }

        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var model = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (model is null)
        {
            return Results.NotFound();
        }

        request.ApplyTo(model);

        var existing = await repository.GetByModelCodeAsync(
            model.ModelCode,
            model.ClientId,
            cancellationToken);

        if (existing is not null && existing.Id != id)
        {
            return Results.Conflict(
                new { message = $"An asset model with code '{model.ModelCode}' already exists." });
        }

        var referenceError = await ResolveReferencesAsync(
            model,
            manufacturers,
            assetTypes,
            categories,
            cancellationToken);

        if (referenceError is not null)
        {
            return referenceError;
        }

        var updated = await repository.UpdateAsync(
            id,
            model,
            cancellationToken);

        if (!updated)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetModel",
            model.Id,
            model.ModelName,
            EventAction.Updated,
            cancellationToken);

        return Results.Ok(AssetModelResponse.FromEntity(model));
    }

    private static async Task<IResult> UpdateAssetModelStatusAsync(
        string id,
        UpdateAssetModelStatusRequest request,
        IAssetModelRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset model id." });
        }

        var validationErrors = request.Validate();

        if (validationErrors.Count > 0)
        {
            return Results.ValidationProblem(validationErrors);
        }

        var model = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (model is null)
        {
            return Results.NotFound();
        }

        model.Status = request.Status;
        model.UpdatedBy = request.UpdatedBy;
        model.UpdatedAt = DateTime.UtcNow;

        var updated = await repository.UpdateAsync(
            id,
            model,
            cancellationToken);

        if (!updated)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetModel",
            model.Id,
            model.ModelName,
            EventAction.Updated,
            cancellationToken);

        return Results.Ok(AssetModelResponse.FromEntity(model));
    }

    private static async Task<IResult> DeleteAssetModelAsync(
        string id,
        IAssetModelRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!MongoObjectId.IsValid(id))
        {
            return Results.BadRequest(
                new { message = "Invalid asset model id." });
        }

        var model = await repository.GetByIdAsync(
            id,
            cancellationToken);

        if (model is null)
        {
            return Results.NotFound();
        }

        var deleted = await repository.DeleteAsync(
            id,
            cancellationToken);

        if (!deleted)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(
            "AssetModel",
            model.Id,
            model.ModelName,
            EventAction.Deleted,
            cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// Checks the manufacturer, asset type and category exist and copies their current names onto the model. When no category
    /// is given the asset type's category is used; when one is given it must match the asset type's category.
    /// Returns an error result, or null when valid.
    /// </summary>
    private static async Task<IResult?> ResolveReferencesAsync(
        AssetModelEntity model,
        IManufacturerRepository manufacturers,
        IAssetTypeRepository assetTypes,
        ISharedAssetCategoryRepository categories,
        CancellationToken cancellationToken)
    {
        if (model.Manufacturer is not null)
        {
            var manufacturer = MongoObjectId.IsValid(model.Manufacturer.Id!)
                ? await manufacturers.GetByIdAsync(model.Manufacturer.Id!, cancellationToken)
                : null;

            if (manufacturer is null)
            {
                return Results.BadRequest(
                    new { message = $"Manufacturer '{model.Manufacturer.Id}' was not found." });
            }

            model.Manufacturer.Name = manufacturer.ManufacturerName;
        }

        MasterDataReference? assetTypeCategory = null;

        if (model.AssetType is not null)
        {
            var assetType = MongoObjectId.IsValid(model.AssetType.Id!)
                ? await assetTypes.GetByIdAsync(model.AssetType.Id!, cancellationToken)
                : null;

            if (assetType is null)
            {
                return Results.BadRequest(
                    new { message = $"Asset type '{model.AssetType.Id}' was not found." });
            }

            model.AssetType.Name = assetType.AssetTypeName;
            assetTypeCategory = assetType.Category;
        }

        if (model.Category is null)
        {
            if (assetTypeCategory is not null)
            {
                model.Category = new MasterDataReference { Id = assetTypeCategory.Id, Name = assetTypeCategory.Name };
            }

            return null;
        }

        var categoryError = await MasterDataReferenceResolver.ResolveAssetCategoryAsync(
            model.Category,
            categories,
            cancellationToken);

        if (categoryError is not null)
        {
            return categoryError;
        }

        if (assetTypeCategory?.Id is not null && assetTypeCategory.Id != model.Category.Id)
        {
            return Results.BadRequest(
                new { message = $"Asset type '{model.AssetType!.Name}' belongs to category '{assetTypeCategory.Name}', not '{model.Category.Name}'." });
        }

        return null;
    }
}
