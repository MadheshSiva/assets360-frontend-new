using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A row filter on an export job: dataset field name, operator and value as entered in the Export Builder.</summary>
public sealed class DataExportFilter
{
    [BsonElement("field")]
    public string Field { get; set; } = string.Empty;

    [BsonElement("operator")]
    public string Operator { get; set; } = string.Empty;

    [BsonElement("value")]
    public string Value { get; set; } = string.Empty;
}

/// <summary>
/// Reports &amp; Analytics / Data Export &amp; API: a saved export job. Status (Draft, Scheduled, Running, Success, Failed, Paused)
/// lives on BaseEntity.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class DataExportJob : BaseEntity
{
    // Business identifier exposed to clients (e.g. EXP-0001).
    [BsonElement("job_id")]
    public string JobId { get; set; } = string.Empty;

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("dataset_id")]
    public string DatasetId { get; set; } = string.Empty;

    [BsonElement("module")]
    public string Module { get; set; } = string.Empty;

    [BsonElement("format")]
    public string Format { get; set; } = string.Empty;

    [BsonElement("delivery")]
    public string Delivery { get; set; } = string.Empty;

    // Bucket path, SFTP host/folder, recipients, or the API connection name.
    [BsonElement("target")]
    public string Target { get; set; } = string.Empty;

    [BsonElement("frequency")]
    public string Frequency { get; set; } = string.Empty;

    // "HH:mm", "Mon HH:mm", "MM" (hourly), "Continuous" or "Manual".
    [BsonElement("time")]
    public string Time { get; set; } = string.Empty;

    [BsonElement("time_zone")]
    public string TimeZone { get; set; } = "UTC";

    [BsonElement("fields")]
    public List<string> Fields { get; set; } = [];

    [BsonElement("filters")]
    public List<DataExportFilter> Filters { get; set; } = [];

    [BsonElement("encrypted")]
    public bool Encrypted { get; set; }

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    [BsonElement("last_run_id")]
    public string? LastRunId { get; set; }

    [BsonElement("last_run_at")]
    public DateTime? LastRunAt { get; set; }

    [BsonElement("next_run_at")]
    public DateTime? NextRunAt { get; set; }

    [BsonElement("last_error")]
    public string? LastError { get; set; }

    [BsonElement("last_row_count")]
    public long? LastRowCount { get; set; }

    [BsonElement("last_size_bytes")]
    public long? LastSizeBytes { get; set; }

    [BsonElement("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}

/// <summary>One run of an export job: what was generated and whether it was delivered. Status is Success or Failed.</summary>
[BsonIgnoreExtraElements]
public sealed class DataExportRun : BaseEntity
{
    [BsonElement("run_id")]
    public string RunId { get; set; } = string.Empty;

    [BsonElement("job_id")]
    public string JobId { get; set; } = string.Empty;

    [BsonElement("job_name")]
    public string JobName { get; set; } = string.Empty;

    [BsonElement("dataset_id")]
    public string DatasetId { get; set; } = string.Empty;

    [BsonElement("format")]
    public string Format { get; set; } = string.Empty;

    [BsonElement("delivery")]
    public string Delivery { get; set; } = string.Empty;

    [BsonElement("target")]
    public string Target { get; set; } = string.Empty;

    [BsonElement("started_at")]
    public DateTime StartedAt { get; set; }

    [BsonElement("finished_at")]
    public DateTime? FinishedAt { get; set; }

    [BsonElement("duration_ms")]
    public long DurationMs { get; set; }

    [BsonElement("row_count")]
    public long RowCount { get; set; }

    [BsonElement("size_bytes")]
    public long SizeBytes { get; set; }

    [BsonElement("file_name")]
    public string? FileName { get; set; }

    [BsonElement("content_type")]
    public string? ContentType { get; set; }

    [BsonElement("has_file")]
    public bool HasFile { get; set; }

    // "Delivered" or "Not delivered"; delivery_message says why.
    [BsonElement("delivery_status")]
    public string DeliveryStatus { get; set; } = string.Empty;

    [BsonElement("delivery_message")]
    public string? DeliveryMessage { get; set; }

    [BsonElement("error")]
    public string? Error { get; set; }

    [BsonElement("triggered_by")]
    public string? TriggeredBy { get; set; }
}

/// <summary>The generated file of a run, kept apart from the run so run history stays small.</summary>
[BsonIgnoreExtraElements]
public sealed class DataExportRunFile : BaseEntity
{
    [BsonElement("run_id")]
    public string RunId { get; set; } = string.Empty;

    [BsonElement("file_name")]
    public string FileName { get; set; } = string.Empty;

    [BsonElement("content_type")]
    public string ContentType { get; set; } = string.Empty;

    [BsonElement("content")]
    public byte[] Content { get; set; } = [];
}

/// <summary>A connection test: when, whether the endpoint answered, and what it said.</summary>
public sealed class DataExportConnectionTest
{
    [BsonElement("at")]
    public DateTime At { get; set; }

    [BsonElement("ok")]
    public bool Ok { get; set; }

    [BsonElement("http_status")]
    public int? HttpStatus { get; set; }

    [BsonElement("latency_ms")]
    public long? LatencyMs { get; set; }

    [BsonElement("message")]
    public string? Message { get; set; }
}

/// <summary>
/// A reporting / analytics system that receives data feeds. Only a masked form of the secret is stored, never the secret itself.
/// Status (Untested, Connected, Warning, Disconnected) lives on BaseEntity.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class DataExportConnection : BaseEntity
{
    [BsonElement("connection_id")]
    public string ConnectionId { get; set; } = string.Empty;

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("type")]
    public string Type { get; set; } = string.Empty;

    [BsonElement("base_url")]
    public string BaseUrl { get; set; } = string.Empty;

    [BsonElement("auth")]
    public string Auth { get; set; } = string.Empty;

    [BsonElement("auth_client_id")]
    public string? AuthClientId { get; set; }

    // e.g. "••••••••3f9a"; the plaintext secret is never persisted.
    [BsonElement("secret_mask")]
    public string? SecretMask { get; set; }

    [BsonElement("secret_set_at")]
    public DateTime? SecretSetAt { get; set; }

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    [BsonElement("last_tested_at")]
    public DateTime? LastTestedAt { get; set; }

    [BsonElement("last_test_message")]
    public string? LastTestMessage { get; set; }

    [BsonElement("certificate_expires_at")]
    public DateTime? CertificateExpiresAt { get; set; }

    // Most recent tests first, capped; uptime is worked out from them.
    [BsonElement("tests")]
    public List<DataExportConnectionTest> Tests { get; set; } = [];

    [BsonElement("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Reporting data access: an export run, sample download, connection change or test. Status holds the result.</summary>
[BsonIgnoreExtraElements]
public sealed class DataExportAccessLog : BaseEntity
{
    [BsonElement("log_id")]
    public string LogId { get; set; } = string.Empty;

    [BsonElement("at")]
    public DateTime At { get; set; }

    [BsonElement("actor")]
    public string Actor { get; set; } = string.Empty;

    [BsonElement("action")]
    public string Action { get; set; } = string.Empty;

    [BsonElement("resource")]
    public string Resource { get; set; } = string.Empty;

    [BsonElement("client")]
    public string Client { get; set; } = string.Empty;

    [BsonElement("ip")]
    public string? Ip { get; set; }

    // Success, Failed or Denied.
    [BsonElement("result")]
    public string Result { get; set; } = string.Empty;

    [BsonElement("job_id")]
    public string? JobId { get; set; }

    [BsonElement("run_id")]
    public string? RunId { get; set; }
}
