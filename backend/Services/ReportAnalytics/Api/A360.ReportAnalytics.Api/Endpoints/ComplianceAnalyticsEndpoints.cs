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
/// Reports &amp; Analytics / Compliance Analytics: compliance score, audit findings, asset compliance status, CAPA, permit and certificate
/// expiry, compliance risks and per-location compliance worked out from live Inspection, Maintenance, WIP, Asset and Master Data records.
/// Data endpoints take the filter bar as query values. Action plans ("Create action plan") are stored in compliance_action_plans.
/// </summary>
public static class ComplianceAnalyticsEndpoints
{
    internal const string EntityType = "ComplianceAnalyticsView";
    internal const string ActionPlanEntityType = "ComplianceActionPlan";
    /// <summary>Page key of this page's saved views.</summary>
    public const string Page = "compliance-analytics";
    private const string BasePath = "/api/compliance-analytics";
    private const string SequenceName = "compliance_analytics_view";
    private const string ActionPlanSequenceName = "compliance_action_plan";

    public static RouteGroupBuilder MapComplianceAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Compliance Analytics");

        // Page furniture: dropdown values and the Organization / Location / Regulation filters.
        group.MapGet("/options", GetOptions).WithName("GetComplianceAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetComplianceAnalyticsFilters");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetComplianceAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateComplianceAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateComplianceAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteComplianceAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetComplianceAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetComplianceAnalyticsSummary");
        group.MapGet("/score-trend", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.ScoreTrend())).WithName("GetComplianceScoreTrend");
        group.MapGet("/findings-by-severity", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.FindingsBySeverity())).WithName("GetAuditFindingsBySeverity");
        group.MapGet("/compliance-status", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.ComplianceStatus())).WithName("GetComplianceStatus");
        group.MapGet("/findings-by-area", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.FindingsByArea())).WithName("GetFindingsByComplianceArea");
        group.MapGet("/capa", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Capa())).WithName("GetCapaClosureRate");
        group.MapGet("/expiry", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Expiry())).WithName("GetPermitCertificationExpiry");
        group.MapGet("/risks", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Risks())).WithName("GetComplianceRisks");
        group.MapGet("/locations", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Locations())).WithName("GetRegulatoryComplianceByLocation");
        group.MapGet("/environmental", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Environmental())).WithName("GetEnvironmentalComplianceByLocation");
        group.MapGet("/insights", ([AsParameters] ComplianceAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetComplianceInsights");
        group.MapGet("/findings", GetFindingsAsync).WithName("GetOpenComplianceFindings");

        // Export.
        group.MapGet("/export", ExportAsync).WithName("ExportComplianceAnalytics");

        // Create action plan.
        group.MapGet("/action-plans", GetActionPlansAsync).WithName("GetComplianceActionPlans");
        group.MapGet("/action-plans/{actionPlanId}", GetActionPlanAsync).WithName("GetComplianceActionPlan");
        group.MapPost("/action-plans", CreateActionPlanAsync).WithName("CreateComplianceActionPlan");
        group.MapPut("/action-plans/{actionPlanId}", UpdateActionPlanAsync).WithName("UpdateComplianceActionPlan");
        group.MapDelete("/action-plans/{actionPlanId}", DeleteActionPlanAsync).WithName("DeleteComplianceActionPlan");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new ComplianceAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        ComplianceAnalyticsOptions.DefaultDatePreset,
        ComplianceAnalyticsOptions.Areas.All,
        ComplianceAnalyticsOptions.RiskLevels.All,
        ComplianceAnalyticsOptions.ExpiryTypes.All,
        ComplianceAnalyticsCalculator.ExpiryMonths,
        ComplianceAnalyticsCalculator.ExpirySoonDays,
        ComplianceAnalyticsOptions.FindingSortFields.All,
        ComplianceAnalyticsOptions.ExportFormats.All,
        ComplianceAnalyticsOptions.ActionPlanPriorities.All,
        ComplianceAnalyticsOptions.ActionPlanStatuses.All,
        ComplianceAnalyticsOptions.ActionPlanSources.All,
        ComplianceAnalyticsOptions.DefaultScoreTarget,
        ComplianceAnalyticsOptions.DefaultCapaTarget));

    /// <summary>Organizations and locations (asset register sites plus the sites named on inspections) and the regulations in scope.</summary>
    private static async Task<IResult> GetFiltersAsync(
        IDashboardDataRepository dashboardRepository,
        IComplianceAnalyticsDataRepository dataRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var options = await dashboardRepository.GetFilterOptionsAsync(tenant, client, cancellationToken);
        var sites = await dataRepository.GetSitesAsync(tenant, client, cancellationToken);
        var regulations = await dataRepository.GetRegulationsAsync(tenant, client, cancellationToken);
        var standards = await dataRepository.GetReferenceStandardsAsync(tenant, client, cancellationToken);

        var locations = options.Locations.ToList();
        foreach (var site in sites.Where(site => locations.All(option => !string.Equals(option.Label, site, StringComparison.OrdinalIgnoreCase)
                                                                        && !string.Equals(option.Value, site, StringComparison.OrdinalIgnoreCase))))
        {
            locations.Add(new DashboardOption(site, site));
        }

        var regulationOptions = regulations.Select(regulation => regulation.Name)
            .Concat(standards)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .Select(name => new DashboardOption(name, name))
            .ToList();

        return Results.Ok(new ComplianceAnalyticsFilterOptionsResponse(
            options.Organizations,
            locations.OrderBy(option => option.Label, StringComparer.OrdinalIgnoreCase).ToList(),
            regulationOptions));
    }

    /// <summary>The built-in All Compliance view first, then the user's saved views.</summary>
    private static async Task<IResult> GetViewsAsync(
        IComplianceAnalyticsViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        IReadOnlyList<ComplianceAnalyticsView> views = viewerId is null
            ? []
            : await repository.GetOwnedAsync(viewerId, Tenant(tenantId, currentUser), Client(clientId, currentUser), cancellationToken);

        return Results.Ok(new[] { ComplianceAnalyticsViewResponse.AllCompliance(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(ComplianceAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveComplianceAnalyticsViewRequest request,
        IComplianceAnalyticsViewRepository repository,
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
        var view = new ComplianceAnalyticsView
        {
            ViewId = $"CAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
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

        return Results.Created($"{BasePath}/views/{view.ViewId}", ComplianceAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveComplianceAnalyticsViewRequest request,
        IComplianceAnalyticsViewRepository repository,
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

        return Results.Ok(ComplianceAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IComplianceAnalyticsViewRepository repository,
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

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] ComplianceAnalyticsRequest request,
        int findingsSize = ComplianceAnalyticsOptions.MaxPageSize)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var findings = calculator.Findings();

        return Results.Ok(new ComplianceAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.ScoreTrend(),
            calculator.FindingsBySeverity(),
            calculator.ComplianceStatus(),
            calculator.FindingsByArea(),
            calculator.Capa(),
            calculator.Expiry(),
            findings.Take(Math.Clamp(findingsSize, 0, ComplianceAnalyticsOptions.MaxPageSize)).ToList(),
            findings.Count,
            calculator.Risks(),
            calculator.Locations(),
            calculator.Environmental(),
            calculator.Insights()));
    }

    /// <summary>
    /// Open Compliance Findings: most severe first, then soonest due. severity, status (e.g. Overdue), overdueOnly and search narrow the
    /// list; sortBy is one of /options findingSortFields.
    /// </summary>
    private static async Task<IResult> GetFindingsAsync(
        [AsParameters] ComplianceAnalyticsRequest request,
        string? search = null,
        string? severity = null,
        string? status = null,
        bool overdueOnly = false,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = ComplianceAnalyticsOptions.DefaultPageSize)
    {
        var errors = new Dictionary<string, string[]>();
        if (!string.IsNullOrWhiteSpace(severity) && !ComplianceAnalyticsOptions.RiskLevels.IsValid(severity))
        {
            errors["Severity"] = [$"Severity must be one of: {string.Join(", ", ComplianceAnalyticsOptions.RiskLevels.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortBy) && !ComplianceAnalyticsOptions.FindingSortFields.IsValid(sortBy))
        {
            errors["SortBy"] = [$"SortBy must be one of: {string.Join(", ", ComplianceAnalyticsOptions.FindingSortFields.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (page < 1)
        {
            errors["Page"] = ["Page must be 1 or more"];
        }

        if (pageSize is < 1 or > ComplianceAnalyticsOptions.MaxPageSize)
        {
            errors["PageSize"] = [$"PageSize must be between 1 and {ComplianceAnalyticsOptions.MaxPageSize}"];
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

        IEnumerable<ComplianceFindingRow> rows = calculator.Findings();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.FindingId, row.Requirement, row.Regulation, row.AssetId, row.AssetName, row.Location, row.Owner }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (ComplianceAnalyticsOptions.RiskLevels.Normalize(severity) is { } level)
        {
            rows = rows.Where(row => row.Severity == level);
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            rows = rows.Where(row => string.Equals(row.Status, status.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        if (overdueOnly)
        {
            rows = rows.Where(row => row.IsOverdue);
        }

        var field = ComplianceAnalyticsOptions.FindingSortFields.Normalize(sortBy);
        if (field is not null && field != "severity" || sortDirection is not null)
        {
            var descending = string.Equals(sortDirection?.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
            Func<ComplianceFindingRow, object?> key = field switch
            {
                "dueDate" => row => row.DueDate,
                "findingId" => row => row.FindingId,
                "requirement" => row => row.Requirement,
                "area" => row => row.Area,
                "location" => row => row.Location,
                "owner" => row => row.Owner,
                "status" => row => row.Status,
                _ => row => ComplianceAnalyticsCalculator.Rank(row.Severity)
            };
            var ordered = rows.OrderBy(row => key(row) is null);
            rows = descending ? ordered.ThenByDescending(key, Comparer<object?>.Default) : ordered.ThenBy(key, Comparer<object?>.Default);
        }

        var list = rows.ToList();

        return Results.Ok(new ComplianceFindingsResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    /// <summary>Export: an Excel workbook with a sheet per page section (format=xlsx, the default) or the open findings as CSV (format=csv).</summary>
    private static async Task<IResult> ExportAsync([AsParameters] ComplianceAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !ComplianceAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var findingHeaders = new[] { "Finding ID", "Requirement", "Regulation", "Area", "Asset ID", "Asset", "Location", "Severity", "Due Date", "Owner", "Status", "Corrective Action", "Work Order" };
        IEnumerable<object?[]> FindingRows() => calculator.Findings().Select(row => (object?[])
        [
            row.FindingId, row.Requirement, row.Regulation, row.Area, row.AssetId, row.AssetName, row.Location, row.Severity,
            row.DueDate?.ToString("yyyy-MM-dd"), row.Owner, row.Status, row.CorrectiveAction, row.WorkOrder
        ]);

        if (string.Equals(format?.Trim(), "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", findingHeaders.Select(Csv)));
            foreach (var row in FindingRows())
            {
                csv.AppendLine(string.Join(",", row.Select(value => Csv(value?.ToString()))));
            }

            return Results.File(
                Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(),
                "text/csv",
                $"compliance-analytics-open-findings-{generatedAt:yyyyMMddHHmmss}.csv");
        }

        var period = calculator.Period;
        var summary = calculator.Summary();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change", "Change Unit"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null, null],
            ["Location", filters.Location ?? "All locations", null, null, null],
            ["Compliance Area", filters.Area ?? "All areas", null, null, null],
            ["Regulation", filters.Regulation ?? "All regulations", null, null, null],
            ["Risk Level", filters.RiskLevel ?? "All risk levels", null, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null, null],
            ["Generated (UTC)", generatedAt, null, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Overall Compliance Score (%)", summary.ComplianceScore),
                ("Open Audit Findings", summary.OpenFindings),
                ("Expiring Certifications (90 days)", summary.ExpiringItems),
                ("Overdue CAPA Actions", summary.OverdueCapa),
                ("Active Compliance Risks", summary.ActiveRisks)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change, item.Kpi.ChangeUnit])
        ]);

        AddSeriesSheet(workbook, "Score Trend", calculator.ScoreTrend().Trend);
        AddSeriesSheet(workbook, "Findings by Severity", calculator.FindingsBySeverity().Trend);
        var status = calculator.ComplianceStatus();
        AddSheet(workbook, "Compliance Status", ["Status", "Assets"],
        [
            ["Compliant", status.Compliant], ["Partially Compliant", status.PartiallyCompliant], ["Non-Compliant", status.NonCompliant], ["Not Assessed", status.NotAssessed]
        ]);
        AddSheet(workbook, "Findings by Area", ["Area", "Open Findings"], calculator.FindingsByArea().Select(row => (object?[])[row.Area, row.OpenFindings]));

        var capa = calculator.Capa();
        AddSeriesSheet(workbook, "CAPA Closure", capa.Trend);
        AddSheet(workbook, "Open CAPA", ["CAPA ID", "Action", "Finding ID", "Location", "Owner", "Due Date", "Days Overdue", "Status"],
            capa.OpenActions.Select(row => (object?[]) [row.CapaId, row.Action, row.FindingId, row.Location, row.Owner, row.DueDate?.ToString("yyyy-MM-dd"), row.DaysOverdue, row.Status]));

        AddSheet(workbook, "Expiry", ["Reference", "Item", "Type", "Source", "Location", "Expires", "Days Left"],
            calculator.Expiry().Items.Select(row => (object?[]) [row.Reference, row.Name, row.Type, row.Source, row.Location, row.ExpiresAt.ToString("yyyy-MM-dd"), row.DaysLeft]));
        AddSheet(workbook, "Open Findings", findingHeaders, FindingRows());
        AddSheet(workbook, "Risks", ["Risk", "Source", "Regulation", "Area", "Location", "Level", "Owner", "Reference"],
            calculator.Risks().Select(row => (object?[]) [row.Title, row.Source, row.Regulation, row.Area, row.Location, row.Level, row.Owner, row.Reference]));
        AddSheet(workbook, "Locations", ["Location", "Score (%)", "Environmental Score (%)", "Open Findings", "Critical Findings", "Expiring Items (90 days)", "Active Risks", "Risk", "Status"],
            calculator.Locations().Select(row => (object?[])
                [row.Location, row.Score, row.EnvironmentalScore, row.OpenFindings, row.CriticalFindings, row.ExpiringItems, row.ActiveRisks, row.Risk, row.Status]));
        AddSheet(workbook, "Insights", ["Insight", "Message", "Count"], calculator.Insights().Select(row => (object?[])[row.Title, row.Message, row.Count]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"compliance-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    // ----- Action plans -----

    private static async Task<IResult> GetActionPlansAsync(
        IComplianceActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? status = null,
        string? sourceType = null,
        string? sourceId = null,
        string? location = null,
        string? search = null,
        int page = 1,
        int pageSize = ComplianceAnalyticsOptions.DefaultPageSize,
        string? tenantId = null,
        string? clientId = null)
    {
        var errors = new Dictionary<string, string[]>();
        if (!string.IsNullOrWhiteSpace(status) && !ComplianceAnalyticsOptions.ActionPlanStatuses.IsValid(status))
        {
            errors["Status"] = [$"Status must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ActionPlanStatuses.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(sourceType) && !ComplianceAnalyticsOptions.ActionPlanSources.IsValid(sourceType))
        {
            errors["SourceType"] = [$"SourceType must be one of: {string.Join(", ", ComplianceAnalyticsOptions.ActionPlanSources.All)}"];
        }

        if (page < 1)
        {
            errors["Page"] = ["Page must be 1 or more"];
        }

        if (pageSize is < 1 or > ComplianceAnalyticsOptions.MaxPageSize)
        {
            errors["PageSize"] = [$"PageSize must be between 1 and {ComplianceAnalyticsOptions.MaxPageSize}"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var (items, total) = await repository.QueryAsync(new ComplianceActionPlanQuery(
            Tenant(tenantId, currentUser),
            Client(clientId, currentUser),
            ComplianceAnalyticsOptions.ActionPlanStatuses.Normalize(status),
            ComplianceAnalyticsOptions.ActionPlanSources.Normalize(sourceType),
            sourceId,
            location,
            search,
            page,
            pageSize), cancellationToken);
        var utcNow = DateTime.UtcNow;

        return Results.Ok(new ComplianceActionPlanListResponse(items.Select(plan => ComplianceActionPlanResponse.FromEntity(plan, utcNow)).ToList(), total, page, pageSize));
    }

    private static async Task<IResult> GetActionPlanAsync(
        string actionPlanId,
        IComplianceActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken)
    {
        var plan = await repository.GetByActionPlanIdAsync(actionPlanId, cancellationToken);
        return plan is null || !SameTenant(plan, currentUserAccessor.GetCurrentUser())
            ? Results.NotFound()
            : Results.Ok(ComplianceActionPlanResponse.FromEntity(plan, DateTime.UtcNow));
    }

    private static async Task<IResult> CreateActionPlanAsync(
        SaveComplianceActionPlanRequest request,
        IComplianceActionPlanRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var utcNow = DateTime.UtcNow;
        var errors = request.Validate(false, DateOnly.FromDateTime(utcNow));
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var status = ComplianceAnalyticsOptions.ActionPlanStatuses.Normalize(request.Status) ?? "Open";
        var plan = new ComplianceActionPlan
        {
            ActionPlanId = $"CAP-{await sequenceGenerator.GetNextValueAsync(ActionPlanSequenceName, cancellationToken):D4}",
            Title = request.Title!.Trim(),
            Owner = request.Owner!.Trim(),
            DueDate = request.DueDate!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            Priority = ComplianceAnalyticsOptions.ActionPlanPriorities.Normalize(request.Priority) ?? "High",
            Notes = Trim(request.Notes),
            Context = Trim(request.Context),
            SourceType = ComplianceAnalyticsOptions.ActionPlanSources.Normalize(request.SourceType) ?? "other",
            SourceId = Trim(request.SourceId),
            Location = Trim(request.Location),
            Regulation = Trim(request.Regulation),
            CreatedById = CustomReportAccess.ViewerId(currentUser),
            CompletedAt = status == "Completed" ? utcNow : null,
            Status = status,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = Tenant(request.TenantId, currentUser),
            ClientId = Client(request.ClientId, currentUser),
            IsDeleted = false
        };

        plan = await repository.CreateAsync(plan, cancellationToken);
        await eventLogger.LogAsync(ActionPlanEntityType, plan.Id, plan.Title, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/action-plans/{plan.ActionPlanId}", ComplianceActionPlanResponse.FromEntity(plan, utcNow));
    }

    private static async Task<IResult> UpdateActionPlanAsync(
        string actionPlanId,
        SaveComplianceActionPlanRequest request,
        IComplianceActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var plan = await repository.GetByActionPlanIdAsync(actionPlanId, cancellationToken);
        if (plan is null || !SameTenant(plan, currentUser))
        {
            return Results.NotFound();
        }

        var utcNow = DateTime.UtcNow;
        var errors = request.Validate(true, DateOnly.FromDateTime(utcNow));
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var status = ComplianceAnalyticsOptions.ActionPlanStatuses.Normalize(request.Status) ?? plan.Status ?? "Open";
        plan.Title = request.Title!.Trim();
        plan.Owner = request.Owner!.Trim();
        plan.DueDate = request.DueDate!.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        plan.Priority = ComplianceAnalyticsOptions.ActionPlanPriorities.Normalize(request.Priority) ?? plan.Priority;
        plan.Notes = Trim(request.Notes);
        plan.Context = Trim(request.Context) ?? plan.Context;
        plan.SourceType = ComplianceAnalyticsOptions.ActionPlanSources.Normalize(request.SourceType) ?? plan.SourceType;
        plan.SourceId = Trim(request.SourceId) ?? plan.SourceId;
        plan.Location = Trim(request.Location) ?? plan.Location;
        plan.Regulation = Trim(request.Regulation) ?? plan.Regulation;
        plan.CompletedAt = status == "Completed" ? plan.CompletedAt ?? utcNow : null;
        plan.Status = status;
        plan.UpdatedBy = currentUser?.UserName;
        plan.UpdatedAt = utcNow;

        if (!await repository.UpdateAsync(plan.Id, plan, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ActionPlanEntityType, plan.Id, plan.Title, EventAction.Updated, cancellationToken);

        return Results.Ok(ComplianceActionPlanResponse.FromEntity(plan, utcNow));
    }

    private static async Task<IResult> DeleteActionPlanAsync(
        string actionPlanId,
        IComplianceActionPlanRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var plan = await repository.GetByActionPlanIdAsync(actionPlanId, cancellationToken);
        if (plan is null || !SameTenant(plan, currentUserAccessor.GetCurrentUser()) || !await repository.DeleteAsync(plan.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(ActionPlanEntityType, plan.Id, plan.Title, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    // ----- Helpers -----

    private static async Task<IResult> Section<T>(ComplianceAnalyticsRequest request, Func<ComplianceAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new ComplianceAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>Applies the saved view, then the query values, checks them and reads the records.</summary>
    private static async Task<(ComplianceAnalyticsCalculator? Calculator, ComplianceAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        ComplianceAnalyticsRequest request)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new ComplianceAnalyticsFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(ComplianceAnalyticsOptions.AllComplianceViewId, StringComparison.OrdinalIgnoreCase))
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
                    : saved.DatePreset ?? ComplianceAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");

        var area = Pick(request.Area, saved.ComplianceArea);
        var regulation = Pick(request.Regulation, saved.Regulation);
        var riskLevel = Pick(request.RiskLevel, saved.RiskLevel);
        ComplianceAnalyticsValidationExtensions.ValidateComplianceFilters(errors, string.Empty, area, regulation, riskLevel);

        if (request.ScoreTarget is < 0 or > 100)
        {
            errors["ScoreTarget"] = ["ScoreTarget must be between 0 and 100"];
        }

        if (request.CapaTarget is < 0 or > 100)
        {
            errors["CapaTarget"] = ["CapaTarget must be between 0 and 100"];
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
            null);
        var settings = new ComplianceAnalyticsSettings(
            ComplianceAnalyticsOptions.Areas.Normalize(area),
            regulation,
            ComplianceAnalyticsOptions.RiskLevels.Normalize(riskLevel),
            request.ScoreTarget ?? ComplianceAnalyticsOptions.DefaultScoreTarget,
            request.CapaTarget ?? ComplianceAnalyticsOptions.DefaultCapaTarget);

        var calculator = await ComplianceAnalyticsCalculator.LoadAsync(
            request.DataRepository, request.DashboardRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new ComplianceAnalyticsAppliedFilters(
            viewId ?? ComplianceAnalyticsOptions.AllComplianceViewId,
            scope.Organization,
            scope.Location,
            settings.Area,
            settings.Regulation,
            settings.RiskLevel,
            settings.ScoreTarget,
            settings.CapaTarget), null);
    }

    private static async Task<bool> NameTakenAsync(
        IComplianceAnalyticsViewRepository repository,
        string? ownerId,
        string? tenantId,
        string? clientId,
        string name,
        string? exceptId,
        CancellationToken cancellationToken) =>
        (await repository.GetOwnedAsync(ownerId, tenantId, clientId, cancellationToken))
            .Any(view => view.Id != exceptId && string.Equals(view.ViewName, name.Trim(), StringComparison.OrdinalIgnoreCase));

    private static bool SameTenant(BaseEntity entity, CurrentUser? currentUser) =>
        string.IsNullOrWhiteSpace(currentUser?.TenantId) || string.Equals(entity.TenantId, currentUser.TenantId, StringComparison.OrdinalIgnoreCase);

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

    /// <summary>A quoted CSV cell; formula-looking text is neutralised.</summary>
    private static string Csv(string? value)
    {
        var text = value ?? string.Empty;
        if (text.Length > 0 && "=+-@".Contains(text[0]))
        {
            text = "'" + text;
        }

        return $"\"{text.Replace("\"", "\"\"")}\"";
    }

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}
