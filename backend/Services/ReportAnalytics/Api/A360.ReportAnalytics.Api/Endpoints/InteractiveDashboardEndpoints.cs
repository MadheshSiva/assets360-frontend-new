using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.ReportAnalytics.Api.Contracts;
using A360.ReportAnalytics.Api.Validation;
using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Endpoints;

/// <summary>Reports &amp; Analytics / Interactive Dashboards: the dashboard selector, Create / Edit Dashboard, Share, favourites and the Widget Library.</summary>
public static class InteractiveDashboardEndpoints
{
    internal const string EntityType = "InteractiveDashboard";
    internal const string BasePath = "/api/interactive-dashboards";
    private const string SequenceName = "interactive_dashboard";

    public static RouteGroupBuilder MapInteractiveDashboardEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Interactive Dashboards");

        // Page furniture: dropdown values, the Widget Library panel and the Organization / Location / Asset Category filters.
        group.MapGet("/options", GetOptions).WithName("GetInteractiveDashboardOptions");
        group.MapGet("/widget-library", GetWidgetLibrary).WithName("GetInteractiveDashboardWidgetLibrary");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetInteractiveDashboardFilters");

        // Dashboard selector (My Dashboards, Shared with me, Favorites) and Create / Edit Dashboard.
        group.MapGet("", GetDashboardsAsync).WithName("GetInteractiveDashboards");
        group.MapGet("/{dashboardId}", GetDashboardByIdAsync).WithName("GetInteractiveDashboardById");
        group.MapPost("", CreateDashboardAsync).WithName("CreateInteractiveDashboard");
        group.MapPut("/{dashboardId}", UpdateDashboardAsync).WithName("UpdateInteractiveDashboard");
        group.MapDelete("/{dashboardId}", DeleteDashboardAsync).WithName("DeleteInteractiveDashboard");

        group.MapPost("/{dashboardId}/duplicate", DuplicateDashboardAsync).WithName("DuplicateInteractiveDashboard");
        group.MapPut("/{dashboardId}/favorite", SetFavoriteAsync).WithName("SetInteractiveDashboardFavorite");
        group.MapPut("/{dashboardId}/share", ShareDashboardAsync).WithName("ShareInteractiveDashboard");

        // Edit mode: drag and drop, Add Widget and the "…" menu on a widget.
        group.MapPut("/{dashboardId}/layout", UpdateLayoutAsync).WithName("UpdateInteractiveDashboardLayout");
        group.MapPost("/{dashboardId}/widgets", AddWidgetAsync).WithName("AddInteractiveDashboardWidget");
        group.MapPut("/{dashboardId}/widgets/{widgetId}", UpdateWidgetAsync).WithName("UpdateInteractiveDashboardWidget");
        group.MapDelete("/{dashboardId}/widgets/{widgetId}", RemoveWidgetAsync).WithName("RemoveInteractiveDashboardWidget");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new InteractiveDashboardOptionsResponse(
        InteractiveDashboardOptions.Views.All,
        InteractiveDashboardOptions.Visibilities.All,
        InteractiveDashboardOptions.Permissions.All,
        InteractiveDashboardOptions.DatePresets.All,
        InteractiveDashboardOptions.DefaultDatePreset,
        InteractiveDashboardOptions.ExportFormats.All,
        InteractiveDashboardOptions.Orientations.All,
        InteractiveDashboardOptions.WidgetTypes,
        InteractiveDashboardOptions.Metrics,
        InteractiveDashboardOptions.Templates.Select(template => new DashboardTemplateResponse(template.Key, template.Name, template.Description, template.Widgets.Count)).ToList(),
        InteractiveDashboardOptions.GridColumns,
        InteractiveDashboardOptions.MaxWidgets));

    /// <summary>Widget Library: each widget type with the metrics it can show.</summary>
    private static IResult GetWidgetLibrary() => Results.Ok(InteractiveDashboardOptions.WidgetTypes
        .Select(type => new DashboardWidgetLibraryItem(
            type.Key,
            type.Label,
            type.Description,
            type.Icon,
            type.DefaultWidth,
            type.DefaultHeight,
            InteractiveDashboardOptions.Metrics
                .Where(metric => metric.WidgetTypes.Contains(type.Key))
                .Select(metric => new DashboardMetricOption(metric.Key, metric.Label, metric.Module))
                .ToList()))
        .ToList());

    /// <summary>Organization (master organizations), Location (asset sites) and Asset Category values for the filter bar.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        return Results.Ok(await dataRepository.GetFilterOptionsAsync(
            string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId,
            string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId,
            cancellationToken));
    }

    /// <summary>view: all (default), my, shared (shared with me) or favorites.</summary>
    private static async Task<IResult> GetDashboardsAsync(
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? view = null,
        string? search = null,
        string? tenantId = null,
        string? clientId = null,
        int page = 1,
        int pageSize = InteractiveDashboardRepository.DefaultPageSize)
    {
        var normalizedView = string.IsNullOrWhiteSpace(view) ? InteractiveDashboardRepository.AllView : InteractiveDashboardOptions.Views.Normalize(view);
        if (normalizedView is null)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["View"] = [$"View must be one of: {string.Join(", ", InteractiveDashboardOptions.Views.All)}"]
            });
        }

        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > InteractiveDashboardRepository.MaxPageSize ? InteractiveDashboardRepository.DefaultPageSize : pageSize;

        var currentUser = currentUserAccessor.GetCurrentUser();
        var result = await repository.QueryAsync(
            new InteractiveDashboardQuery(Scope(currentUser, tenantId, clientId), normalizedView, search, page, pageSize),
            cancellationToken);
        var viewerId = InteractiveDashboardAccess.ViewerId(currentUser);

        return Results.Ok(new InteractiveDashboardListResponse(
            result.Items.Select(dashboard => InteractiveDashboardListItemResponse.FromEntity(dashboard, viewerId)).ToList(),
            result.TotalCount,
            page,
            pageSize));
    }

    private static async Task<IResult> GetDashboardByIdAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var viewerId = InteractiveDashboardAccess.ViewerId(currentUserAccessor.GetCurrentUser());
        var dashboard = await FindVisibleAsync(dashboardId, repository, viewerId, cancellationToken);
        if (dashboard is null)
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Viewed, cancellationToken);

        return Results.Ok(InteractiveDashboardResponse.FromEntity(dashboard, viewerId));
    }

    /// <summary>Create Dashboard: a name is required; widgets come from the request, or from TemplateKey, or start empty.</summary>
    private static async Task<IResult> CreateDashboardAsync(
        CreateInteractiveDashboardRequest request,
        IInteractiveDashboardRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var dashboard = request.ToEntity(await NextDashboardIdAsync(sequenceGenerator, cancellationToken), currentUser, DateTime.UtcNow);
        dashboard = await repository.CreateAsync(dashboard, cancellationToken);

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/{dashboard.DashboardId}", InteractiveDashboardResponse.FromEntity(dashboard, InteractiveDashboardAccess.ViewerId(currentUser)));
    }

    /// <summary>Edit Dashboard → Save: replaces the widget list; widgets keep their ids when the request sends them back.</summary>
    private static async Task<IResult> UpdateDashboardAsync(
        string dashboardId,
        UpdateInteractiveDashboardRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: false, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        var errors = request.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        request.ApplyTo(dashboard, currentUser, DateTime.UtcNow);

        return await SaveAsync(dashboard, repository, currentUser, eventLogger, cancellationToken);
    }

    private static async Task<IResult> DeleteDashboardAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUserAccessor.GetCurrentUser(), manage: true, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        if (!await repository.DeleteAsync(dashboard.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>Copies any dashboard the user can see into a private one they own ("Copy of …" unless a name is given).</summary>
    private static async Task<IResult> DuplicateDashboardAsync(
        string dashboardId,
        DuplicateInteractiveDashboardRequest? request,
        IInteractiveDashboardRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = InteractiveDashboardAccess.ViewerId(currentUser);
        var source = await FindVisibleAsync(dashboardId, repository, viewerId, cancellationToken);
        if (source is null)
        {
            return Results.NotFound();
        }

        if (request?.DashboardName?.Trim().Length > 200)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["DashboardName"] = ["DashboardName must be 200 characters or fewer"] });
        }

        var copy = source.Duplicate(await NextDashboardIdAsync(sequenceGenerator, cancellationToken), request?.DashboardName, currentUser, DateTime.UtcNow);
        copy = await repository.CreateAsync(copy, cancellationToken);

        await eventLogger.LogAsync(EntityType, copy.Id, copy.DashboardName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/{copy.DashboardId}", InteractiveDashboardResponse.FromEntity(copy, viewerId));
    }

    /// <summary>Favourites are per user, so a signed-in user is required.</summary>
    private static async Task<IResult> SetFavoriteAsync(
        string dashboardId,
        FavoriteInteractiveDashboardRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        var viewerId = InteractiveDashboardAccess.ViewerId(currentUserAccessor.GetCurrentUser());
        if (viewerId is null)
        {
            return Results.Unauthorized();
        }

        var dashboard = await FindVisibleAsync(dashboardId, repository, viewerId, cancellationToken);
        if (dashboard is null || !await repository.SetFavoriteAsync(dashboard.Id, viewerId, request.IsFavorite, cancellationToken))
        {
            return Results.NotFound();
        }

        return Results.Ok(new { dashboard.DashboardId, request.IsFavorite });
    }

    /// <summary>Share: only the owner may change who can see or edit the dashboard. The lists replace the current ones.</summary>
    private static async Task<IResult> ShareDashboardAsync(
        string dashboardId,
        ShareInteractiveDashboardRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: true, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        var errors = request.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        request.ApplyShare(dashboard, currentUser, DateTime.UtcNow);

        if (!await repository.UpdateAsync(dashboard.Id, dashboard, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Updated, cancellationToken);

        return Results.Ok(new DashboardShareResponse(
            dashboard.DashboardId,
            dashboard.Visibility,
            dashboard.SharedWith,
            InteractiveDashboardMappings.SharedSummary(dashboard),
            $"{BasePath}/{dashboard.DashboardId}"));
    }

    /// <summary>Drag and drop / resize: saves new positions for the listed widgets.</summary>
    private static async Task<IResult> UpdateLayoutAsync(
        string dashboardId,
        DashboardLayoutRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: false, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        var errors = request.Validate(dashboard);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        request.ApplyLayout(dashboard, currentUser, DateTime.UtcNow);

        return await SaveAsync(dashboard, repository, currentUser, eventLogger, cancellationToken);
    }

    /// <summary>Add Widget: placed where Position says, or below the others at the widget type's default size.</summary>
    private static async Task<IResult> AddWidgetAsync(
        string dashboardId,
        DashboardWidgetRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: false, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        var errors = new Dictionary<string, string[]>();
        request.ValidateWidget(errors, "Widget");
        if (dashboard.Widgets.Count >= InteractiveDashboardOptions.MaxWidgets)
        {
            errors["Widgets"] = [$"A dashboard can hold at most {InteractiveDashboardOptions.MaxWidgets} widgets"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        // A requested id that is already taken is replaced with a new one.
        var widget = (request with
        {
            WidgetId = dashboard.Widgets.Any(existing => existing.WidgetId == request.WidgetId?.Trim()) ? null : request.WidgetId
        }).ToWidget(dashboard.Widgets);
        dashboard.Widgets.Add(widget);

        dashboard.UpdatedBy = currentUser?.UserName;
        dashboard.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(dashboard.Id, dashboard, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Updated, cancellationToken);

        return Results.Created($"{BasePath}/{dashboard.DashboardId}/widgets/{widget.WidgetId}", widget);
    }

    /// <summary>Edits one widget (type, metric, title, position, settings); a missing position keeps the current one.</summary>
    private static async Task<IResult> UpdateWidgetAsync(
        string dashboardId,
        string widgetId,
        DashboardWidgetRequest request,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: false, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        var index = dashboard.Widgets.FindIndex(widget => widget.WidgetId == widgetId);
        if (index < 0)
        {
            return Results.NotFound();
        }

        var errors = new Dictionary<string, string[]>();
        request.ValidateWidget(errors, "Widget");
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var current = dashboard.Widgets[index].Position;
        var position = request.Position ?? new DashboardWidgetPositionRequest(current.X, current.Y, current.W, current.H);
        var widget = (request with
        {
            Position = position with { X = position.X ?? current.X, Y = position.Y ?? current.Y }
        }).ToWidget(dashboard.Widgets, widgetId);

        dashboard.Widgets[index] = widget;
        dashboard.UpdatedBy = currentUser?.UserName;
        dashboard.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(dashboard.Id, dashboard, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Updated, cancellationToken);

        return Results.Ok(widget);
    }

    private static async Task<IResult> RemoveWidgetAsync(
        string dashboardId,
        string widgetId,
        IInteractiveDashboardRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var (dashboard, problem) = await FindEditableAsync(dashboardId, repository, currentUser, manage: false, cancellationToken);
        if (dashboard is null)
        {
            return problem!;
        }

        if (dashboard.Widgets.RemoveAll(widget => widget.WidgetId == widgetId) == 0)
        {
            return Results.NotFound();
        }

        dashboard.UpdatedBy = currentUser?.UserName;
        dashboard.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(dashboard.Id, dashboard, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Updated, cancellationToken);

        return Results.NoContent();
    }

    internal static InteractiveDashboardScope Scope(CurrentUser? currentUser, string? tenantId, string? clientId) =>
        new(
            InteractiveDashboardAccess.ViewerId(currentUser),
            string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId,
            string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId);

    internal static async Task<InteractiveDashboard?> FindVisibleAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        string? viewerId,
        CancellationToken cancellationToken)
    {
        var dashboard = await repository.GetByDashboardIdAsync(dashboardId, cancellationToken);
        return dashboard is not null && InteractiveDashboardAccess.CanView(dashboard, viewerId) ? dashboard : null;
    }

    /// <summary>
    /// The dashboard if the user may change it; 404 when they cannot see it, 403 when they can only view it
    /// (or, with manage, when they are not the owner).
    /// </summary>
    private static async Task<(InteractiveDashboard? Dashboard, IResult? Problem)> FindEditableAsync(
        string dashboardId,
        IInteractiveDashboardRepository repository,
        CurrentUser? currentUser,
        bool manage,
        CancellationToken cancellationToken)
    {
        var viewerId = InteractiveDashboardAccess.ViewerId(currentUser);
        var dashboard = await FindVisibleAsync(dashboardId, repository, viewerId, cancellationToken);
        if (dashboard is null)
        {
            return (null, Results.NotFound());
        }

        if (manage ? InteractiveDashboardAccess.CanManage(dashboard, viewerId) : InteractiveDashboardAccess.CanEdit(dashboard, viewerId))
        {
            return (dashboard, null);
        }

        return (null, Results.Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: manage ? "Only the dashboard owner can do this" : "You can view this dashboard but not edit it"));
    }

    private static async Task<string> NextDashboardIdAsync(ISequenceGenerator sequenceGenerator, CancellationToken cancellationToken) =>
        $"DSH-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}";

    private static async Task<IResult> SaveAsync(
        InteractiveDashboard dashboard,
        IInteractiveDashboardRepository repository,
        CurrentUser? currentUser,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (!await repository.UpdateAsync(dashboard.Id, dashboard, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, dashboard.Id, dashboard.DashboardName, EventAction.Updated, cancellationToken);

        return Results.Ok(InteractiveDashboardResponse.FromEntity(dashboard, InteractiveDashboardAccess.ViewerId(currentUser)));
    }
}
