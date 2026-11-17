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
/// Reports &amp; Analytics / Financial Analytics: asset value, CAPEX / OPEX, maintenance spend, depreciation, total cost of ownership, budget vs
/// actual per cost center and CAPEX approvals, worked out from the asset register, Maintenance cost records and work orders and the Master Data
/// departments. Data endpoints take the filter bar as query values.
/// </summary>
public static class FinancialAnalyticsEndpoints
{
    internal const string EntityType = "FinancialAnalyticsView";
    internal const string CapexEntityType = "FinancialAnalyticsCapexRequest";
    private const string BasePath = "/api/financial-analytics";
    private const string SequenceName = "financial_analytics_view";
    private const string CapexSequenceName = "financial_analytics_capex_request";

    /// <summary>Saved views of this page in the shared AssetPerformanceView collection.</summary>
    public const string Page = "financial-analytics";

    public static RouteGroupBuilder MapFinancialAnalyticsEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup(BasePath).WithTags("Financial Analytics");

        // Page furniture: dropdown values, the Organization / Location / Asset Category filters and the cost centers.
        group.MapGet("/options", GetOptions).WithName("GetFinancialAnalyticsOptions");
        group.MapGet("/filters", GetFiltersAsync).WithName("GetFinancialAnalyticsFilters");
        group.MapGet("/cost-centers", GetCostCenterOptionsAsync).WithName("GetFinancialAnalyticsCostCenterOptions");

        // Save View and the saved views.
        group.MapGet("/views", GetViewsAsync).WithName("GetFinancialAnalyticsViews");
        group.MapPost("/views", CreateViewAsync).WithName("CreateFinancialAnalyticsView");
        group.MapPut("/views/{viewId}", UpdateViewAsync).WithName("UpdateFinancialAnalyticsView");
        group.MapDelete("/views/{viewId}", DeleteViewAsync).WithName("DeleteFinancialAnalyticsView");

        // The whole page in one call, and each section on its own.
        group.MapGet("/overview", GetOverviewAsync).WithName("GetFinancialAnalyticsOverview");
        group.MapGet("/summary", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.Summary())).WithName("GetFinancialSummary");
        group.MapGet("/tco-trend", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.TcoTrend())).WithName("GetFinancialTcoTrend");
        group.MapGet("/budget-vs-actual", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.CostCenters())).WithName("GetFinancialBudgetVsActual");
        group.MapGet("/cost-by-category", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.CategoryCosts())).WithName("GetFinancialCostByCategory");
        group.MapGet("/depreciation", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.Depreciation())).WithName("GetFinancialDepreciation");
        group.MapGet("/budget-utilization", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.BudgetUtilization())).WithName("GetFinancialBudgetUtilization");
        group.MapGet("/maintenance-by-location", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.SiteMaintenance())).WithName("GetFinancialMaintenanceByLocation");
        group.MapGet("/cost-centers/performance", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.CostCenters())).WithName("GetFinancialCostCenterPerformance");
        group.MapGet("/disposal-candidates", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.DisposalCandidates())).WithName("GetFinancialDisposalCandidates");
        group.MapGet("/insights", ([AsParameters] FinancialAnalyticsRequest request) => Section(request, calculator => calculator.Insights())).WithName("GetFinancialInsights");
        group.MapGet("/assets", GetAssetsAsync).WithName("GetFinancialHighestCostAssets");

        // CAPEX requests and CAPEX Approvals.
        group.MapGet("/capex-requests", GetCapexRequestsAsync).WithName("GetFinancialCapexRequests");
        group.MapGet("/capex-requests/{requestId}", GetCapexRequestAsync).WithName("GetFinancialCapexRequest");
        group.MapPost("/capex-requests", CreateCapexRequestAsync).WithName("CreateFinancialCapexRequest");
        group.MapPut("/capex-requests/{requestId}", UpdateCapexRequestAsync).WithName("UpdateFinancialCapexRequest");
        group.MapDelete("/capex-requests/{requestId}", DeleteCapexRequestAsync).WithName("DeleteFinancialCapexRequest");
        group.MapPost("/capex-requests/decisions", DecideCapexRequestsAsync).WithName("DecideFinancialCapexRequests");

        // Export.
        group.MapGet("/export", ExportAsync).WithName("ExportFinancialAnalytics");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new FinancialAnalyticsOptionsResponse(
        InteractiveDashboardOptions.DatePresets.All,
        FinancialAnalyticsOptions.DefaultDatePreset,
        FinancialAnalyticsOptions.BaseCurrency,
        FinancialAnalyticsCalculator.CostCenterStatuses,
        FinancialAnalyticsOptions.CapexStatuses.All,
        FinancialAnalyticsOptions.CapexDecisions.All,
        FinancialAnalyticsOptions.ExportFormats.All,
        FinancialAnalyticsOptions.DefaultBudgetTarget,
        FinancialAnalyticsOptions.DefaultUsefulLifeYears,
        FinancialAnalyticsOptions.DefaultMaintenanceRatioLimit,
        FinancialAnalyticsOptions.DefaultUtilizationThreshold));

    /// <summary>Organization, Location, Asset Category and Asset Type values.</summary>
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

    /// <summary>Cost Center values: Master Data departments (cost center, else code) and any other cost center or department recorded on an asset or work order.</summary>
    private static async Task<IResult> GetCostCenterOptionsAsync(
        IFinancialAnalyticsDataRepository financialRepository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? tenantId = null,
        string? clientId = null)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var tenant = Tenant(tenantId, currentUser);
        var client = Client(clientId, currentUser);
        var departments = await financialRepository.GetCostCentersAsync(tenant, client, cancellationToken);
        var assets = await financialRepository.GetAssetFinancialsAsync(tenant, client, null, cancellationToken);

        var options = departments
            .Select(department => (Code: department.CostCenter ?? department.Code ?? department.Name, Name: department.Name ?? department.CostCenter ?? department.Code,
                department.AnnualBudget, Names: new[] { department.CostCenter, department.Code, department.Name }))
            .Where(option => option.Code is not null)
            .Select(option => new FinancialCostCenterOption(option.Code!, option.Code == option.Name ? option.Code! : $"{option.Code} {option.Name}", option.AnnualBudget))
            .ToList();
        var known = departments.SelectMany(department => new[] { department.CostCenter, department.Code, department.Name }).OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var workOrders = await financialRepository.GetWorkOrderCostsAsync(tenant, client, null, null, cancellationToken);

        options.AddRange(assets
            .Select(asset => asset.CostCenter ?? asset.Department)
            .Concat(workOrders.Select(workOrder => workOrder.Department))
            .OfType<string>()
            .Where(value => !known.Contains(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(value => new FinancialCostCenterOption(value, value, null)));

        return Results.Ok(options
            .GroupBy(option => option.Value, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(option => option.Value, StringComparer.OrdinalIgnoreCase)
            .ToList());
    }

    /// <summary>The built-in All Financials view first, then the user's saved views.</summary>
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

        return Results.Ok(new[] { FinancialAnalyticsViewResponse.AllFinancial(views.All(view => !view.IsDefault)) }
            .Concat(views.Select(FinancialAnalyticsViewResponse.FromEntity))
            .ToList());
    }

    /// <summary>Save View: the current filter bar under a name. Views belong to the signed-in user.</summary>
    private static async Task<IResult> CreateViewAsync(
        SaveFinancialAnalyticsViewRequest request,
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
            ViewId = $"FAV-{await sequenceGenerator.GetNextValueAsync(SequenceName, cancellationToken):D4}",
            Page = Page,
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
            await repository.ClearDefaultAsync(Page, viewerId, tenantId, clientId, view.Id, cancellationToken);
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/views/{view.ViewId}", FinancialAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> UpdateViewAsync(
        string viewId,
        SaveFinancialAnalyticsViewRequest request,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var currentUser = currentUserAccessor.GetCurrentUser();
        var viewerId = CustomReportAccess.ViewerId(currentUser);
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != viewerId || view.Page != Page)
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

        return Results.Ok(FinancialAnalyticsViewResponse.FromEntity(view));
    }

    private static async Task<IResult> DeleteViewAsync(
        string viewId,
        IAssetPerformanceViewRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var view = await repository.GetByViewIdAsync(viewId, cancellationToken);
        if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUserAccessor.GetCurrentUser()) || view.Page != Page
            || !await repository.DeleteAsync(view.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(EntityType, view.Id, view.ViewName, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> GetOverviewAsync(
        [AsParameters] FinancialAnalyticsRequest request,
        int assetLimit = FinancialAnalyticsOptions.DefaultAssetLimit)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var assets = calculator.Assets();

        return Results.Ok(new FinancialAnalyticsOverviewResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            calculator.Summary(),
            calculator.TcoTrend(),
            calculator.CategoryCosts(),
            calculator.Depreciation(),
            calculator.CostCenters(),
            calculator.BudgetUtilization(),
            calculator.SiteMaintenance(),
            assets.Take(Math.Clamp(assetLimit, 0, FinancialAnalyticsOptions.MaxAssetLimit)).ToList(),
            assets.Count,
            calculator.CapexRequests(),
            calculator.DisposalCandidates(),
            calculator.Insights()));
    }

    /// <summary>
    /// Highest Cost Assets, highest TCO first. sortBy is tco, acquisition, maintenance, depreciation, costPerHour or maintenanceRatio;
    /// maintenanceRatioAbove keeps assets above that maintenance-to-acquisition percentage (the threshold insight).
    /// </summary>
    private static async Task<IResult> GetAssetsAsync(
        [AsParameters] FinancialAnalyticsRequest request,
        string? search = null,
        double? maintenanceRatioAbove = null,
        string? sortBy = null,
        string? sortDirection = null,
        int page = 1,
        int pageSize = FinancialAnalyticsOptions.DefaultAssetLimit)
    {
        var sortFields = new OptionList("tco", "acquisition", "maintenance", "depreciation", "costPerHour", "maintenanceRatio");
        var errors = new Dictionary<string, string[]>();
        if (!string.IsNullOrWhiteSpace(sortBy) && !sortFields.IsValid(sortBy))
        {
            errors["SortBy"] = [$"SortBy must be one of: {string.Join(", ", sortFields.All)}"];
        }

        if (!string.IsNullOrWhiteSpace(sortDirection) && sortDirection.Trim().ToLowerInvariant() is not ("asc" or "desc"))
        {
            errors["SortDirection"] = ["SortDirection must be asc or desc"];
        }

        if (maintenanceRatioAbove is < 0)
        {
            errors["MaintenanceRatioAbove"] = ["MaintenanceRatioAbove must be 0 or more"];
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

        IEnumerable<FinancialAssetRow> rows = calculator.Assets();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            rows = rows.Where(row => new[] { row.AssetId, row.AssetName, row.Category, row.Location, row.CostCenter }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        if (maintenanceRatioAbove is not null)
        {
            rows = rows.Where(row => row.MaintenanceRatio > maintenanceRatioAbove);
        }

        Func<FinancialAssetRow, double?> key = sortFields.Normalize(sortBy) switch
        {
            "acquisition" => row => row.Acquisition,
            "maintenance" => row => row.Maintenance,
            "depreciation" => row => row.Depreciation,
            "costPerHour" => row => row.CostPerHour,
            "maintenanceRatio" => row => row.MaintenanceRatio,
            _ => row => row.Tco
        };
        var ascending = string.Equals(sortDirection?.Trim(), "asc", StringComparison.OrdinalIgnoreCase);
        var ordered = rows.OrderBy(row => key(row) is null);
        var list = (ascending ? ordered.ThenBy(key) : ordered.ThenByDescending(key)).ToList();

        page = page < 1 ? 1 : page;
        pageSize = pageSize < 1 || pageSize > FinancialAnalyticsOptions.MaxAssetLimit ? FinancialAnalyticsOptions.DefaultAssetLimit : pageSize;

        return Results.Ok(new FinancialAssetsResponse(
            DateTime.UtcNow,
            filters!,
            DashboardPeriodResponse.FromPeriod(calculator.Period),
            list.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
            list.Count,
            page,
            pageSize));
    }

    // ===== CAPEX requests =====

    /// <summary>The tenant's CAPEX requests, newest first; status narrows them (pending = Pending and More Info Requested).</summary>
    private static async Task<IResult> GetCapexRequestsAsync(
        IFinancialAnalyticsCapexRequestRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        CancellationToken cancellationToken,
        string? status = null,
        string? search = null,
        string? tenantId = null,
        string? clientId = null)
    {
        IReadOnlyCollection<string>? statuses = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            if (status.Trim().Equals("pending", StringComparison.OrdinalIgnoreCase))
            {
                statuses = FinancialAnalyticsCapexRequestRepository.OpenStatuses.ToList();
            }
            else if (FinancialAnalyticsOptions.CapexStatuses.Normalize(status) is { } value)
            {
                statuses = [value];
            }
            else
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["Status"] = [$"Status must be pending or one of: {string.Join(", ", FinancialAnalyticsOptions.CapexStatuses.All)}"]
                });
            }
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        IEnumerable<FinancialAnalyticsCapexRequest> requests =
            await repository.ListAsync(Tenant(tenantId, currentUser), Client(clientId, currentUser), statuses, cancellationToken);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            requests = requests.Where(request => new[] { request.RequestId, request.Title, request.AssetId, request.AssetName, request.Location, request.RequestedBy }
                .Any(value => value?.Contains(term, StringComparison.OrdinalIgnoreCase) == true));
        }

        return Results.Ok(requests.Select(FinancialCapexRequestRow.FromEntity).ToList());
    }

    private static async Task<IResult> GetCapexRequestAsync(string requestId, IFinancialAnalyticsCapexRequestRepository repository, CancellationToken cancellationToken)
    {
        var request = await repository.GetByRequestIdAsync(requestId, cancellationToken);
        return request is null ? Results.NotFound() : Results.Ok(FinancialCapexRequestRow.FromEntity(request));
    }

    private static async Task<IResult> CreateCapexRequestAsync(
        SaveFinancialCapexRequest body,
        IFinancialAnalyticsCapexRequestRepository repository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = body.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        var utcNow = DateTime.UtcNow;
        var submitted = body.SubmittedAt?.ToUniversalTime() ?? utcNow;
        var request = new FinancialAnalyticsCapexRequest
        {
            RequestId = $"CPX-{submitted.Year}-{await sequenceGenerator.GetNextValueAsync(CapexSequenceName, cancellationToken):D4}",
            SubmittedAt = submitted,
            Status = FinancialAnalyticsCapexRequestRepository.PendingStatus,
            CreatedBy = currentUser?.UserName,
            CreatedAt = utcNow,
            UpdatedBy = currentUser?.UserName,
            UpdatedAt = utcNow,
            TenantId = Tenant(body.TenantId, currentUser),
            ClientId = Client(body.ClientId, currentUser),
            IsDeleted = false
        };
        Apply(request, body, currentUser);

        request = await repository.CreateAsync(request, cancellationToken);
        await eventLogger.LogAsync(CapexEntityType, request.Id, request.RequestId, EventAction.Created, cancellationToken);

        return Results.Created($"{BasePath}/capex-requests/{request.RequestId}", FinancialCapexRequestRow.FromEntity(request));
    }

    /// <summary>Edits a request that is still pending; decided requests are closed.</summary>
    private static async Task<IResult> UpdateCapexRequestAsync(
        string requestId,
        SaveFinancialCapexRequest body,
        IFinancialAnalyticsCapexRequestRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var request = await repository.GetByRequestIdAsync(requestId, cancellationToken);
        if (request is null)
        {
            return Results.NotFound();
        }

        var errors = body.Validate();
        if (!FinancialAnalyticsCapexRequestRepository.OpenStatuses.Contains(request.Status ?? FinancialAnalyticsCapexRequestRepository.PendingStatus))
        {
            errors["Status"] = [$"Request {request.RequestId} is {request.Status} and can no longer be edited"];
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var currentUser = currentUserAccessor.GetCurrentUser();
        Apply(request, body, currentUser);
        if (body.SubmittedAt is { } submitted)
        {
            request.SubmittedAt = submitted.ToUniversalTime();
        }

        request.UpdatedBy = currentUser?.UserName;
        request.UpdatedAt = DateTime.UtcNow;

        if (!await repository.UpdateAsync(request.Id, request, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(CapexEntityType, request.Id, request.RequestId, EventAction.Updated, cancellationToken);

        return Results.Ok(FinancialCapexRequestRow.FromEntity(request));
    }

    private static async Task<IResult> DeleteCapexRequestAsync(
        string requestId,
        IFinancialAnalyticsCapexRequestRepository repository,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var request = await repository.GetByRequestIdAsync(requestId, cancellationToken);
        if (request is null || !await repository.DeleteAsync(request.Id, cancellationToken))
        {
            return Results.NotFound();
        }

        await eventLogger.LogAsync(CapexEntityType, request.Id, request.RequestId, EventAction.Deleted, cancellationToken);

        return Results.NoContent();
    }

    /// <summary>
    /// CAPEX Approvals: Approve or Reject closes the requests; Request more information keeps them pending as More Info Requested.
    /// Every request must exist and still be pending, otherwise nothing is changed.
    /// </summary>
    private static async Task<IResult> DecideCapexRequestsAsync(
        FinancialCapexDecisionRequest body,
        IFinancialAnalyticsCapexRequestRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var errors = body.Validate();
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var requests = new List<FinancialAnalyticsCapexRequest>();
        foreach (var requestId in body.RequestIds!.Select(id => id.Trim()).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var request = await repository.GetByRequestIdAsync(requestId, cancellationToken);
            if (request is null)
            {
                errors[$"RequestIds"] = [$"Request '{requestId}' was not found"];
                break;
            }

            if (!FinancialAnalyticsCapexRequestRepository.OpenStatuses.Contains(request.Status ?? FinancialAnalyticsCapexRequestRepository.PendingStatus))
            {
                errors["RequestIds"] = [$"Request {request.RequestId} is already {request.Status}"];
                break;
            }

            requests.Add(request);
        }

        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var decision = FinancialAnalyticsOptions.CapexDecisions.Normalize(body.Decision)!;
        var status = decision switch
        {
            "Approve" => FinancialAnalyticsCapexRequestRepository.ApprovedStatus,
            "Reject" => FinancialAnalyticsCapexRequestRepository.RejectedStatus,
            _ => FinancialAnalyticsCapexRequestRepository.MoreInfoStatus
        };
        var currentUser = currentUserAccessor.GetCurrentUser();
        var utcNow = DateTime.UtcNow;

        foreach (var request in requests)
        {
            request.Decisions.Add(new FinancialAnalyticsCapexDecision
            {
                Decision = decision,
                Approver = string.IsNullOrWhiteSpace(body.Approver) ? currentUser?.UserName : body.Approver.Trim(),
                Comments = body.Comments!.Trim(),
                DecidedBy = currentUser?.UserName,
                DecidedAt = utcNow
            });
            request.Status = status;
            request.UpdatedBy = currentUser?.UserName;
            request.UpdatedAt = utcNow;

            await repository.UpdateAsync(request.Id, request, cancellationToken);
            await eventLogger.LogAsync(CapexEntityType, request.Id, request.RequestId, EventAction.Updated, cancellationToken);
        }

        return Results.Ok(new FinancialCapexDecisionResponse(decision, status, requests.Select(FinancialCapexRequestRow.FromEntity).ToList()));
    }

    private static void Apply(FinancialAnalyticsCapexRequest request, SaveFinancialCapexRequest body, CurrentUser? currentUser)
    {
        static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

        request.Title = body.Title!.Trim();
        request.AssetId = Clean(body.AssetId);
        request.AssetName = Clean(body.AssetName);
        request.Location = Clean(body.Location);
        request.Category = Clean(body.Category);
        request.CostCenter = Clean(body.CostCenter);
        request.Amount = Math.Round(body.Amount!.Value, 2);
        request.Currency = Clean(body.Currency)?.ToUpperInvariant() ?? FinancialAnalyticsOptions.BaseCurrency;
        request.Justification = Clean(body.Justification);
        request.RequestedBy = Clean(body.RequestedBy) ?? request.RequestedBy ?? currentUser?.UserName;
    }

    // ===== Export =====

    /// <summary>Export: an Excel workbook with a sheet per page section, or (format=csv) the Highest Cost Assets table.</summary>
    private static async Task<IResult> ExportAsync([AsParameters] FinancialAnalyticsRequest request, string? format = null)
    {
        if (!string.IsNullOrWhiteSpace(format) && !FinancialAnalyticsOptions.ExportFormats.IsValid(format))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["Format"] = [$"Format must be one of: {string.Join(", ", FinancialAnalyticsOptions.ExportFormats.All)}"]
            });
        }

        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        var generatedAt = DateTime.UtcNow;
        var assets = calculator.Assets();
        string[] assetHeaders =
        [
            "Asset ID", "Asset Name", "Category", "Location", "Cost Center", "Acquisition", "Maintenance (to date)", "Maintenance (period)",
            "Accumulated Depreciation", "Net Book Value", "TCO", "Operating Hours", "Cost per Op. Hour", "Maintenance / Acquisition (%)",
            "Useful Life (months)", "Useful Life Source"
        ];
        object?[] AssetValues(FinancialAssetRow row) =>
        [
            row.AssetId, row.AssetName, row.Category, row.Location, row.CostCenter, row.Acquisition, row.Maintenance, row.PeriodMaintenance,
            row.Depreciation, row.NetBookValue, row.Tco, row.OperatingHours, row.CostPerHour, row.MaintenanceRatio, row.UsefulLifeMonths, row.UsefulLifeSource
        ];

        if (string.Equals(format?.Trim(), "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", assetHeaders.Select(Csv)));
            foreach (var row in assets)
            {
                csv.AppendLine(string.Join(",", AssetValues(row).Select(value => Csv(value))));
            }

            return Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray(), "text/csv",
                $"financial-analytics-assets-{generatedAt:yyyyMMddHHmmss}.csv");
        }

        var period = calculator.Period;
        var summary = calculator.Summary();
        using var workbook = new XLWorkbook();

        AddSheet(workbook, "Summary", ["Item", "Value", "Previous Period", "Change (%)"],
        [
            ["Organization", filters!.Organization ?? "All organizations", null, null],
            ["Location", filters.Location ?? "All locations", null, null],
            ["Asset Category", filters.Category ?? "All categories", null, null],
            ["Cost Center", filters.CostCenter ?? "All cost centers", null, null],
            ["Currency", filters.Currency, null, null],
            ["Period", $"{period.From:dd MMM yyyy} – {period.To:dd MMM yyyy} ({period.Preset}, {period.TimeZone})", null, null],
            ["Generated (UTC)", generatedAt, null, null],
            .. new (string Label, KpiWidgetData Kpi)[]
            {
                ("Total Asset Value", summary.TotalAssetValue),
                ("Maintenance Spend", summary.MaintenanceSpend),
                ("CAPEX", summary.Capex),
                ("OPEX (maintenance + depreciation)", summary.Opex),
                ("Net Book Value", summary.NetBookValue)
            }.Select(item => (object?[])[item.Label, item.Kpi.Value, item.Kpi.PreviousValue, item.Kpi.Change])
        ]);

        AddSeriesSheet(workbook, "TCO Trend", calculator.TcoTrend().Trend);
        AddSheet(workbook, "Budget vs Actual", ["Cost Center", "Name", "Budget", "Budget Source", "Actual", "Maintenance", "CAPEX", "Variance", "Utilization (%)", "Status"],
            calculator.CostCenters().Select(row => (object?[])
            [
                row.Code, row.Name, row.Budget, row.BudgetSource, row.Actual, row.Maintenance, row.Capex, row.Variance, row.Utilization, row.Status
            ]));
        AddSheet(workbook, "Cost by Category", ["Category", "Acquisition", "Maintenance", "Total", "Percentage"],
            calculator.CategoryCosts().Items.Select(row => (object?[])[row.Category, row.Acquisition, row.Maintenance, row.Total, row.Percentage]));
        AddSeriesSheet(workbook, "Depreciation", calculator.Depreciation().Trend);

        var budget = calculator.BudgetUtilization();
        AddSheet(workbook, "Budget Utilization", ["Current Spend", "Total Budget", "Remaining Budget", "Utilization (%)", "Target (%)"],
            [[budget.Spend, budget.Budget, budget.Remaining, budget.Utilization, budget.Target]]);
        AddSheet(workbook, "Maintenance by Location", ["Location", "Labor", "Parts", "Contractor", "Total"],
            calculator.SiteMaintenance().Select(row => (object?[])[row.Site, row.Labour, row.Parts, row.Contractor, row.Total]));
        AddSheet(workbook, "Highest Cost Assets", assetHeaders, assets.Select(AssetValues));
        AddSheet(workbook, "CAPEX Pending", ["Request", "Title", "Asset", "Location", "Category", "Cost Center", "Amount", "Currency", "Requested By", "Submitted", "Status"],
            calculator.CapexRequests().Select(row => (object?[])
            [
                row.RequestId, row.Title, row.AssetName ?? row.AssetId, row.Location, row.Category, row.CostCenter, row.Amount, row.Currency, row.RequestedBy,
                row.SubmittedAt, row.Status
            ]));
        AddSheet(workbook, "Disposal Candidates", ["Asset ID", "Asset Name", "Category", "Location", "Utilization (%)", "Recoverable Value (NBV)"],
            calculator.DisposalCandidates().Select(row => (object?[])[row.AssetId, row.AssetName, row.Category, row.Location, row.Utilization, row.RecoverableValue]));
        AddSheet(workbook, "Insights", ["Insight", "Severity", "Message", "Count", "Amount"],
            calculator.Insights().Select(row => (object?[])[row.Title, row.Severity, row.Message, row.Count, row.Amount]));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        return Results.File(
            stream.ToArray(),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            $"financial-analytics-{generatedAt:yyyyMMddHHmmss}.xlsx");
    }

    private static async Task<IResult> Section<T>(FinancialAnalyticsRequest request, Func<FinancialAnalyticsCalculator, T> build)
    {
        var (calculator, filters, problem) = await LoadAsync(request);
        if (calculator is null)
        {
            return problem!;
        }

        return Results.Ok(new FinancialAnalyticsSection<T>(DateTime.UtcNow, filters!, DashboardPeriodResponse.FromPeriod(calculator.Period), build(calculator)));
    }

    /// <summary>Applies the saved view, then the query values, checks them and reads the records.</summary>
    private static async Task<(FinancialAnalyticsCalculator? Calculator, FinancialAnalyticsAppliedFilters? Filters, IResult? Problem)> LoadAsync(
        FinancialAnalyticsRequest request)
    {
        var currentUser = request.CurrentUserAccessor.GetCurrentUser();
        var saved = new AssetPerformanceFilters();
        string? viewId = null;
        var errors = new Dictionary<string, string[]>();

        if (!string.IsNullOrWhiteSpace(request.ViewId)
            && !request.ViewId.Trim().Equals(FinancialAnalyticsOptions.AllFinancialViewId, StringComparison.OrdinalIgnoreCase))
        {
            var view = await request.ViewRepository.GetByViewIdAsync(request.ViewId, request.CancellationToken);
            if (view is null || view.OwnerId != CustomReportAccess.ViewerId(currentUser) || view.Page != Page)
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
                    : saved.DatePreset ?? FinancialAnalyticsOptions.DefaultDatePreset,
            request.From ?? (saved.DateFrom is null ? null : DateOnly.FromDateTime(saved.DateFrom.Value)),
            request.To ?? (saved.DateTo is null ? null : DateOnly.FromDateTime(saved.DateTo.Value)),
            string.IsNullOrWhiteSpace(request.TimeZone) ? saved.TimeZone : request.TimeZone);

        dates.ValidateFilters(errors, "Filters");
        request.ValidateSettings(errors);

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
            Pick(request.Category, saved.AssetCategory));
        var settings = new FinancialAnalyticsSettings(
            InteractiveDashboardMappings.FilterValue(request.CostCenter),
            request.BudgetTarget ?? FinancialAnalyticsOptions.DefaultBudgetTarget,
            request.DefaultUsefulLifeYears ?? FinancialAnalyticsOptions.DefaultUsefulLifeYears,
            request.MaintenanceRatioLimit ?? FinancialAnalyticsOptions.DefaultMaintenanceRatioLimit,
            request.UtilizationThreshold ?? FinancialAnalyticsOptions.DefaultUtilizationThreshold);

        var calculator = await FinancialAnalyticsCalculator.LoadAsync(
            request.DataRepository, request.FinancialRepository, request.CapexRepository, scope, period, settings, utcNow, request.CancellationToken);

        return (calculator, new FinancialAnalyticsAppliedFilters(
            viewId ?? FinancialAnalyticsOptions.AllFinancialViewId,
            scope.Organization,
            scope.Location,
            scope.AssetCategory,
            settings.CostCenter,
            FinancialAnalyticsOptions.BaseCurrency,
            settings.BudgetTarget,
            settings.DefaultUsefulLifeYears,
            settings.MaintenanceRatioLimit,
            settings.UtilizationThreshold), null);
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

    private static string Csv(object? value)
    {
        var text = value switch
        {
            null => string.Empty,
            double number => number.ToString(CultureInfo.InvariantCulture),
            int number => number.ToString(CultureInfo.InvariantCulture),
            _ => value.ToString() ?? string.Empty
        };

        // Guard against formula injection in spreadsheet apps, then quote when needed.
        if (text.Length > 0 && value is string && "=+-@".Contains(text[0]))
        {
            text = "'" + text;
        }

        return text.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }

    private static string? Tenant(string? tenantId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(tenantId) ? currentUser?.TenantId : tenantId;

    private static string? Client(string? clientId, CurrentUser? currentUser) => string.IsNullOrWhiteSpace(clientId) ? currentUser?.ClientId : clientId;
}
