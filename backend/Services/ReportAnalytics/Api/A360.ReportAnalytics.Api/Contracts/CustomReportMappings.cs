using System.Text;
using System.Text.Json;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.ReportAnalytics.Repository.Reporting;
using A360.Security;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>Who may see and change a custom report.</summary>
public static class CustomReportAccess
{
    public static string? ViewerId(CurrentUser? currentUser) =>
        string.IsNullOrWhiteSpace(currentUser?.UserId) ? currentUser?.Id : currentUser.UserId;

    public static bool CanView(CustomReport report, string? viewerId) =>
        report.Visibility != CustomReportRepository.PrivateVisibility || CanEdit(report, viewerId);

    // Only the owner changes a report; reports created without a signed-in user have no owner.
    public static bool CanEdit(CustomReport report, string? viewerId) =>
        string.IsNullOrWhiteSpace(report.OwnerId) || report.OwnerId == viewerId;
}

internal static class CustomReportMappings
{
    private const int DefaultRowLimit = 1000;
    private const int DefaultMaxCategories = 6;

    public static CustomReport ToEntity(this CreateCustomReportRequest request, string reportId, CurrentUser? currentUser, DateTime utcNow)
    {
        var report = new CustomReport
        {
            ReportId = reportId,
            OwnerId = CustomReportAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            Status = CustomReportOptions.DraftStatus,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            // Set on create too so the library's "Updated" date and Last Updated filter cover new reports.
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = FirstNonEmpty(request.TenantId, currentUser?.TenantId),
            ClientId = FirstNonEmpty(request.ClientId, currentUser?.ClientId),
            IsDeleted = false
        };

        Apply(report, request.ReportName, request.Description, request.Module, request.Visibility, request.CurrentStep, request.Definition, request.Schedule);
        report.RefreshStatus(utcNow);

        return report;
    }

    public static void ApplyTo(this UpdateCustomReportRequest request, CustomReport report, CurrentUser? currentUser, DateTime utcNow)
    {
        Apply(report, request.ReportName, request.Description, request.Module, request.Visibility, request.CurrentStep, request.Definition, request.Schedule);
        report.Touch(currentUser, utcNow);
    }

    public static CustomReport Duplicate(this CustomReport source, string reportId, string? reportName, CurrentUser? currentUser, DateTime utcNow)
    {
        var copy = new CreateCustomReportRequest(
            string.IsNullOrWhiteSpace(reportName) ? $"Copy of {source.ReportName}" : reportName,
            source.Description,
            source.Module,
            source.Visibility,
            source.CurrentStep,
            null,
            null,
            source.TenantId,
            source.ClientId).ToEntity(reportId, currentUser, utcNow);

        // Round-trip through JSON so the copy shares no lists with the source.
        copy.Definition = JsonSerializer.Deserialize<CustomReportDefinition>(JsonSerializer.Serialize(source.Definition))!;
        copy.Schedule = source.Schedule is null ? null : JsonSerializer.Deserialize<CustomReportSchedule>(JsonSerializer.Serialize(source.Schedule));
        copy.RefreshStatus(utcNow);

        return copy;
    }

    public static void Publish(this CustomReport report, CurrentUser? currentUser, DateTime utcNow)
    {
        report.Status = CustomReportOptions.PublishedStatus;
        report.PublishedAt = utcNow;
        report.PublishedBy = currentUser?.UserName;
        report.Touch(currentUser, utcNow);
    }

    public static void Unpublish(this CustomReport report, CurrentUser? currentUser, DateTime utcNow)
    {
        report.Status = CustomReportOptions.DraftStatus;
        report.Touch(currentUser, utcNow);
    }

    public static void Touch(this CustomReport report, CurrentUser? currentUser, DateTime utcNow)
    {
        report.UpdatedBy = currentUser?.UserName ?? report.UpdatedBy;
        report.UpdatedAt = utcNow;
        report.RefreshStatus(utcNow);
    }

    /// <summary>A live report is Scheduled when it has a schedule, else Published. Drafts never have a next run.</summary>
    public static void RefreshStatus(this CustomReport report, DateTime utcNow)
    {
        if (report.Status == CustomReportOptions.DraftStatus)
        {
            if (report.Schedule is not null)
            {
                report.Schedule.NextRunAt = null;
            }

            return;
        }

        report.Status = report.Schedule is null ? CustomReportOptions.PublishedStatus : CustomReportOptions.ScheduledStatus;
        if (report.Schedule is not null)
        {
            report.Schedule.NextRunAt = ReportSchedules.NextRun(report.Schedule, utcNow);
        }
    }

    /// <summary>
    /// Normalises the builder steps: catalog keys in their standard spelling, calculated fields referenced by key,
    /// option values in their standard spelling. Anything unrecognised is kept as typed so validation can report it.
    /// </summary>
    public static CustomReportDefinition ToDomain(this CustomReportDefinitionRequest? request)
    {
        request ??= new CustomReportDefinitionRequest(null, null, null, null, null, null, null, null, null, null);

        var calculated = BuildCalculatedFields(request.CalculatedFields);
        var calculatedKeys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var field in calculated)
        {
            calculatedKeys.TryAdd(field.Key, field.Key);
            calculatedKeys.TryAdd(field.Label, field.Key);
        }

        string Resolve(string? key)
        {
            var trimmed = key?.Trim() ?? string.Empty;
            return ReportFieldCatalog.Find(trimmed)?.Key ?? (calculatedKeys.TryGetValue(trimmed, out var calculatedKey) ? calculatedKey : trimmed);
        }

        string? ResolveOperand(string? operand) =>
            string.IsNullOrWhiteSpace(operand) ? null : ReportValueParser.IsNumberLiteral(operand) ? operand.Trim() : Resolve(operand);

        foreach (var field in calculated)
        {
            field.LeftOperand = ResolveOperand(field.LeftOperand) ?? string.Empty;
            field.RightOperand = ResolveOperand(field.RightOperand);
        }

        var dataSources = (request.DataSources ?? [])
            .Where(source => !string.IsNullOrWhiteSpace(source))
            .Select(source => source.Trim().ToLowerInvariant())
            .Prepend(ReportDataSources.Assets)
            .Distinct()
            .ToList();

        var groupBy = CleanKeys(request.GroupBy, Resolve);
        var aggregations = (request.Aggregations ?? [])
            .Select(aggregation => new CustomReportAggregation
            {
                Field = string.IsNullOrWhiteSpace(aggregation.Field) ? null : Resolve(aggregation.Field),
                Function = ReportAggregations.All.FirstOrDefault(function => string.Equals(function, aggregation.Function?.Trim(), StringComparison.OrdinalIgnoreCase))
                    ?? aggregation.Function?.Trim()
                    ?? string.Empty,
                Label = string.IsNullOrWhiteSpace(aggregation.Label) ? null : aggregation.Label.Trim()
            })
            .ToList();

        // Grouping without a measure shows the row count per group.
        if (groupBy.Count > 0 && aggregations.Count == 0)
        {
            aggregations.Add(new CustomReportAggregation { Function = ReportAggregations.Count });
        }

        var visualization = request.Visualization;

        return new CustomReportDefinition
        {
            DataSources = dataSources,
            SelectedFields = CleanKeys(request.SelectedFields, Resolve),
            CalculatedFields = calculated,
            Filters = (request.Filters ?? [])
                .Select(filter => new CustomReportFilter
                {
                    Field = Resolve(filter.Field),
                    Operator = ReportFilterOperators.ForType(ReportFieldTypes.Date)
                        .Concat(ReportFilterOperators.ForType(ReportFieldTypes.String))
                        .Concat(ReportFilterOperators.ForType(ReportFieldTypes.Number))
                        .FirstOrDefault(op => string.Equals(op, filter.Operator?.Trim(), StringComparison.OrdinalIgnoreCase))
                        ?? filter.Operator?.Trim()
                        ?? string.Empty,
                    Value = JsonText(filter.Value),
                    Values = (filter.Values ?? []).Select(value => JsonText(value)).OfType<string>().ToList(),
                    ValueTo = JsonText(filter.ValueTo)
                })
                .ToList(),
            FilterLogic = CustomReportOptions.FilterLogic.Normalize(request.FilterLogic) ?? request.FilterLogic?.Trim() ?? "And",
            GroupBy = groupBy,
            Aggregations = aggregations,
            Sorts = (request.Sorts ?? [])
                .Select(sort => new CustomReportSort
                {
                    Field = AggregationKeyOrField(sort.Field, aggregations, Resolve),
                    Direction = sort.Direction?.Trim().ToLowerInvariant() ?? "asc"
                })
                .ToList(),
            RowLimit = request.RowLimit ?? DefaultRowLimit,
            Visualization = new CustomReportVisualization
            {
                ChartType = CustomReportOptions.ChartTypes.Normalize(visualization?.ChartType) ?? visualization?.ChartType?.Trim() ?? CustomReportOptions.TableChart,
                Title = string.IsNullOrWhiteSpace(visualization?.Title) ? null : visualization.Title.Trim(),
                XAxisField = string.IsNullOrWhiteSpace(visualization?.XAxisField) ? null : AggregationKeyOrField(visualization.XAxisField, aggregations, Resolve),
                YAxisField = string.IsNullOrWhiteSpace(visualization?.YAxisField) ? null : AggregationKeyOrField(visualization.YAxisField, aggregations, Resolve),
                DefaultView = CustomReportOptions.DefaultViews.Normalize(visualization?.DefaultView) ?? visualization?.DefaultView?.Trim() ?? "Table",
                ShowDataLabels = visualization?.ShowDataLabels ?? true,
                MaxCategories = visualization?.MaxCategories ?? DefaultMaxCategories
            }
        };
    }

    public static CustomReportSchedule? ToDomain(this CustomReportScheduleRequest? request)
    {
        var frequency = CustomReportOptions.ScheduleFrequencies.Normalize(request?.Frequency) ?? request?.Frequency?.Trim();
        if (request is null || string.IsNullOrWhiteSpace(frequency) || frequency == CustomReportOptions.NoSchedule)
        {
            return null;
        }

        return new CustomReportSchedule
        {
            Frequency = frequency,
            DayOfWeek = frequency == "Weekly" ? CustomReportOptions.DaysOfWeek.Normalize(request.DayOfWeek) ?? request.DayOfWeek?.Trim() : null,
            DayOfMonth = frequency is "Monthly" or "Quarterly" ? request.DayOfMonth ?? 1 : null,
            Time = string.IsNullOrWhiteSpace(request.Time) ? "08:00" : request.Time.Trim(),
            TimeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? ReportPeriods.DefaultTimeZone : request.TimeZone.Trim(),
            Recipients = (request.Recipients ?? [])
                .Where(recipient => !string.IsNullOrWhiteSpace(recipient))
                .Select(recipient => recipient.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList()
        };
    }

    /// <summary>Turns a template from Export Reports back into a create request.</summary>
    public static CreateCustomReportRequest ToCreateRequest(this CustomReportTemplate template)
    {
        var definition = template.Definition ?? new CustomReportDefinition();
        var schedule = template.Schedule;

        return new CreateCustomReportRequest(
            template.ReportName,
            template.Description,
            template.Module,
            template.Visibility,
            1,
            new CustomReportDefinitionRequest(
                definition.DataSources,
                definition.SelectedFields,
                (definition.CalculatedFields ?? [])
                    .Select(field => new CalculatedFieldRequest(field.Key, field.Label, field.LeftOperand, field.Operator, field.RightOperand, field.DataType, field.Decimals))
                    .ToList(),
                (definition.Filters ?? [])
                    .Select(filter => new ReportFilterRequest(
                        filter.Field,
                        filter.Operator,
                        filter.Value is null ? null : JsonSerializer.SerializeToElement(filter.Value),
                        (filter.Values ?? []).Select(value => JsonSerializer.SerializeToElement(value)).ToList(),
                        filter.ValueTo is null ? null : JsonSerializer.SerializeToElement(filter.ValueTo)))
                    .ToList(),
                definition.FilterLogic,
                definition.GroupBy,
                (definition.Aggregations ?? []).Select(aggregation => new ReportAggregationRequest(aggregation.Field, aggregation.Function, aggregation.Label)).ToList(),
                (definition.Sorts ?? []).Select(sort => new ReportSortRequest(sort.Field, sort.Direction)).ToList(),
                definition.RowLimit,
                definition.Visualization is null
                    ? null
                    : new ReportVisualizationRequest(
                        definition.Visualization.ChartType,
                        definition.Visualization.Title,
                        definition.Visualization.XAxisField,
                        definition.Visualization.YAxisField,
                        definition.Visualization.DefaultView,
                        definition.Visualization.ShowDataLabels,
                        definition.Visualization.MaxCategories)),
            schedule is null
                ? null
                : new CustomReportScheduleRequest(schedule.Frequency, schedule.DayOfWeek, schedule.DayOfMonth, schedule.Time, schedule.TimeZone, schedule.Recipients),
            null,
            null);
    }

    private static void Apply(
        CustomReport report,
        string? reportName,
        string? description,
        string? module,
        string? visibility,
        int? currentStep,
        CustomReportDefinitionRequest? definition,
        CustomReportScheduleRequest? schedule)
    {
        report.ReportName = reportName?.Trim() ?? string.Empty;
        report.Description = string.IsNullOrWhiteSpace(description) ? null : description.Trim();
        report.Module = CustomReportOptions.Modules.Normalize(module) ?? StandardReportOptions.Categories.All[0];
        report.Visibility = CustomReportOptions.Visibilities.Normalize(visibility) ?? CustomReportOptions.DefaultVisibility;
        report.CurrentStep = Math.Clamp(currentStep ?? report.CurrentStep, 1, CustomReportOptions.BuilderSteps.Count);
        report.Definition = definition.ToDomain();
        report.Schedule = schedule.ToDomain();
    }

    // Calculated field keys are "calc_" + the label in snake case unless the client chose one; duplicates get _2, _3...
    private static List<CustomReportCalculatedField> BuildCalculatedFields(IReadOnlyList<CalculatedFieldRequest>? requests)
    {
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var fields = new List<CustomReportCalculatedField>();

        foreach (var request in requests ?? [])
        {
            var label = request.Label?.Trim() ?? string.Empty;
            var baseKey = !string.IsNullOrWhiteSpace(request.Key) && ReportFieldCatalog.Find(request.Key) is null
                ? Slug(request.Key)
                : $"calc_{Slug(label)}";
            var key = baseKey;
            for (var suffix = 2; !used.Add(key); suffix++)
            {
                key = $"{baseKey}_{suffix}";
            }

            fields.Add(new CustomReportCalculatedField
            {
                Key = key,
                Label = label,
                LeftOperand = request.LeftOperand ?? string.Empty,
                Operator = ReportCalculationOperators.All.FirstOrDefault(op => string.Equals(op, request.Operator?.Trim(), StringComparison.OrdinalIgnoreCase))
                    ?? request.Operator?.Trim()
                    ?? string.Empty,
                RightOperand = request.RightOperand,
                DataType = CustomReportOptions.CalculatedDataTypes.Normalize(request.DataType) ?? request.DataType?.Trim() ?? ReportFieldTypes.Number,
                Decimals = request.Decimals ?? 2
            });
        }

        return fields;
    }

    private static string Slug(string value)
    {
        var builder = new StringBuilder();
        foreach (var character in value.Trim().ToLowerInvariant())
        {
            if (char.IsAsciiLetterOrDigit(character))
            {
                builder.Append(character);
            }
            else if (builder.Length > 0 && builder[^1] != '_')
            {
                builder.Append('_');
            }
        }

        var slug = builder.ToString().Trim('_');
        return slug.Length == 0 ? "field" : slug;
    }

    private static List<string> CleanKeys(IReadOnlyList<string>? keys, Func<string?, string> resolve) =>
        (keys ?? [])
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Select(resolve)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

    // Sorts and chart axes may name an aggregation column (sum_maintenance_cost, count) as well as a field.
    private static string AggregationKeyOrField(string? key, List<CustomReportAggregation> aggregations, Func<string?, string> resolve)
    {
        var trimmed = key?.Trim() ?? string.Empty;
        var aggregation = aggregations.FirstOrDefault(item => string.Equals(ReportAggregations.KeyOf(item), trimmed, StringComparison.OrdinalIgnoreCase));
        return aggregation is not null ? ReportAggregations.KeyOf(aggregation) : resolve(trimmed);
    }

    private static string? JsonText(JsonElement? value) => value?.ValueKind switch
    {
        null or JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.String => value.Value.GetString(),
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => value.Value.GetRawText()
    };

    private static string? FirstNonEmpty(string? requested, string? fallback)
    {
        return string.IsNullOrWhiteSpace(requested) ? fallback : requested.Trim();
    }
}
