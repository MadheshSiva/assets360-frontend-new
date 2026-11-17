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
/// Reports &amp; Analytics / IoT &amp; Utilization Analytics: connected assets, telemetry, utilization, connectivity, sensor health, IoT events and
/// alerts worked out from the Tracking service's devices, device health, sensors and location events, the asset register, downtime records and
/// sensor alerts. Data endpoints take the filter bar as query values. Action plans raised from the insights are stored here.
/// </summary>
public static class IotUtilizationAnalyticsEndpoints
{
    internal const string EntityType = "IotUtilizationAnalyticsView";
    internal const string PlanEntityType = "IotUtilizationAnalyticsActionPlan";
    public const string Page = "iot-utilization-analytics";
    private const string BasePath = "/api/iot-utilization-analytics";
    private const string SequenceName = "iot_utilization_analytics_view";
    private const string PlanSequenceName = "iot_utilization_analytics_action_plan";

    public static RouteGroupBuilder MapIotUtilizationAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("IoT & Utilization Analytics");

        // Page furniture: dropdown values and the Organization / Location / Asset Category / Device Type filters.
        group.MapGet("/options", GetOptions).WithName("GetIotUtilizationAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetIotUtilizationAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetIotUtilizationAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateIotUtilizationAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateIotUtilizationAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteIotUtilizationAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetIotUtilizationAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetIotUtilizationSummary");
        group.MapGet("/utilization-trend", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.UtilizationTrend())).WithName("GetIotUtilizationTrend");
        group.MapGet("/telemetry", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Telemetry())).WithName("GetIotTelemetryOverview");
        group.MapGet("/connectivity", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Connectivity())).WithName("GetIotConnectivityStatus");
        group.MapGet("/category-utilization", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.CategoryUtilization())).WithName("GetIotUtilizationByCategory");
        group.MapGet("/sensor-health", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.SensorHealth())).WithName("GetIotSensorHealth");
        group.MapGet("/events", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Events())).WithName("GetIotEventsAndAlerts");
        group.MapGet("/locations", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Locations())).WithName("GetIotConnectedAssetLocations");
        group.MapGet("/devices", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Devices())).WithName("GetIotDevicePerformance");
        group.MapGet("/insights", ([AsParameters] IotUtilizationAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetIotInsights");
        group.MapGet("/variance", GetVarianceAsync).WithName("GetIotUtilizationVariance");
        group.MapGet("/alerts", GetAlertsAsync).WithName("GetIotActiveAlerts");
        group.MapGet("/assets", GetAssetsAsync).WithName("GetIotConnectedAssets");
        group.MapGet("/assets/{assetRowId}/utilization-history", GetUtilizationHistoryAsync).WithName("GetIotAssetUtilizationHistory");

        // Compare Periods and Export.
        group.MapGet("/compare-periods", ComparePeriodsAsync).WithName("CompareIotUtilizationPeriods");
        group.MapGet("/export", ExportAsync).WithName("ExportIotUtilizationAnalytics");

        // Create action plan (insight cards) and the plans raised so far.
        group.MapGet("/action-plans", GetActionPlansAsync).WithName("GetIotUtilizationActionPlans");
        group.MapGet("/action-plans/{planId}", GetActionPlanAsync).WithName("GetIotUtilizationActionPlan");
        group.MapPost("/action-plans", CreateActionPlanAsync).WithName("CreateIotUtilizationActionPlan");
        group.MapPut("/action-plans/{planId}", UpdateActionPlanAsync).WithName("UpdateIotUtilizationActionPlan");
        group.MapDelete("/action-plans/{planId}", DeleteActionPlanAsync).WithName("DeleteIotUtilizationActionPlan");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new IotUtilizationAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        IotUtilizationAnalyticsOptions.DefaultDatePreset,
        IotUtilizationAnalyticsOptions.ConnectivityStatuses.All,
        IotUtilizationAnalyticsCalculator.HealthStatuses,
        IotUtilizationAnalyticsOptions.AlertSeverities.All,
        IotUtilizationAnalyticsCalculator.EventSeverities,
        IotUtilizationAnalyticsOptions.AssetSortFields.All,
        IotUtilizationAnalyticsOptions.ExportFormats.All,
        IotUtilizationAnalyticsOptions.DefaultUtilizationTarget,
        IotUtilizationAnalyticsCalculator.SensorHealthTarget,
        IotUtilizationAnalyticsCalculator.OfflineInsightHours,
        IotUtilizationAnalyticsOptions.AutoRefreshSeconds,
        IotUtilizationAnalyticsOptions.PlanPriorities.All,
        IotUtilizationAnalyticsOptions.PlanStatuses.All,
        IotUtilizationAnalyticsOptions.InsightKeys.All));

    /// <summary>Organization, Location, Asset Category and Device Type values, and the technicians an action plan can be assigned to.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        IIotUtilizationAnalyticsDataRepository iotRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var options = await dataRepository.GetFilterOptionsAsync(tenant, client, cancellationToken);
        var deviceTypes = await iotRepository.GetDeviceTypesAsync(tenant, client, cancellationToken);
        var owners = (await dataRepository.GetTechniciansAsync(new DashboardDataScope(tenant, client, null, null, null), cancellationToken))
            .Select(technician => technician.Name?.Trim())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Select(name => name!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Results.Ok(new IotUtilizationAnalyticsFilterOptionsResponse(
            options.Organizations,
            options.Locations,
            options.AssetCategories,
            deviceTypes.Select(type => new DashboardOption(type, type)).ToList(),
            owners));
    }

    // ----- Saved views -----

    /// <summary>The built-in All Connected Assets view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IIotUtilizationAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<IotUtilizationAnalyticsView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { IotUtilizationAnalyticsViewResponse.AllAssets(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(IotUtilizationAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveIotUtilizationAnalyticsViewRequest request,
        IIotUtilizationAnalyticsViewRepository repository,
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
        var errors = request.Validate();
        if (errors.Count == 0 && await NameTakenAsync(repository, viewerId, tenantId, clientId, request.ViewName!, null, cancellationToken))
        {
            errors["ViewName"] = ["You already have a view with this name"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var utcNow = DateTime.UtcNow;
        var view = new IotUtilizationAnalyticsView
        {
            ViewId = $"IUV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
            ViewName = request.ViewName!.Trim(),
            OwnerId = viewerId,
            OwnerName = currentUser?.UserName,
            IsDefault = request.IsDefault ?? false,
            Filters = request.Filters.ToDomain(),
            Status = "Active",
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = tenantId,
            ClientId = clientId,
            IsDeleted = false
        };

        view = await repository.CreateAsync(view, cancellationToken);
        if (view.IsDefault)
        {
            await repository.ClearDefaultAsync(viewerId, tenantId, clientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{view.ViewId}", IotUtilizationAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveIotUtilizationAnalyticsViewRequest request,
        IIotUtilizationAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != viewerId)
        {
            return Results.NotFound();
        }

        var errors = request.Validate();
        if (errors.Count == 0 && await NameTakenAsync(repository, viewerId, view.TenantId, view.ClientId, request.ViewName!, view.Id, cancellationToken))
        {
            errors["ViewName"] = ["You already have a view with this name"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        view.ViewName = request.ViewName!.Trim();
        view.IsDefault = request.IsDefault ?? view.IsDefault;
        view.Filters = request.Filters.ToDomain();
        view.UpdatedBy = currentUser?.UserName;
        view.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(view.Id, view, cancellationToken))
        {
            return Results.NotFound();
        }

        if (view.IsDefault)
        {
            await repository.ClearDefaultAsync(viewerId, view.TenantId, view.ClientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Updated, cancellationToken);

        return Results.Ok(IotUtilizationAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IIotUtilizationAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser())
            || !await repository.DeleteAsync(view.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    // ----- Data -----

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] IotUtilizationAnalyticsRequest request,
        int varianceLimit = IotUtilizationAnalyticsOptions.DefaultVarianceLimit,
        int assetLimit = IotUtilizationAnalyticsOptions.MaxPageSize)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var assets = calculator.Assets();

        return Results.Ok(new IotUtilizationAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.UtilizationTrend(),
            calculator.Telemetry(),
            calculator.Connectivity(),
            calculator.CategoryUtilization(),
            calculator.SensorHealth(),
            calculator.Events(),
            calculator.Locations(),
            calculator.BelowTarget().Take(Math.Clamp(varianceLimit, 0, IotUtilizationAnalyticsOptions.MaxVarianceLimit)).ToList(),
            calculator.Devices(),
            calculator.Insights(),
            calculator.ActiveAlerts(),
            assets.Take(Math.Clamp(assetLimit, 0, IotUtilizationAnalyticsOptions.MaxPageSize)).ToList(),
            assets.Count));
    }

    /// <summary>Top Utilization Variance Assets: the assets furthest below the utilization target (limit, default 8).</summary>
    private static Task<IResult> GetVarianceAsync(
        [AsParameters] IotUtilizationAnalyticsRequest request,
        int limit = IotUtilizationAnalyticsOptions.DefaultVarianceLimit) =>
        Section(request, calculator => calculator.BelowTarget().Take(Math.Clamp(limit, 1, IotUtilizationAnalyticsOptions.MaxVarianceLimit)).ToList());

    /// <summary>Active IoT alerts, newest first. sensorType=Vibration backs the abnormal-vibration insight; severity is Critical or Warning.</summary>
    private static async Task<IResult> GetAlertsAsync(
        [AsParameters] IotUtilizationAnalyticsRequest request,
        string? sensorType = null,
        string? severity = null,
        string? assetRowId = null)
    {
        if (!string.IsNullOrWhiteSpace(severity) && !IotUtilizationAnalyticsOptions.AlertSeverities.IsValid(severity))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Severity"] = [$"Severity must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.AlertSeverities.All)}"]
            });
        }

        return await Section(request, calculator =>
        {
            IEnumerable<IotAlertRow> alerts = calculator.ActiveAlerts();
            if (!string.IsNullOrWhiteSpace(sensorType))
            {
                alerts = alerts.Where(alert => alert.SensorType?.Contains(sensorType.Trim(), StringComparison.OrdinalIgnoreCase) == true);
            }

            if (IotUtilizationAnalyticsOptions.AlertSeverities.Normalize(severity) is { } level)
            {
                alerts = alerts.Where(alert => alert.Severity == level);
            }

            if (!string.IsNullOrWhiteSpace(assetRowId))
            {
                alerts = alerts.Where(alert => alert.AssetRowId == assetRowId.Trim() || string.Equals(alert.DeviceId, assetRowId.Trim(), StringComparison.OrdinalIgnoreCase));
            }

            return alerts.ToList();
        });
    }

    /// <summary>
    /// Connected assets. belowTarget=true and offlineOver24h=true back the insight buttons; sortBy is one of /options assetSortFields
    /// (default variance, largest shortfall first).
    /// </summary>
    private static async Task<IResult> GetAssetsAsync(
        [AsParameters] IotUtilizationAnalyticsRequest request,
        string? search = null,
        bool belowTarget = false,
        bool offlineOver24h = false,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = IotUtilizationAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        if (!string.IsNullOrWhiteSpace(sortBy) && !IotUtilizationAnalyticsOptions.AssetSortFields.IsValid(sortBy))
        {
            errors["SortBy"] = [$"SortBy must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.AssetSortFields.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        IEnumerable<IotAssetRow> rows = belowTarget ? calculator.BelowTarget() : offlineOver24h ? calculator.OfflineOver24Hours() : calculator.Assets();
        if (belowTarget && offlineOver24h)
        {
            var offline = calculator.OfflineOver24Hours().Select(row => row.Id).ToHashSet();
            rows = rows.Where(row => offline.Contains(row.Id));
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.AssetId, row.AssetName, row.DeviceId, row.DeviceName, row.Location, row.Category, row.DeviceType }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        var field = IotUtilizationAnalyticsOptions.AssetSortFields.Normalize(sortBy);
        if (field is not null || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<IotAssetRow, object?> key = field switch
            {
                "utilization" => row => row.Utilization,
                "assetId" => row => row.AssetId,
                "assetName" => row => row.AssetName,
                "location" => row => row.Location,
                "lastSeen" => row => row.MinutesSinceLastSeen,
                "connectivity" => row => row.Connectivity,
                "deviceType" => row => row.DeviceType,
                "availability" => row => row.TelemetryAvailability,
                _ => row => row.Variance
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > IotUtilizationAnalyticsOptions.MaxPageSize ? IotUtilizationAnalyticsOptions.DefaultPageSize : pageSize;

        return Results.Ok(new IotAssetListResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>The detail dialog's sparkline: weekly utilization over the last 12 weeks (weeks, 1–52) for one connected asset (row id or device id).</summary>
    private static async Task<IResult> GetUtilizationHistoryAsync(
        string assetRowId,
        [AsParameters] IotUtilizationAnalyticsRequest request,
        int weeks = IotUtilizationAnalyticsOptions.HistoryWeeks)
    {
        if (weeks is < 1 or > 52)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Weeks"] = ["Weeks must be between 1 and 52"] });
        }

        ReportPeriods.TryGetTimeZone(request.TimeZone, out var zone);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
        var (calculator, _, problem) = await LoadAsync(request, new DashboardFiltersRequest(
            null,
            null,
            null,
            InteractiveDashboardOptions.CustomDatePreset,
            today.AddDays(-7 * weeks + 1),
            today,
            request.TimeZone), forceWeekly: true);
        if (calculator is null)
        {
            return problem!;
        }

        var history = calculator.UtilizationHistory(assetRowId);
        return history is null
            ? Results.NotFound()
            : Results.Ok(new IotUtilizationHistoryResponse(DateTime.UtcNow, assetRowId, DashboardPeriodResponse.FromPeriod(calculator.Period), history));
    }

    /// <summary>
    /// Compare Periods: the KPIs of the selected period against another one, given as compareFrom / compareTo or comparePreset, and both
    /// utilization trends. Without either, the previous period of the same length is used.
    /// </summary>
    private static async Task<IResult> ComparePeriodsAsync(
        [AsParameters] IotUtilizationAnalyticsRequest request,
        string? comparePreset = null,
        DateOnly? compareFrom = null,
        DateOnly? compareTo = null)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var period = calculator.Period;
        if (string.IsNullOrWhiteSpace(comparePreset) && compareFrom is null && compareTo is null)
        {
            comparePreset = InteractiveDashboardOptions.CustomDatePreset;
            compareFrom = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(period.PreviousFromUtc, period.Zone));
            compareTo = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(period.PreviousToUtc, period.Zone)).AddDays(-1);
        }

        var (compare, _, compareProblem) = await LoadAsync(request, new DashboardFiltersRequest(
            null,
            null,
            null,
            string.IsNullOrWhiteSpace(comparePreset) ? InteractiveDashboardOptions.CustomDatePreset : comparePreset,
            compareFrom,
            compareTo,
            period.TimeZone));
        if (compare is null)
        {
            return compareProblem!;
        }

        var current = calculator.Summary();
        var other = compare.Summary();
        (string Name, KpiWidgetData Value, KpiWidgetData Compare, bool PercentChange)[] metrics =
        [
            ("Connected Assets", current.ConnectedAssets, other.ConnectedAssets, true),
            ("Average Utilization", current.AverageUtilization, other.AverageUtilization, false),
            ("Telemetry Availability", current.TelemetryAvailability, other.TelemetryAvailability, false),
            ("Active IoT Alerts", current.ActiveAlerts, other.ActiveAlerts, true)
        ];

        return Results.Ok(new IotPeriodComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(period),
            DashboardPeriodResponse.FromPeriod(compare.Period),
            metrics.Select(metric =>
            {
                var kpi = DashboardWidgetCalculator.Kpi(metric.Value.Value, metric.Compare.Value, metric.Value.Format, metric.PercentChange);
                return new PeriodComparisonItem(metric.Name, kpi.Format, kpi.Value, kpi.PreviousValue, kpi.Change, kpi.ChangeUnit, kpi.Trend);
            }).ToList(),
            calculator.UtilizationTrend().Trend,
            compare.UtilizationTrend().Trend));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section (format=xlsx, default) or the connected assets as CSV (format=csv).</summary>
    private static async Task<IResult> ExportAsync([AsParameters] IotUtilizationAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !IotUtilizationAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", IotUtilizationAnalyticsOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var assets = calculator.Assets();
        string[] assetHeaders =
        [
            "Asset ID", "Asset Name", "Category", "Location", "Organization", "Device Type", "Device ID", "Connectivity", "Sensor Health", "Utilization %",
            "Target %", "Variance (pts)", "Telemetry Availability %", "Avg Signal (dBm)", "Battery %", "Last Telemetry (UTC)"
        ];
        object?[] AssetValues(IotAssetRow row) =>
        [
            row.AssetId, row.AssetName, row.Category, row.Location, row.Organization, row.DeviceType, row.DeviceId, row.Connectivity, row.SensorHealth,
            row.Utilization, row.Target, row.Variance, row.TelemetryAvailability, row.SignalDbm, row.BatteryLevel, row.LastSeenAt
        ];

        if (string.Equals(format?.Trim(), "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", assetHeaders.Select(Csv)));
            foreach (var row in assets)
            {
                csv.AppendLine(string.Join(",", AssetValues(row).Select(value => Csv(value switch
                {
                    null => string.Empty,
                    DateTime date => date.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                    IFormattable number => number.ToString(null, CultureInfo.InvariantCulture),
                    _ => value.ToString() ?? string.Empty
                }))));
            }

            return Results.File(
                Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(),
                "text/csv",
                $"iot-utilization-assets-{generatedAt:yyyyMMddHHmmss}.csv");
        }

        var period = calculator.Period;
        var summary = calculator.Summary();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Asset Category", filters.Category ?? "All categories", null, null, null],
            ["Device Type", filters.DeviceType ?? "All device types", null, null, null],
            ["Connectivity Status", filters.Connectivity ?? "All statuses", null, null, null],
            ["Utilization Target (%)", filters.UtilizationTarget, null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Connected Assets", summary.ConnectedAssets),
                ("Average Utilization (%)", summary.AverageUtilization),
                ("Telemetry Availability (%)", summary.TelemetryAvailability),
                ("Active IoT Alerts", summary.ActiveAlerts)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Utilization Trend", calculator.UtilizationTrend().Trend);
        AddSeriesSheet(workbook, "Telemetry Overview", calculator.Telemetry().Trend);
        AddSheet(workbook, "Connectivity Status", ["Status", "Assets", "Percentage"],
            calculator.Connectivity().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSheet(workbook, "Utilization by Category", ["Category", "Assets", "Utilization %", "Target %"],
            calculator.CategoryUtilization().Select(item => (object?[])[item.Category, item.AssetCount, item.Utilization, item.Target]));
        var health = calculator.SensorHealth();
        AddSheet(workbook, "Sensor Health", ["Sensor Health", "Sensors"],
        [
            ["Healthy", health.Healthy], ["Warning", health.Warning], ["Failed", health.Failed], ["Score (%)", health.Score], ["Target (%)", health.Target]
        ]);
        AddSeriesSheet(workbook, "IoT Events", calculator.Events().Trend);
        AddSheet(workbook, "Locations", ["Location", "Organization", "Latitude", "Longitude", "Connected", "Online", "Intermittent", "Offline", "Never Connected", "Avg Utilization %", "Availability %", "Active Alerts"],
            calculator.Locations().Select(site => (object?[])
            [
                site.Location, site.Organization, site.Latitude, site.Longitude, site.Connected, site.Online, site.Intermittent, site.Offline,
                site.NeverConnected, site.Utilization, site.TelemetryAvailability, site.ActiveAlerts
            ]));
        AddSheet(workbook, "Utilization Variance", assetHeaders, calculator.BelowTarget().Select(AssetValues));
        AddSheet(workbook, "Device Performance", ["Device Type", "Connected", "Online", "Availability %", "Avg Signal (dBm)", "Failed Sensors"],
            calculator.Devices().Select(row => (object?[])[row.DeviceType, row.Connected, row.Online, row.TelemetryAvailability, row.AvgSignalDbm, row.FailedSensors]));
        AddSheet(workbook, "Active Alerts", ["Alert", "Asset ID", "Asset", "Location", "Device ID", "Type", "Reading", "Severity", "Raised (UTC)", "Status"],
            calculator.ActiveAlerts().Select(alert => (object?[])
            [
                alert.Id, alert.AssetId, alert.AssetName, alert.Location, alert.DeviceId, alert.Type, alert.Reading, alert.Severity, alert.RaisedAt, alert.Status
            ]));
        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Assets"],
            calculator.Insights().Select(insight => (object?[])[insight.Title, insight.Message, insight.Count, insight.AssetCount]));
        AddSheet(workbook, "Connected Assets", assetHeaders, assets.Select(AssetValues));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"iot-utilization-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    // ----- Action plans -----

    private static async Task<IResult> GetActionPlansAsync(
        IIotUtilizationAnalyticsActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? status = null,
        string? priority = null,
        string? insightKey = null,
        string? owner = null,
        string? search = null,
        int page = 1,
        int pageSize = IotUtilizationAnalyticsOptions.DefaultPageSize,
        string? tenantId = null,
        string? clientId = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, IotUtilizationAnalyticsOptions.PlanStatuses);
        CheckOption(errors, "Priority", priority, IotUtilizationAnalyticsOptions.PlanPriorities);
        CheckOption(errors, "InsightKey", insightKey, IotUtilizationAnalyticsOptions.InsightKeys);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > IotUtilizationAnalyticsOptions.MaxPageSize ? IotUtilizationAnalyticsOptions.DefaultPageSize : pageSize;
        var result = await repository.QueryAsync(new IotUtilizationAnalyticsActionPlanQuery(
            Tenant(tenantId, currentUser),
            Client(clientId, currentUser),
            IotUtilizationAnalyticsOptions.PlanStatuses.Normalize(status),
            IotUtilizationAnalyticsOptions.PlanPriorities.Normalize(priority),
            IotUtilizationAnalyticsOptions.InsightKeys.Normalize(insightKey),
            owner,
            search,
            page,
            pageSize), cancellationToken);

        return Results.Ok(new IotUtilizationActionPlanListResponse(
            result.Items.Select(IotUtilizationActionPlanResponse.FromEntity).ToList(),
            result.TotalCount,
            page,
            pageSize));
    }

    private static async Task<IResult> GetActionPlanAsync(
        string planId,
        IIotUtilizationAnalyticsActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        var plan = await repository.GetByPlanIdAsync(planId, cancellationToken);
        return plan is null || !InTenant(plan, currentUserAccessor.GetCurrentUser())
            ? Results.NotFound()
            : Results.Ok(IotUtilizationActionPlanResponse.FromEntity(plan));
    }

    private static async Task<IResult> CreateActionPlanAsync(
        SaveIotUtilizationActionPlanRequest request,
        IIotUtilizationAnalyticsActionPlanRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = request.Validate(isNew: true, DateOnly.FromDateTime(DateTime.UtcNow));
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var utcNow = DateTime.UtcNow;
        var plan = new IotUtilizationAnalyticsActionPlan
        {
            PlanId = $"IAP-{await sequenceGenerator.GetNextValueAsync(PlanSequenceName, cancellationToken):D4}",
            CreatedById = CustomReportAccess.ViewerId(currentUser),
            Status = IotUtilizationAnalyticsOptions.PlanStatuses.Normalize(request.Status) ?? IotUtilizationAnalyticsOptions.OpenPlanStatus,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = Tenant(request.TenantId, currentUser),
            ClientId = Client(request.ClientId, currentUser),
            IsDeleted = false
        };
        Apply(plan, request);

        plan = await repository.CreateAsync(plan, cancellationToken);
        await eventLogger.LogAsync(PlanEntityType, plan.Id, plan.Title, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/action-plans/{plan.PlanId}", IotUtilizationActionPlanResponse.FromEntity(plan));
    }

    private static async Task<IResult> UpdateActionPlanAsync(
        string planId,
        SaveIotUtilizationActionPlanRequest request,
        IIotUtilizationAnalyticsActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var plan = await repository.GetByPlanIdAsync(planId, cancellationToken);
        if (plan is null || !InTenant(plan, currentUser))
        {
            return Results.NotFound();
        }

        var errors = request.Validate(isNew: false, DateOnly.FromDateTime(DateTime.UtcNow));
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        Apply(plan, request);
        plan.Status = IotUtilizationAnalyticsOptions.PlanStatuses.Normalize(request.Status) ?? plan.Status;
        plan.UpdatedBy = currentUser?.UserName;
        plan.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(plan.Id, plan, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(PlanEntityType, plan.Id, plan.Title, EventAction.Updated, cancellationToken);

        return Results.Ok(IotUtilizationActionPlanResponse.FromEntity(plan));
    }

    private static async Task<IResult> DeleteActionPlanAsync(
        string planId,
        IIotUtilizationAnalyticsActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var plan = await repository.GetByPlanIdAsync(planId, cancellationToken);
        if (plan is null || !InTenant(plan, currentUserAccessor.GetCurrentUser()) || !await repository.DeleteAsync(plan.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(PlanEntityType, plan.Id, plan.Title, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static void Apply(IotUtilizationAnalyticsActionPlan plan, SaveIotUtilizationActionPlanRequest request)
    {
        plan.Title = request.Title!.Trim();
        plan.Owner = request.Owner!.Trim();
        plan.DueDate = request.DueDate!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        plan.Priority = IotUtilizationAnalyticsOptions.PlanPriorities.Normalize(request.Priority) ?? "High";
        plan.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        plan.InsightKey = IotUtilizationAnalyticsOptions.InsightKeys.Normalize(request.InsightKey);
        plan.Context = string.IsNullOrWhiteSpace(request.Context) ? null : request.Context.Trim();
        plan.DeviceIds = (request.DeviceIds ?? [])
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>A signed-in user only sees plans of their own tenant.</summary>
    private static bool InTenant(IotUtilizationAnalyticsActionPlan plan, CurrentUser? currentUser) =>
        string.IsNullOrWhiteSpace(currentUser?.TenantId) || plan.TenantId == currentUser.TenantId;

    // ----- Loading -----

    private static async Task<IResult> Section<T>(IotUtilizationAnalyticsRequest request, Func<IotUtilizationAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request, null);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new IotUtilizationAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>
    /// Applies the saved view, then the query values, checks them and reads the records.
    /// dates replaces the date range (Compare Periods, utilization history); the other filters stay the same.
    /// </summary>
    private static async Task<(IotUtilizationAnalyticsCalculator? Calculator, IotUtilizationAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        IotUtilizationAnalyticsRequest request,
        DashboardFiltersRequest? dates,
        bool forceWeekly = false)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new IotUtilizationAnalyticsFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(IotUtilizationAnalyticsOptions.AllAssetsViewId, StringComparison.OrdinalIgnoreCase))
        {
            var view = await request.ViewRepository.GetByViewIdAsync(request.ViewId, request.CancellationToken);
            if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUser))
            {
                return (null, null, Results.ValidationProblem(new Dictionary<string, string[]> { ["ViewId"] = [$"View '{request.ViewId}' was not found"] }));
            }

            saved = view.Filters;
            viewId = view.ViewId;
        }

        string? Pick(string? value, string? fallback) => value is null ? fallback : InteractiveDashboardMappings.FilterValue(value);

        dates ??= new DashboardFiltersRequest(
            null,
            null,
            null,
            !string.IsNullOrWhiteSpace(request.DatePreset)
                ? request.DatePreset
                : request.From is not null || request.To is not null
                    ? InteractiveDashboardOptions.CustomDatePreset
                    : saved.DatePreset ?? IotUtilizationAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        var organization = Pick(request.Organization, saved.Organization);
        var location = Pick(request.Location, saved.Location);
        var category = Pick(request.Category, saved.AssetCategory);
        var deviceType = Pick(request.DeviceType, saved.DeviceType);
        var connectivity = Pick(request.Connectivity, saved.Connectivity);
        IotUtilizationAnalyticsValidationExtensions.ValidateFilterValues(errors, string.Empty, organization, location, category, deviceType, connectivity);

        if (request.UtilizationTarget is < 0 or > 100)
        {
            errors["UtilizationTarget"] = ["UtilizationTarget must be between 0 and 100"];
        }

        if (errors.Count > 0)
        {
            return (null, null, Results.ValidationProblem(errors));
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

        var scope = new DashboardDataScope(Tenant(request.TenantId, currentUser), Client(request.ClientId, currentUser), organization, location, category);
        var settings = new IotUtilizationAnalyticsSettings(
            deviceType,
            IotUtilizationAnalyticsOptions.ConnectivityStatuses.Normalize(connectivity),
            request.UtilizationTarget ?? IotUtilizationAnalyticsOptions.DefaultUtilizationTarget);

        var calculator = await IotUtilizationAnalyticsCalculator.LoadAsync(
            request.DataRepository, request.IotRepository, scope, period, settings, utcNow, request.CancellationToken, forceWeekly);

        return (calculator, new IotUtilizationAnalyticsAppliedFilters(
            viewId ?? IotUtilizationAnalyticsOptions.AllAssetsViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            settings.DeviceType,
            settings.Connectivity,
            settings.UtilizationTarget), null);
    }

    private static async Task<bool> NameTakenAsync(
        IIotUtilizationAnalyticsViewRepository repository,
        string? ownerId,
        string? tenantId,
        string? clientId,
        string name,
        string? exceptId,
        CancellationToken cancellationToken) =>
        (await repository.GetOwnedAsync(ownerId, tenantId, clientId, cancellationToken))
            .Any(view => view.Id != exceptId && string.Equals(view.ViewName, name.Trim(), StringComparison.OrdinalIgnoreCase));

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

    private static void AddSeriesSheet(XLWorkbook workbook, string name, PerformanceSeries series) =>
        AddSheet(workbook, name,
            new[] { "Period" }.Concat(series.Series.Select(line => line.Name)).ToList(),
            series.Categories.Select((label, index) => new object?[] { label }.Concat(series.Series.Select(line => (object?)line.Values[index])).ToArray()));

    private static string Csv(string value) =>
        value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}
