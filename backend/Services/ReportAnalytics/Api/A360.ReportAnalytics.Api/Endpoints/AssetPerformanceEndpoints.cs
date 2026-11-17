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
/// Reports &amp; Analytics / Asset Performance: health, utilization, availability, reliability, downtime and lifecycle figures
/// worked out from live Asset and Maintenance records. Every data endpoint takes the filter bar as query values (AssetPerformanceQuery).
/// </summary>
public static class AssetPerformanceEndpoints
{
    internal const string EntityType = "AssetPerformanceView";
    private const string BasePath = "/api/asset-performance";
    private const string SequenceName = "asset_performance_view";
    private const string Page = AssetPerformanceViewRepository.AssetPerformancePage;

    public static RouteGroupBuilder MapAssetPerformanceEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Asset Performance");

        // Page furniture: dropdown values and the Organization / Location / Category / Asset Type filters.
        group.MapGet("/options", GetOptions).WithName("GetAssetPerformanceOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetAssetPerformanceFilters");

        // The view selector ("All Assets") and Save View.
        group.MapGet("/views", GetViewsAsync).WithName("GetAssetPerformanceViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateAssetPerformanceView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateAssetPerformanceView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteAssetPerformanceView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetAssetPerformanceOverview");
        group.MapGet("/summary", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetAssetPerformanceSummary");
        group.MapGet("/health-trend", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.HealthTrend())).WithName("GetAssetHealthScoreTrend");
        group.MapGet("/utilization-by-category", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.UtilizationByCategory())).WithName("GetUtilizationByAssetCategory");
        group.MapGet("/insights", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetPerformanceInsights");
        group.MapGet("/score-distribution", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.ScoreDistribution())).WithName("GetPerformanceScoreDistribution");
        group.MapGet("/reliability", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.Reliability())).WithName("GetReliabilityAndAvailability");
        group.MapGet("/downtime", ([AsParameters] AssetPerformanceRequest request) => Section(request, calculator => calculator.Downtime())).WithName("GetDowntimeAnalysis");
        group.MapGet("/top-bottom", GetTopBottomAsync).WithName("GetTopAndBottomPerformingAssets");
        group.MapGet("/assets", GetAssetsAsync).WithName("GetAssetPerformanceAssets");
        group.MapGet("/locations", GetLocationsAsync).WithName("GetAssetPerformanceByLocation");

        // Compare Assets and Export.
        group.MapPost("/compare", CompareAssetsAsync).WithName("CompareAssetPerformance");
        group.MapGet("/export", ExportAsync).WithName("ExportAssetPerformance");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new AssetPerformanceOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        AssetPerformanceOptions.DefaultDatePreset,
        AssetPerformanceOptions.Statuses.All,
        AssetPerformanceCalculator.Bands.Select(band => new AssetPerformanceBandOption(band.Band, band.Min, Math.Floor(band.Max))).ToList(),
        AssetPerformanceOptions.AssetSortFields.All,
        AssetPerformanceOptions.LocationSortFields.All,
        AssetPerformanceOptions.ExportFormats.All,
        AssetPerformanceOptions.DefaultHealthThreshold,
        AssetPerformanceOptions.DefaultUtilizationTarget,
        AssetPerformanceOptions.MinCompareAssets,
        AssetPerformanceOptions.MaxCompareAssets));

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

    /// <summary>The built-in All Assets view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<AssetPerformanceView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(Page, viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { AssetPerformanceViewResponse.AllAssets(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(AssetPerformanceViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveAssetPerformanceViewRequest request,
        IAssetPerformanceViewRepository repository,
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
        var view = new AssetPerformanceView
        {
            ViewId = $"APV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
            ViewName = request.ViewName!.Trim(),
            Page = Page,
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
            await repository.ClearDefaultAsync(Page, viewerId, tenantId, clientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{view.ViewId}", AssetPerformanceViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveAssetPerformanceViewRequest request,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != viewerId || !IsOnPage(view))
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
            await repository.ClearDefaultAsync(Page, viewerId, view.TenantId, view.ClientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Updated, cancellationToken);

        return Results.Ok(AssetPerformanceViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser()) || !IsOnPage(view)
            || !await repository.DeleteAsync(view.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] AssetPerformanceRequest request,
        int topCount = AssetPerformanceOptions.DefaultTopCount,
        int bottomCount = AssetPerformanceOptions.DefaultBottomCount)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new AssetPerformanceOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.HealthTrend(),
            calculator.UtilizationByCategory(),
            calculator.Insights(),
            calculator.ScoreDistribution(),
            calculator.Reliability(),
            calculator.Downtime(),
            calculator.TopBottom(Clamp(topCount, AssetPerformanceOptions.MaxTopBottom), Clamp(bottomCount, AssetPerformanceOptions.MaxTopBottom)),
            calculator.Locations()));
    }

    /// <summary>Top and Bottom Performing Assets: the best topCount and the worst bottomCount by performance score.</summary>
    private static Task<IResult> GetTopBottomAsync(
        [AsParameters] AssetPerformanceRequest request,
        int topCount = AssetPerformanceOptions.DefaultTopCount,
        int bottomCount = AssetPerformanceOptions.DefaultBottomCount) =>
        Section(request, calculator => calculator.TopBottom(
            Clamp(topCount, AssetPerformanceOptions.MaxTopBottom),
            Clamp(bottomCount, AssetPerformanceOptions.MaxTopBottom)));

    /// <summary>
    /// Every asset's figures, e.g. for "View assets" on an insight (healthBelow=60 or interventionOnly=true).
    /// sortBy is one of /options assetSortFields (default performanceScore, best first).
    /// </summary>
    private static async Task<IResult> GetAssetsAsync(
        [AsParameters] AssetPerformanceRequest request,
        string? search = null,
        string? status = null,
        string? band = null,
        double? healthBelow = null,
        bool interventionOnly = false,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = AssetPerformanceOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "Status", status, AssetPerformanceOptions.Statuses);
        CheckOption(errors, "Band", band, AssetPerformanceOptions.ScoreBands);
        CheckOption(errors, "SortBy", sortBy, AssetPerformanceOptions.AssetSortFields);
        CheckDirection(errors, sortDirection);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        IEnumerable<AssetPerformanceRow> rows = calculator.Rows();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.AssetId, row.AssetName, row.Location, row.Category }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (AssetPerformanceOptions.Statuses.Normalize(status) is { } statusValue)
        {
            rows = rows.Where(row => row.Status == statusValue);
        }

        if (AssetPerformanceOptions.ScoreBands.Normalize(band) is { } bandValue)
        {
            rows = rows.Where(row => row.PerformanceBand == bandValue);
        }

        if (healthBelow is not null)
        {
            rows = rows.Where(row => row.HealthScore < healthBelow);
        }

        if (interventionOnly)
        {
            rows = rows.Where(row => calculator.InterventionReasons(row).Count > 0);
        }

        var field = AssetPerformanceOptions.AssetSortFields.Normalize(sortBy) ?? "performanceScore";
        // The default column is best first; others default to ascending.
        var descending = sortDirection is null ? sortBy is null : sortDirection.Trim().Equals("desc", StringComparison.OrdinalIgnoreCase);
        var sorted = Sort(rows, field switch
        {
            "healthScore" => row => row.HealthScore,
            "utilization" => row => row.Utilization,
            "availability" => row => row.Availability,
            "downtimeHours" => row => row.DowntimeHours,
            "failures" => row => row.Failures,
            "mtbfHours" => row => row.MtbfHours,
            "assetId" => row => row.AssetId,
            "assetName" => row => row.AssetName,
            "location" => row => row.Location,
            _ => row => row.PerformanceScore
        }, descending).ToList();

        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > AssetPerformanceOptions.MaxPageSize ? AssetPerformanceOptions.DefaultPageSize : pageSize;

        return Results.Ok(new AssetPerformanceListResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            sorted.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            sorted.Count,
            page,
            pageSize));
    }

    /// <summary>Asset Performance by Location; utilizationBelow narrows it for "View locations". Default sort: average health, best first.</summary>
    private static async Task<IResult> GetLocationsAsync(
        [AsParameters] AssetPerformanceRequest request,
        double? utilizationBelow = null,
        string? sortBy = null,
        string? sortDirection = null)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "SortBy", sortBy, AssetPerformanceOptions.LocationSortFields);
        CheckDirection(errors, sortDirection);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        return await Section(request, calculator =>
        {
            IEnumerable<LocationPerformanceRow> rows = calculator.Locations();
            if (utilizationBelow is not null)
            {
                rows = rows.Where(location => location.Utilization < utilizationBelow);
            }

            var field = AssetPerformanceOptions.LocationSortFields.Normalize(sortBy) ?? "averageHealthScore";
            var descending = sortDirection is null ? sortBy is null : sortDirection.Trim().Equals("desc", StringComparison.OrdinalIgnoreCase);
            return Sort(rows, field switch
            {
                "utilization" => location => location.Utilization,
                "availability" => location => location.Availability,
                "performanceScore" => location => location.PerformanceScore,
                "assetCount" => location => location.AssetCount,
                "location" => location => location.Location,
                _ => location => location.AverageHealthScore
            }, descending).ToList();
        });
    }

    private static async Task<IResult> CompareAssetsAsync(
        CompareAssetsRequest body,
        [AsParameters] AssetPerformanceRequest request)
    {
        var ids = (body.AssetIds ?? [])
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Select(id => id.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ids.Count is < AssetPerformanceOptions.MinCompareAssets or > AssetPerformanceOptions.MaxCompareAssets)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["AssetIds"] = [$"Pick between {AssetPerformanceOptions.MinCompareAssets} and {AssetPerformanceOptions.MaxCompareAssets} different assets"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var found = ids.Select(id => (Id: id, Asset: calculator.FindAsset(id))).ToList();
        var assets = found
            .Where(item => item.Asset is not null)
            .Select(item => item.Asset!)
            .DistinctBy(asset => asset.MongoId)
            .Select(calculator.Compare)
            .ToList();

        return Results.Ok(new AssetComparisonResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            assets,
            found.Where(item => item.Asset is null).Select(item => item.Id).ToList()));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] AssetPerformanceRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !AssetPerformanceOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", AssetPerformanceOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var period = calculator.Period;
        var generatedAt = DateTime.UtcNow;
        var summary = calculator.Summary();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Category", filters.Category ?? "All categories", null, null, null],
            ["Asset Type", filters.AssetType ?? "All asset types", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Total Assets", summary.TotalAssets),
                ("Average Health Score", summary.AverageHealthScore),
                ("Utilization Rate (%)", summary.UtilizationRate),
                ("Availability (%)", summary.Availability),
                ("MTBF (hrs)", summary.Mtbf),
                ("MTTR (hrs)", summary.Mttr)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSheet(workbook, "Assets",
            ["Asset ID", "Asset Name", "Category", "Asset Type", "Location", "Health Score", "Utilization (%)", "Availability (%)", "MTBF (hrs)", "MTTR (hrs)",
             "Downtime (hrs)", "Planned (hrs)", "Unplanned (hrs)", "Failures", "Performance Score", "Band", "Status"],
            calculator.Rows().OrderByDescending(row => row.PerformanceScore ?? -1).Select(row => (object?[])
            [
                row.AssetId, row.AssetName, row.Category, row.AssetType, row.Location, row.HealthScore, row.Utilization, row.Availability,
                row.MtbfHours, row.MttrHours, row.DowntimeHours, row.PlannedDowntimeHours, row.UnplannedDowntimeHours, row.Failures,
                row.PerformanceScore, row.PerformanceBand, row.Status
            ]));

        AddSheet(workbook, "Locations",
            ["Location", "Assets", "Avg Health Score", "Utilization (%)", "Availability (%)", "Performance Score", "Status"],
            calculator.Locations().Select(location => (object?[])
            [
                location.Location, location.AssetCount, location.AverageHealthScore, location.Utilization, location.Availability, location.PerformanceScore, location.Status
            ]));

        AddSheet(workbook, "Utilization by Category", ["Category", "Assets", "Active (%)", "Idle (%)", "Maintenance (%)"],
            calculator.UtilizationByCategory().Select(item => (object?[])[item.Category, item.AssetCount, item.Active, item.Idle, item.Maintenance]));

        AddSheet(workbook, "Score Distribution", ["Band", "From", "To", "Assets", "Percentage"],
            calculator.ScoreDistribution().Bands.Select(band => (object?[])[band.Band, band.Min, band.Max, band.Count, band.Percentage]));

        AddSeriesSheet(workbook, "Health Score Trend", calculator.HealthTrend());
        AddSeriesSheet(workbook, "Reliability", calculator.Reliability().Trend);
        AddSeriesSheet(workbook, "Downtime", calculator.Downtime().Trend);

        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Assets / Locations"],
            calculator.Insights().Select(insight => (object?[])
            [
                insight.Title,
                insight.Message,
                insight.Count,
                string.Join(", ", insight.Assets.Select(asset => asset.AssetId ?? asset.Id).Concat(insight.Locations))
            ]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"asset-performance-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(AssetPerformanceRequest request, Func<AssetPerformanceCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new AssetPerformanceSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>Applies the saved view, then the query values, checks them and reads the records.</summary>
    private static async Task<(AssetPerformanceCalculator? Calculator, AssetPerformanceAppliedFilters? Filters, IResult? Problem)> LoadAsync(AssetPerformanceRequest request)
    {
        var query = request.ToQuery();
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new AssetPerformanceFilters();
        string? viewId = null;

        if (!string.IsNullOrWhiteSpace(query.ViewId) && !query.ViewId.Trim().Equals(AssetPerformanceOptions.AllAssetsViewId, StringComparison.OrdinalIgnoreCase))
        {
            var view = await request.ViewRepository.GetByViewIdAsync(query.ViewId, request.CancellationToken);
            if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUser) || !IsOnPage(view))
            {
                return (null, null, Results.ValidationProblem(new Dictionary<string, string[]> { ["ViewId"] = [$"View '{query.ViewId}' was not found"] }));
            }

            saved = view.Filters;
            viewId = view.ViewId;
        }

        string? Pick(string? value, string? fallback) => value is null ? fallback : InteractiveDashboardMappings.FilterValue(value);

        var preset = !string.IsNullOrWhiteSpace(query.DatePreset)
            ? query.DatePreset
            : query.From is not null || query.To is not null ? InteractiveDashboardOptions.CustomDatePreset : saved.DatePreset ?? AssetPerformanceOptions.DefaultDatePreset;
        var dates = new DashboardFiltersRequest(
            null,
            null,
            null,
            preset,
            query.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            query.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(query.TimeZone) ? saved.TimeZone : query.TimeZone);

        var errors = new Dictionary<string, string[]>();
        dates.ValidateFilters(errors, "Filters");
        if (query.HealthThreshold is < 0 or > 100)
        {
            errors["HealthThreshold"] = ["HealthThreshold must be between 0 and 100"];
        }

        if (query.UtilizationTarget is < 0 or > 100)
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

        var scope = new DashboardDataScope(
            Tenant(query.TenantId, currentUser),
            Client(query.ClientId, currentUser),
            Pick(query.Organization, saved.Organization),
            Pick(query.Location, saved.Location),
            Pick(query.Category, saved.AssetCategory),
            Pick(query.AssetType, saved.AssetType));
        var thresholds = new AssetPerformanceThresholds(
            query.HealthThreshold ?? AssetPerformanceOptions.DefaultHealthThreshold,
            query.UtilizationTarget ?? AssetPerformanceOptions.DefaultUtilizationTarget);

        var calculator = await AssetPerformanceCalculator.LoadAsync(request.DataRepository, scope, period, thresholds, utcNow, request.CancellationToken);

        return (calculator, new AssetPerformanceAppliedFilters(
            viewId ?? AssetPerformanceOptions.AllAssetsViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            scope.AssetType,
            thresholds.HealthThreshold,
            thresholds.UtilizationTarget), null);
    }

    private static async Task<bool> NameTakenAsync(
        IAssetPerformanceViewRepository repository,
        string? ownerId,
        string? tenantId,
        string? clientId,
        string name,
        string? exceptId,
        CancellationToken cancellationToken) =>
        (await repository.GetOwnedAsync(Page, ownerId, tenantId, clientId, cancellationToken))
            .Any(view => view.Id != exceptId && string.Equals(view.ViewName, name.Trim(), StringComparison.OrdinalIgnoreCase));

    private static IEnumerable<T> Sort<T>(IEnumerable<T> rows, Func<T, object?> key, bool descending)
    {
        // Rows without a value go last either way.
        var ordered = rows.OrderBy(row => key(row) is null);
        return descending
            ? ordered.ThenByDescending(key, Comparer<object?>.Default)
            : ordered.ThenBy(key, Comparer<object?>.Default);
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

    private static void AddSeriesSheet(XLWorkbook workbook, string name, PerformanceSeries series) =>
        AddSheet(workbook, name,
            new[] { "Month" }.Concat(series.Series.Select(line => line.Name)).ToList(),
            series.Categories.Select((month, index) => new object?[] { month }.Concat(series.Series.Select(line => (object?)line.Values[index])).ToArray()));

    private static void CheckOption(Dictionary<string, string[]> errors, string key, string? value, OptionList options)
    {
        if (!string.IsNullOrWhiteSpace(value) && !options.IsValid(value))
        {
            errors[key] = [$"{key} must be one of: {string.Join(", ", options.All)}"];
        }
    }

    private static void CheckDirection(Dictionary<string, string[]> errors, string? sortDirection)
    {
        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }
    }

    private static int Clamp(int value, int max) => Math.Clamp(value, 0, max);

    private static bool IsOnPage(AssetPerformanceView view) => view.Page is null || view.Page == Page;

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}

/// <summary>The filter bar (see AssetPerformanceQuery) plus the services every Asset Performance data endpoint needs.</summary>
public sealed class AssetPerformanceRequest
{
    public string? ViewId { get; init; }

    public string? Organization { get; init; }

    public string? Location { get; init; }

    public string? Category { get; init; }

    public string? AssetType { get; init; }

    public string? DatePreset { get; init; }

    public DateOnly? From { get; init; }

    public DateOnly? To { get; init; }

    public string? TimeZone { get; init; }

    public double? HealthThreshold { get; init; }

    public double? UtilizationTarget { get; init; }

    public string? TenantId { get; init; }

    public string? ClientId { get; init; }

    public IDashboardDataRepository DataRepository { get; init; } = null!;

    public IAssetPerformanceViewRepository ViewRepository { get; init; } = null!;

    public ICurrentUserAccessor CurrentUserAccessor { get; init; } = null!;

    public CancellationToken CancellationToken { get; init; }

    public AssetPerformanceQuery ToQuery() => new(
        ViewId, Organization, Location, Category, AssetType, DatePreset, From, To, TimeZone, HealthThreshold, UtilizationTarget, TenantId, ClientId);
}
