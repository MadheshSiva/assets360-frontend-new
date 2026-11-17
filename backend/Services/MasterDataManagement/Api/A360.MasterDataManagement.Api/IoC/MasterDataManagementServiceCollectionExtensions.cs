using MongoDB.Driver;
using A360.MasterDataManagement.Repository.Repositories;
using A360.Repository.Activity;
using A360.Repository.Repositories;
using A360.Repository.Settings;
using A360.Security;

namespace A360.MasterDataManagement.Api.IoC;

public static class MasterDataManagementServiceCollectionExtensions
{
    public static IServiceCollection AddMasterDataManagementApiServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var mongoDbSettings = new MongoDbSettings
        {
            ConnectionString = configuration[$"{MongoDbSettings.SectionName}:ConnectionString"] ?? string.Empty,
            DatabaseName = configuration[$"{MongoDbSettings.SectionName}:DatabaseName"] ?? string.Empty
        };

        mongoDbSettings.Validate();

        services.AddSingleton(mongoDbSettings);
        services.AddSingleton<IMongoClient>(_ => new MongoClient(mongoDbSettings.ConnectionString));
        services.AddSingleton(serviceProvider =>
        {
            var client = serviceProvider.GetRequiredService<IMongoClient>();
            return client.GetDatabase(mongoDbSettings.DatabaseName);
        });

        services.AddA360JwtAuthentication(configuration);

        services.AddScoped<EventLogRepository>();
        services.AddScoped<IEventLogRepository>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddScoped<IEventLogger>(serviceProvider => new EventLogger(
            serviceProvider.GetRequiredService<IEventLogRepository>(),
            "MasterDataManagement",
            serviceProvider.GetRequiredService<ICurrentUserAccessor>()));

        services.AddScoped<MasterDataItemRepository>();
        services.AddScoped<IMasterDataItemRepository>(serviceProvider => serviceProvider.GetRequiredService<MasterDataItemRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<MasterDataItemRepository>());

        services.AddScoped<LocationRepository>();
        services.AddScoped<ILocationRepository>(serviceProvider => serviceProvider.GetRequiredService<LocationRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<LocationRepository>());

        services.AddScoped<BusinessUnitRepository>();
        services.AddScoped<IBusinessUnitRepository>(serviceProvider => serviceProvider.GetRequiredService<BusinessUnitRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<BusinessUnitRepository>());

        services.AddScoped<OrganizationRepository>();
        services.AddScoped<IOrganizationRepository>(serviceProvider => serviceProvider.GetRequiredService<OrganizationRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<OrganizationRepository>());

        services.AddScoped<DepartmentRepository>();
        services.AddScoped<IDepartmentRepository>(serviceProvider => serviceProvider.GetRequiredService<DepartmentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<DepartmentRepository>());

        services.AddScoped<SiteRepository>();
        services.AddScoped<ISiteRepository>(serviceProvider => serviceProvider.GetRequiredService<SiteRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<SiteRepository>());

        services.AddScoped<BuildingRepository>();
        services.AddScoped<IBuildingRepository>(serviceProvider => serviceProvider.GetRequiredService<BuildingRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<BuildingRepository>());

        services.AddScoped<FloorRepository>();
        services.AddScoped<IFloorRepository>(serviceProvider => serviceProvider.GetRequiredService<FloorRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<FloorRepository>());

        services.AddScoped<ZoneRepository>();
        services.AddScoped<IZoneRepository>(serviceProvider => serviceProvider.GetRequiredService<ZoneRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ZoneRepository>());

        services.AddScoped<AssetCategoryRepository>();
        services.AddScoped<IAssetCategoryRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryRepository>());

        services.AddScoped<ISharedAssetCategoryRepository, SharedAssetCategoryRepository>();

        services.AddScoped<AssetTypeRepository>();
        services.AddScoped<IAssetTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetTypeRepository>());

        services.AddScoped<AssetModelRepository>();
        services.AddScoped<IAssetModelRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetModelRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetModelRepository>());

        services.AddScoped<ManufacturerRepository>();
        services.AddScoped<IManufacturerRepository>(serviceProvider => serviceProvider.GetRequiredService<ManufacturerRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ManufacturerRepository>());

        services.AddScoped<ConditionRepository>();
        services.AddScoped<IConditionRepository>(serviceProvider => serviceProvider.GetRequiredService<ConditionRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ConditionRepository>());

        services.AddScoped<CriticalityRepository>();
        services.AddScoped<ICriticalityRepository>(serviceProvider => serviceProvider.GetRequiredService<CriticalityRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<CriticalityRepository>());

        services.AddScoped<EmployeeRepository>();
        services.AddScoped<IEmployeeRepository>(serviceProvider => serviceProvider.GetRequiredService<EmployeeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<EmployeeRepository>());

        services.AddScoped<TechnicianRepository>();
        services.AddScoped<ITechnicianRepository>(serviceProvider => serviceProvider.GetRequiredService<TechnicianRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<TechnicianRepository>());

        services.AddScoped<SkillRepository>();
        services.AddScoped<ISkillRepository>(serviceProvider => serviceProvider.GetRequiredService<SkillRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<SkillRepository>());

        services.AddScoped<TeamRepository>();
        services.AddScoped<ITeamRepository>(serviceProvider => serviceProvider.GetRequiredService<TeamRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<TeamRepository>());

        services.AddScoped<ShiftRepository>();
        services.AddScoped<IShiftRepository>(serviceProvider => serviceProvider.GetRequiredService<ShiftRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ShiftRepository>());

        services.AddScoped<SupplierRepository>();
        services.AddScoped<ISupplierRepository>(serviceProvider => serviceProvider.GetRequiredService<SupplierRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<SupplierRepository>());

        services.AddScoped<ServiceProviderRepository>();
        services.AddScoped<IServiceProviderRepository>(serviceProvider => serviceProvider.GetRequiredService<ServiceProviderRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ServiceProviderRepository>());

        services.AddScoped<AmcVendorRepository>();
        services.AddScoped<IAmcVendorRepository>(serviceProvider => serviceProvider.GetRequiredService<AmcVendorRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AmcVendorRepository>());

        services.AddScoped<MaintenanceTypeRepository>();
        services.AddScoped<IMaintenanceTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<MaintenanceTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<MaintenanceTypeRepository>());

        services.AddScoped<WorkTypeRepository>();
        services.AddScoped<IWorkTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<WorkTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<WorkTypeRepository>());

        services.AddScoped<FailureCodeRepository>();
        services.AddScoped<IFailureCodeRepository>(serviceProvider => serviceProvider.GetRequiredService<FailureCodeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<FailureCodeRepository>());

        services.AddScoped<TaskTemplateRepository>();
        services.AddScoped<ITaskTemplateRepository>(serviceProvider => serviceProvider.GetRequiredService<TaskTemplateRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<TaskTemplateRepository>());

        services.AddScoped<ChecklistRepository>();
        services.AddScoped<IChecklistRepository>(serviceProvider => serviceProvider.GetRequiredService<ChecklistRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ChecklistRepository>());

        services.AddScoped<PrioritySeverityRepository>();
        services.AddScoped<IPrioritySeverityRepository>(serviceProvider => serviceProvider.GetRequiredService<PrioritySeverityRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<PrioritySeverityRepository>());

        services.AddScoped<ItemCategoryRepository>();
        services.AddScoped<IItemCategoryRepository>(serviceProvider => serviceProvider.GetRequiredService<ItemCategoryRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ItemCategoryRepository>());

        services.AddScoped<UomRepository>();
        services.AddScoped<IUomRepository>(serviceProvider => serviceProvider.GetRequiredService<UomRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<UomRepository>());

        services.AddScoped<ItemRepository>();
        services.AddScoped<IItemRepository>(serviceProvider => serviceProvider.GetRequiredService<ItemRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ItemRepository>());

        services.AddScoped<WarehouseRepository>();
        services.AddScoped<IWarehouseRepository>(serviceProvider => serviceProvider.GetRequiredService<WarehouseRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<WarehouseRepository>());

        services.AddScoped<StoreRepository>();
        services.AddScoped<IStoreRepository>(serviceProvider => serviceProvider.GetRequiredService<StoreRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<StoreRepository>());

        services.AddScoped<BinRepository>();
        services.AddScoped<IBinRepository>(serviceProvider => serviceProvider.GetRequiredService<BinRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<BinRepository>());

        services.AddScoped<StockStatusRepository>();
        services.AddScoped<IStockStatusRepository>(serviceProvider => serviceProvider.GetRequiredService<StockStatusRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<StockStatusRepository>());

        services.AddScoped<CertificationTypeRepository>();
        services.AddScoped<ICertificationTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<CertificationTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<CertificationTypeRepository>());

        services.AddScoped<RegulationRepository>();
        services.AddScoped<IRegulationRepository>(serviceProvider => serviceProvider.GetRequiredService<RegulationRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<RegulationRepository>());

        services.AddScoped<StandardRepository>();
        services.AddScoped<IStandardRepository>(serviceProvider => serviceProvider.GetRequiredService<StandardRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<StandardRepository>());

        services.AddScoped<PermitTypeRepository>();
        services.AddScoped<IPermitTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<PermitTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<PermitTypeRepository>());

        services.AddScoped<ApiSyncStatusRepository>();
        services.AddScoped<IApiSyncStatusRepository>(serviceProvider => serviceProvider.GetRequiredService<ApiSyncStatusRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ApiSyncStatusRepository>());

        services.AddScoped<UpdateSourceRepository>();
        services.AddScoped<IUpdateSourceRepository>(serviceProvider => serviceProvider.GetRequiredService<UpdateSourceRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<UpdateSourceRepository>());

        services.AddScoped<ChartTypeRepository>();
        services.AddScoped<IChartTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<ChartTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ChartTypeRepository>());

        services.AddScoped<SystemSettingsRepository>();
        services.AddScoped<ISystemSettingsRepository>(serviceProvider => serviceProvider.GetRequiredService<SystemSettingsRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<SystemSettingsRepository>());

        services.AddScoped<ModuleAccessRepository>();
        services.AddScoped<IModuleAccessRepository>(serviceProvider => serviceProvider.GetRequiredService<ModuleAccessRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<ModuleAccessRepository>());

        services.AddScoped<PermissionRepository>();
        services.AddScoped<IPermissionRepository>(serviceProvider => serviceProvider.GetRequiredService<PermissionRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<PermissionRepository>());

        services.AddScoped<RoleRepository>();
        services.AddScoped<IRoleRepository>(serviceProvider => serviceProvider.GetRequiredService<RoleRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<RoleRepository>());

        services.AddScoped<SystemUserRepository>();
        services.AddScoped<ISystemUserRepository>(serviceProvider => serviceProvider.GetRequiredService<SystemUserRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<SystemUserRepository>());

        services.AddHostedService<MongoIndexHostedService>();

        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
            {
                Title = "A360 Master Data Management API",
                Version = "v1"
            });
        });

        return services;
    }
}
