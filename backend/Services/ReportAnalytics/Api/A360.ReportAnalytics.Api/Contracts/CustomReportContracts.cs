using System.Text.Json;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>
/// The Report Builder steps. Fields are referenced by catalog key (GET /fields) or by a calculated field's key or label.
/// The same shape is used by templates (Export Reports as json / Import Template).
/// </summary>
public sealed record CustomReportDefinitionRequest(
    IReadOnlyList<string>? DataSources,
    IReadOnlyList<string>? SelectedFields,
    IReadOnlyList<CalculatedFieldRequest>? CalculatedFields,
    IReadOnlyList<ReportFilterRequest>? Filters,
    string? FilterLogic,
    IReadOnlyList<string>? GroupBy,
    IReadOnlyList<ReportAggregationRequest>? Aggregations,
    IReadOnlyList<ReportSortRequest>? Sorts,
    int? RowLimit,
    ReportVisualizationRequest? Visualization);

/// <summary>Key is optional (generated from Label). Operands are field keys or numbers; Operator is + - * / or daysSince.</summary>
public sealed record CalculatedFieldRequest(
    string? Key,
    string? Label,
    string? LeftOperand,
    string? Operator,
    string? RightOperand,
    string? DataType,
    int? Decimals);

/// <summary>Value, Values (in / notIn) and ValueTo (between) accept text, numbers or dates.</summary>
public sealed record ReportFilterRequest(
    string? Field,
    string? Operator,
    JsonElement? Value,
    IReadOnlyList<JsonElement>? Values,
    JsonElement? ValueTo);

public sealed record ReportAggregationRequest(
    string? Field,
    string? Function,
    string? Label);

public sealed record ReportSortRequest(
    string? Field,
    string? Direction);

public sealed record ReportVisualizationRequest(
    string? ChartType,
    string? Title,
    string? XAxisField,
    string? YAxisField,
    string? DefaultView,
    bool? ShowDataLabels,
    int? MaxCategories);

/// <summary>Frequency None (or no schedule) leaves the report unscheduled.</summary>
public sealed record CustomReportScheduleRequest(
    string? Frequency,
    string? DayOfWeek,
    int? DayOfMonth,
    string? Time,
    string? TimeZone,
    IReadOnlyList<string>? Recipients);

/// <summary>Create Custom Report / Save Draft. Every report starts as a Draft.</summary>
public sealed record CreateCustomReportRequest(
    string? ReportName,
    string? Description,
    string? Module,
    string? Visibility,
    int? CurrentStep,
    CustomReportDefinitionRequest? Definition,
    CustomReportScheduleRequest? Schedule,
    string? TenantId,
    string? ClientId);

/// <summary>Save Draft / Save Report. A published or scheduled report must stay complete.</summary>
public sealed record UpdateCustomReportRequest(
    string? ReportName,
    string? Description,
    string? Module,
    string? Visibility,
    int? CurrentStep,
    CustomReportDefinitionRequest? Definition,
    CustomReportScheduleRequest? Schedule);

/// <summary>Preview Report for an unsaved definition.</summary>
public sealed record PreviewCustomReportRequest(
    CustomReportDefinitionRequest? Definition,
    int? Limit,
    string? TenantId,
    string? ClientId);

public sealed record DuplicateCustomReportRequest(string? ReportName);

public sealed record FavoriteCustomReportRequest(bool IsFavorite);

public sealed record CustomReportResponse(
    string ReportId,
    string ReportName,
    string? Description,
    string Module,
    string? OwnerId,
    string? OwnerName,
    string Visibility,
    string? Status,
    int CurrentStep,
    bool IsFavorite,
    bool CanEdit,
    CustomReportDefinition Definition,
    CustomReportSchedule? Schedule,
    string? ScheduleSummary,
    DateTime? PublishedAt,
    string? PublishedBy,
    string? CreatedBy,
    DateTime? CreatedAt,
    string? UpdatedBy,
    DateTime? UpdatedAt,
    string? TenantId,
    string? ClientId)
{
    public static CustomReportResponse FromEntity(CustomReport report, string? viewerId)
    {
        return new CustomReportResponse(
            report.ReportId,
            report.ReportName,
            report.Description,
            report.Module,
            report.OwnerId,
            report.OwnerName,
            report.Visibility,
            report.Status,
            report.CurrentStep,
            viewerId is not null && report.FavoritedBy.Contains(viewerId),
            CustomReportAccess.CanEdit(report, viewerId),
            report.Definition,
            report.Schedule,
            ReportSchedules.Describe(report.Schedule),
            report.PublishedAt,
            report.PublishedBy,
            report.CreatedBy,
            report.CreatedAt,
            report.UpdatedBy,
            report.UpdatedAt,
            report.TenantId,
            report.ClientId);
    }
}

/// <summary>A card in the Custom Report Library.</summary>
public sealed record CustomReportListItemResponse(
    string ReportId,
    string ReportName,
    string? Description,
    string? OwnerId,
    string? OwnerName,
    string Module,
    string? Status,
    string Visibility,
    string ChartType,
    bool IsFavorite,
    DateTime? UpdatedAt,
    string? ScheduleSummary,
    DateTime? NextRunAt)
{
    public static CustomReportListItemResponse FromEntity(CustomReport report, string? viewerId)
    {
        return new CustomReportListItemResponse(
            report.ReportId,
            report.ReportName,
            report.Description,
            report.OwnerId,
            report.OwnerName,
            report.Module,
            report.Status,
            report.Visibility,
            report.Definition.Visualization.ChartType,
            viewerId is not null && report.FavoritedBy.Contains(viewerId),
            report.UpdatedAt,
            ReportSchedules.Describe(report.Schedule),
            report.Schedule?.NextRunAt);
    }
}

public sealed record CustomReportListResponse(
    IReadOnlyCollection<CustomReportListItemResponse> Items,
    long TotalCount,
    int Page,
    int PageSize);

/// <summary>The four cards at the top of the page.</summary>
public sealed record CustomReportSummaryResponse(
    long CustomReports,
    long Published,
    long Scheduled,
    long Drafts);

/// <summary>An exported report definition; Import Template accepts one of these or an array of them.</summary>
public sealed record CustomReportTemplate(
    string ReportName,
    string? Description,
    string Module,
    string Visibility,
    CustomReportDefinition Definition,
    CustomReportSchedule? Schedule)
{
    public static CustomReportTemplate FromEntity(CustomReport report) =>
        new(report.ReportName, report.Description, report.Module, report.Visibility, report.Definition, report.Schedule);
}

public sealed record CustomReportImportFailure(
    int Index,
    string? ReportName,
    IDictionary<string, string[]> Errors);

public sealed record CustomReportImportResponse(
    IReadOnlyCollection<CustomReportListItemResponse> Created,
    IReadOnlyCollection<CustomReportImportFailure> Failed);

public sealed record ReportFieldResponse(
    string Key,
    string Label,
    string DataType,
    string DataSource,
    IReadOnlyList<string> FilterOperators);

public sealed record ReportFieldGroupResponse(
    string Group,
    IReadOnlyCollection<ReportFieldResponse> Fields);

public sealed record ReportDataSourceResponse(
    string Key,
    string Label,
    string Description,
    bool Required,
    int FieldCount);

public sealed record ReportChartPoint(string Label, double Value);

public sealed record CustomReportChartResponse(
    string ChartType,
    string Title,
    string XAxisField,
    string XAxisLabel,
    string YAxisField,
    string YAxisLabel,
    bool ShowDataLabels,
    IReadOnlyCollection<ReportChartPoint> Points);

/// <summary>
/// Preview tab. Rows hold values keyed by column key. TotalRows counts every matching row;
/// the saved report returns at most RowLimit of them.
/// </summary>
public sealed record CustomReportPreviewResponse(
    IReadOnlyList<ReportColumn> Columns,
    IReadOnlyList<IReadOnlyDictionary<string, object?>> Rows,
    long TotalRows,
    int RowLimit,
    bool IsTruncated,
    string DefaultView,
    CustomReportChartResponse? Chart);
