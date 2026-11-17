using System.Net.Mail;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Reporting;

namespace A360.ReportAnalytics.Api.Validation;

public static class CustomReportValidationExtensions
{
    private const int MaxReportNameLength = 200;
    private const int MaxDescriptionLength = 1000;
    private const int MaxSelectedFields = 50;
    private const int MaxCalculatedFields = 20;
    private const int MaxFilters = 30;
    private const int MaxGroupBy = 3;
    private const int MaxAggregations = 10;
    private const int MaxSorts = 5;
    private const int MaxRecipients = 20;

    public static Dictionary<string, string[]> Validate(this CreateCustomReportRequest request) =>
        ValidateHeader(request.ReportName, request.Description, request.Module, request.Visibility, request.CurrentStep, request.Schedule);

    public static Dictionary<string, string[]> Validate(this UpdateCustomReportRequest request) =>
        ValidateHeader(request.ReportName, request.Description, request.Module, request.Visibility, request.CurrentStep, request.Schedule);

    /// <summary>
    /// Checks every reference and value in the builder steps. With requireComplete (Publish, saving a live report, Preview)
    /// the report must also produce at least one column and a chart must have both axes.
    /// </summary>
    public static void ValidateDefinition(this CustomReportDefinition definition, Dictionary<string, string[]> errors, bool requireComplete)
    {
        var builder = new ReportQueryBuilder(definition);

        ValidateDataSources(definition, errors);
        ValidateCalculatedFields(definition, errors);
        ValidateSelectedFields(definition, errors);
        ValidateFilters(definition, builder, errors);
        ValidateGrouping(definition, builder, errors);
        ValidateSorts(definition, builder, errors);
        ValidateVisualization(definition, builder, errors);

        if (definition.RowLimit is < 1 or > CustomReportOptions.MaxRowLimit)
        {
            errors["Definition.RowLimit"] = [$"RowLimit must be between 1 and {CustomReportOptions.MaxRowLimit}"];
        }

        if (!requireComplete)
        {
            return;
        }

        if (builder.Columns.Count == 0)
        {
            errors.TryAdd("Definition.SelectedFields", ["Select at least one field (or a Group by field)"]);
        }

        var visualization = definition.Visualization;
        if (visualization.ChartType != CustomReportOptions.TableChart
            && (string.IsNullOrWhiteSpace(visualization.XAxisField) || string.IsNullOrWhiteSpace(visualization.YAxisField)))
        {
            errors.TryAdd("Definition.Visualization", [$"A {visualization.ChartType} chart needs XAxisField and YAxisField"]);
        }
    }

    private static Dictionary<string, string[]> ValidateHeader(
        string? reportName,
        string? description,
        string? module,
        string? visibility,
        int? currentStep,
        CustomReportScheduleRequest? schedule)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(reportName))
        {
            errors["ReportName"] = ["ReportName is required"];
        }
        else if (reportName.Trim().Length > MaxReportNameLength)
        {
            errors["ReportName"] = [$"ReportName must be {MaxReportNameLength} characters or fewer"];
        }

        if (description?.Trim().Length > MaxDescriptionLength)
        {
            errors["Description"] = [$"Description must be {MaxDescriptionLength} characters or fewer"];
        }

        ValidateOption(errors, "Module", module, CustomReportOptions.Modules);
        ValidateOption(errors, "Visibility", visibility, CustomReportOptions.Visibilities);

        if (currentStep is < 1 or > 6)
        {
            errors["CurrentStep"] = ["CurrentStep must be between 1 and 6"];
        }

        ValidateSchedule(errors, schedule);

        return errors;
    }

    private static void ValidateSchedule(Dictionary<string, string[]> errors, CustomReportScheduleRequest? schedule)
    {
        if (schedule is null || string.IsNullOrWhiteSpace(schedule.Frequency))
        {
            return;
        }

        var frequency = CustomReportOptions.ScheduleFrequencies.Normalize(schedule.Frequency);
        if (frequency is null)
        {
            errors["Schedule.Frequency"] = [$"Frequency must be one of: {string.Join(", ", CustomReportOptions.ScheduleFrequencies.All)}"];
            return;
        }

        if (frequency == CustomReportOptions.NoSchedule)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(schedule.Time) && !ReportSchedules.TryParseTime(schedule.Time, out _))
        {
            errors["Schedule.Time"] = ["Time must be HH:mm (24-hour), e.g. 08:00"];
        }

        if (frequency == "Weekly" && !CustomReportOptions.DaysOfWeek.IsValid(schedule.DayOfWeek))
        {
            errors["Schedule.DayOfWeek"] = [$"A weekly schedule needs DayOfWeek: {string.Join(", ", CustomReportOptions.DaysOfWeek.All)}"];
        }

        if (frequency is "Monthly" or "Quarterly" && schedule.DayOfMonth is < 1 or > 31)
        {
            errors["Schedule.DayOfMonth"] = ["DayOfMonth must be between 1 and 31"];
        }

        if (!ReportPeriods.TryGetTimeZone(schedule.TimeZone, out _))
        {
            errors["Schedule.TimeZone"] = [$"TimeZone '{schedule.TimeZone}' is not recognised (use an id such as Asia/Dubai or UTC)"];
        }

        var recipients = (schedule.Recipients ?? []).Where(recipient => !string.IsNullOrWhiteSpace(recipient)).ToList();
        if (recipients.Count > MaxRecipients)
        {
            errors["Schedule.Recipients"] = [$"No more than {MaxRecipients} recipients"];
        }
        else if (recipients.FirstOrDefault(recipient => !MailAddress.TryCreate(recipient.Trim(), out _)) is { } invalid)
        {
            errors["Schedule.Recipients"] = [$"'{invalid}' is not a valid email address"];
        }
    }

    private static void ValidateDataSources(CustomReportDefinition definition, Dictionary<string, string[]> errors)
    {
        var unknown = definition.DataSources.Where(source => ReportFieldCatalog.DataSources.All(known => known.Key != source)).ToList();
        if (unknown.Count > 0)
        {
            errors["Definition.DataSources"] = [$"Unknown data source(s): {string.Join(", ", unknown)}. Use: {string.Join(", ", ReportFieldCatalog.DataSources.Select(source => source.Key))}"];
        }
    }

    private static void ValidateCalculatedFields(CustomReportDefinition definition, Dictionary<string, string[]> errors)
    {
        if (definition.CalculatedFields.Count > MaxCalculatedFields)
        {
            errors["Definition.CalculatedFields"] = [$"No more than {MaxCalculatedFields} calculated fields"];
            return;
        }

        var earlier = new Dictionary<string, CustomReportCalculatedField>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < definition.CalculatedFields.Count; index++)
        {
            var field = definition.CalculatedFields[index];
            var key = $"Definition.CalculatedFields[{index}]";
            var problems = new List<string>();

            if (string.IsNullOrWhiteSpace(field.Label))
            {
                problems.Add("Label is required");
            }

            if (!ReportCalculationOperators.All.Contains(field.Operator))
            {
                problems.Add($"Operator must be one of: {string.Join(", ", ReportCalculationOperators.All)}");
            }

            if (!CustomReportOptions.CalculatedDataTypes.IsValid(field.DataType))
            {
                problems.Add($"DataType must be one of: {string.Join(", ", CustomReportOptions.CalculatedDataTypes.All)}");
            }

            if (field.Decimals is < 0 or > 6)
            {
                problems.Add("Decimals must be between 0 and 6");
            }

            if (field.Operator == ReportCalculationOperators.DaysSince)
            {
                if (OperandType(field.LeftOperand, earlier) != ReportFieldTypes.Date)
                {
                    problems.Add("daysSince needs a date field as LeftOperand");
                }
            }
            else if (ReportCalculationOperators.All.Contains(field.Operator))
            {
                foreach (var (name, operand) in new[] { ("LeftOperand", field.LeftOperand), ("RightOperand", field.RightOperand) })
                {
                    if (string.IsNullOrWhiteSpace(operand))
                    {
                        problems.Add($"{name} is required");
                    }
                    else if (!ReportValueParser.IsNumberLiteral(operand) && OperandType(operand, earlier) is not (ReportFieldTypes.Number or ReportFieldTypes.Currency))
                    {
                        problems.Add($"{name} '{operand}' must be a number or a numeric field defined before this one");
                    }
                }
            }

            foreach (var operand in new[] { field.LeftOperand, field.RightOperand })
            {
                if (ReportFieldCatalog.Find(operand) is { } catalogField && !definition.DataSources.Contains(catalogField.DataSource))
                {
                    problems.Add($"'{catalogField.Label}' needs the {catalogField.DataSource} data source");
                }
            }

            if (problems.Count > 0)
            {
                errors[key] = problems.ToArray();
            }

            earlier.TryAdd(field.Key, field);
        }
    }

    private static string? OperandType(string? operand, Dictionary<string, CustomReportCalculatedField> earlier)
    {
        if (ReportFieldCatalog.Find(operand) is { } field)
        {
            return field.DataType;
        }

        return operand is not null && earlier.TryGetValue(operand, out var calculated) ? calculated.DataType : null;
    }

    private static void ValidateSelectedFields(CustomReportDefinition definition, Dictionary<string, string[]> errors)
    {
        if (definition.SelectedFields.Count > MaxSelectedFields)
        {
            errors["Definition.SelectedFields"] = [$"No more than {MaxSelectedFields} fields"];
            return;
        }

        var problems = definition.SelectedFields
            .Select(key => FieldProblem(definition, key))
            .OfType<string>()
            .ToArray();

        if (problems.Length > 0)
        {
            errors["Definition.SelectedFields"] = problems;
        }
    }

    private static void ValidateFilters(CustomReportDefinition definition, ReportQueryBuilder builder, Dictionary<string, string[]> errors)
    {
        if (!CustomReportOptions.FilterLogic.IsValid(definition.FilterLogic))
        {
            errors["Definition.FilterLogic"] = ["FilterLogic must be And or Or"];
        }

        if (definition.Filters.Count > MaxFilters)
        {
            errors["Definition.Filters"] = [$"No more than {MaxFilters} filters"];
            return;
        }

        for (var index = 0; index < definition.Filters.Count; index++)
        {
            var filter = definition.Filters[index];
            var key = $"Definition.Filters[{index}]";

            if (FieldProblem(definition, filter.Field) is { } fieldProblem)
            {
                errors[key] = [fieldProblem];
                continue;
            }

            var type = builder.TypeOf(filter.Field)!;
            var operators = ReportFilterOperators.ForType(type);
            if (!operators.Contains(filter.Operator))
            {
                errors[key] = [$"Operator for a {type} field must be one of: {string.Join(", ", operators)}"];
                continue;
            }

            var problem = filter.Operator switch
            {
                _ when ReportFilterOperators.NeedsNoValue(filter.Operator) => null,
                _ when ReportFilterOperators.NeedsValues(filter.Operator) =>
                    filter.Values.Count == 0
                        ? "Values needs at least one value"
                        : filter.Values.FirstOrDefault(value => !ReportValueParser.TryParse(value, type, out _)) is { } bad
                            ? $"'{bad}' is not a valid {type}"
                            : null,
                ReportFilterOperators.InLastDays =>
                    int.TryParse(filter.Value, out var days) && days is > 0 and <= 3650 ? null : "Value must be a number of days between 1 and 3650",
                ReportFilterOperators.Between => BetweenProblem(filter, type),
                _ => ReportValueParser.TryParse(filter.Value, type, out _) ? null : $"Value must be a valid {type}"
            };

            if (problem is not null)
            {
                errors[key] = [problem];
            }
        }
    }

    private static string? BetweenProblem(CustomReportFilter filter, string type)
    {
        if (!ReportValueParser.TryParse(filter.Value, type, out var from) || !ReportValueParser.TryParse(filter.ValueTo, type, out var to))
        {
            return $"between needs Value and ValueTo as valid {type} values";
        }

        return from.CompareTo(to) > 0 ? "Value must be less than or equal to ValueTo" : null;
    }

    private static void ValidateGrouping(CustomReportDefinition definition, ReportQueryBuilder builder, Dictionary<string, string[]> errors)
    {
        if (definition.GroupBy.Count > MaxGroupBy)
        {
            errors["Definition.GroupBy"] = [$"No more than {MaxGroupBy} Group by fields"];
        }
        else if (definition.GroupBy.Select(key => FieldProblem(definition, key)).OfType<string>().ToArray() is { Length: > 0 } groupProblems)
        {
            errors["Definition.GroupBy"] = groupProblems;
        }

        if (definition.Aggregations.Count == 0)
        {
            return;
        }

        if (definition.GroupBy.Count == 0)
        {
            errors["Definition.Aggregations"] = ["Aggregations need at least one Group by field"];
            return;
        }

        if (definition.Aggregations.Count > MaxAggregations)
        {
            errors["Definition.Aggregations"] = [$"No more than {MaxAggregations} aggregations"];
            return;
        }

        var problems = new List<string>();
        foreach (var aggregation in definition.Aggregations)
        {
            if (!ReportAggregations.All.Contains(aggregation.Function))
            {
                problems.Add($"Function '{aggregation.Function}' must be one of: {string.Join(", ", ReportAggregations.All)}");
                continue;
            }

            if (string.IsNullOrWhiteSpace(aggregation.Field))
            {
                if (aggregation.Function != ReportAggregations.Count)
                {
                    problems.Add($"{aggregation.Function} needs a Field");
                }

                continue;
            }

            if (FieldProblem(definition, aggregation.Field) is { } fieldProblem)
            {
                problems.Add(fieldProblem);
                continue;
            }

            var type = builder.TypeOf(aggregation.Field)!;
            if (aggregation.Function is ReportAggregations.Sum or ReportAggregations.Avg && !ReportFieldTypes.IsNumeric(type))
            {
                problems.Add($"{aggregation.Function} needs a numeric field; '{builder.LabelOf(aggregation.Field)}' is {type}");
            }
            else if (aggregation.Function is ReportAggregations.Min or ReportAggregations.Max && !(ReportFieldTypes.IsNumeric(type) || type == ReportFieldTypes.Date))
            {
                problems.Add($"{aggregation.Function} needs a numeric or date field; '{builder.LabelOf(aggregation.Field)}' is {type}");
            }
        }

        var duplicates = definition.Aggregations
            .GroupBy(ReportAggregations.KeyOf, StringComparer.OrdinalIgnoreCase)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToList();
        if (duplicates.Count > 0)
        {
            problems.Add($"Duplicate aggregation(s): {string.Join(", ", duplicates)}");
        }

        if (problems.Count > 0)
        {
            errors["Definition.Aggregations"] = problems.ToArray();
        }
    }

    private static void ValidateSorts(CustomReportDefinition definition, ReportQueryBuilder builder, Dictionary<string, string[]> errors)
    {
        if (definition.Sorts.Count > MaxSorts)
        {
            errors["Definition.Sorts"] = [$"No more than {MaxSorts} sorts"];
            return;
        }

        var problems = new List<string>();
        foreach (var sort in definition.Sorts)
        {
            if (!IsColumn(builder, sort.Field))
            {
                problems.Add($"Sort field '{sort.Field}' must be one of the report's columns: {string.Join(", ", builder.Columns.Select(column => column.Key))}");
            }

            if (sort.Direction is not ("asc" or "desc"))
            {
                problems.Add($"Direction for '{sort.Field}' must be asc or desc");
            }
        }

        if (problems.Count > 0)
        {
            errors["Definition.Sorts"] = problems.ToArray();
        }
    }

    private static void ValidateVisualization(CustomReportDefinition definition, ReportQueryBuilder builder, Dictionary<string, string[]> errors)
    {
        var visualization = definition.Visualization;
        var problems = new List<string>();

        if (!CustomReportOptions.ChartTypes.IsValid(visualization.ChartType))
        {
            problems.Add($"ChartType must be one of: {string.Join(", ", CustomReportOptions.ChartTypes.All)}");
        }

        if (!CustomReportOptions.DefaultViews.IsValid(visualization.DefaultView))
        {
            problems.Add("DefaultView must be Table or Chart");
        }

        if (visualization.MaxCategories is < 2 or > 50)
        {
            problems.Add("MaxCategories must be between 2 and 50");
        }

        if (!string.IsNullOrWhiteSpace(visualization.XAxisField) && !IsColumn(builder, visualization.XAxisField))
        {
            problems.Add($"XAxisField '{visualization.XAxisField}' must be one of the report's columns");
        }

        if (!string.IsNullOrWhiteSpace(visualization.YAxisField))
        {
            var column = builder.Columns.FirstOrDefault(column => string.Equals(column.Key, visualization.YAxisField, StringComparison.OrdinalIgnoreCase));
            if (column is null)
            {
                problems.Add($"YAxisField '{visualization.YAxisField}' must be one of the report's columns");
            }
            else if (!ReportFieldTypes.IsNumeric(column.DataType))
            {
                problems.Add($"YAxisField '{column.Label}' must be numeric");
            }
        }

        if (problems.Count > 0)
        {
            errors["Definition.Visualization"] = problems.ToArray();
        }
    }

    // Unknown key, or a catalog field whose data source is not selected.
    private static string? FieldProblem(CustomReportDefinition definition, string? key)
    {
        if (ReportFieldCatalog.Find(key) is { } field)
        {
            return definition.DataSources.Contains(field.DataSource)
                ? null
                : $"'{field.Label}' needs the {field.DataSource} data source";
        }

        return definition.CalculatedFields.Any(calculated => string.Equals(calculated.Key, key, StringComparison.OrdinalIgnoreCase))
            ? null
            : $"Unknown field '{key}'";
    }

    private static bool IsColumn(ReportQueryBuilder builder, string? key) =>
        builder.Columns.Any(column => string.Equals(column.Key, key?.Trim(), StringComparison.OrdinalIgnoreCase));

    private static void ValidateOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }
}
