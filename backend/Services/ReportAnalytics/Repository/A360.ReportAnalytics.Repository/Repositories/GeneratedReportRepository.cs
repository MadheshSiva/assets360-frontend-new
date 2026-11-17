using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

// Generated Reports persistence: each report with the snapshot of rows it was generated with.

public interface IGeneratedReportRepository : IMongoRepository<GeneratedReport>
{
    Task<GeneratedReport?> GetByReportIdAsync(string reportId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Reports without their rows, newest first; recurrence narrows to Once / Daily / Weekly / Monthly.</summary>
    Task<IReadOnlyList<GeneratedReport>> ListAsync(string? tenantId, string? clientId, string? recurrence, CancellationToken cancellationToken = default);
}

public sealed class GeneratedReportRepository : MongoRepository<GeneratedReport>, IGeneratedReportRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "GeneratedReport";

    public GeneratedReportRepository(IMongoDatabase database)
        : base(database.GetCollection<GeneratedReport>(CollectionName))
    {
    }

    public async Task<GeneratedReport?> GetByReportIdAsync(string reportId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(reportId)
            ? null
            : await Collection.Find(DataExportScope.Filter<GeneratedReport>(tenantId, clientId)
                    & Builders<GeneratedReport>.Filter.Eq(report => report.ReportId, reportId.Trim()))
                .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<GeneratedReport>> ListAsync(string? tenantId, string? clientId, string? recurrence, CancellationToken cancellationToken = default)
    {
        var filter = DataExportScope.Filter<GeneratedReport>(tenantId, clientId);
        if (!string.IsNullOrWhiteSpace(recurrence))
        {
            filter &= Builders<GeneratedReport>.Filter.Eq(report => report.Recurrence, recurrence.Trim());
        }

        return await Collection.Find(filter)
            .Sort(Builders<GeneratedReport>.Sort.Descending(report => report.CreatedAt).Descending(report => report.Id))
            .Project<GeneratedReport>(Builders<GeneratedReport>.Projection.Exclude(report => report.Rows))
            .ToListAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<GeneratedReport>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<GeneratedReport>(keys.Ascending(report => report.ReportId), new CreateIndexOptions { Name = "ux_generated_report_report_id", Unique = true }),
            new CreateIndexModel<GeneratedReport>(
                keys.Ascending(report => report.TenantId).Ascending(report => report.ClientId).Descending(report => report.CreatedAt),
                new CreateIndexOptions { Name = "ix_generated_report_tenant_id_client_id_created_at" })
        ], cancellationToken);
    }
}
