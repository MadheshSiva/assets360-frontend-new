using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>
/// Reports &amp; Analytics / Generated Reports: a report produced from a template over one Data Export dataset. It keeps a snapshot of
/// the rows read when it was (re)generated. Status (Completed or Failed) lives on BaseEntity.
/// </summary>
[BsonIgnoreExtraElements]
public sealed class GeneratedReport : BaseEntity
{
    // Business identifier exposed to clients (e.g. GRP-0001).
    [BsonElement("report_id")]
    public string ReportId { get; set; } = string.Empty;

    [BsonElement("name")]
    public string Name { get; set; } = string.Empty;

    [BsonElement("module")]
    public string Module { get; set; } = string.Empty;

    [BsonElement("template_id")]
    public string TemplateId { get; set; } = string.Empty;

    [BsonElement("template")]
    public string Template { get; set; } = string.Empty;

    [BsonElement("dataset_id")]
    public string DatasetId { get; set; } = string.Empty;

    // 1h, 2h, 4h, 8h, 24h, 7d, 30d, 90d, 1y or all.
    [BsonElement("time_range")]
    public string TimeRange { get; set; } = string.Empty;

    // Dataset field the time range was applied to; null when the template is a current snapshot.
    [BsonElement("date_field")]
    public string? DateField { get; set; }

    // Once, Daily, Weekly or Monthly.
    [BsonElement("recurrence")]
    public string Recurrence { get; set; } = string.Empty;

    // "HH:mm" for Daily / Weekly / Monthly.
    [BsonElement("schedule_time")]
    public string? ScheduleTime { get; set; }

    // Weekday for Weekly.
    [BsonElement("schedule_day")]
    public string? ScheduleDay { get; set; }

    // "yyyy-MM-dd" first run date for Monthly (the day of month repeats).
    [BsonElement("schedule_date")]
    public string? ScheduleDate { get; set; }

    [BsonElement("time_zone")]
    public string TimeZone { get; set; } = "UTC";

    // URL, PDF or CSV.
    [BsonElement("format")]
    public string Format { get; set; } = string.Empty;

    [BsonElement("share_with")]
    public List<string> ShareWith { get; set; } = [];

    [BsonElement("expire_on")]
    public DateTime? ExpireOn { get; set; }

    [BsonElement("generated_at")]
    public DateTime? GeneratedAt { get; set; }

    [BsonElement("range_from")]
    public DateTime? RangeFrom { get; set; }

    [BsonElement("range_to")]
    public DateTime? RangeTo { get; set; }

    [BsonElement("headers")]
    public List<string> Headers { get; set; } = [];

    // One array per row, in header order: string, double, date (UTC) or null.
    [BsonElement("rows")]
    public List<BsonArray> Rows { get; set; } = [];

    [BsonElement("row_count")]
    public int RowCount { get; set; }

    [BsonElement("truncated")]
    public bool Truncated { get; set; }

    [BsonElement("error")]
    public string? Error { get; set; }

    [BsonElement("deleted_at")]
    public DateTime? DeletedAt { get; set; }
}
