using A360.MasterDataManagement.Domain.ValueObjects;
using A360.MasterDataManagement.Repository.Repositories;
using A360.Repository.Repositories;

namespace A360.MasterDataManagement.Api.Endpoints;

/// <summary>
/// Checks that references carrying an id point at an existing master record, and copies that record's
/// current name onto the reference. References without an id are left as typed.
/// Each method returns an error result, or null when everything resolved.
/// </summary>
public static class MasterDataReferenceResolver
{
    public static async Task<IResult?> ResolveOrganizationAsync(
        MasterDataReference? reference,
        IOrganizationRepository organizations,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var organization = MongoObjectId.IsValid(reference.Id)
            ? await organizations.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (organization is null)
        {
            return Results.BadRequest(
                new { message = $"Organization '{reference.Id}' was not found." });
        }

        reference.Name = organization.OrganizationName;
        return null;
    }

    public static async Task<IResult?> ResolveAssetCategoryAsync(
        MasterDataReference? reference,
        ISharedAssetCategoryRepository categories,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var category = MongoObjectId.IsValid(reference.Id)
            ? await categories.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (category is null)
        {
            return Results.BadRequest(
                new { message = $"Asset category '{reference.Id}' was not found." });
        }

        reference.Name = category.Name;
        return null;
    }

    public static async Task<IResult?> ResolveMaintenanceTypeAsync(
        MasterDataReference? reference,
        IMaintenanceTypeRepository maintenanceTypes,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var maintenanceType = MongoObjectId.IsValid(reference.Id)
            ? await maintenanceTypes.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (maintenanceType is null)
        {
            return Results.BadRequest(
                new { message = $"Maintenance type '{reference.Id}' was not found." });
        }

        reference.Name = maintenanceType.MaintenanceTypeName;
        return null;
    }

    public static async Task<IResult?> ResolveAssetTypeAsync(
        MasterDataReference? reference,
        IAssetTypeRepository assetTypes,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var assetType = MongoObjectId.IsValid(reference.Id)
            ? await assetTypes.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (assetType is null)
        {
            return Results.BadRequest(
                new { message = $"Asset type '{reference.Id}' was not found." });
        }

        reference.Name = assetType.AssetTypeName;
        return null;
    }

    public static async Task<IResult?> ResolveTeamAsync(
        MasterDataReference? reference,
        ITeamRepository teams,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var team = MongoObjectId.IsValid(reference.Id)
            ? await teams.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (team is null)
        {
            return Results.BadRequest(
                new { message = $"Team '{reference.Id}' was not found." });
        }

        reference.Name = team.TeamName;
        return null;
    }

    public static async Task<IResult?> ResolveTechnicianAsync(
        MasterDataReference? reference,
        ITechnicianRepository technicians,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var technician = MongoObjectId.IsValid(reference.Id)
            ? await technicians.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (technician is null)
        {
            return Results.BadRequest(
                new { message = $"Technician '{reference.Id}' was not found." });
        }

        reference.Name = technician.TechnicianName;
        return null;
    }

    public static async Task<IResult?> ResolveItemCategoryAsync(
        MasterDataReference? reference,
        IItemCategoryRepository itemCategories,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var itemCategory = MongoObjectId.IsValid(reference.Id)
            ? await itemCategories.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (itemCategory is null)
        {
            return Results.BadRequest(
                new { message = $"Item category '{reference.Id}' was not found." });
        }

        reference.Name = itemCategory.CategoryName;
        return null;
    }

    public static async Task<IResult?> ResolveUomAsync(
        MasterDataReference? reference,
        IUomRepository uoms,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var uom = MongoObjectId.IsValid(reference.Id)
            ? await uoms.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (uom is null)
        {
            return Results.BadRequest(
                new { message = $"Unit of measure '{reference.Id}' was not found." });
        }

        reference.Name = uom.UomName;
        return null;
    }

    public static async Task<IResult?> ResolveEmployeeAsync(
        MasterDataReference? reference,
        IEmployeeRepository employees,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var employee = MongoObjectId.IsValid(reference.Id)
            ? await employees.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (employee is null)
        {
            return Results.BadRequest(
                new { message = $"Employee '{reference.Id}' was not found." });
        }

        reference.Name = employee.EmployeeName;
        return null;
    }

    public static async Task<IResult?> ResolveWarehouseAsync(
        MasterDataReference? reference,
        IWarehouseRepository warehouses,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var warehouse = MongoObjectId.IsValid(reference.Id)
            ? await warehouses.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (warehouse is null)
        {
            return Results.BadRequest(
                new { message = $"Warehouse '{reference.Id}' was not found." });
        }

        reference.Name = warehouse.WarehouseName;
        return null;
    }

    public static async Task<IResult?> ResolveStoreAsync(
        MasterDataReference? reference,
        IStoreRepository stores,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var store = MongoObjectId.IsValid(reference.Id)
            ? await stores.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (store is null)
        {
            return Results.BadRequest(
                new { message = $"Store '{reference.Id}' was not found." });
        }

        reference.Name = store.StoreName;
        return null;
    }

    public static async Task<IResult?> ResolveModuleAccessAsync(
        MasterDataReference? reference,
        IModuleAccessRepository modules,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var moduleAccess = MongoObjectId.IsValid(reference.Id)
            ? await modules.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (moduleAccess is null)
        {
            return Results.BadRequest(
                new { message = $"Module '{reference.Id}' was not found." });
        }

        reference.Name = moduleAccess.ModuleName;
        return null;
    }

    public static async Task<IResult?> ResolvePermissionAsync(
        MasterDataReference? reference,
        IPermissionRepository permissions,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var permission = MongoObjectId.IsValid(reference.Id)
            ? await permissions.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (permission is null)
        {
            return Results.BadRequest(
                new { message = $"Permission '{reference.Id}' was not found." });
        }

        reference.Name = permission.PermissionName;
        return null;
    }

    public static async Task<IResult?> ResolvePermissionListAsync(
        IEnumerable<MasterDataReference> references,
        IPermissionRepository permissions,
        CancellationToken cancellationToken)
    {
        foreach (var reference in references)
        {
            var error = await ResolvePermissionAsync(reference, permissions, cancellationToken);

            if (error is not null)
            {
                return error;
            }
        }

        return null;
    }

    public static async Task<IResult?> ResolveModuleAccessListAsync(
        IEnumerable<MasterDataReference> references,
        IModuleAccessRepository modules,
        CancellationToken cancellationToken)
    {
        foreach (var reference in references)
        {
            var error = await ResolveModuleAccessAsync(reference, modules, cancellationToken);

            if (error is not null)
            {
                return error;
            }
        }

        return null;
    }

    public static async Task<IResult?> ResolveDepartmentAsync(
        MasterDataReference? reference,
        IDepartmentRepository departments,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var department = MongoObjectId.IsValid(reference.Id)
            ? await departments.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (department is null)
        {
            return Results.BadRequest(
                new { message = $"Department '{reference.Id}' was not found." });
        }

        reference.Name = department.DepartmentName;
        return null;
    }

    public static async Task<IResult?> ResolveRoleAsync(
        MasterDataReference? reference,
        IRoleRepository roles,
        CancellationToken cancellationToken)
    {
        if (reference is null || string.IsNullOrWhiteSpace(reference.Id))
        {
            return null;
        }

        var role = MongoObjectId.IsValid(reference.Id)
            ? await roles.GetByIdAsync(reference.Id, cancellationToken)
            : null;

        if (role is null)
        {
            return Results.BadRequest(
                new { message = $"Role '{reference.Id}' was not found." });
        }

        reference.Name = role.RoleName;
        return null;
    }

    public static async Task<IResult?> ResolveBusinessUnitAsync(
        MasterDataReference? reference,
        IBusinessUnitRepository businessUnits,
        CancellationToken cancellationToken)
    {
        return reference is null
            ? null
            : await ResolveBusinessUnitsAsync([reference], businessUnits, cancellationToken);
    }

    public static async Task<IResult?> ResolveDepartmentsAsync(
        IEnumerable<MasterDataReference> references,
        IDepartmentRepository departments,
        CancellationToken cancellationToken)
    {
        foreach (var reference in references.Where(x => !string.IsNullOrWhiteSpace(x.Id)))
        {
            var department = MongoObjectId.IsValid(reference.Id!)
                ? await departments.GetByIdAsync(reference.Id!, cancellationToken)
                : null;

            if (department is null)
            {
                return Results.BadRequest(
                    new { message = $"Department '{reference.Id}' was not found." });
            }

            reference.Name = department.DepartmentName;
        }

        return null;
    }

    public static async Task<IResult?> ResolveSiteAsync(
        MasterDataReference? reference,
        ISiteRepository sites,
        CancellationToken cancellationToken)
    {
        return reference is null
            ? null
            : await ResolveSitesAsync([reference], sites, cancellationToken);
    }

    /// <summary>
    /// Resolves the site of a floor or zone against its parent's site: when none is given the parent's
    /// site is copied, and when one is given it must be the same site the parent sits on.
    /// </summary>
    public static async Task<(MasterDataReference? Site, IResult? Error)> ResolveSiteFromParentAsync(
        MasterDataReference? reference,
        MasterDataReference? parentSite,
        string parentDescription,
        ISiteRepository sites,
        CancellationToken cancellationToken)
    {
        if (reference is null)
        {
            return parentSite is null
                ? (null, null)
                : (new MasterDataReference { Id = parentSite.Id, Name = parentSite.Name }, null);
        }

        var siteError = await ResolveSiteAsync(reference, sites, cancellationToken);

        if (siteError is not null)
        {
            return (reference, siteError);
        }

        if (parentSite?.Id is not null && parentSite.Id != reference.Id)
        {
            return (reference, Results.BadRequest(
                new { message = $"Site '{reference.Name}' does not match the site of {parentDescription} ('{parentSite.Name}')." }));
        }

        return (reference, null);
    }

    public static async Task<IResult?> ResolveSitesAsync(
        IEnumerable<MasterDataReference> references,
        ISiteRepository sites,
        CancellationToken cancellationToken)
    {
        foreach (var reference in references.Where(x => !string.IsNullOrWhiteSpace(x.Id)))
        {
            var site = MongoObjectId.IsValid(reference.Id!)
                ? await sites.GetByIdAsync(reference.Id!, cancellationToken)
                : null;

            if (site is null)
            {
                return Results.BadRequest(
                    new { message = $"Site '{reference.Id}' was not found." });
            }

            reference.Name = site.SiteName;
        }

        return null;
    }

    public static async Task<IResult?> ResolveBusinessUnitsAsync(
        IEnumerable<MasterDataReference> references,
        IBusinessUnitRepository businessUnits,
        CancellationToken cancellationToken)
    {
        foreach (var reference in references.Where(x => !string.IsNullOrWhiteSpace(x.Id)))
        {
            var businessUnit = MongoObjectId.IsValid(reference.Id!)
                ? await businessUnits.GetByIdAsync(reference.Id!, cancellationToken)
                : null;

            if (businessUnit is null)
            {
                return Results.BadRequest(
                    new { message = $"Business unit '{reference.Id}' was not found." });
            }

            reference.Name = businessUnit.BusinessUnitName;
        }

        return null;
    }
}
