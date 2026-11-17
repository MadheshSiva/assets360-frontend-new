using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Analytics;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>
/// Reports &amp; Analytics / KPI Dashboard: a KPI library (built-in KPIs worked out from live Asset, Maintenance, Inspection, Inventory and
/// WIP records through the analytics calculators, plus custom KPIs), views of KPI tiles with their layout, the performance trend,
/// target vs actual by module, exceptions and insights. KPIs are shared by the tenant; views and layouts belong to the signed-in user.
/// </summary>
public static class KpiDashboardEndpoints
{
    internal const string KpiEntityType = "KpiDashboardKpi";
    internal const string ViewEntityType = "KpiDashboardView";
    private const string BasePath = "/api/kpi-dashboard";
    private const string KpiSequenceName = "kpi_dashboard_kpi";
    private const string ViewSequenceName = "kpi_dashboard_view";

    public static RouteGroupBuilder MapKpiDashboardEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("KPI Dashboard");

        // Page furniture: dropdown values, the metric catalogue, owners and the Organization / Location / Category filters.
        group.MapGet("/options", GetOptionsAsync).WithName("GetKpiDashboardOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetKpiDashboardFilters");

        // KPI library: Create KPI / Edit KPI.
        group.MapGet("/kpis", GetKpisAsync).WithName("GetKpiDashboardKpis");
        group.MapGet("/kpis/{kpiId}", GetKpiAsync).WithName("GetKpiDashboardKpi");
        group.MapPost("/kpis", CreateKpiAsync).WithName("CreateKpiDashboardKpi");
        group.MapPut("/kpis/{kpiId}", UpdateKpiAsync).WithName("UpdateKpiDashboardKpi");
        group.MapDelete("/kpis/{kpiId}", DeleteKpiAsync).WithName("DeleteKpiDashboardKpi");
        group.MapGet("/kpis/{kpiId}/values", GetKpiValuesAsync).WithName("GetKpiDashboardKpiValues");

        // Views: built-in views with the user's layout, and custom views.
        group.MapGet("/views", GetViewsAsync).WithName("GetKpiDashboardViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateKpiDashboardView");
        group.MapPut("/views/{viewKey}", UpdateViewAsync).WithName("UpdateKpiDashboardView");
        group.MapPost("/views/{viewKey}/reset", ResetViewAsync).WithName("ResetKpiDashboardView");
        group.MapDelete("/views/{viewKey}", DeleteViewAsync).WithName("DeleteKpiDashboardView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetKpiDashboardOverview");
        group.MapGet("/tiles", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, ids) => page.Evaluation.Tiles(ids))).WithName("GetKpiDashboardTiles");
        group.MapGet("/trend", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, ids) => page.Evaluation.Trend(ids, page.Filters.Granularity))).WithName("GetKpiDashboardTrend");
        group.MapGet("/targets", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, ids) => page.Evaluation.Targets(ids))).WithName("GetKpiDashboardTargets");
        group.MapGet("/exceptions", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, ids) => page.Evaluation.Exceptions(ids, page.Filters.ExceptionStatus))).WithName("GetKpiDashboardExceptions");
        group.MapGet("/insights", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, ids) => page.Evaluation.Insights(ids))).WithName("GetKpiDashboardInsights");
        group.MapGet("/library", ([AsParameters] KpiDashboardRequest request) => Section(request, (page, _) => new { Modules = page.Evaluation.Library(), Kpis = page.Evaluation.States }))
            .WithName("GetKpiDashboardLibrary");

        group.MapGet("/export", ExportAsync).WithName("ExportKpiDashboard");

        return group;
    }

    private static async Task<IResult> GetOptionsAsync(
        IDashboardDataRepository dataRepository,
        IKpiDashboardKpiRepository kpiRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var scope = new DashboardDataScope(tenant, client, null, null, null);

        // Owners: technicians on record plus the owners already given to KPIs.
        var owners = (await dataRepository.GetTechniciansAsync(scope, cancellationToken)).Select(technician => technician.Name)
            .Concat((await kpiRepository.GetAllAsync(tenant, client, cancellationToken)).Select(kpi => kpi.Owner))
            .Append(currentUser?.UserName)
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Results.Ok(new KpiDashboardOptionsResponse(
            InteractiveDashboardOptions.DatePresets.All,
            KpiDashboardOptions.DefaultDatePreset,
            KpiDashboardOptions.Modules.All,
            KpiDashboardOptions.Units.All,
            KpiDashboardOptions.Directions.All,
            KpiDashboardCalculator.Statuses,
            KpiDashboardOptions.ExceptionStatuses.All,
            KpiDashboardOptions.Granularities.All,
            KpiDashboardOptions.ExportFormats.All,
            KpiDashboardCatalog.Items.Select(item => new KpiMetricOption(item.Id, item.Name, item.Module, item.Unit, item.Direction, item.Flow, item.History, item.Source, item.Info)).ToList(),
            owners,
            KpiDashboardCatalog.DefaultViewKey));
    }

    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        return Results.Ok(await dataRepository.GetFilterOptionsAsync(Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken));
    }

    // ===== KPI library =====

    private static async Task<IResult> GetKpisAsync(
        IKpiDashboardKpiRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? module = null,
        string? tenantId = null,
        string? clientId = null)
    {
        if (!string.IsNullOrWhiteSpace(module) && !KpiDashboardOptions.Modules.IsValid(module))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Module"] = [$"Module must be one of: {string.Join(", ", KpiDashboardOptions.Modules.All)}"] });
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var definitions = await DefinitionsAsync(repository, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);
        var moduleName = KpiDashboardOptions.Modules.Normalize(module);

        return Results.Ok(definitions.Where(definition => moduleName is null || definition.Module == moduleName).ToList());
    }

    private static async Task<IResult> GetKpiAsync(
        string kpiId,
        IKpiDashboardKpiRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var definition = Find(await DefinitionsAsync(repository, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken), kpiId);
        return definition is null ? Results.NotFound() : Results.Ok(definition);
    }

    /// <summary>Create KPI: adds a custom KPI to the library and, with viewKey, as the last tile of that view.</summary>
    private static async Task<IResult> CreateKpiAsync(
        SaveKpiDashboardKpiRequest request,
        IKpiDashboardKpiRepository repository,
        IKpiDashboardLayoutRepository layoutRepository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var library = await DefinitionsAsync(repository, tenantId, clientId, cancellationToken);
        var errors = request.Validate(null, library);

        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<KpiDashboardViewResponse> views = [];
        if (!string.IsNullOrWhiteSpace(request.ViewKey))
        {
            views = KpiDashboardMappings.Views(await layoutRepository.GetOwnedAsync(viewerId, tenantId, clientId, cancellationToken), library);
            if (FindView(views, request.ViewKey) is null)
            {
                errors["ViewKey"] = [$"View '{request.ViewKey}' was not found"];
            }
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var metric = KpiDashboardCatalog.Find(request.Metric);
        var kpi = new KpiDashboardKpi
        {
            KpiId = $"KPI-{await sequenceGenerator.GetNextValueAsync(KpiSequenceName, cancellationToken):D4}",
            IsBuiltIn = false,
            Name = request.Name!.Trim(),
            Module = KpiDashboardOptions.Modules.Normalize(request.Module)!,
            Unit = metric?.Unit ?? KpiDashboardOptions.Units.Normalize(request.Unit)!,
            Direction = KpiDashboardOptions.Directions.Normalize(request.Direction) ?? metric?.Direction ?? KpiDashboardCatalog.Higher,
            Target = request.Target,
            Owner = request.Owner!.Trim(),
            Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim(),
            Metric = metric?.Id,
            ManualValue = metric is null ? request.Value : null,
            ReviewDueDate = ToUtcDate(request.ReviewDueDate),
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = tenantId,
            ClientId = clientId,
            IsDeleted = false
        };

        kpi = await repository.CreateAsync(kpi, cancellationToken);
        await eventLogger.LogAsync(KpiEntityType, kpi.Id, kpi.Name, EventAction.Created, cancellationToken);

        if (viewerId is not null && FindView(views, request.ViewKey) is { } view)
        {
            var items = view.Items.Select(item => new KpiDashboardLayoutItem { KpiId = item.KpiId, Visible = item.Visible })
                .Append(new KpiDashboardLayoutItem { KpiId = kpi.KpiId, Visible = true })
                .ToList();
            await SaveLayoutAsync(layoutRepository, view, items, viewerId, currentUser, tenantId, clientId, cancellationToken);
        }

        var created = Find(KpiDashboardMappings.Definitions(await repository.GetAllAsync(tenantId, clientId, cancellationToken)), kpi.KpiId);
        return Results.Created($"{BasePath}/kpis/{kpi.KpiId}", created);
    }

    /// <summary>Edit KPI. A built-in KPI's changes are kept in its own document (created on first edit).</summary>
    private static async Task<IResult> UpdateKpiAsync(
        string kpiId,
        SaveKpiDashboardKpiRequest request,
        IKpiDashboardKpiRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var library = await DefinitionsAsync(repository, tenantId, clientId, cancellationToken);
        var existing = Find(library, kpiId);
        if (existing is null)
        {
            return Results.NotFound();
        }

        var errors = request.Validate(existing, library);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var stored = await repository.GetByKpiIdAsync(existing.Id, tenantId, clientId, cancellationToken);
        var isNew = stored is null;
        stored ??= new KpiDashboardKpi
        {
            KpiId = existing.Id,
            IsBuiltIn = true,
            Module = existing.Module,
            Unit = existing.Unit,
            Metric = existing.Metric,
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            TenantId = tenantId,
            ClientId = clientId
        };

        stored.Name = request.Name!.Trim();
        stored.Direction = KpiDashboardOptions.Directions.Normalize(request.Direction) ?? existing.Direction;
        stored.Target = request.Target;
        stored.Owner = request.Owner!.Trim();
        stored.ReviewDueDate = ToUtcDate(request.ReviewDueDate);
        if (request.Info is not null)
        {
            stored.Info = string.IsNullOrWhiteSpace(request.Info) ? null : request.Info.Trim();
        }

        if (!existing.IsBuiltIn)
        {
            var metric = KpiDashboardCatalog.Find(request.Metric);
            stored.Metric = metric?.Id;
            stored.Unit = metric?.Unit ?? KpiDashboardOptions.Units.Normalize(request.Unit)!;
            stored.ManualValue = metric is null ? request.Value : null;
            stored.Module = KpiDashboardOptions.Modules.Normalize(request.Module) ?? stored.Module;
        }

        stored.UpdatedBy = currentUser?.UserName;
        stored.UpdatedAt = utcNow;

        if (isNew)
        {
            stored = await repository.CreateAsync(stored, cancellationToken);
        }
        else if (!await repository.UpdateAsync(stored.Id, stored, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(KpiEntityType, stored.Id, stored.Name, EventAction.Updated, cancellationToken);

        return Results.Ok(Find(KpiDashboardMappings.Definitions(await repository.GetAllAsync(tenantId, clientId, cancellationToken)), existing.Id));
    }

    /// <summary>Deletes a custom KPI (soft delete); for a built-in KPI it discards the changes, restoring its defaults.</summary>
    private static async Task<IResult> DeleteKpiAsync(
        string kpiId,
        IKpiDashboardKpiRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var stored = await repository.GetByKpiIdAsync(kpiId, tenant, client, cancellationToken);
        if (stored is null)
        {
            // A built-in KPI without changes has nothing to reset.
            return KpiDashboardCatalog.Find(kpiId) is not null ? Results.NoContent() : Results.NotFound();
        }

        if (stored.IsBuiltIn)
        {
            if (!await repository.DeleteAsync(stored.Id, cancellationToken))
            {
                return Results.NotFound();
            }
        }
        else
        {
            stored.IsDeleted = true;
            stored.UpdatedBy = currentUser?.UserName;
            stored.UpdatedAt = DateTime.UtcNow;
            if (!await repository.UpdateAsync(stored.Id, stored, cancellationToken))
            {
                return Results.NotFound();
            }
        }

        await eventLogger.LogAsync(KpiEntityType, stored.Id, stored.Name, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>View details: one KPI for the filter bar with its monthly values.</summary>
    private static async Task<IResult> GetKpiValuesAsync(string kpiId, [AsParameters] KpiDashboardRequest request)
    {
        var (page, problem) = await LoadAsync(request, kpiId);
        if (page is null)
        {
            return problem!;
        }

        var state = page.Evaluation.Find(kpiId);
        if (state is null)
        {
            return Results.NotFound();
        }

        return Results.Ok(new KpiDashboardSection<KpiDashboardKpiValuesResponse>(
            DateTime.UtcNow, page.Filters, DashboardPeriodResponse.FromPeriod(page.Calculator.Period),
            new KpiDashboardKpiValuesResponse(state, state.Kpi.History ? page.Calculator.MonthLabels : [])));
    }

    // ===== Views =====

    private static async Task<IResult> GetViewsAsync(
        IKpiDashboardKpiRepository kpiRepository,
        IKpiDashboardLayoutRepository layoutRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        return Results.Ok(await ViewsAsync(kpiRepository, layoutRepository, CustomReportAccess.ViewerId(currentUser), tenant, client, cancellationToken));
    }

    /// <summary>Save current tiles as a custom view.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveKpiDashboardViewRequest request,
        IKpiDashboardKpiRepository kpiRepository,
        IKpiDashboardLayoutRepository layoutRepository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        if (viewerId is null)
        {
            return Results.Unauthorized();
        }

        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var library = await DefinitionsAsync(kpiRepository, tenantId, clientId, cancellationToken);
        var views = KpiDashboardMappings.Views(await layoutRepository.GetOwnedAsync(viewerId, tenantId, clientId, cancellationToken), library);
        var errors = request.Validate(true, library, views.SelectMany(view => new[] { view.Label, view.Dashboard }).ToList(), out var items);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var layout = new KpiDashboardLayout
        {
            ViewKey = $"KDV-{await sequenceGenerator.GetNextValueAsync(ViewSequenceName, cancellationToken):D4}",
            IsCustom = true,
            Label = request.Label!.Trim(),
            OwnerId = viewerId,
            OwnerName = currentUser?.UserName,
            Items = items,
            DefaultItems = items.Select(item => new KpiDashboardLayoutItem { KpiId = item.KpiId, Visible = true }).ToList(),
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = tenantId,
            ClientId = clientId,
            IsDeleted = false
        };

        layout = await layoutRepository.CreateAsync(layout, cancellationToken);
        await eventLogger.LogAsync(ViewEntityType, layout.Id, layout.Label, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{layout.ViewKey}", FindView(KpiDashboardMappings.Views([layout], library), layout.ViewKey));
    }

    /// <summary>Edit KPI Layout / Hide tile: the tiles (order and visibility) of a view; a custom view can also be renamed.</summary>
    private static async Task<IResult> UpdateViewAsync(
        string viewKey,
        SaveKpiDashboardViewRequest request,
        IKpiDashboardKpiRepository kpiRepository,
        IKpiDashboardLayoutRepository layoutRepository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        if (viewerId is null)
        {
            return Results.Unauthorized();
        }

        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var library = await DefinitionsAsync(kpiRepository, tenantId, clientId, cancellationToken);
        var views = KpiDashboardMappings.Views(await layoutRepository.GetOwnedAsync(viewerId, tenantId, clientId, cancellationToken), library);
        var view = FindView(views, viewKey);
        if (view is null)
        {
            return Results.NotFound();
        }

        var taken = view.IsCustom
            ? views.Where(other => other.Key != view.Key).SelectMany(other => new[] { other.Label, other.Dashboard }).ToList()
            : [];
        var errors = (view.IsCustom ? request : request with { Label = null }).Validate(false, library, taken, out var items);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var layout = await SaveLayoutAsync(layoutRepository, view, items, viewerId, currentUser, tenantId, clientId, cancellationToken,
            view.IsCustom && !string.IsNullOrWhiteSpace(request.Label) ? request.Label.Trim() : null);
        if (layout is null)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ViewEntityType, layout.Id, layout.Label, EventAction.Updated, cancellationToken);

        return Results.Ok(FindView(KpiDashboardMappings.Views([layout], library), view.Key));
    }

    /// <summary>Reset to default: a built-in view drops the user's layout; a custom view goes back to the tiles it was saved with.</summary>
    private static async Task<IResult> ResetViewAsync(
        string viewKey,
        IKpiDashboardKpiRepository kpiRepository,
        IKpiDashboardLayoutRepository layoutRepository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var library = await DefinitionsAsync(kpiRepository, tenant, client, cancellationToken);
        var layout = await layoutRepository.GetByViewKeyAsync(viewKey, viewerId, tenant, client, cancellationToken);

        if (layout is null)
        {
            return KpiDashboardCatalog.FindView(viewKey) is { } builtIn
                ? Results.Ok(FindView(KpiDashboardMappings.Views([], library), builtIn.Key))
                : Results.NotFound();
        }

        if (layout.IsCustom)
        {
            layout.Items = layout.DefaultItems.Select(item => new KpiDashboardLayoutItem { KpiId = item.KpiId, Visible = true }).ToList();
            layout.UpdatedBy = currentUser?.UserName;
            layout.UpdatedAt = DateTime.UtcNow;
            if (!await layoutRepository.UpdateAsync(layout.Id, layout, cancellationToken))
            {
                return Results.NotFound();
            }
        }
        else if (!await layoutRepository.DeleteAsync(layout.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ViewEntityType, layout.Id, layout.Label, EventAction.Updated, cancellationToken);

        return Results.Ok(FindView(KpiDashboardMappings.Views(layout.IsCustom ? [layout] : [], library), layout.ViewKey));
    }

    /// <summary>Deletes a custom view; built-in views can only be reset.</summary>
    private static async Task<IResult> DeleteViewAsync(
        string viewKey,
        IKpiDashboardLayoutRepository layoutRepository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        if (KpiDashboardCatalog.FindView(viewKey) is not null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["ViewKey"] = ["Built-in views cannot be deleted; reset their layout instead"] });
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var layout = await layoutRepository.GetByViewKeyAsync(viewKey, CustomReportAccess.ViewerId(currentUser), Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);
        if (layout is null || !layout.IsCustom || !await layoutRepository.DeleteAsync(layout.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ViewEntityType, layout.Id, layout.Label, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    // ===== Page data =====

    private static async Task<IResult> GetOverviewAsync([AsParameters] KpiDashboardRequest request)
    {
        var (page, problem) = await LoadAsync(request, null);
        if (page is null)
        {
            return problem!;
        }

        var ids = page.TileIds;
        var evaluation = page.Evaluation;

        return Results.Ok(new KpiDashboardOverviewResponse(
            DateTime.UtcNow,
            page.Filters,
            DashboardPeriodResponse.FromPeriod(page.Calculator.Period),
            page.View,
            page.Views,
            page.Calculator.MonthLabels,
            evaluation.Tiles(ids),
            evaluation.States,
            evaluation.Trend(ids, page.Filters.Granularity),
            evaluation.Targets(ids),
            evaluation.Exceptions(ids, page.Filters.ExceptionStatus),
            evaluation.Insights(ids),
            evaluation.Library()));
    }

    /// <summary>Export: an Excel workbook (tiles, trend, targets, exceptions, library) or a CSV of the view's tiles.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] KpiDashboardRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !KpiDashboardOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", KpiDashboardOptions.ExportFormats.All)}"]
            });
        }

        var (page, problem) = await LoadAsync(request, null);
        if (page is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var period = page.Calculator.Period;
        var evaluation = page.Evaluation;
        var ids = page.TileIds;
        var fileBase = $"kpi-dashboard-{Slug(page.View.Key)}-{generatedAt:yyyyMMddHHmmss}";
        string[] kpiHeader = ["KPI", "Module", "Unit", "Current", "Target", "Target Basis", "Variance", "Variance Unit", "Attainment (%)", "Previous Period", "Change", "Change Unit", "Status", "Owner", "Next Review Due", "Source"];
        object?[] KpiRow(KpiState state) =>
        [
            state.Kpi.Name, state.Kpi.Module, state.Kpi.Unit, state.Value, state.Target, state.TargetBasis, state.Variance, state.VarianceUnit, state.Attainment,
            state.PreviousValue, state.Change, state.ChangeUnit, state.Status, state.Kpi.Owner, state.Kpi.ReviewDueDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            state.Kpi.Source
        ];

        if (KpiDashboardOptions.ExportFormats.Normalize(format) == "csv")
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(',', kpiHeader.Select(Csv)));
            foreach (var state in evaluation.Tiles(ids))
            {
                csv.AppendLine(string.Join(',', KpiRow(state).Select(Csv)));
            }

            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv", $"{fileBase}.csv");
        }

        using var workbook = new XLWorkbook();
        AddSheet(workbook, "Summary", ["Item", "Value"],
        [
            ["View", page.View.Dashboard],
            ["Organization", page.Filters.Organization ?? "All organizations"],
            ["Location", page.Filters.Location ?? "All locations"],
            ["Asset Category", page.Filters.Category ?? "All categories"],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})"],
            ["Generated (UTC)", generatedAt]
        ]);

        AddSheet(workbook, "KPIs", kpiHeader, evaluation.Tiles(ids).Select(KpiRow));

        var months = page.Calculator.MonthLabels;
        AddSheet(workbook, "Monthly Values", new[] { "KPI" }.Concat(months).ToList(),
            evaluation.Tiles(ids).Where(state => state.Kpi.History).Select(state => new object?[] { state.Kpi.Name }.Concat(state.Spark.Select(value => (object?)value)).ToArray()));

        var trend = evaluation.Trend(ids, page.Filters.Granularity);
        AddSheet(workbook, "Performance Trend", ["Period", "Overall Score (%)", "Target (%)", "Prior Period (%)"],
            trend.Categories.Select((label, index) => (object?[])[label, trend.Overall[index], trend.Target[index], trend.Prior[index]]));

        AddSheet(workbook, "Target vs Actual", ["Module", "KPIs", "Attainment (%)", "Target (%)"],
            evaluation.Targets(ids).Select(row => (object?[])[row.Module, row.Kpis, row.Attainment, row.Target]));

        AddSheet(workbook, "Exceptions", kpiHeader, evaluation.Exceptions(ids, page.Filters.ExceptionStatus).Select(KpiRow));

        AddSheet(workbook, "Insights", ["Insight", "Message"], evaluation.Insights(ids).Select(insight => (object?[])[insight.Title, insight.Text]));

        AddSheet(workbook, "KPI Library", kpiHeader.Append("On this view").ToList(),
            evaluation.States.Select(state => KpiRow(state).Append(ids.Contains(state.Kpi.Id) ? "Yes" : "No").ToArray()));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(stream.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{fileBase}.xlsx");
    }

    private static async Task<IResult> Section<T>(KpiDashboardRequest request, Func<KpiPage, IReadOnlyList<string>, T> build)
    {
        var (page, problem) = await LoadAsync(request, null);
        if (page is null)
        {
            return problem!;
        }

        return Results.Ok(new KpiDashboardSection<T>(DateTime.UtcNow, page.Filters, DashboardPeriodResponse.FromPeriod(page.Calculator.Period), build(page, page.TileIds)));
    }

    private sealed record KpiPage(
        KpiDashboardCalculator Calculator,
        KpiDashboardCalculator.KpiEvaluation Evaluation,
        KpiDashboardAppliedFilters Filters,
        KpiDashboardViewResponse View,
        IReadOnlyList<KpiDashboardViewResponse> Views,
        IReadOnlyList<string> TileIds);

    /// <summary>Checks the query values, resolves the view and evaluates the library (monthly values for the view's tiles, or for historyKpiId).</summary>
    private static async Task<(KpiPage? Page, IResult? Problem)> LoadAsync(KpiDashboardRequest request, string? historyKpiId)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var errors = new Dictionary<string, string[]>();

        var dates = new DashboardFiltersRequest(
            null,
            null,
            null,
            !string.IsNullOrWhiteSpace(request.DatePreset)
                ? request.DatePreset
                : request.From is not null || request.To is not null ? InteractiveDashboardOptions.CustomDatePreset : KpiDashboardOptions.DefaultDatePreset,
            request.From,
            request.To,
            request.TimeZone);
        dates.ValidateFilters(errors, "Filters");

        if (!string.IsNullOrWhiteSpace(request.Granularity) && !KpiDashboardOptions.Granularities.IsValid(request.Granularity))
        {
            errors["Granularity"] = [$"Granularity must be one of: {string.Join(", ", KpiDashboardOptions.Granularities.All)}"];
        }

        var exceptionStatus = InteractiveDashboardMappings.FilterValue(request.ExceptionStatus);
        if (exceptionStatus is not null && !KpiDashboardOptions.ExceptionStatuses.IsValid(exceptionStatus))
        {
            errors["ExceptionStatus"] = [$"ExceptionStatus must be one of: {string.Join(", ", KpiDashboardOptions.ExceptionStatuses.All)}"];
        }

        var tenantId = Tenant(request.TenantId, currentUser);
        var clientId = Client(request.ClientId, currentUser);
        var definitions = await DefinitionsAsync(request.KpiRepository, tenantId, clientId, request.CancellationToken);
        var views = KpiDashboardMappings.Views(
            await request.LayoutRepository.GetOwnedAsync(CustomReportAccess.ViewerId(currentUser), tenantId, clientId, request.CancellationToken),
            definitions);
        var view = FindView(views, string.IsNullOrWhiteSpace(request.ViewKey) ? KpiDashboardCatalog.DefaultViewKey : request.ViewKey);
        if (view is null)
        {
            errors["ViewKey"] = [$"View '{request.ViewKey}' was not found"];
        }

        if (historyKpiId is not null && Find(definitions, historyKpiId) is null)
        {
            errors["KpiId"] = [$"KPI '{historyKpiId}' was not found"];
        }

        if (errors.Count > 0)
        {
            return (null, Results.ValidationProblem(errors));
        }

        ReportPeriods.TryGetTimeZone(dates.TimeZone, out var zone);
        var utcNow = DateTime.UtcNow;
        var period = DashboardPeriods.Resolve(
            InteractiveDashboardOptions.DatePresets.Normalize(dates.DatePreset)!,
            dates.DateFrom,
            dates.DateTo,
            zone,
            string.IsNullOrWhiteSpace(dates.TimeZone) ? ReportPeriods.DefaultTimeZone : dates.TimeZone.Trim(),
            utcNow);

        var scope = new DashboardDataScope(
            tenantId,
            clientId,
            InteractiveDashboardMappings.FilterValue(request.Organization),
            InteractiveDashboardMappings.FilterValue(request.Location),
            InteractiveDashboardMappings.FilterValue(request.Category));

        var tileIds = view!.Items.Where(item => item.Visible).Select(item => item.KpiId).ToList();
        var history = historyKpiId is null
            ? tileIds.ToHashSet(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>([Find(definitions, historyKpiId)!.Id], StringComparer.OrdinalIgnoreCase);

        var calculator = KpiDashboardCalculator.Create(request.DataRepository, scope, period, utcNow);
        var evaluation = await calculator.EvaluateAsync(definitions, history, request.CancellationToken);

        var filters = new KpiDashboardAppliedFilters(
            view.Key,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            KpiDashboardOptions.Granularities.Normalize(request.Granularity) ?? KpiDashboardCalculator.Monthly,
            KpiDashboardOptions.ExceptionStatuses.Normalize(exceptionStatus));

        return (new KpiPage(calculator, evaluation, filters, view, views, tileIds), null);
    }

    private static async Task<IReadOnlyList<KpiDefinition>> DefinitionsAsync(
        IKpiDashboardKpiRepository repository, string? tenantId, string? clientId, CancellationToken cancellationToken) =>
        KpiDashboardMappings.Definitions(await repository.GetAllAsync(tenantId, clientId, cancellationToken));

    private static async Task<IReadOnlyList<KpiDashboardViewResponse>> ViewsAsync(
        IKpiDashboardKpiRepository kpiRepository,
        IKpiDashboardLayoutRepository layoutRepository,
        string? viewerId,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken)
    {
        var definitions = await DefinitionsAsync(kpiRepository, tenantId, clientId, cancellationToken);
        return KpiDashboardMappings.Views(await layoutRepository.GetOwnedAsync(viewerId, tenantId, clientId, cancellationToken), definitions);
    }

    /// <summary>Writes a view's tiles: updates its layout document, or creates one for a built-in view the user had not changed.</summary>
    private static async Task<KpiDashboardLayout?> SaveLayoutAsync(
        IKpiDashboardLayoutRepository repository,
        KpiDashboardViewResponse view,
        List<KpiDashboardLayoutItem> items,
        string viewerId,
        CurrentUser? currentUser,
        string? tenantId,
        string? clientId,
        CancellationToken cancellationToken,
        string? label = null)
    {
        var utcNow = DateTime.UtcNow;
        var layout = await repository.GetByViewKeyAsync(view.Key, viewerId, tenantId, clientId, cancellationToken);
        if (layout is null)
        {
            if (view.IsCustom)
            {
                return null;
            }

            layout = new KpiDashboardLayout
            {
                ViewKey = view.Key,
                IsCustom = false,
                Label = view.Label,
                OwnerId = viewerId,
                OwnerName = currentUser?.UserName,
                Items = items,
                Status = "Active",
                CreatedBy = currentUser?.UserName,
                CreatedAt = utcNow,
                UpdatedBy = currentUser?.UserName,
                UpdatedAt = utcNow,
                TenantId = tenantId,
                ClientId = clientId,
                IsDeleted = false
            };

            return await repository.CreateAsync(layout, cancellationToken);
        }

        layout.Items = items;
        if (label is not null)
        {
            layout.Label = label;
        }

        layout.UpdatedBy = currentUser?.UserName;
        layout.UpdatedAt = utcNow;
        return await repository.UpdateAsync(layout.Id, layout, cancellationToken) ? layout : null;
    }

    private static KpiDefinition? Find(IReadOnlyList<KpiDefinition> definitions, string? kpiId) =>
        string.IsNullOrWhiteSpace(kpiId) ? null : definitions.FirstOrDefault(definition => string.Equals(definition.Id, kpiId.Trim(), StringComparison.OrdinalIgnoreCase));

    private static KpiDashboardViewResponse? FindView(IReadOnlyList<KpiDashboardViewResponse> views, string? key) =>
        string.IsNullOrWhiteSpace(key) ? null : views.FirstOrDefault(view => string.Equals(view.Key, key.Trim(), StringComparison.OrdinalIgnoreCase));

    private static DateTime? ToUtcDate(DateOnly? date) => date?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);

    private static string Slug(string value) => new(value.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray());

    /// <summary>Quoted CSV cell; cells that look like formulas are neutralised.</summary>
    private static string Csv(object? value)
    {
        var text = value switch
        {
            null => string.Empty,
            double number => number.ToString(CultureInfo.InvariantCulture),
            DateTime date => date.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
            _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty
        };

        if (text.Length > 0 && "=+-@".Contains(text[0]) && !double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
        {
            text = "'" + text;
        }

        return $"\"{text.Replace("\"", "\"\"")}\"";
    }

    private static void AddSheet(XLWorkbook workbook, string name, IReadOnlyList<string> headers, IEnumerable<object?[]> rows)
    {
        var sheet = workbook.AddWorksheet(name);
        for (var column = 0; column < headers.Count; column++)
        {
            sheet.Cell(1, column + 1).Value = headers[column];
        }

        sheet.Row(1).Style.Font.Bold = true;

        var row = 2;
        foreach (var values in rows)
        {
            for (var column = 0; column < values.Length; column++)
            {
                sheet.Cell(row, column + 1).Value = XLCellValue.FromObject(values[column]);
            }

            row++;
        }

        sheet.Columns().AdjustToContents();
    }

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}
