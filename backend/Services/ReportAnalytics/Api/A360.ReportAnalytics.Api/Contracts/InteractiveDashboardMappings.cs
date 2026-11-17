using A360.ReportAnalytics.Domain.Entities;
using A360.ReportAnalytics.Repository.Repositories;
using A360.Security;

namespace A360.ReportAnalytics.Api.Contracts;

/// <summary>
/// Owners manage a dashboard (edit, share, delete). People it is shared with can view it, or edit its widgets with Edit permission.
/// Organization dashboards are visible to everyone in the tenant. Dashboards created without a signed-in user have no owner and are open to all.
/// Group shares are recorded for the Dashboard Information panel; the token carries no group membership, so they do not grant access yet.
/// </summary>
public static class InteractiveDashboardAccess
{
    public const string OwnerRole = "Owner";
    public const string EditorRole = "Editor";
    public const string ViewerRole = "Viewer";

    public static string? ViewerId(CurrentUser? currentUser) => CustomReportAccess.ViewerId(currentUser);

    public static bool CanManage(InteractiveDashboard dashboard, string? viewerId) =>
        string.IsNullOrWhiteSpace(dashboard.OwnerId) || dashboard.OwnerId == viewerId;

    public static bool CanEdit(InteractiveDashboard dashboard, string? viewerId) =>
        CanManage(dashboard, viewerId) || SharedPermission(dashboard, viewerId) == InteractiveDashboardOptions.EditPermission;

    public static bool CanView(InteractiveDashboard dashboard, string? viewerId) =>
        CanManage(dashboard, viewerId)
        || dashboard.Visibility == InteractiveDashboardRepository.OrganizationVisibility
        || SharedPermission(dashboard, viewerId) is not null;

    public static string AccessRole(InteractiveDashboard dashboard, string? viewerId) =>
        CanManage(dashboard, viewerId) ? OwnerRole : CanEdit(dashboard, viewerId) ? EditorRole : ViewerRole;

    private static string? SharedPermission(InteractiveDashboard dashboard, string? viewerId) =>
        viewerId is null || dashboard.Visibility != InteractiveDashboardRepository.SharedVisibility
            ? null
            : dashboard.SharedWith.Users.FirstOrDefault(user => user.Id == viewerId)?.Permission;
}

internal static class InteractiveDashboardMappings
{
    public static InteractiveDashboard ToEntity(this CreateInteractiveDashboardRequest request, string dashboardId, CurrentUser? currentUser, DateTime utcNow)
    {
        var template = InteractiveDashboardOptions.FindTemplate(request.TemplateKey);
        var widgets = request.Widgets is { Count: > 0 }
            ? request.Widgets
            : template?.Widgets.Select(widget => new DashboardWidgetRequest(
                null,
                widget.WidgetType,
                widget.Metric,
                widget.Title,
                new DashboardWidgetPositionRequest(widget.X, widget.Y, widget.W, widget.H),
                new DashboardWidgetSettingsRequest(null, null, null, widget.Orientation))).ToList();

        var description = Trim(request.Description) ?? (template is { Widgets.Count: > 0 } ? template.Description : null);

        return new InteractiveDashboard
        {
            DashboardId = dashboardId,
            DashboardName = request.DashboardName!.Trim(),
            Description = description,
            AudienceRole = Trim(request.AudienceRole),
            OwnerId = InteractiveDashboardAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            Visibility = InteractiveDashboardOptions.Visibilities.Normalize(request.Visibility) ?? InteractiveDashboardRepository.PrivateVisibility,
            DefaultFilters = request.DefaultFilters.ToDomain(),
            Widgets = ToWidgets(widgets, []),
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = FirstNonEmpty(request.TenantId, currentUser?.TenantId),
            ClientId = FirstNonEmpty(request.ClientId, currentUser?.ClientId),
            IsDeleted = false
        };
    }

    public static void ApplyTo(this UpdateInteractiveDashboardRequest request, InteractiveDashboard dashboard, CurrentUser? currentUser, DateTime utcNow)
    {
        dashboard.DashboardName = request.DashboardName!.Trim();
        dashboard.Description = Trim(request.Description);
        dashboard.AudienceRole = Trim(request.AudienceRole);
        dashboard.DefaultFilters = request.DefaultFilters.ToDomain();
        dashboard.Widgets = ToWidgets(request.Widgets, dashboard.Widgets);
        Touch(dashboard, currentUser, utcNow);
    }

    public static void ApplyShare(this ShareInteractiveDashboardRequest request, InteractiveDashboard dashboard, CurrentUser? currentUser, DateTime utcNow)
    {
        static List<DashboardShareEntry> Entries(IReadOnlyList<DashboardShareRequest>? entries) => (entries ?? [])
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Id))
            .GroupBy(entry => entry.Id!.Trim())
            .Select(group => new DashboardShareEntry
            {
                Id = group.Key,
                Name = Trim(group.Last().Name),
                Permission = InteractiveDashboardOptions.Permissions.Normalize(group.Last().Permission) ?? InteractiveDashboardOptions.ViewPermission
            })
            .ToList();

        dashboard.Visibility = InteractiveDashboardOptions.Visibilities.Normalize(request.Visibility) ?? dashboard.Visibility;
        dashboard.SharedWith = new DashboardSharing { Users = Entries(request.Users), Groups = Entries(request.Groups) };
        Touch(dashboard, currentUser, utcNow);
    }

    /// <summary>Applies new positions to the listed widgets.</summary>
    public static void ApplyLayout(this DashboardLayoutRequest request, InteractiveDashboard dashboard, CurrentUser? currentUser, DateTime utcNow)
    {
        foreach (var item in request.Widgets ?? [])
        {
            var widget = dashboard.Widgets.First(widget => widget.WidgetId == item.WidgetId!.Trim());
            widget.Position = new DashboardWidgetPosition
            {
                X = item.X ?? widget.Position.X,
                Y = item.Y ?? widget.Position.Y,
                W = item.W ?? widget.Position.W,
                H = item.H ?? widget.Position.H
            };
        }

        Touch(dashboard, currentUser, utcNow);
    }

    public static DashboardWidget ToWidget(this DashboardWidgetRequest request, IReadOnlyCollection<DashboardWidget> others, string? widgetId = null)
    {
        var metric = InteractiveDashboardOptions.FindMetric(request.Metric)!;
        var widgetType = InteractiveDashboardOptions.FindWidgetType(request.WidgetType) ?? InteractiveDashboardOptions.FindWidgetType(metric.WidgetTypes[0])!;
        var settings = request.Settings;

        DashboardWidgetPosition position;
        if (request.Position is { } requested && requested.X is not null && requested.Y is not null)
        {
            position = new DashboardWidgetPosition
            {
                X = requested.X.Value,
                Y = requested.Y.Value,
                W = requested.W ?? widgetType.DefaultWidth,
                H = requested.H ?? widgetType.DefaultHeight
            };
        }
        else
        {
            // Below everything else, at the widget type's default size.
            position = new DashboardWidgetPosition
            {
                X = 0,
                Y = others.Select(other => other.Position.Y + other.Position.H).DefaultIfEmpty(0).Max(),
                W = request.Position?.W ?? widgetType.DefaultWidth,
                H = request.Position?.H ?? widgetType.DefaultHeight
            };
        }

        return new DashboardWidget
        {
            WidgetId = widgetId ?? Trim(request.WidgetId) ?? NewWidgetId(others),
            WidgetType = widgetType.Key,
            Metric = metric.Key,
            Title = Trim(request.Title) ?? metric.Label,
            Position = position,
            Settings = new DashboardWidgetSettings
            {
                Limit = settings?.Limit,
                Months = settings?.Months,
                ShowComparison = settings?.ShowComparison ?? true,
                Orientation = InteractiveDashboardOptions.Orientations.Normalize(settings?.Orientation)
            }
        };
    }

    public static DashboardFilters ToDomain(this DashboardFiltersRequest? request)
    {
        var preset = InteractiveDashboardOptions.DatePresets.Normalize(request?.DatePreset) ?? InteractiveDashboardOptions.DefaultDatePreset;
        var custom = preset == InteractiveDashboardOptions.CustomDatePreset;

        return new DashboardFilters
        {
            Organization = FilterValue(request?.Organization),
            Location = FilterValue(request?.Location),
            AssetCategory = FilterValue(request?.AssetCategory),
            DatePreset = preset,
            DateFrom = custom ? request!.DateFrom!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            DateTo = custom ? request!.DateTo!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) : null,
            TimeZone = Trim(request?.TimeZone) ?? ReportPeriods.DefaultTimeZone
        };
    }

    public static DashboardFiltersRequest ToRequest(this DashboardFilters filters) => new(
        filters.Organization,
        filters.Location,
        filters.AssetCategory,
        filters.DatePreset,
        filters.DateFrom is null ? null : DateOnly.FromDateTime(filters.DateFrom.Value),
        filters.DateTo is null ? null : DateOnly.FromDateTime(filters.DateTo.Value),
        filters.TimeZone);

    /// <summary>A private copy owned by the user, with fresh widget ids and no shares or stars.</summary>
    public static InteractiveDashboard Duplicate(this InteractiveDashboard source, string dashboardId, string? dashboardName, CurrentUser? currentUser, DateTime utcNow)
    {
        var widgets = new List<DashboardWidget>();
        foreach (var widget in source.Widgets)
        {
            widgets.Add(new DashboardWidget
            {
                WidgetId = NewWidgetId(widgets),
                WidgetType = widget.WidgetType,
                Metric = widget.Metric,
                Title = widget.Title,
                Position = new DashboardWidgetPosition { X = widget.Position.X, Y = widget.Position.Y, W = widget.Position.W, H = widget.Position.H },
                Settings = new DashboardWidgetSettings
                {
                    Limit = widget.Settings.Limit,
                    Months = widget.Settings.Months,
                    ShowComparison = widget.Settings.ShowComparison,
                    Orientation = widget.Settings.Orientation
                }
            });
        }

        return new InteractiveDashboard
        {
            DashboardId = dashboardId,
            DashboardName = Trim(dashboardName) ?? $"Copy of {source.DashboardName}",
            Description = source.Description,
            AudienceRole = source.AudienceRole,
            OwnerId = InteractiveDashboardAccess.ViewerId(currentUser),
            OwnerName = currentUser?.UserName,
            Visibility = InteractiveDashboardRepository.PrivateVisibility,
            DefaultFilters = source.DefaultFilters.ToRequest().ToDomain(),
            Widgets = widgets,
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = source.TenantId,
            ClientId = source.ClientId,
            IsDeleted = false
        };
    }

    /// <summary>"5 users and 2 groups", "1 user", "Only you" ...</summary>
    public static string SharedSummary(InteractiveDashboard dashboard)
    {
        if (dashboard.Visibility == InteractiveDashboardRepository.OrganizationVisibility)
        {
            return "Everyone in the organization";
        }

        if (dashboard.Visibility != InteractiveDashboardRepository.SharedVisibility)
        {
            return "Only the owner";
        }

        static string Count(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

        var parts = new List<string>();
        if (dashboard.SharedWith.Users.Count > 0) parts.Add(Count(dashboard.SharedWith.Users.Count, "user"));
        if (dashboard.SharedWith.Groups.Count > 0) parts.Add(Count(dashboard.SharedWith.Groups.Count, "group"));

        return parts.Count == 0 ? "Only the owner" : string.Join(" and ", parts);
    }

    /// <summary>"all", "All organizations" and empty all mean no filter.</summary>
    public static string? FilterValue(string? value)
    {
        var trimmed = Trim(value);
        return trimmed is null || trimmed.Equals("all", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("All ", StringComparison.OrdinalIgnoreCase)
            ? null
            : trimmed;
    }

    // Keeps the ids of widgets that are still listed so the client can match them up; new widgets get new ids.
    private static List<DashboardWidget> ToWidgets(IReadOnlyList<DashboardWidgetRequest>? requests, IReadOnlyCollection<DashboardWidget> existing)
    {
        var widgets = new List<DashboardWidget>();
        foreach (var request in requests ?? [])
        {
            var id = Trim(request.WidgetId);
            widgets.Add(request.ToWidget(widgets, id is not null && widgets.All(widget => widget.WidgetId != id) ? id : NewWidgetId(widgets.Concat(existing))));
        }

        return widgets;
    }

    private static string NewWidgetId(IEnumerable<DashboardWidget> others)
    {
        var taken = others.Select(widget => widget.WidgetId).ToHashSet();
        string id;
        do
        {
            id = $"w-{Guid.NewGuid():N}"[..10];
        }
        while (taken.Contains(id));

        return id;
    }

    private static void Touch(InteractiveDashboard dashboard, CurrentUser? currentUser, DateTime utcNow)
    {
        dashboard.UpdatedBy = currentUser?.UserName;
        dashboard.UpdatedAt = utcNow;
    }

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? FirstNonEmpty(params string?[] values) => values.Select(Trim).FirstOrDefault(value => value is not null);
}
