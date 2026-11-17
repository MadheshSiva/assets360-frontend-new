using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A row on Reports &amp; Analytics / Standard Reports. Status (Draft, Ready, Scheduled, Needs review) lives on BaseEntity.</summary>
[BsonIgnoreExtraElements]
public sealed class StandardReport : BaseEntity
{
    // Business identifier exposed to clients (e.g. RPT-0001); kept separate from the Mongo _id.
    [BsonElement("report_id")]
    public string ReportId { get; set; } = string.Empty;

    [BsonElement("report_name")]
    public string ReportName { get; set; } = string.Empty;

    [BsonElement("description")]
    public string? Description { get; set; }

    [BsonElement("category")]
    public string Category { get; set; } = string.Empty;

    // Report Period column; both are null when the report has no date filter. Stored in UTC.
    [BsonElement("report_period_from")]
    public DateTime? ReportPeriodFrom { get; set; }

    [BsonElement("report_period_to")]
    public DateTime? ReportPeriodTo { get; set; }

    // IANA or Windows id (e.g. Asia/Dubai) the period and schedule were entered in.
    [BsonElement("time_zone")]
    public string TimeZone { get; set; } = "UTC";

    // False when the period is whole days, so clients show dates without times.
    [BsonElement("include_time")]
    public bool IncludeTime { get; set; }

    [BsonElement("frequency")]
    public string Frequency { get; set; } = string.Empty;

    [BsonElement("generated_on")]
    public DateTime? GeneratedOn { get; set; }

    [BsonElement("next_scheduled_on")]
    public DateTime? NextScheduledOn { get; set; }

    // "Review due" marker on the calendar.
    [BsonElement("review_due_on")]
    public DateTime? ReviewDueOn { get; set; }
}
