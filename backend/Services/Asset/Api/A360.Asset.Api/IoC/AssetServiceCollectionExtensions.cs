using MongoDB.Driver;
using A360.Asset.Api.Endpoints;
using A360.Asset.Repository.Repositories;
using A360.Repository.Activity;
using A360.Repository.Repositories;
using A360.Repository.Sequences;
using A360.Repository.Settings;
using A360.Security;

namespace A360.Asset.Api.IoC;

public static class AssetServiceCollectionExtensions
{
    public static IServiceCollection AddAssetApiServices(
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

        services.AddSingleton<ISequenceGenerator, MongoSequenceGenerator>();

        services.AddScoped<EventLogRepository>();
        services.AddScoped<IEventLogRepository>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddA360JwtAuthentication(configuration);
        services.AddScoped<IEventLogger>(serviceProvider => new EventLogger(
            serviceProvider.GetRequiredService<IEventLogRepository>(),
            "Asset",
            serviceProvider.GetRequiredService<ICurrentUserAccessor>()));

        services.AddScoped<AssetRegistrationDraftRepository>();
        services.AddScoped<IAssetRegistrationDraftRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetRegistrationDraftRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetRegistrationDraftRepository>());

        services.AddScoped<AssetRegistrationRepository>();
        services.AddScoped<IAssetRegistrationRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetRegistrationRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetRegistrationRepository>());

        services.AddScoped<AssetCategoryRepository>();
        services.AddScoped<IAssetCategoryRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryRepository>());

        services.AddScoped<AssetCategoryTypeRepository>();
        services.AddScoped<IAssetCategoryTypeRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryTypeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetCategoryTypeRepository>());

        services.AddScoped<AssetModelRepository>();
        services.AddScoped<IAssetModelRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetModelRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetModelRepository>());

        services.AddScoped<AssetHierarchyItemRepository>();
        services.AddScoped<IAssetHierarchyItemRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetHierarchyItemRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetHierarchyItemRepository>());

        services.AddScoped<AssetComponentRepository>();
        services.AddScoped<IAssetComponentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetComponentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetComponentRepository>());

        services.AddScoped<AssetCustomFieldRepository>();
        services.AddScoped<IAssetCustomFieldRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetCustomFieldRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetCustomFieldRepository>());

        services.AddScoped<AssetFieldGroupRepository>();
        services.AddScoped<IAssetFieldGroupRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetFieldGroupRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetFieldGroupRepository>());

        services.AddScoped<AssetFieldLayoutRepository>();
        services.AddScoped<IAssetFieldLayoutRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetFieldLayoutRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetFieldLayoutRepository>());
        services.AddScoped<AssetFieldLayoutEndpoints.LayoutContextLoader>();

        services.AddScoped<AssetDocumentRepository>();
        services.AddScoped<IAssetDocumentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetDocumentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetDocumentRepository>());

        services.AddScoped<AssetImageRepository>();
        services.AddScoped<IAssetImageRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetImageRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetImageRepository>());

        services.AddScoped<AssetRelationshipRepository>();
        services.AddScoped<IAssetRelationshipRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetRelationshipRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetRelationshipRepository>());

        services.AddScoped<AssetConditionAssessmentRepository>();
        services.AddScoped<IAssetConditionAssessmentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetConditionAssessmentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetConditionAssessmentRepository>());

        services.AddScoped<AssetStatusConditionChangeRepository>();
        services.AddScoped<IAssetStatusConditionChangeRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetStatusConditionChangeRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetStatusConditionChangeRepository>());

        services.AddScoped<AssetCriticalityAssessmentRepository>();
        services.AddScoped<IAssetCriticalityAssessmentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetCriticalityAssessmentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetCriticalityAssessmentRepository>());

        services.AddScoped<AssetRiskMitigationActionRepository>();
        services.AddScoped<IAssetRiskMitigationActionRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetRiskMitigationActionRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetRiskMitigationActionRepository>());

        services.AddScoped<AssetAssignmentRepository>();
        services.AddScoped<IAssetAssignmentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetAssignmentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetAssignmentRepository>());

        services.AddScoped<AssetBulkAssignmentRepository>();
        services.AddScoped<IAssetBulkAssignmentRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetBulkAssignmentRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetBulkAssignmentRepository>());
        services.AddScoped<IAssignmentMasterDataRepository, AssignmentMasterDataRepository>();

        services.AddScoped<AssetAuditRepository>();
        services.AddScoped<IAssetAuditRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetAuditRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetAuditRepository>());

        services.AddScoped<AssetDisposalRequestRepository>();
        services.AddScoped<IAssetDisposalRequestRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetDisposalRequestRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetDisposalRequestRepository>());

        services.AddScoped<AssetServiceRequestRepository>();
        services.AddScoped<IAssetServiceRequestRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetServiceRequestRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetServiceRequestRepository>());
        services.AddScoped<IMaintenanceLookupRepository, MaintenanceLookupRepository>();
        services.AddScoped<IStatusConditionLookupRepository, StatusConditionLookupRepository>();

        services.AddHostedService<MongoIndexHostedService>();
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen();

        return services;
    }
}
