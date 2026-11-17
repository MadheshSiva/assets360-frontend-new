using System.Text.RegularExpressions;
using MongoDB.Bson;
using MongoDB.Driver;
using A360.Repository.Repositories;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Repositories;

// Data Export & API persistence: export jobs, API connections, run history (+ generated files) and access logs.

internal static class DataExportScope
{
    public static readonly Collation CaseInsensitive = new("en", strength: CollationStrength.Secondary);

    public static FilterDefinition<T> Filter<T>(string? tenantId, string? clientId)
        where T : A360.Domain.Entities.BaseEntity
    {
        var builder = Builders<T>.Filter;
        var filter = builder.Eq(entity => entity.IsDeleted, false);
        if (!string.IsNullOrWhiteSpace(tenantId))
        {
            filter &= builder.Eq(entity => entity.TenantId, tenantId.Trim());
        }

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            filter &= builder.Eq(entity => entity.ClientId, clientId.Trim());
        }

        return filter;
    }
}

public interface IDataExportJobRepository : IMongoRepository<DataExportJob>
{
    Task<DataExportJob?> GetByJobIdAsync(string jobId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DataExportJob>> ListAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(string name, string? tenantId, string? clientId, string? excludeId, CancellationToken cancellationToken = default);
}

public sealed class DataExportJobRepository : MongoRepository<DataExportJob>, IDataExportJobRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "DataExportJob";

    public DataExportJobRepository(IMongoDatabase database)
        : base(database.GetCollection<DataExportJob>(CollectionName))
    {
    }

    public async Task<DataExportJob?> GetByJobIdAsync(string jobId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(jobId)
            ? null
            : await Collection.Find(DataExportScope.Filter<DataExportJob>(tenantId, clientId) & Builders<DataExportJob>.Filter.Eq(job => job.JobId, jobId.Trim()))
                .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<DataExportJob>> ListAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await Collection.Find(DataExportScope.Filter<DataExportJob>(tenantId, clientId))
            .Sort(Builders<DataExportJob>.Sort.Descending(job => job.CreatedAt).Ascending(job => job.Id))
            .ToListAsync(cancellationToken);

    public async Task<bool> NameExistsAsync(string name, string? tenantId, string? clientId, string? excludeId, CancellationToken cancellationToken = default)
    {
        var builder = Builders<DataExportJob>.Filter;
        var filter = DataExportScope.Filter<DataExportJob>(tenantId, clientId) & builder.Eq(job => job.Name, name.Trim());
        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            filter &= builder.Ne(job => job.Id, excludeId);
        }

        return await Collection.Find(filter, new FindOptions { Collation = DataExportScope.CaseInsensitive }).AnyAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<DataExportJob>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<DataExportJob>(keys.Ascending(job => job.JobId), new CreateIndexOptions { Name = "ux_data_export_job_job_id", Unique = true }),
            new CreateIndexModel<DataExportJob>(
                keys.Ascending(job => job.TenantId).Ascending(job => job.ClientId).Ascending(job => job.Name),
                new CreateIndexOptions { Name = "ix_data_export_job_tenant_id_client_id_name", Collation = DataExportScope.CaseInsensitive })
        ], cancellationToken);
    }
}

public interface IDataExportConnectionRepository : IMongoRepository<DataExportConnection>
{
    Task<DataExportConnection?> GetByConnectionIdAsync(string connectionId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DataExportConnection>> ListAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    Task<bool> NameExistsAsync(string name, string? tenantId, string? clientId, string? excludeId, CancellationToken cancellationToken = default);
}

public sealed class DataExportConnectionRepository : MongoRepository<DataExportConnection>, IDataExportConnectionRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "DataExportConnection";

    public DataExportConnectionRepository(IMongoDatabase database)
        : base(database.GetCollection<DataExportConnection>(CollectionName))
    {
    }

    public async Task<DataExportConnection?> GetByConnectionIdAsync(string connectionId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(connectionId)
            ? null
            : await Collection.Find(DataExportScope.Filter<DataExportConnection>(tenantId, clientId)
                    & Builders<DataExportConnection>.Filter.Eq(connection => connection.ConnectionId, connectionId.Trim()))
                .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<DataExportConnection>> ListAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await Collection.Find(DataExportScope.Filter<DataExportConnection>(tenantId, clientId))
            .Sort(Builders<DataExportConnection>.Sort.Ascending(connection => connection.CreatedAt).Ascending(connection => connection.Id))
            .ToListAsync(cancellationToken);

    public async Task<bool> NameExistsAsync(string name, string? tenantId, string? clientId, string? excludeId, CancellationToken cancellationToken = default)
    {
        var builder = Builders<DataExportConnection>.Filter;
        var filter = DataExportScope.Filter<DataExportConnection>(tenantId, clientId) & builder.Eq(connection => connection.Name, name.Trim());
        if (!string.IsNullOrWhiteSpace(excludeId))
        {
            filter &= builder.Ne(connection => connection.Id, excludeId);
        }

        return await Collection.Find(filter, new FindOptions { Collation = DataExportScope.CaseInsensitive }).AnyAsync(cancellationToken);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<DataExportConnection>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<DataExportConnection>(
                keys.Ascending(connection => connection.ConnectionId),
                new CreateIndexOptions { Name = "ux_data_export_connection_connection_id", Unique = true }),
            new CreateIndexModel<DataExportConnection>(
                keys.Ascending(connection => connection.TenantId).Ascending(connection => connection.ClientId).Ascending(connection => connection.Name),
                new CreateIndexOptions { Name = "ix_data_export_connection_tenant_id_client_id_name", Collation = DataExportScope.CaseInsensitive })
        ], cancellationToken);
    }
}

public interface IDataExportRunRepository : IMongoRepository<DataExportRun>
{
    Task<DataExportRun?> GetByRunIdAsync(string runId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);

    /// <summary>Runs started at or after fromUtc (all when null), newest first; jobId narrows to one job.</summary>
    Task<IReadOnlyList<DataExportRun>> ListAsync(
        string? tenantId, string? clientId, string? jobId, DateTime? fromUtc, int limit, CancellationToken cancellationToken = default);

    Task SaveFileAsync(DataExportRunFile file, CancellationToken cancellationToken = default);

    Task<DataExportRunFile?> GetFileAsync(string runId, string? tenantId, string? clientId, CancellationToken cancellationToken = default);
}

public sealed class DataExportRunRepository : MongoRepository<DataExportRun>, IDataExportRunRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "DataExportRun";
    public const string FileCollectionName = "DataExportRunFile";

    private readonly IMongoCollection<DataExportRunFile> _files;

    public DataExportRunRepository(IMongoDatabase database)
        : base(database.GetCollection<DataExportRun>(CollectionName))
    {
        _files = database.GetCollection<DataExportRunFile>(FileCollectionName);
    }

    public async Task<DataExportRun?> GetByRunIdAsync(string runId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(runId)
            ? null
            : await Collection.Find(DataExportScope.Filter<DataExportRun>(tenantId, clientId) & Builders<DataExportRun>.Filter.Eq(run => run.RunId, runId.Trim()))
                .FirstOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<DataExportRun>> ListAsync(
        string? tenantId, string? clientId, string? jobId, DateTime? fromUtc, int limit, CancellationToken cancellationToken = default)
    {
        var builder = Builders<DataExportRun>.Filter;
        var filter = DataExportScope.Filter<DataExportRun>(tenantId, clientId);
        if (!string.IsNullOrWhiteSpace(jobId))
        {
            filter &= builder.Eq(run => run.JobId, jobId.Trim());
        }

        if (fromUtc is not null)
        {
            filter &= builder.Gte(run => run.StartedAt, fromUtc.Value);
        }

        var find = Collection.Find(filter).Sort(Builders<DataExportRun>.Sort.Descending(run => run.StartedAt).Descending(run => run.Id));
        if (limit > 0)
        {
            find = find.Limit(limit);
        }

        return await find.ToListAsync(cancellationToken);
    }

    public async Task SaveFileAsync(DataExportRunFile file, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(file.Id))
        {
            file.Id = ObjectId.GenerateNewId().ToString();
        }

        await _files.InsertOneAsync(file, cancellationToken: cancellationToken);
    }

    public async Task<DataExportRunFile?> GetFileAsync(string runId, string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        await _files.Find(DataExportScope.Filter<DataExportRunFile>(tenantId, clientId) & Builders<DataExportRunFile>.Filter.Eq(file => file.RunId, runId.Trim()))
            .FirstOrDefaultAsync(cancellationToken);

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<DataExportRun>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<DataExportRun>(keys.Ascending(run => run.RunId), new CreateIndexOptions { Name = "ux_data_export_run_run_id", Unique = true }),
            new CreateIndexModel<DataExportRun>(
                keys.Ascending(run => run.TenantId).Ascending(run => run.ClientId).Descending(run => run.StartedAt),
                new CreateIndexOptions { Name = "ix_data_export_run_tenant_id_client_id_started_at" }),
            new CreateIndexModel<DataExportRun>(keys.Ascending(run => run.JobId), new CreateIndexOptions { Name = "ix_data_export_run_job_id" })
        ], cancellationToken);

        await _files.Indexes.CreateOneAsync(
            new CreateIndexModel<DataExportRunFile>(
                Builders<DataExportRunFile>.IndexKeys.Ascending(file => file.RunId),
                new CreateIndexOptions { Name = "ux_data_export_run_file_run_id", Unique = true }),
            cancellationToken: cancellationToken);
    }
}

/// <summary>Access Logs tab query. PageSize 0 returns every match.</summary>
public sealed record DataExportAccessLogQuery(
    string? TenantId,
    string? ClientId,
    string? Search,
    string? Result,
    string? Resource,
    DateTime? FromUtc,
    int Page,
    int PageSize);

public interface IDataExportAccessLogRepository : IMongoRepository<DataExportAccessLog>
{
    Task<(IReadOnlyList<DataExportAccessLog> Items, long TotalCount)> QueryAsync(DataExportAccessLogQuery query, CancellationToken cancellationToken = default);
}

public sealed class DataExportAccessLogRepository : MongoRepository<DataExportAccessLog>, IDataExportAccessLogRepository, IMongoIndexConfigurator
{
    public const string CollectionName = "DataExportAccessLog";

    public DataExportAccessLogRepository(IMongoDatabase database)
        : base(database.GetCollection<DataExportAccessLog>(CollectionName))
    {
    }

    public async Task<(IReadOnlyList<DataExportAccessLog> Items, long TotalCount)> QueryAsync(
        DataExportAccessLogQuery query,
        CancellationToken cancellationToken = default)
    {
        var builder = Builders<DataExportAccessLog>.Filter;
        var filter = DataExportScope.Filter<DataExportAccessLog>(query.TenantId, query.ClientId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = new BsonRegularExpression(Regex.Escape(query.Search.Trim()), "i");
            filter &= builder.Or(
                builder.Regex(log => log.Actor, pattern),
                builder.Regex(log => log.Action, pattern),
                builder.Regex(log => log.Resource, pattern),
                builder.Regex(log => log.Client, pattern),
                builder.Regex(log => log.Ip, pattern));
        }

        if (!string.IsNullOrWhiteSpace(query.Result))
        {
            filter &= builder.Eq(log => log.Result, query.Result.Trim());
        }

        if (!string.IsNullOrWhiteSpace(query.Resource))
        {
            filter &= builder.Eq(log => log.Resource, query.Resource.Trim());
        }

        if (query.FromUtc is not null)
        {
            filter &= builder.Gte(log => log.At, query.FromUtc.Value);
        }

        var find = Collection.Find(filter).Sort(Builders<DataExportAccessLog>.Sort.Descending(log => log.At).Descending(log => log.Id));
        if (query.PageSize > 0)
        {
            find = find.Skip((Math.Max(1, query.Page) - 1) * query.PageSize).Limit(query.PageSize);
        }

        var items = await find.ToListAsync(cancellationToken);
        var total = query.PageSize > 0 ? await Collection.CountDocumentsAsync(filter, cancellationToken: cancellationToken) : items.Count;
        return (items, total);
    }

    public async Task CreateIndexesAsync(CancellationToken cancellationToken = default)
    {
        var keys = Builders<DataExportAccessLog>.IndexKeys;
        await Collection.Indexes.CreateManyAsync(
        [
            new CreateIndexModel<DataExportAccessLog>(keys.Ascending(log => log.LogId), new CreateIndexOptions { Name = "ux_data_export_access_log_log_id", Unique = true }),
            new CreateIndexModel<DataExportAccessLog>(
                keys.Ascending(log => log.TenantId).Ascending(log => log.ClientId).Descending(log => log.At),
                new CreateIndexOptions { Name = "ix_data_export_access_log_tenant_id_client_id_at" })
        ], cancellationToken);
    }
}
