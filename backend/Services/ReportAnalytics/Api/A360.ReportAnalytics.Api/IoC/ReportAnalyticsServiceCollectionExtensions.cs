using MongoDB.Driver;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Repository.Activity;
using A360.Repository.Repositories;
using A360.Repository.Sequences;
using A360.Repository.Settings;
using A360.Security;

namespace A360.ReportAnalytics.Api.IoC;

public static class ReportAnalyticsServiceCollectionExtensions
{
    public static IServiceCollection AddReportAnalyticsApiServices(
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

        services.AddA360JwtAuthentication(configuration);

        services.AddScoped<EventLogRepository>();
        services.AddScoped<IEventLogRepository>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<EventLogRepository>());
        services.AddScoped<IEventLogger>(serviceProvider => new EventLogger(
            serviceProvider.GetRequiredService<IEventLogRepository>(),
            "ReportAnalytics",
            serviceProvider.GetRequiredService<ICurrentUserAccessor>()));

        services.AddScoped<StandardReportRepository>();
        services.AddScoped<IStandardReportRepository>(serviceProvider => serviceProvider.GetRequiredService<StandardReportRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<StandardReportRepository>());

        services.AddScoped<CustomReportRepository>();
        services.AddScoped<ICustomReportRepository>(serviceProvider => serviceProvider.GetRequiredService<CustomReportRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<CustomReportRepository>());

        services.AddScoped<IReportDataRepository, ReportDataRepository>();

        services.AddScoped<InteractiveDashboardRepository>();
        services.AddScoped<IInteractiveDashboardRepository>(serviceProvider => serviceProvider.GetRequiredService<InteractiveDashboardRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<InteractiveDashboardRepository>());

        services.AddScoped<IDashboardDataRepository, DashboardDataRepository>();

        services.AddScoped<AssetPerformanceViewRepository>();
        services.AddScoped<IAssetPerformanceViewRepository>(serviceProvider => serviceProvider.GetRequiredService<AssetPerformanceViewRepository>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<AssetPerformanceViewRepository>());

        services.AddScoped<IFinancialAnalyticsDataRepository, FinancialAnalyticsDataRepository>();
        AddIndexedRepository<IFinancialAnalyticsCapexRequestRepository, FinancialAnalyticsCapexRequestRepository>(services);

        services.AddScoped<IInventoryAnalyticsDataRepository, InventoryAnalyticsDataRepository>();
        AddIndexedRepository<IInventoryAnalyticsViewRepository, InventoryAnalyticsViewRepository>(services);
        AddIndexedRepository<IInventoryAnalyticsActionRequestRepository, InventoryAnalyticsActionRequestRepository>(services);

        services.AddScoped<IComplianceAnalyticsDataRepository, ComplianceAnalyticsDataRepository>();
        AddIndexedRepository<IComplianceAnalyticsViewRepository, ComplianceAnalyticsViewRepository>(services);
        AddIndexedRepository<IComplianceActionPlanRepository, ComplianceActionPlanRepository>(services);

        services.AddScoped<IIotUtilizationAnalyticsDataRepository, IotUtilizationAnalyticsDataRepository>();
        AddIndexedRepository<IIotUtilizationAnalyticsViewRepository, IotUtilizationAnalyticsViewRepository>(services);
        AddIndexedRepository<IIotUtilizationAnalyticsActionPlanRepository, IotUtilizationAnalyticsActionPlanRepository>(services);

        services.AddScoped<IPredictiveAnalyticsDataRepository, PredictiveAnalyticsDataRepository>();
        AddIndexedRepository<IPredictiveAnalyticsViewRepository, PredictiveAnalyticsViewRepository>(services);

        AddIndexedRepository<IKpiDashboardKpiRepository, KpiDashboardKpiRepository>(services);
        AddIndexedRepository<IKpiDashboardLayoutRepository, KpiDashboardLayoutRepository>(services);

        services.AddScoped<IDataExportDataRepository, DataExportDataRepository>();
        AddIndexedRepository<IDataExportJobRepository, DataExportJobRepository>(services);
        AddIndexedRepository<IDataExportConnectionRepository, DataExportConnectionRepository>(services);
        AddIndexedRepository<IDataExportRunRepository, DataExportRunRepository>(services);
        AddIndexedRepository<IDataExportAccessLogRepository, DataExportAccessLogRepository>(services);

        AddIndexedRepository<IGeneratedReportRepository, GeneratedReportRepository>(services);

        services.AddHostedService<MongoIndexHostedService>();

        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
            {
                Title = "A360 Report Analytics API",
                Version = "v1"
            });
        });

        return services;
    }

    // Registers a Mongo repository once and exposes it as its interface and as an index configurator for MongoIndexHostedService.
    private static void AddIndexedRepository<TInterface, TImplementation>(IServiceCollection services)
        where TInterface : class
        where TImplementation : class, TInterface, IMongoIndexConfigurator
    {
        services.AddScoped<TImplementation>();
        services.AddScoped<TInterface>(serviceProvider => serviceProvider.GetRequiredService<TImplementation>());
        services.AddScoped<IMongoIndexConfigurator>(serviceProvider => serviceProvider.GetRequiredService<TImplementation>());
    }
}
