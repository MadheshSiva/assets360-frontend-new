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
/// Reports &amp; Analytics / Predictive Analytics: failure risk, remaining useful life, risk distribution, anomalies, prediction accuracy,
/// maintenance cost, high-risk assets and model performance worked out from live predictive alerts, asset, work order, downtime and cost
/// records. Data endpoints take the filter bar as query values.
/// </summary>
public static class PredictiveAnalyticsEndpoints
{
    internal const string EntityType = "PredictiveAnalyticsView";
    internal const string Page = "predictive-analytics";
    private const string BasePath = "/api/predictive-analytics";
    private const string SequenceName = "predictive_analytics_view";

    public static RouteGroupBuilder MapPredictiveAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Predictive Analytics");

        // Page furniture: dropdown values and the Organization / Location / Asset Category / Asset Type filters.
        group.MapGet("/options", GetOptions).WithName("GetPredictiveAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetPredictiveAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetPredictiveAnalyticsViews");
        group.MapGet("/views/{viewId}", GetViewAsync).WithName("GetPredictiveAnalyticsView");
        group.MapPost("/views", CreateViewAsync).WithName("CreatePredictiveAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdatePredictiveAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeletePredictiveAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetPredictiveAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetPredictiveAnalyticsSummary");
        group.MapGet("/risk-trend", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.RiskTrend())).WithName("GetFailureRiskTrend");
        group.MapGet("/remaining-useful-life", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.RemainingLife())).WithName("GetRemainingUsefulLifeForecast");
        group.MapGet("/risk-distribution", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.Distribution())).WithName("GetRiskDistribution");
        group.MapGet("/anomalies", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.Anomalies())).WithName("GetAnomalyDetectionEvents");
        group.MapGet("/accuracy", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.Accuracy())).WithName("GetPredictionAccuracy");
        group.MapGet("/maintenance-cost", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.MaintenanceCost())).WithName("GetPredictedMaintenanceCost");
        group.MapGet("/model-performance", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.ModelPerformance())).WithName("GetModelPerformanceByAssetType");
        group.MapGet("/insights", ([AsParameters] PredictiveAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetPredictiveInsights");
        group.MapGet("/high-risk-assets", ([AsParameters] PredictiveAnalyticsRequest request, int page = 1, int pageSize = PredictiveAnalyticsOptions.DefaultPageSize) =>
            ListAsync(request, "high-risk", null, null, null, page, pageSize)).WithName("GetHighRiskAssets");
        group.MapGet("/predictions", GetPredictionsAsync).WithName("GetAssetPredictions");

        group.MapGet("/export", ExportAsync).WithName("ExportPredictiveAnalytics");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new PredictiveAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        PredictiveAnalyticsOptions.DefaultDatePreset,
        PredictiveAnalyticsOptions.RiskLevels.All,
        PredictiveAnalyticsOptions.PredictionLists.All,
        PredictiveAnalyticsOptions.PredictionSortFields.All,
        PredictiveAnalyticsOptions.ExportFormats.All,
        PredictiveAnalyticsOptions.DefaultAccuracyTarget,
        PredictiveAnalyticsOptions.DefaultReviewConfidence,
        PredictiveAnalyticsOptions.DefaultFailureWindowDays,
        PredictiveAnalyticsOptions.DefaultToleranceDays,
        PredictiveAnalyticsOptions.DefaultHighRiskScore));

    /// <summary>Register values, plus the locations and asset types recorded on predictive alerts of unregistered assets.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dataRepository,
        IPredictiveAnalyticsDataRepository predictiveRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var options = await dataRepository.GetFilterOptionsAsync(tenant, client, cancellationToken);
        var (locations, assetTypes) = await predictiveRepository.GetAlertFilterValuesAsync(tenant, client, cancellationToken);

        static IReadOnlyList<DashboardOption> Merge(IReadOnlyList<DashboardOption> options, IReadOnlyList<string> extra) => options
            .Concat(extra.Where(value => !options.Any(option => string.Equals(option.Label, value, StringComparison.OrdinalIgnoreCase)))
                .Select(value => new DashboardOption(value, value)))
            .OrderBy(option => option.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return Results.Ok(new DashboardFilterOptions(options.Organizations, Merge(options.Locations, locations), options.AssetCategories, Merge(options.AssetTypes, assetTypes)));
    }

    /// <summary>The built-in All Predictions view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IPredictiveAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<PredictiveAnalyticsView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { PredictiveAnalyticsViewResponse.AllPredictions(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(PredictiveAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    private static async Task<IResult> GetViewAsync(
        string viewId,
        IPredictiveAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        if (viewId.Trim().Equals(PredictiveAnalyticsOptions.AllPredictionsViewId, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Ok(PredictiveAnalyticsViewResponse.AllPredictions(false));
        }

        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        return view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser())
            ? Results.NotFound()
            : Results.Ok(PredictiveAnalyticsViewResponse.FromEntity(view));
    }

    /// <summary>Save View: the current filter bar (risk level included) under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SavePredictiveAnalyticsViewRequest request,
        IPredictiveAnalyticsViewRepository repository,
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
        var view = new PredictiveAnalyticsView
        {
            ViewId = $"PAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
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

        return Results.Created($"{BasePath}/views/{view.ViewId}", PredictiveAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SavePredictiveAnalyticsViewRequest request,
        IPredictiveAnalyticsViewRepository repository,
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

        return Results.Ok(PredictiveAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IPredictiveAnalyticsViewRepository repository,
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

    /// <summary>The whole page; predictionLimit caps the monitored-asset rows returned (default 500).</summary>
    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] PredictiveAnalyticsRequest request,
        int predictionLimit = PredictiveAnalyticsOptions.MaxPageSize)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var predictions = calculator.Predictions();

        return Results.Ok(new PredictiveAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.RiskTrend(),
            calculator.RemainingLife(),
            calculator.Distribution(),
            calculator.Anomalies(),
            calculator.Accuracy(),
            calculator.MaintenanceCost(),
            calculator.ModelPerformance(),
            calculator.Insights(),
            predictions.Take(Math.Clamp(predictionLimit, 0, PredictiveAnalyticsOptions.MaxPageSize)).ToList(),
            predictions.Count));
    }

    /// <summary>
    /// Monitored assets' predictions. list is one of /options predictionLists (all, high-risk, failures, vibration, review) and backs the
    /// insight and "View all" buttons; sortBy is one of predictionSortFields (default the list's own order).
    /// </summary>
    private static Task<IResult> GetPredictionsAsync(
        [AsParameters] PredictiveAnalyticsRequest request,
        string? list = null,
        string? search = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = PredictiveAnalyticsOptions.DefaultPageSize) =>
        ListAsync(request, list, search, sortBy, sortDirection, page, pageSize);

    private static async Task<IResult> ListAsync(
        PredictiveAnalyticsRequest request,
        string? list,
        string? search,
        string? sortBy,
        string? sortDirection,
        int page,
        int pageSize)
    {
        var errors = new Dictionary<string, string[]>();
        CheckOption(errors, "List", list, PredictiveAnalyticsOptions.PredictionLists);
        CheckOption(errors, "SortBy", sortBy, PredictiveAnalyticsOptions.PredictionSortFields);
        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (page < 1)
        {
            errors["Page"] = ["Page must be 1 or more"];
        }

        if (pageSize < 1 || pageSize > PredictiveAnalyticsOptions.MaxPageSize)
        {
            errors["PageSize"] = [$"PageSize must be between 1 and {PredictiveAnalyticsOptions.MaxPageSize}"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var name = PredictiveAnalyticsOptions.PredictionLists.Normalize(list) ?? "all";
        IEnumerable<AssetPrediction> rows = calculator.List(name);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.AssetId, row.AssetName, row.Location, row.AssetType, row.Owner, row.PredictedIssue }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (PredictiveAnalyticsOptions.PredictionSortFields.Normalize(sortBy) is { } field)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<AssetPrediction, object?> key = field switch
            {
                "assetId" => row => row.AssetId,
                "assetName" => row => row.AssetName,
                "location" => row => row.Location,
                "failureWindowDays" => row => row.FailureWindowDays,
                "remainingUsefulLifeHours" => row => row.RemainingUsefulLifeHours,
                "confidence" => row => row.Confidence,
                "owner" => row => row.Owner,
                _ => row => row.RiskScore
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var items = rows.ToList();
        return Results.Ok(new PredictionListResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            name,
            items.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            items.Count,
            page,
            pageSize));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section, or the monitored assets' predictions as CSV.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] PredictiveAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !PredictiveAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", PredictiveAnalyticsOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var headers = new[]
        {
            "Asset ID", "Asset Name", "Location", "Category", "Asset Type", "Risk Level", "Risk Score", "Health Score", "Failure Window (days)",
            "Remaining Life (hrs)", "Predicted Failure Date", "Predicted Issue", "Confidence %", "Recommended Action", "Vibration Anomaly (7 days)",
            "Model", "Owner", "Alert Status"
        };
        IEnumerable<object?[]> PredictionRows(IEnumerable<AssetPrediction> rows) => rows.Select(row => new object?[]
        {
            row.AssetId, row.AssetName, row.Location, row.Category, row.AssetType, row.RiskLevel, row.RiskScore, row.HealthScore, row.FailureWindowDays,
            row.RemainingUsefulLifeHours, row.PredictedFailureDate, row.PredictedIssue, row.Confidence, row.RecommendedAction,
            row.VibrationAnomaly ? "Yes" : "No", row.ModelName, row.Owner, row.AlertStatus
        });

        if (string.Equals(format?.Trim(), "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", headers.Select(Csv)));
            foreach (var values in PredictionRows(calculator.Predictions()))
            {
                csv.AppendLine(string.Join(",", values.Select(value => Csv(value switch
                {
                    DateTime date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    IFormattable number => number.ToString(null, CultureInfo.InvariantCulture),
                    _ => value?.ToString()
                }))));
            }

            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv",
                $"predictive-analytics-{generatedAt:yyyyMMddHHmmss}.csv");
        }

        var period = calculator.Period;
        var summary = calculator.Summary();
        var accuracy = calculator.Accuracy();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Asset Category", filters.Category ?? "All categories", null, null, null],
            ["Asset Type", filters.AssetType ?? "All asset types", null, null, null],
            ["Risk Level", filters.RiskLevel ?? "All risk levels", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Assets Monitored", summary.AssetsMonitored),
                ("High-Risk Assets", summary.HighRiskAssets),
                ("Predicted Failures", summary.PredictedFailures),
                ("Prediction Accuracy (%)", summary.PredictionAccuracy)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Failure Risk Trend", calculator.RiskTrend().Trend);
        AddSeriesSheet(workbook, "Remaining Useful Life", calculator.RemainingLife().Forecast);
        AddSheet(workbook, "Risk Distribution", ["Risk Level", "Assets", "Percentage"],
            calculator.Distribution().Items.Select(item => (object?[])[item.Label, item.Count, item.Percentage]));
        AddSeriesSheet(workbook, "Anomaly Events", calculator.Anomalies().Trend);
        AddSheet(workbook, "Prediction Accuracy", ["Metric", "Value"],
        [
            ["Accuracy (%)", accuracy.Accuracy], ["Precision (%)", accuracy.Precision], ["Recall (%)", accuracy.Recall],
            ["False Positive Rate (%)", accuracy.FalsePositiveRate], ["Target (%)", accuracy.Target], ["Evaluated", accuracy.Evaluated],
            ["True Positives", accuracy.TruePositives], ["False Positives", accuracy.FalsePositives], ["True Negatives", accuracy.TrueNegatives],
            ["False Negatives", accuracy.FalseNegatives], ["Prevented Failures", accuracy.PreventedFailures], ["Tolerance (days)", accuracy.ToleranceDays]
        ]);
        AddSeriesSheet(workbook, "Maintenance Cost", calculator.MaintenanceCost().Trend);
        AddSheet(workbook, "High-Risk Assets", headers, PredictionRows(calculator.HighRisk()));
        AddSheet(workbook, "Model Performance", ["Asset Type", "Monitored", "Accuracy %", "Precision %", "Recall %", "Evaluated", "Model Status", "Models"],
            calculator.ModelPerformance().Select(row => (object?[])
                [row.AssetType, row.Monitored, row.Accuracy, row.Precision, row.Recall, row.Evaluated, row.Status, string.Join(", ", row.Models)]));
        AddSheet(workbook, "Insights", ["Insight", "Message", "Count", "Assets"],
            calculator.Insights().Select(insight => (object?[]) [insight.Title, insight.Message, insight.Count, string.Join(", ", insight.AssetIds)]));
        AddSheet(workbook, "Predictions", headers, PredictionRows(calculator.Predictions()));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"predictive-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(PredictiveAnalyticsRequest request, Func<PredictiveAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new PredictiveAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>Applies the saved view, then the query values, checks them and reads the records.</summary>
    private static async Task<(PredictiveAnalyticsCalculator? Calculator, PredictiveAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        PredictiveAnalyticsRequest request)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new PredictiveAnalyticsFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(PredictiveAnalyticsOptions.AllPredictionsViewId, StringComparison.OrdinalIgnoreCase))
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

        var dates = new DashboardFiltersRequest(
            null,
            null,
            null,
            !string.IsNullOrWhiteSpace(request.DatePreset)
                ? request.DatePreset
                : request.From is not null || request.To is not null
                    ? InteractiveDashboardOptions.CustomDatePreset
                    : saved.DatePreset ?? PredictiveAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");
        request.ValidateSettings(errors);

        var riskLevel = Pick(request.RiskLevel, saved.RiskLevel);
        if (riskLevel is not null && !PredictiveAnalyticsOptions.RiskLevels.IsValid(riskLevel))
        {
            errors["RiskLevel"] = [$"RiskLevel must be one of: {string.Join(", ", PredictiveAnalyticsOptions.RiskLevels.All)}"];
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
            Tenant(request.TenantId, currentUser),
            Client(request.ClientId, currentUser),
            Pick(request.Organization, saved.Organization),
            Pick(request.Location, saved.Location),
            Pick(request.Category, saved.AssetCategory),
            Pick(request.AssetType, saved.AssetType));
        var settings = new PredictiveAnalyticsSettings(
            PredictiveAnalyticsOptions.RiskLevels.Normalize(riskLevel),
            request.AccuracyTarget ?? PredictiveAnalyticsOptions.DefaultAccuracyTarget,
            request.ReviewConfidence ?? PredictiveAnalyticsOptions.DefaultReviewConfidence,
            request.FailureWindowDays ?? PredictiveAnalyticsOptions.DefaultFailureWindowDays,
            request.ToleranceDays ?? PredictiveAnalyticsOptions.DefaultToleranceDays,
            request.HighRiskScore ?? PredictiveAnalyticsOptions.DefaultHighRiskScore);

        var calculator = await PredictiveAnalyticsCalculator.LoadAsync(
            request.DataRepository, request.PredictiveRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new PredictiveAnalyticsAppliedFilters(
            viewId ?? PredictiveAnalyticsOptions.AllPredictionsViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            scope.AssetType,
            settings.RiskLevel,
            settings.AccuracyTarget,
            settings.ReviewConfidence,
            settings.FailureWindowDays,
            settings.ToleranceDays,
            settings.HighRiskScore), null);
    }

    private static async Task<bool> NameTakenAsync(
        IPredictiveAnalyticsViewRepository repository,
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
            new[] { "Month" }.Concat(series.Series.Select(line => line.Name)).ToList(),
            series.Categories.Select((month, index) => new object?[] { month }.Concat(series.Series.Select(line => (object?)line.Values[index])).ToArray()));

    private static string Csv(string? value) =>
        value is null ? string.Empty : value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;

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
