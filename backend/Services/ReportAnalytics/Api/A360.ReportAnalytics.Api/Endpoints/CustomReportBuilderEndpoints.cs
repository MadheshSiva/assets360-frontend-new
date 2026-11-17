using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.ReportAnalytics.Repository.Reporting;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>Report Builder: data sources, the field catalog, Preview and downloading a report's data.</summary>
public static class CustomReportBuilderEndpoints
{
    private const string OtherCategory = "Other";
    private const string BlankCategory = "(Blank)";

    public static RouteGroupBuilder MapCustomReportBuilderEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/custom-reports").WithTags("Custom Report Builder");

        // Steps 1 and 2.
        group.MapGet("/data-sources", GetDataSources).WithName("GetCustomReportDataSources");
        group.MapGet("/fields", GetFields).WithName("GetCustomReportFields");

        // Step 6 / Preview Report, and Export on a saved report.
        group.MapPost("/preview", PreviewDefinitionAsync).WithName("PreviewCustomReportDefinition");
        group.MapGet("/{reportId}/preview", PreviewReportAsync).WithName("PreviewCustomReport");
        group.MapGet("/{reportId}/export", ExportReportDataAsync).WithName("ExportCustomReportData");

        return group;
    }

    private static IResult GetDataSources() => Results.Ok(ReportFieldCatalog.DataSources
        .Select(source => new ReportDataSourceResponse(
            source.Key,
            source.Label,
            source.Description,
            source.Required,
            ReportFieldCatalog.Fields.Count(field => field.DataSource == source.Key)))
        .ToList());

    /// <summary>Select Fields, grouped as on screen. dataSources is comma separated (default: all); search matches the label or key.</summary>
    private static IResult GetFields(string? dataSources = null, string? search = null, string? group = null)
    {
        var sources = (dataSources ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(source => source.ToLowerInvariant())
            .ToHashSet();

        var fields = ReportFieldCatalog.Fields
            .Where(field => sources.Count == 0 || sources.Contains(field.DataSource))
            .Where(field => string.IsNullOrWhiteSpace(group) || string.Equals(field.Group, group.Trim(), StringComparison.OrdinalIgnoreCase))
            .Where(field => string.IsNullOrWhiteSpace(search)
                || field.Label.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase)
                || field.Key.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase));

        return Results.Ok(fields
            .GroupBy(field => field.Group)
            .Select(fieldGroup => new ReportFieldGroupResponse(
                fieldGroup.Key,
                fieldGroup.Select(field => new ReportFieldResponse(
                    field.Key,
                    field.Label,
                    field.DataType,
                    field.DataSource,
                    ReportFilterOperators.ForType(field.DataType))).ToList()))
            .ToList());
    }

    /// <summary>Preview Report before saving: runs the builder steps against live data.</summary>
    private static async Task<IResult> PreviewDefinitionAsync(
        PreviewCustomReportRequest request,
        IReportDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var definition = request.Definition.ToDomain();
        var scope = new ReportQueryScope(
            string.IsNullOrWhiteSpace(request.TenantId) ? currentUser?.TenantId : request.TenantId.Trim(),
            string.IsNullOrWhiteSpace(request.ClientId) ? currentUser?.ClientId : request.ClientId.Trim());

        return await PreviewAsync(definition, scope, request.Limit, dataRepository, cancellationToken);
    }

    private static async Task<IResult> PreviewReportAsync(
        string reportId,
        ICustomReportRepository repository,
        IReportDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        int? limit = null)
    {
        var report = await FindVisibleAsync(reportId, repository, currentUserAccessor.GetCurrentUser(), cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        return await PreviewAsync(report.Definition, DataScope(report), limit, dataRepository, cancellationToken);
    }

    /// <summary>Export on a report: every row up to its RowLimit, as xlsx (default) or csv. Dates are UTC.</summary>
    private static async Task<IResult> ExportReportDataAsync(
        string reportId,
        ICustomReportRepository repository,
        IReportDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? format = null)
    {
        var exportFormat = string.IsNullOrWhiteSpace(format) ? "xlsx" : CustomReportOptions.ExportFormats.Normalize(format);
        if (exportFormat is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", CustomReportOptions.ExportFormats.All)}"]
            });
        }

        var report = await FindVisibleAsync(reportId, repository, currentUserAccessor.GetCurrentUser(), cancellationToken);
        if (report is null)
        {
            return Results.NotFound();
        }

        var errors = new Dictionary<string, string[]>();
        report.Definition.ValidateDefinition(errors, requireComplete: true);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var result = await dataRepository.RunAsync(report.Definition, DataScope(report), report.Definition.RowLimit, cancellationToken);
        var fileName = $"{FileSafe(report.ReportName)}-{DateTime.UtcNow:yyyyMMddHHmmss}";

        if (exportFormat == "csv")
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", result.Columns.Select(column => CsvField(column.Label))));
            foreach (var row in result.Rows)
            {
                csv.AppendLine(string.Join(",", result.Columns.Select(column => CsvField(FormatValue(row[column.Key])))));
            }

            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv", $"{fileName}.csv");
        }

        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet(SheetName(report.ReportName));
        for (var index = 0; index < result.Columns.Count; index++)
        {
            sheet.Cell(1, index + 1).Value = result.Columns[index].Label;
        }

        sheet.Row(1).Style.Font.Bold = true;

        for (var rowIndex = 0; rowIndex < result.Rows.Count; rowIndex++)
        {
            for (var column = 0; column < result.Columns.Count; column++)
            {
                var cell = sheet.Cell(rowIndex + 2, column + 1);
                switch (result.Rows[rowIndex][result.Columns[column].Key])
                {
                    case null:
                        break;
                    case DateTime date:
                        cell.Value = date;
                        cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm";
                        break;
                    case double or int or long or decimal:
                        cell.Value = Convert.ToDouble(result.Rows[rowIndex][result.Columns[column].Key], CultureInfo.InvariantCulture);
                        break;
                    case var value:
                        cell.Value = FormatValue(value);
                        break;
                }
            }
        }

        sheet.Columns().AdjustToContents();

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{fileName}.xlsx");
    }

    private static async Task<IResult> PreviewAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        int? limit,
        IReportDataRepository dataRepository,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        definition.ValidateDefinition(errors, requireComplete: true);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var rowCount = Math.Min(Math.Clamp(limit ?? CustomReportOptions.DefaultPreviewLimit, 1, CustomReportOptions.MaxPreviewLimit), definition.RowLimit);
        var result = await dataRepository.RunAsync(definition, scope, rowCount, cancellationToken);
        var chart = await BuildChartAsync(definition, scope, result.Columns, dataRepository, cancellationToken);

        return Results.Ok(new CustomReportPreviewResponse(
            result.Columns,
            result.Rows,
            result.TotalRows,
            definition.RowLimit,
            result.TotalRows > result.Rows.Count,
            definition.Visualization.DefaultView,
            chart));
    }

    /// <summary>Chart points over all matching rows. Beyond MaxCategories the smallest categories are summed into "Other" (not for date axes).</summary>
    private static async Task<CustomReportChartResponse?> BuildChartAsync(
        CustomReportDefinition definition,
        ReportQueryScope scope,
        IReadOnlyList<ReportColumn> columns,
        IReportDataRepository dataRepository,
        CancellationToken cancellationToken)
    {
        var visualization = definition.Visualization;
        var xColumn = columns.FirstOrDefault(column => string.Equals(column.Key, visualization.XAxisField, StringComparison.OrdinalIgnoreCase));
        var yColumn = columns.FirstOrDefault(column => string.Equals(column.Key, visualization.YAxisField, StringComparison.OrdinalIgnoreCase));
        if (visualization.ChartType == CustomReportOptions.TableChart || xColumn is null || yColumn is null)
        {
            return null;
        }

        var groups = await dataRepository.GetChartGroupsAsync(definition, scope, xColumn.Key, yColumn.Key, cancellationToken);
        var points = groups
            .Select(group => new ReportChartPoint(group.Label is null ? BlankCategory : FormatValue(group.Label), Math.Round(group.Value, 2)))
            .ToList();

        if (xColumn.DataType != ReportFieldTypes.Date && points.Count > visualization.MaxCategories)
        {
            var kept = points.Take(visualization.MaxCategories - 1).ToList();
            kept.Add(new ReportChartPoint(OtherCategory, Math.Round(points.Skip(visualization.MaxCategories - 1).Sum(point => point.Value), 2)));
            points = kept;
        }

        return new CustomReportChartResponse(
            visualization.ChartType,
            visualization.Title ?? $"{yColumn.Label} by {xColumn.Label}",
            xColumn.Key,
            xColumn.Label,
            yColumn.Key,
            yColumn.Label,
            visualization.ShowDataLabels,
            points);
    }

    private static async Task<CustomReport?> FindVisibleAsync(
        string reportId,
        ICustomReportRepository repository,
        CurrentUser? currentUser,
        CancellationToken cancellationToken)
    {
        var report = await repository.GetByReportIdAsync(reportId, cancellationToken);
        return report is not null && CustomReportAccess.CanView(report, CustomReportAccess.ViewerId(currentUser)) ? report : null;
    }

    // A saved report always reads its owner's tenant data, whoever views it.
    private static ReportQueryScope DataScope(CustomReport report) => new(report.TenantId, report.ClientId);

    private static string FormatValue(object? value) => value switch
    {
        null => string.Empty,
        DateTime date => date.TimeOfDay == TimeSpan.Zero
            ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : date.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };

    private static string CsvField(string value)
    {
        // Quote fields with separators, and neutralise leading formula characters for spreadsheet apps.
        if (value.Length > 0 && "=+-@".Contains(value[0]) && !double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
        {
            value = "'" + value;
        }

        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }

    private static string FileSafe(string name)
    {
        var safe = new string(name.Select(character => char.IsLetterOrDigit(character) ? char.ToLowerInvariant(character) : '-').ToArray()).Trim('-');
        return safe.Length == 0 ? "custom-report" : safe[..Math.Min(safe.Length, 60)];
    }

    // Excel sheet names: 31 characters, none of : \ / ? * [ ].
    private static string SheetName(string name)
    {
        var safe = new string(name.Where(character => !":\\/?*[]".Contains(character)).ToArray()).Trim();
        return safe.Length == 0 ? "Report" : safe[..Math.Min(safe.Length, 31)];
    }
}
