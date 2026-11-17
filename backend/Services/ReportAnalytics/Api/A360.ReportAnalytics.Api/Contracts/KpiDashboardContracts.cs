using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;

namespace A360.ReportAnalytics.Api.Contracts;

public static class KpiDashboardOptions
{
    public const string DefaultDatePreset = "This year";
    public const int MaxNameLength = 60;
    public const int MaxOwnerLength = 100;
    public const int MaxInfoLength = 300;
    public const int MaxViewLabelLength = 60;
    public const int MaxLayoutItems = 100;

    public static readonly OptionList Modules = new(KpiDashboardCatalog.Modules.ToArray());

    public static readonly OptionList Units = new(KpiDashboardCatalog.Units.ToArray());

    public static readonly OptionList Directions = new(KpiDashboardCatalog.Directions.ToArray());

    public static readonly OptionList Granularities = new(KpiDashboardCalculator.Granularities.ToArray());

    public static readonly OptionList ExceptionStatuses = new(KpiDashboardCalculator.ExceptionStatuses.ToArray());

    public static readonly OptionList ExportFormats = new("xlsx", "csv");
}

/// <summary>
/// The filter bar shared by every KPI Dashboard data endpoint. viewKey (from /views) picks the tiles; default executive.
/// organization, location and category narrow the assets ("all" clears one). from / to (yyyy-MM-dd) without a preset mean Custom.
/// granularity (Monthly / Quarterly) shapes the trend; exceptionStatus (Watch, At Risk, Over Budget) narrows the exceptions.
/// </summary>
public sealed class KpiDashboardRequest
{
    public string? ViewKey { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public string? Granularity { get; init; }

    public string? ExceptionStatus { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IKpiDashboardKpiRepository KpiRepository { get; init; } = null!;

    public IKpiDashboardLayoutRepository LayoutRepository { get; init; } = null!;

    public A360.Security.ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }
}

/// <summary>
/// Create KPI / Edit KPI. Built-in KPIs take name, target, direction, owner, reviewDueDate and info only. A custom KPI either measures
/// a catalogue metric (its unit is the metric's) or reports value by hand. viewKey (create only) also adds the KPI as a tile on that view.
/// </summary>
public sealed record SaveKpiDashboardKpiRequest(
    string? Name,
    string? Module,
    string? Unit,
    string? Direction,
    double? Target,
    string? Owner,
    string? Metric,
    double? Value,
    DateOnly? ReviewDueDate,
    string? Info,
    string? ViewKey,
    string? TenantId,
    string? ClientId);

public sealed record KpiDashboardLayoutItemRequest(string? KpiId, bool? Visible);

/// <summary>Save a custom view (POST) or a view's layout (PUT). Label is required for a new custom view; built-in views keep theirs.</summary>
public sealed record SaveKpiDashboardViewRequest(
    string? Label,
    IReadOnlyList<KpiDashboardLayoutItemRequest>? Items,
    string? TenantId,
    string? ClientId);

public sealed record KpiDashboardLayoutItemResponse(string KpiId, bool Visible);

/// <summary>A view: Items are the tiles in order (hidden ones included); DefaultKpiIds are what "Reset to default" restores.</summary>
public sealed record KpiDashboardViewResponse(
    string Key,
    string Label,
    string Dashboard,
    bool IsCustom,
    bool IsModified,
    IReadOnlyList<KpiDashboardLayoutItemResponse> Items,
    IReadOnlyList<string> DefaultKpiIds,
    DateTime? UpdatedAt);

public sealed record KpiDashboardAppliedFilters(
    string ViewKey,
    string? Organization,
    string? Location,
    string? Category,
    string Granularity,
    string? ExceptionStatus);

/// <summary>One page section with its context; GeneratedAt drives "Updated n min ago".</summary>
public sealed record KpiDashboardSection<T>(DateTime GeneratedAt, KpiDashboardAppliedFilters Filters, DashboardPeriodResponse Period, T Data);

/// <summary>
/// Everything on the page in one call. Kpis is the whole library for the filter bar (current values); Tiles are the view's visible KPIs in
/// order, with monthly values in Spark (MonthLabels). Exceptions, Targets, Trend and Insights cover the tiles.
/// </summary>
public sealed record KpiDashboardOverviewResponse(
    DateTime GeneratedAt,
    KpiDashboardAppliedFilters Filters,
    DashboardPeriodResponse Period,
    KpiDashboardViewResponse View,
    IReadOnlyList<KpiDashboardViewResponse> Views,
    IReadOnlyList<string> MonthLabels,
    IReadOnlyList<KpiState> Tiles,
    IReadOnlyList<KpiState> Kpis,
    KpiTrend Trend,
    IReadOnlyList<KpiModuleAttainment> Targets,
    IReadOnlyList<KpiState> Exceptions,
    IReadOnlyList<KpiInsight> Insights,
    IReadOnlyList<KpiLibraryModule> Library);

/// <summary>One KPI with its monthly values (View details, tile Export CSV).</summary>
public sealed record KpiDashboardKpiValuesResponse(KpiState Kpi, IReadOnlyList<string> MonthLabels);

public sealed record KpiMetricOption(string Id, string Name, string Module, string Unit, string Direction, bool Flow, bool History, string Source, string Info);

public sealed record KpiDashboardOptionsResponse(
    IReadOnlyList<string> DatePresets,
    string DefaultDatePreset,
    IReadOnlyList<string> Modules,
    IReadOnlyList<string> Units,
    IReadOnlyList<string> Directions,
    IReadOnlyList<string> Statuses,
    IReadOnlyList<string> ExceptionStatuses,
    IReadOnlyList<string> Granularities,
    IReadOnlyList<string> ExportFormats,
    IReadOnlyList<KpiMetricOption> Metrics,
    IReadOnlyList<string> Owners,
    string DefaultViewKey);

public static class KpiDashboardMappings
{
    /// <summary>The built-in KPIs with the tenant's changes, then the custom KPIs in creation order.</summary>
    public static IReadOnlyList<KpiDefinition> Definitions(IReadOnlyList<KpiDashboardKpi> stored)
    {
        var builtIn = KpiDashboardCatalog.Items.Select(item =>
        {
            var change = stored.FirstOrDefault(kpi => kpi.IsBuiltIn && string.Equals(kpi.KpiId, item.Id, StringComparison.OrdinalIgnoreCase));
            return new KpiDefinition(
                item.Id,
                string.IsNullOrWhiteSpace(change?.Name) ? item.Name : change.Name,
                item.Module,
                item.Unit,
                change?.Direction is { } direction && KpiDashboardOptions.Directions.IsValid(direction) ? KpiDashboardOptions.Directions.Normalize(direction)! : item.Direction,
                change?.Target is > 0 ? change.Target.Value : item.DefaultTarget,
                change?.Target is > 0,
                change?.Owner,
                string.IsNullOrWhiteSpace(change?.Info) ? item.Info : change.Info,
                item.Id,
                null,
                item.Flow,
                item.History,
                item.Source,
                change?.ReviewDueDate is { } due ? DateOnly.FromDateTime(due) : null,
                true,
                change is not null,
                change?.UpdatedAt);
        });

        var custom = stored.Where(kpi => !kpi.IsBuiltIn).Select(kpi =>
        {
            var metric = KpiDashboardCatalog.Find(kpi.Metric);
            return new KpiDefinition(
                kpi.KpiId,
                kpi.Name,
                kpi.Module,
                metric?.Unit ?? kpi.Unit,
                kpi.Direction,
                kpi.Target ?? 0,
                true,
                kpi.Owner,
                string.IsNullOrWhiteSpace(kpi.Info) ? metric is null ? "Custom KPI with a manually reported value" : $"Custom KPI: {metric.Info}" : kpi.Info,
                metric?.Id,
                metric is null ? kpi.ManualValue : null,
                metric?.Flow ?? false,
                metric?.History ?? false,
                metric?.Source ?? "Manual",
                kpi.ReviewDueDate is { } due ? DateOnly.FromDateTime(due) : null,
                false,
                false,
                kpi.UpdatedAt ?? kpi.CreatedAt);
        });

        return builtIn.Concat(custom).ToList();
    }

    /// <summary>The built-in views (with the user's layout changes), then the user's custom views; unknown KPI ids are dropped.</summary>
    public static IReadOnlyList<KpiDashboardViewResponse> Views(IReadOnlyList<KpiDashboardLayout> layouts, IReadOnlyList<KpiDefinition> definitions)
    {
        var known = definitions.Select(definition => definition.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        List<KpiDashboardLayoutItemResponse> Items(IEnumerable<KpiDashboardLayoutItem> items) => items
            .Where(item => known.Contains(item.KpiId))
            .DistinctBy(item => item.KpiId, StringComparer.OrdinalIgnoreCase)
            .Select(item => new KpiDashboardLayoutItemResponse(item.KpiId, item.Visible))
            .ToList();

        var builtIn = KpiDashboardCatalog.Views.Select(view =>
        {
            var layout = layouts.FirstOrDefault(item => !item.IsCustom && string.Equals(item.ViewKey, view.Key, StringComparison.OrdinalIgnoreCase));
            var defaults = view.KpiIds.Where(known.Contains).ToList();
            return new KpiDashboardViewResponse(
                view.Key,
                view.Label,
                view.Dashboard,
                false,
                layout is not null,
                layout is null ? defaults.Select(id => new KpiDashboardLayoutItemResponse(id, true)).ToList() : Items(layout.Items),
                defaults,
                layout?.UpdatedAt);
        });

        var custom = layouts.Where(layout => layout.IsCustom).Select(layout => new KpiDashboardViewResponse(
            layout.ViewKey,
            layout.Label,
            $"{layout.Label} (custom)",
            true,
            false,
            Items(layout.Items),
            layout.DefaultItems.Select(item => item.KpiId).Where(known.Contains).ToList(),
            layout.UpdatedAt ?? layout.CreatedAt));

        return builtIn.Concat(custom).ToList();
    }

    public static List<KpiDashboardLayoutItem> ToDomain(this IReadOnlyList<KpiDashboardLayoutItemRequest>? items) =>
        (items ?? [])
            .Where(item => !string.IsNullOrWhiteSpace(item.KpiId))
            .Select(item => new KpiDashboardLayoutItem { KpiId = item.KpiId!.Trim(), Visible = item.Visible ?? true })
            .ToList();
}
