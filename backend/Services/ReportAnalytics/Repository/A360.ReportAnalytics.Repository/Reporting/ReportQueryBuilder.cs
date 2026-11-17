using System.Globalization;
using System.Text.RegularExpressions;
using MongoDB.Bson;
using A360.ReportAnalytics.Domain.Entities;

namespace A360.ReportAnalytics.Repository.Reporting;

public sealed record ReportColumn(string Key, string Label, string DataType);

/// <summary>Tenant/client the report data is limited to; null means not limited.</summary>
public sealed record ReportQueryScope(string? TenantId, string? ClientId);

public static class ReportAggregations
{
    public const string Sum = "sum";
    public const string Avg = "avg";
    public const string Min = "min";
    public const string Max = "max";
    public const string Count = "count";
    public const string CountDistinct = "countDistinct";

    public static readonly IReadOnlyList<string> All = [Sum, Avg, Min, Max, Count, CountDistinct];

    /// <summary>Column key of an aggregation, e.g. sum_maintenance_cost; plain count is "count".</summary>
    public static string KeyOf(CustomReportAggregation aggregation) =>
        aggregation.Function == Count && string.IsNullOrWhiteSpace(aggregation.Field)
            ? Count
            : $"{aggregation.Function}_{aggregation.Field}";
}

public static class ReportFilterOperators
{
    public const string EqualsTo = "equals";
    public const string NotEquals = "notEquals";
    public const string Contains = "contains";
    public const string NotContains = "notContains";
    public const string StartsWith = "startsWith";
    public const string In = "in";
    public const string NotIn = "notIn";
    public const string GreaterThan = "greaterThan";
    public const string GreaterOrEqual = "greaterOrEqual";
    public const string LessThan = "lessThan";
    public const string LessOrEqual = "lessOrEqual";
    public const string Between = "between";
    public const string IsEmpty = "isEmpty";
    public const string IsNotEmpty = "isNotEmpty";
    public const string InLastDays = "inLastDays";

    private static readonly string[] Text = [EqualsTo, NotEquals, Contains, NotContains, StartsWith, In, NotIn, IsEmpty, IsNotEmpty];
    private static readonly string[] Numeric = [EqualsTo, NotEquals, GreaterThan, GreaterOrEqual, LessThan, LessOrEqual, Between, In, NotIn, IsEmpty, IsNotEmpty];
    private static readonly string[] Dates = [EqualsTo, NotEquals, GreaterThan, GreaterOrEqual, LessThan, LessOrEqual, Between, InLastDays, IsEmpty, IsNotEmpty];

    public static IReadOnlyList<string> ForType(string dataType) => dataType switch
    {
        ReportFieldTypes.Date => Dates,
        ReportFieldTypes.Number or ReportFieldTypes.Currency => Numeric,
        _ => Text
    };

    public static bool NeedsNoValue(string op) => op is IsEmpty or IsNotEmpty;

    public static bool NeedsValues(string op) => op is In or NotIn;
}

public static class ReportCalculationOperators
{
    public const string DaysSince = "daysSince";

    public static readonly IReadOnlyList<string> All = ["+", "-", "*", "/", DaysSince];
}

public static class ReportValueParser
{
    /// <summary>Parses a filter value typed as text into the field's type; dates without an offset are UTC.</summary>
    public static bool TryParse(string? raw, string dataType, out BsonValue value)
    {
        value = BsonNull.Value;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        switch (dataType)
        {
            case ReportFieldTypes.Number or ReportFieldTypes.Currency:
                if (!double.TryParse(raw.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
                {
                    return false;
                }

                value = number;
                return true;
            case ReportFieldTypes.Date:
                if (!DateTime.TryParse(raw.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date))
                {
                    return false;
                }

                value = new BsonDateTime(date);
                return true;
            default:
                value = raw.Trim();
                return true;
        }
    }

    public static bool IsNumberLiteral(string? operand) =>
        double.TryParse(operand?.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out _);
}

/// <summary>
/// Turns a report definition into an aggregation over the asset collection:
/// match assets → join only the collections the fields need → compute fields → calculated fields → filters → group.
/// The definition is validated by the API first; unknown keys here are skipped rather than reported.
/// </summary>
public sealed class ReportQueryBuilder
{
    private const int MaxChartGroups = 500;

    private readonly CustomReportDefinition _definition;
    private readonly Dictionary<string, CustomReportCalculatedField> _calculated;

    public ReportQueryBuilder(CustomReportDefinition definition)
    {
        _definition = definition;
        _calculated = definition.CalculatedFields
            .Where(field => !string.IsNullOrWhiteSpace(field.Key))
            .GroupBy(field => field.Key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        Columns = BuildColumns();
    }

    public bool IsGrouped => _definition.GroupBy.Count > 0;

    /// <summary>The report's output columns: selected fields, or group fields plus aggregations when grouped.</summary>
    public IReadOnlyList<ReportColumn> Columns { get; }

    public string? TypeOf(string? key)
    {
        if (key is null)
        {
            return null;
        }

        if (ReportFieldCatalog.Find(key) is { } field)
        {
            return field.DataType;
        }

        return _calculated.TryGetValue(key, out var calculated) ? calculated.DataType : null;
    }

    public string? LabelOf(string? key)
    {
        if (key is null)
        {
            return null;
        }

        return ReportFieldCatalog.Find(key)?.Label ?? (_calculated.TryGetValue(key, out var calculated) ? calculated.Label : null);
    }

    public List<BsonDocument> BuildRows(ReportQueryScope scope, int limit)
    {
        var pipeline = BuildBase(scope);
        pipeline.Add(new BsonDocument("$sort", SortDocument()));
        pipeline.Add(new BsonDocument("$limit", limit));

        var project = new BsonDocument("_id", 0);
        foreach (var column in Columns)
        {
            project[column.Key] = 1;
        }

        pipeline.Add(new BsonDocument("$project", project));
        return pipeline;
    }

    public List<BsonDocument> BuildCount(ReportQueryScope scope)
    {
        var pipeline = BuildBase(scope);
        pipeline.Add(new BsonDocument("$count", "n"));
        return pipeline;
    }

    /// <summary>Sums Y per X over every row (not just the preview page). Dates on X are grouped by day.</summary>
    public List<BsonDocument> BuildChart(ReportQueryScope scope, string xKey, string yKey)
    {
        var isDateAxis = TypeOf(xKey) == ReportFieldTypes.Date;
        BsonValue label = isDateAxis
            ? new BsonDocument("$dateToString", new BsonDocument { { "format", "%Y-%m-%d" }, { "date", $"${xKey}" } })
            : $"${xKey}";

        var pipeline = BuildBase(scope);
        pipeline.Add(new BsonDocument("$group", new BsonDocument
        {
            { "_id", label },
            { "value", new BsonDocument("$sum", new BsonDocument("$ifNull", new BsonArray { $"${yKey}", 0 })) }
        }));
        pipeline.Add(new BsonDocument("$sort", isDateAxis ? new BsonDocument("_id", 1) : new BsonDocument { { "value", -1 }, { "_id", 1 } }));
        pipeline.Add(new BsonDocument("$limit", MaxChartGroups));
        return pipeline;
    }

    private List<BsonDocument> BuildBase(ReportQueryScope scope)
    {
        var (fields, calculated) = ResolveReferences();

        var match = new BsonDocument("is_deleted", new BsonDocument("$ne", true));
        if (!string.IsNullOrWhiteSpace(scope.TenantId))
        {
            match["tenant_id"] = scope.TenantId;
        }

        if (!string.IsNullOrWhiteSpace(scope.ClientId))
        {
            match["client_id"] = scope.ClientId;
        }

        var pipeline = new List<BsonDocument> { new("$match", match) };

        foreach (var alias in fields.SelectMany(field => field.Lookups).Distinct())
        {
            pipeline.Add(LookupStage(ReportFieldCatalog.Lookups[alias]));
        }

        var project = new BsonDocument("_id", 0);
        foreach (var field in fields)
        {
            project[field.Key] = field.Expression;
        }

        pipeline.Add(new BsonDocument("$project", project));

        // One stage per calculated field so later ones can use earlier ones.
        foreach (var field in calculated)
        {
            pipeline.Add(new BsonDocument("$addFields", new BsonDocument(field.Key, CalculatedExpression(field))));
        }

        var filters = _definition.Filters.Select(FilterDocument).Where(filter => filter is not null).Cast<BsonDocument>().ToList();
        if (filters.Count > 0)
        {
            pipeline.Add(new BsonDocument("$match", filters.Count == 1
                ? filters[0]
                : new BsonDocument(string.Equals(_definition.FilterLogic, "Or", StringComparison.OrdinalIgnoreCase) ? "$or" : "$and", new BsonArray(filters))));
        }

        if (IsGrouped)
        {
            pipeline.AddRange(GroupStages());
        }

        return pipeline;
    }

    // Each joined collection is matched on asset_id, which may hold the asset_registration_id or the Mongo _id.
    private static BsonDocument LookupStage(ReportLookup lookup)
    {
        var project = new BsonDocument("_id", 0);
        foreach (var field in lookup.Fields)
        {
            project[field] = 1;
        }

        return new BsonDocument("$lookup", new BsonDocument
        {
            { "from", lookup.Collection },
            { "let", new BsonDocument { { "rid", "$asset_registration_id" }, { "oid", new BsonDocument("$toString", "$_id") } } },
            {
                "pipeline", new BsonArray
                {
                    new BsonDocument("$match", new BsonDocument
                    {
                        { "is_deleted", new BsonDocument("$ne", true) },
                        { "$expr", new BsonDocument("$in", new BsonArray { "$asset_id", new BsonArray { "$$rid", "$$oid" } }) }
                    }),
                    new BsonDocument("$project", project)
                }
            },
            { "as", lookup.Alias }
        });
    }

    /// <summary>Catalog fields and calculated fields (in dependency order) used anywhere in the definition.</summary>
    private (List<ReportField> Fields, List<CustomReportCalculatedField> Calculated) ResolveReferences()
    {
        var keys = new List<string>();
        keys.AddRange(IsGrouped ? _definition.GroupBy : _definition.SelectedFields);
        keys.AddRange(_definition.Filters.Select(filter => filter.Field));
        keys.AddRange(_definition.Aggregations.Select(aggregation => aggregation.Field).OfType<string>());
        keys.AddRange(_definition.Sorts.Select(sort => sort.Field));
        keys.Add(_definition.Visualization.XAxisField ?? string.Empty);
        keys.Add(_definition.Visualization.YAxisField ?? string.Empty);

        var fields = new Dictionary<string, ReportField>(StringComparer.OrdinalIgnoreCase);
        var calculated = new List<CustomReportCalculatedField>();

        void Visit(string? key)
        {
            if (string.IsNullOrWhiteSpace(key))
            {
                return;
            }

            if (ReportFieldCatalog.Find(key) is { } field)
            {
                fields.TryAdd(field.Key, field);
            }
            else if (_calculated.TryGetValue(key, out var calc) && !calculated.Contains(calc))
            {
                Visit(ReportValueParser.IsNumberLiteral(calc.LeftOperand) ? null : calc.LeftOperand);
                Visit(ReportValueParser.IsNumberLiteral(calc.RightOperand) ? null : calc.RightOperand);
                calculated.Add(calc);
            }
        }

        foreach (var key in keys)
        {
            Visit(key);
        }

        return (fields.Values.ToList(), calculated);
    }

    private static BsonValue Operand(string? operand) =>
        ReportValueParser.IsNumberLiteral(operand)
            ? double.Parse(operand!.Trim(), NumberStyles.Float, CultureInfo.InvariantCulture)
            : $"${operand!.Trim()}";

    private static BsonValue CalculatedExpression(CustomReportCalculatedField field)
    {
        var left = Operand(field.LeftOperand);
        BsonValue expression;

        if (field.Operator == ReportCalculationOperators.DaysSince)
        {
            expression = new BsonDocument("$cond", new BsonArray
            {
                new BsonDocument("$eq", new BsonArray { new BsonDocument("$ifNull", new BsonArray { left, BsonNull.Value }), BsonNull.Value }),
                BsonNull.Value,
                new BsonDocument("$floor", new BsonDocument("$divide", new BsonArray
                {
                    new BsonDocument("$subtract", new BsonArray { "$$NOW", left }),
                    86_400_000
                }))
            });

            return expression;
        }

        var right = Operand(field.RightOperand);
        expression = field.Operator switch
        {
            "+" => new BsonDocument("$add", new BsonArray { left, right }),
            "-" => new BsonDocument("$subtract", new BsonArray { left, right }),
            "*" => new BsonDocument("$multiply", new BsonArray { left, right }),
            // Division by zero or a missing value gives null instead of failing the report.
            _ => new BsonDocument("$cond", new BsonArray
            {
                new BsonDocument("$in", new BsonArray { new BsonDocument("$ifNull", new BsonArray { right, 0 }), new BsonArray { 0, 0.0 } }),
                BsonNull.Value,
                new BsonDocument("$divide", new BsonArray { left, right })
            })
        };

        return new BsonDocument("$round", new BsonArray { expression, Math.Clamp(field.Decimals, 0, 6) });
    }

    private BsonDocument? FilterDocument(CustomReportFilter filter)
    {
        var type = TypeOf(filter.Field);
        if (type is null)
        {
            return null;
        }

        var key = ReportFieldCatalog.Find(filter.Field)?.Key ?? filter.Field.Trim();
        BsonValue Parse(string? raw) => ReportValueParser.TryParse(raw, type, out var value) ? value : BsonNull.Value;
        bool isText = type == ReportFieldTypes.String;

        BsonValue Exact(string? raw) => isText
            ? new BsonRegularExpression($"^{Regex.Escape(raw?.Trim() ?? string.Empty)}$", "i")
            : Parse(raw);

        BsonValue condition = filter.Operator switch
        {
            ReportFilterOperators.EqualsTo when type == ReportFieldTypes.Date => DayRange(Parse(filter.Value)),
            ReportFilterOperators.EqualsTo => isText ? Exact(filter.Value) : new BsonDocument("$eq", Parse(filter.Value)),
            ReportFilterOperators.NotEquals when type == ReportFieldTypes.Date => new BsonDocument("$not", DayRange(Parse(filter.Value))),
            ReportFilterOperators.NotEquals => isText ? new BsonDocument("$not", Exact(filter.Value)) : new BsonDocument("$ne", Parse(filter.Value)),
            ReportFilterOperators.Contains => new BsonRegularExpression(Regex.Escape(filter.Value?.Trim() ?? string.Empty), "i"),
            ReportFilterOperators.NotContains => new BsonDocument("$not", new BsonRegularExpression(Regex.Escape(filter.Value?.Trim() ?? string.Empty), "i")),
            ReportFilterOperators.StartsWith => new BsonRegularExpression($"^{Regex.Escape(filter.Value?.Trim() ?? string.Empty)}", "i"),
            ReportFilterOperators.In => new BsonDocument("$in", new BsonArray(filter.Values.Select(Exact))),
            ReportFilterOperators.NotIn => new BsonDocument("$nin", new BsonArray(filter.Values.Select(Exact))),
            ReportFilterOperators.GreaterThan => new BsonDocument("$gt", Parse(filter.Value)),
            ReportFilterOperators.GreaterOrEqual => new BsonDocument("$gte", Parse(filter.Value)),
            ReportFilterOperators.LessThan => new BsonDocument("$lt", Parse(filter.Value)),
            ReportFilterOperators.LessOrEqual => new BsonDocument("$lte", Parse(filter.Value)),
            ReportFilterOperators.Between => new BsonDocument { { "$gte", Parse(filter.Value) }, UpperBound(Parse(filter.ValueTo), type) },
            ReportFilterOperators.InLastDays => new BsonDocument("$gte", DateTime.UtcNow.Date.AddDays(-(int)Parse(filter.Value).ToDouble())),
            ReportFilterOperators.IsEmpty => new BsonDocument("$in", new BsonArray { BsonNull.Value, string.Empty }),
            ReportFilterOperators.IsNotEmpty => new BsonDocument("$nin", new BsonArray { BsonNull.Value, string.Empty }),
            _ => BsonNull.Value
        };

        return condition.IsBsonNull ? null : new BsonDocument(key, condition);
    }

    private static BsonDocument DayRange(BsonValue day)
    {
        var start = day.ToUniversalTime().Date;
        return new BsonDocument { { "$gte", start }, { "$lt", start.AddDays(1) } };
    }

    // A date without a time ("2026-10-31") includes that whole day.
    private static BsonElement UpperBound(BsonValue value, string type) =>
        type == ReportFieldTypes.Date && value.ToUniversalTime().TimeOfDay == TimeSpan.Zero
            ? new BsonElement("$lt", value.ToUniversalTime().AddDays(1))
            : new BsonElement("$lte", value);

    private IEnumerable<BsonDocument> GroupStages()
    {
        var groupId = new BsonDocument();
        for (var index = 0; index < _definition.GroupBy.Count; index++)
        {
            groupId[$"g{index}"] = $"${GroupKey(index)}";
        }

        var group = new BsonDocument("_id", groupId);
        var project = new BsonDocument("_id", 0);

        for (var index = 0; index < _definition.GroupBy.Count; index++)
        {
            project[GroupKey(index)] = $"$_id.g{index}";
        }

        foreach (var aggregation in _definition.Aggregations)
        {
            var key = ReportAggregations.KeyOf(aggregation);
            var source = $"${aggregation.Field}";

            group[key] = aggregation.Function switch
            {
                ReportAggregations.Sum => new BsonDocument("$sum", source),
                ReportAggregations.Avg => new BsonDocument("$avg", source),
                ReportAggregations.Min => new BsonDocument("$min", source),
                ReportAggregations.Max => new BsonDocument("$max", source),
                ReportAggregations.CountDistinct => new BsonDocument("$addToSet", source),
                _ => new BsonDocument("$sum", 1)
            };

            project[key] = aggregation.Function switch
            {
                ReportAggregations.CountDistinct => new BsonDocument("$size", $"${key}"),
                ReportAggregations.Avg => new BsonDocument("$round", new BsonArray { $"${key}", 2 }),
                _ => (BsonValue)$"${key}"
            };
        }

        yield return new BsonDocument("$group", group);
        yield return new BsonDocument("$project", project);
    }

    private string GroupKey(int index) => ReportFieldCatalog.Find(_definition.GroupBy[index])?.Key ?? _definition.GroupBy[index].Trim();

    private BsonDocument SortDocument()
    {
        var sort = new BsonDocument();
        foreach (var item in _definition.Sorts)
        {
            var column = Columns.FirstOrDefault(column => string.Equals(column.Key, item.Field?.Trim(), StringComparison.OrdinalIgnoreCase));
            if (column is not null && !sort.Contains(column.Key))
            {
                sort[column.Key] = string.Equals(item.Direction, "desc", StringComparison.OrdinalIgnoreCase) ? -1 : 1;
            }
        }

        if (sort.ElementCount == 0 && Columns.Count > 0)
        {
            // Grouped reports default to the biggest first measure; row reports to the first column.
            var measure = IsGrouped ? Columns.Skip(_definition.GroupBy.Count).FirstOrDefault() : null;
            sort = measure is not null ? new BsonDocument(measure.Key, -1) : new BsonDocument(Columns[0].Key, 1);
        }

        return sort;
    }

    private List<ReportColumn> BuildColumns()
    {
        if (!IsGrouped)
        {
            return _definition.SelectedFields
                .Select(key => (Key: ReportFieldCatalog.Find(key)?.Key ?? key.Trim(), Type: TypeOf(key), Label: LabelOf(key)))
                .Where(column => column.Type is not null)
                .Select(column => new ReportColumn(column.Key, column.Label!, column.Type!))
                .ToList();
        }

        var columns = _definition.GroupBy
            .Select((key, index) => new ReportColumn(GroupKey(index), LabelOf(key) ?? key, TypeOf(key) ?? ReportFieldTypes.String))
            .ToList();

        foreach (var aggregation in _definition.Aggregations)
        {
            var fieldLabel = LabelOf(aggregation.Field);
            var label = !string.IsNullOrWhiteSpace(aggregation.Label)
                ? aggregation.Label.Trim()
                : aggregation.Function switch
                {
                    ReportAggregations.Count when fieldLabel is null => "Count",
                    ReportAggregations.CountDistinct => $"Distinct {fieldLabel}",
                    _ => $"{CultureInfo.InvariantCulture.TextInfo.ToTitleCase(aggregation.Function)} of {fieldLabel}"
                };

            var type = aggregation.Function switch
            {
                ReportAggregations.Count or ReportAggregations.CountDistinct => ReportFieldTypes.Number,
                ReportAggregations.Avg => TypeOf(aggregation.Field) == ReportFieldTypes.Currency ? ReportFieldTypes.Currency : ReportFieldTypes.Number,
                _ => TypeOf(aggregation.Field) ?? ReportFieldTypes.Number
            };

            columns.Add(new ReportColumn(ReportAggregations.KeyOf(aggregation), label, type));
        }

        return columns;
    }
}
