using MongoDB.Bson.Serialization.Attributes;
using A360.Domain.Entities;

namespace A360.ReportAnalytics.Domain.Entities;

/// <summary>A report built in Reports &amp; Analytics / Custom Reports. Status (Draft, Published, Scheduled) lives on BaseEntity.</summary>
[BsonIgnoreExtraElements]
public sealed class CustomReport : BaseEntity
{
    // Business identifier exposed to clients (e.g. CRP-0001); kept separate from the Mongo _id.
    [BsonElement("report_id")]
    public string ReportId { get; set; } = string.Empty;

    [BsonElement("report_name")]
    public string ReportName { get; set; } = string.Empty;

    [BsonElement("description")]
    public string? Description { get; set; }

    // Library "Module" filter (Assets, Maintenance, ...).
    [BsonElement("module")]
    public string Module { get; set; } = string.Empty;

    [BsonElement("owner_id")]
    public string? OwnerId { get; set; }

    [BsonElement("owner_name")]
    public string? OwnerName { get; set; }

    // Private, My team or Organization.
    [BsonElement("visibility")]
    public string Visibility { get; set; } = string.Empty;

    // Report Builder step (1 Data Source ... 6 Preview) to reopen a draft at.
    [BsonElement("current_step")]
    public int CurrentStep { get; set; } = 1;

    [BsonElement("definition")]
    public CustomReportDefinition Definition { get; set; } = new();

    [BsonElement("schedule")]
    public CustomReportSchedule? Schedule { get; set; }

    // User ids that starred the report in the library.
    [BsonElement("favorited_by")]
    public List<string> FavoritedBy { get; set; } = [];

    [BsonElement("published_at")]
    public DateTime? PublishedAt { get; set; }

    [BsonElement("published_by")]
    public string? PublishedBy { get; set; }
}

/// <summary>What the Report Builder steps produce: the query the report runs.</summary>
public sealed class CustomReportDefinition
{
    // Step 1: assets, maintenance, inspection. Assets is always included (one row per asset).
    [BsonElement("data_sources")]
    public List<string> DataSources { get; set; } = [];

    // Step 2: catalog field keys and calculated field keys, in column order.
    [BsonElement("selected_fields")]
    public List<string> SelectedFields { get; set; } = [];

    [BsonElement("calculated_fields")]
    public List<CustomReportCalculatedField> CalculatedFields { get; set; } = [];

    // Step 3.
    [BsonElement("filters")]
    public List<CustomReportFilter> Filters { get; set; } = [];

    // And / Or between filters.
    [BsonElement("filter_logic")]
    public string FilterLogic { get; set; } = "And";

    // Step 4: when GroupBy is set, the report returns one row per group with the aggregations as columns.
    [BsonElement("group_by")]
    public List<string> GroupBy { get; set; } = [];

    [BsonElement("aggregations")]
    public List<CustomReportAggregation> Aggregations { get; set; } = [];

    [BsonElement("sorts")]
    public List<CustomReportSort> Sorts { get; set; } = [];

    [BsonElement("row_limit")]
    public int RowLimit { get; set; } = 1000;

    // Step 5.
    [BsonElement("visualization")]
    public CustomReportVisualization Visualization { get; set; } = new();
}

/// <summary>"Add calculated field": LeftOperand Operator RightOperand, where an operand is a field key or a number.</summary>
public sealed class CustomReportCalculatedField
{
    [BsonElement("key")]
    public string Key { get; set; } = string.Empty;

    [BsonElement("label")]
    public string Label { get; set; } = string.Empty;

    [BsonElement("left_operand")]
    public string LeftOperand { get; set; } = string.Empty;

    // + - * / or daysSince (whole days from a date field to now; RightOperand unused).
    [BsonElement("operator")]
    public string Operator { get; set; } = string.Empty;

    [BsonElement("right_operand")]
    public string? RightOperand { get; set; }

    // number or currency.
    [BsonElement("data_type")]
    public string DataType { get; set; } = "number";

    [BsonElement("decimals")]
    public int Decimals { get; set; } = 2;
}

public sealed class CustomReportFilter
{
    [BsonElement("field")]
    public string Field { get; set; } = string.Empty;

    [BsonElement("operator")]
    public string Operator { get; set; } = string.Empty;

    [BsonElement("value")]
    public string? Value { get; set; }

    // For in / notIn.
    [BsonElement("values")]
    public List<string> Values { get; set; } = [];

    // Upper bound for between.
    [BsonElement("value_to")]
    public string? ValueTo { get; set; }
}

public sealed class CustomReportAggregation
{
    // Empty for count.
    [BsonElement("field")]
    public string? Field { get; set; }

    // sum, avg, min, max, count, countDistinct.
    [BsonElement("function")]
    public string Function { get; set; } = string.Empty;

    [BsonElement("label")]
    public string? Label { get; set; }
}

public sealed class CustomReportSort
{
    [BsonElement("field")]
    public string Field { get; set; } = string.Empty;

    [BsonElement("direction")]
    public string Direction { get; set; } = "asc";
}

public sealed class CustomReportVisualization
{
    // Table, Bar, Horizontal bar, Line, Area, Pie, Donut.
    [BsonElement("chart_type")]
    public string ChartType { get; set; } = "Table";

    [BsonElement("title")]
    public string? Title { get; set; }

    [BsonElement("x_axis_field")]
    public string? XAxisField { get; set; }

    [BsonElement("y_axis_field")]
    public string? YAxisField { get; set; }

    // Which Preview tab opens first: Table or Chart.
    [BsonElement("default_view")]
    public string DefaultView { get; set; } = "Table";

    [BsonElement("show_data_labels")]
    public bool ShowDataLabels { get; set; } = true;

    // Categories after this many are summed into "Other".
    [BsonElement("max_categories")]
    public int MaxCategories { get; set; } = 6;
}

/// <summary>Report Configuration / Schedule, e.g. Monthly – 1st day, 08:00.</summary>
public sealed class CustomReportSchedule
{
    // None, Daily, Weekly, Monthly, Quarterly.
    [BsonElement("frequency")]
    public string Frequency { get; set; } = "None";

    // For Weekly (Sunday ... Saturday).
    [BsonElement("day_of_week")]
    public string? DayOfWeek { get; set; }

    // For Monthly / Quarterly; clamped to the month's last day.
    [BsonElement("day_of_month")]
    public int? DayOfMonth { get; set; }

    // HH:mm in TimeZone.
    [BsonElement("time")]
    public string Time { get; set; } = "08:00";

    [BsonElement("time_zone")]
    public string TimeZone { get; set; } = "UTC";

    [BsonElement("recipients")]
    public List<string> Recipients { get; set; } = [];

    // Set while the report is Scheduled; null for drafts and unscheduled reports.
    [BsonElement("next_run_at")]
    public DateTime? NextRunAt { get; set; }
}
