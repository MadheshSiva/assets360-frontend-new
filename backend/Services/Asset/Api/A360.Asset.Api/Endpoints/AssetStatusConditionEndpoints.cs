using A360.Asset.Api.Contracts;
using A360.Asset.Domain.Entities;
using A360.Asset.Repository.Repositories;
using A360.Domain.Entities;
using A360.Repository.Activity;
using A360.Repository.Sequences;
using A360.Security;

namespace A360.Asset.Api.Endpoints;

/// <summary>
/// Asset Status &amp; Condition menu page (summary cards, Asset Summary, Change History) and the
/// Update Asset Status &amp; Condition page (draft, submit, approval levels).
/// </summary>
/// <remarks>
/// The asset registration keeps the current status and condition (basic_information.status / condition).
/// It is changed only when the last approval level approves a change; that also records a condition
/// assessment so the asset's Status &amp; Condition tab shows it.
/// </remarks>
public static class AssetStatusConditionEndpoints
{
    private const string EntityType = "AssetStatusConditionChange";
    private const string SequencePrefix = "asset-status-condition-";
    private const string NumberPrefix = "SCC-";
    private const int RemarksMaxLength = 500;
    private const int TextMaxLength = 200;
    private const int MaxEvidence = 20;
    private const int AssetPageSizeMax = 100;
    private const int LookupLimit = 200;

    public static RouteGroupBuilder MapAssetStatusConditionEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/asset-status-condition").WithTags("Asset Status & Condition");

        group.MapGet("/options", GetOptions).WithName("GetAssetStatusConditionOptions");
        group.MapGet("/summary", GetSummaryAsync).WithName("GetAssetStatusConditionSummary");
        group.MapGet("/assets", GetAssetsAsync).WithName("GetAssetStatusConditionAssets");
        group.MapGet("/assets/{assetRegistrationId}", GetAssetAsync).WithName("GetAssetStatusConditionAsset");
        group.MapGet("/assets/{assetRegistrationId}/lookups", GetLookupsAsync).WithName("GetAssetStatusConditionLookups");
        group.MapGet("/changes", GetChangesAsync).WithName("GetAssetStatusConditionChanges");
        group.MapGet("/changes/{id}", GetChangeAsync).WithName("GetAssetStatusConditionChange");
        group.MapPost("/changes", CreateChangeAsync).WithName("CreateAssetStatusConditionChange");
        group.MapPut("/changes/{id}", UpdateChangeAsync).WithName("UpdateAssetStatusConditionChange");
        group.MapDelete("/changes/{id}", DeleteDraftAsync).WithName("DeleteAssetStatusConditionChange");
        group.MapPost("/changes/{id}/approve", ApproveAsync).WithName("ApproveAssetStatusConditionChange");
        group.MapPost("/changes/{id}/reject", RejectAsync).WithName("RejectAssetStatusConditionChange");

        return group;
    }

    private static IResult GetOptions() => Results.Ok(new AssetStatusConditionOptionsResponse(
        AssetStatusConditionOptions.Statuses.All,
        AssetStatusConditionOptions.Conditions.All,
        AssetStatusConditionOptions.States.All,
        AssetStatusConditionOptions.Reasons.All,
        AssetStatusConditionOptions.AssessmentMethods.All,
        AssetStatusConditionOptions.AssessmentSources.All,
        AssetStatusConditionOptions.OperationalImpacts.All,
        AssetStatusConditionOptions.DowntimeUnits.All,
        AssetStatusConditionOptions.ApprovalLevels.Select(l => new AssetStatusConditionApprovalLevelOption(l.Level, l.Role)).ToList(),
        AssetStatusConditionOptions.ReasonsByStatus,
        AssetStatusConditionOptions.ImpactsByStatus,
        AssetStatusConditionOptions.MethodsBySource));

    /// <summary>
    /// Dropdown data of the update page tied to the asset: its Maintenance work orders and Inspection types / tasks
    /// (Related Work Order, Related Inspection) and the active failure reasons (Reason / Failure Code).
    /// </summary>
    private static async Task<IResult> GetLookupsAsync(
        string assetRegistrationId,
        IAssetRegistrationRepository assetRepository,
        IStatusConditionLookupRepository lookupRepository,
        CancellationToken cancellationToken)
    {
        var asset = await FindAssetAsync(assetRegistrationId, assetRepository, cancellationToken);
        if (asset is null)
        {
            return AssetNotFound(assetRegistrationId);
        }

        var keys = new[] { asset.AssetRegistrationId, asset.BasicInformation.AssetTag }
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var workOrders = await lookupRepository.FindWorkOrdersAsync(keys, LookupLimit, cancellationToken);
        var inspections = await lookupRepository.FindInspectionsAsync(keys, LookupLimit, cancellationToken);
        var reasons = await lookupRepository.FindFailureReasonsAsync(LookupLimit, cancellationToken);

        return Results.Ok(new AssetStatusConditionLookupsResponse(
            workOrders.Select(w => new AssetStatusConditionWorkOrderOption(w.WorkOrderId, w.Title, w.WorkType, w.Priority, w.Status, w.ScheduledDate)).ToList(),
            inspections.Select(i => new AssetStatusConditionInspectionOption(i.Code, i.Name, i.Kind)).ToList(),
            reasons.Select(r => new AssetStatusConditionFailureReasonOption(r.Code, r.Name, r.Category, r.Severity)).ToList()));
    }

    // ======================= Read =======================

    /// <summary>Summary cards. Counts come from the asset register; "due" from the latest approved change of each asset.</summary>
    private static async Task<IResult> GetSummaryAsync(
        IAssetRegistrationRepository assetRepository,
        IAssetStatusConditionChangeRepository repository,
        CancellationToken cancellationToken)
    {
        var all = await assetRepository.QueryAsync(AssetQuery(null, null, null, 1, 1), cancellationToken);
        long StatusCount(string status) => all.StatusCounts
            .Where(entry => string.Equals(entry.Key, status, StringComparison.OrdinalIgnoreCase))
            .Sum(entry => entry.Value);

        var poorOrCritical = await assetRepository.QueryAsync(AssetQuery(null, null, "Poor,Critical", 1, 1), cancellationToken);

        var dueBy = DateTime.UtcNow.Date.AddDays(AssetStatusConditionOptions.AssessmentDueWithinDays);
        var latest = await repository.GetLatestApprovedPerAssetAsync(null, cancellationToken);
        var due = latest.Count(change => change.NextAssessmentDue is not null && change.NextAssessmentDue.Value <= dueBy);

        var pending = await repository.QueryAsync(
            new AssetStatusConditionChangeQuery(null, null, null, null, AssetStatusConditionOptions.StatePendingApproval, 1, 1),
            cancellationToken);

        return Results.Ok(new AssetStatusConditionSummaryResponse(
            all.StatusCounts.Values.Sum(),
            StatusCount("Active"),
            StatusCount("Under Maintenance"),
            StatusCount("Out of Service"),
            poorOrCritical.TotalCount,
            due,
            pending.TotalCount,
            AssetStatusConditionOptions.AssessmentDueWithinDays));
    }

    /// <summary>Asset Summary tab: registered assets with their current status and condition.</summary>
    private static async Task<IResult> GetAssetsAsync(
        IAssetRegistrationRepository assetRepository,
        IAssetStatusConditionChangeRepository repository,
        IAssetConditionAssessmentRepository assessmentRepository,
        CancellationToken cancellationToken,
        string? search = null,
        string? status = null,
        string? condition = null,
        int page = 1,
        int pageSize = 20)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > AssetPageSizeMax ? 20 : pageSize;

        var result = await assetRepository.QueryAsync(
            AssetQuery(search, AssetStatusConditionOptions.Statuses.NormalizeOrKeep(status), NormalizeConditions(condition), page, pageSize),
            cancellationToken);

        var ids = result.Items.Select(asset => asset.AssetRegistrationId).ToList();
        var latest = (await repository.GetLatestApprovedPerAssetAsync(ids, cancellationToken)).ToDictionary(c => c.AssetRegistrationId);
        var pending = (await repository.GetPendingForAssetsAsync(ids, cancellationToken))
            .GroupBy(c => c.AssetRegistrationId)
            .ToDictionary(g => g.Key, g => g.First());

        var items = new List<AssetStatusConditionAssetResponse>(result.Items.Count);
        foreach (var asset in result.Items)
        {
            var assessment = await assessmentRepository.GetLatestAsync(asset.AssetRegistrationId, cancellationToken);
            items.Add(AssetStatusConditionAssetResponse.From(
                asset,
                latest.GetValueOrDefault(asset.AssetRegistrationId),
                assessment,
                pending.GetValueOrDefault(asset.AssetRegistrationId)));
        }

        return Results.Ok(new AssetStatusConditionAssetListResponse(items, result.TotalCount, page, pageSize));
    }

    /// <summary>Asset Information and Current Snapshot of the update page. Accepts the asset registration id or the asset tag.</summary>
    private static async Task<IResult> GetAssetAsync(
        string assetRegistrationId,
        IAssetRegistrationRepository assetRepository,
        IAssetStatusConditionChangeRepository repository,
        IAssetConditionAssessmentRepository assessmentRepository,
        CancellationToken cancellationToken)
    {
        var asset = await FindAssetAsync(assetRegistrationId, assetRepository, cancellationToken);
        if (asset is null)
        {
            return AssetNotFound(assetRegistrationId);
        }

        var latest = await repository.GetLatestApprovedAsync(asset.AssetRegistrationId, cancellationToken);
        var assessment = await assessmentRepository.GetLatestAsync(asset.AssetRegistrationId, cancellationToken);
        var pending = await repository.GetPendingAsync(asset.AssetRegistrationId, cancellationToken);
        return Results.Ok(AssetStatusConditionAssetResponse.From(asset, latest, assessment, pending));
    }

    /// <summary>Change History tab, latest first.</summary>
    private static async Task<IResult> GetChangesAsync(
        IAssetStatusConditionChangeRepository repository,
        CancellationToken cancellationToken,
        string? search = null,
        string? assetRegistrationId = null,
        string? status = null,
        string? condition = null,
        string? state = null,
        int page = 1,
        int pageSize = AssetStatusConditionChangeRepository.DefaultPageSize)
    {
        page = page < 1 ? 1 : page;
        pageSize = pageSize is < 1 or > AssetStatusConditionChangeRepository.MaxPageSize ? AssetStatusConditionChangeRepository.DefaultPageSize : pageSize;

        var result = await repository.QueryAsync(
            new AssetStatusConditionChangeQuery(
                search,
                assetRegistrationId,
                AssetStatusConditionOptions.Statuses.NormalizeOrKeep(status),
                NormalizeConditions(condition),
                AssetStatusConditionOptions.States.NormalizeOrKeep(state),
                page,
                pageSize),
            cancellationToken);

        return Results.Ok(new AssetStatusConditionChangeListResponse(
            result.Items.Select(AssetStatusConditionChangeResponse.FromEntity).ToList(),
            result.TotalCount,
            page,
            pageSize));
    }

    private static async Task<IResult> GetChangeAsync(string id, IAssetStatusConditionChangeRepository repository, CancellationToken cancellationToken)
    {
        var change = await repository.GetByIdAsync(id, cancellationToken);
        return change is null || change.IsDeleted
            ? ChangeNotFound(id)
            : Results.Ok(AssetStatusConditionChangeResponse.FromEntity(change));
    }

    // ======================= Save / submit =======================

    private static async Task<IResult> CreateChangeAsync(
        SaveAssetStatusConditionChangeRequest body,
        IAssetStatusConditionChangeRepository repository,
        IAssetRegistrationRepository assetRepository,
        IAssetConditionAssessmentRepository assessmentRepository,
        ISequenceGenerator sequenceGenerator,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body.AssetRegistrationId))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["AssetRegistrationId"] = ["Asset is required"] });
        }

        var asset = await FindAssetAsync(body.AssetRegistrationId, assetRepository, cancellationToken);
        if (asset is null)
        {
            return AssetNotFound(body.AssetRegistrationId);
        }

        var user = currentUserAccessor.GetCurrentUser();
        var now = DateTime.UtcNow;
        var change = new AssetStatusConditionChange
        {
            AssetRegistrationId = asset.AssetRegistrationId,
            State = AssetStatusConditionOptions.StateDraft,
            CreatedBy = user?.UserName,
            CreatedAt = now,
            ClientId = user?.ClientId ?? asset.ClientId,
            TenantId = user?.TenantId ?? asset.TenantId,
            IsDeleted = false
        };

        var problem = await ApplyAndSubmitAsync(change, asset, body, repository, assetRepository, assessmentRepository, user?.UserName, cancellationToken);
        if (problem is not null)
        {
            return problem;
        }

        // Numbered only once the change is valid, e.g. "SCC-2026-00001".
        var year = now.Year;
        var next = await sequenceGenerator.GetNextValueAsync($"{SequencePrefix}{year}", cancellationToken);
        change.ChangeNumber = $"{NumberPrefix}{year}-{next:D5}";

        await repository.CreateAsync(change, cancellationToken);
        await eventLogger.LogAsync(EntityType, change.Id, Describe(change), EventAction.Created, cancellationToken);
        return Results.Created($"/api/asset-status-condition/changes/{change.Id}", AssetStatusConditionChangeResponse.FromEntity(change));
    }

    /// <summary>Edits a draft (or a rejected change, which goes back to draft) and optionally submits it.</summary>
    private static async Task<IResult> UpdateChangeAsync(
        string id,
        SaveAssetStatusConditionChangeRequest body,
        IAssetStatusConditionChangeRepository repository,
        IAssetRegistrationRepository assetRepository,
        IAssetConditionAssessmentRepository assessmentRepository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var change = await repository.GetByIdAsync(id, cancellationToken);
        if (change is null || change.IsDeleted)
        {
            return ChangeNotFound(id);
        }
        if (change.State is not (AssetStatusConditionOptions.StateDraft or AssetStatusConditionOptions.StateRejected))
        {
            return Results.Conflict(new { message = $"Change {change.ChangeNumber} is {change.State} and can no longer be edited." });
        }

        var asset = await assetRepository.GetByAssetRegistrationIdAsync(change.AssetRegistrationId, cancellationToken);
        if (asset is null)
        {
            return AssetNotFound(change.AssetRegistrationId);
        }

        var user = currentUserAccessor.GetCurrentUser()?.UserName;
        change.State = AssetStatusConditionOptions.StateDraft;
        change.Approvals = [];
        var problem = await ApplyAndSubmitAsync(change, asset, body, repository, assetRepository, assessmentRepository, user, cancellationToken);
        if (problem is not null)
        {
            return problem;
        }

        change.UpdatedBy = user;
        change.UpdatedAt = DateTime.UtcNow;
        await repository.UpdateAsync(change.Id, change, cancellationToken);
        await eventLogger.LogAsync(EntityType, change.Id, Describe(change), EventAction.Updated, cancellationToken);
        return Results.Ok(AssetStatusConditionChangeResponse.FromEntity(change));
    }

    private static async Task<IResult> DeleteDraftAsync(
        string id,
        IAssetStatusConditionChangeRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var change = await repository.GetByIdAsync(id, cancellationToken);
        if (change is null || change.IsDeleted)
        {
            return ChangeNotFound(id);
        }
        if (change.State != AssetStatusConditionOptions.StateDraft)
        {
            return Results.Conflict(new { message = "Only drafts can be deleted." });
        }

        change.IsDeleted = true;
        change.UpdatedBy = currentUserAccessor.GetCurrentUser()?.UserName;
        change.UpdatedAt = DateTime.UtcNow;
        await repository.UpdateAsync(change.Id, change, cancellationToken);
        await eventLogger.LogAsync(EntityType, change.Id, Describe(change), EventAction.Deleted, cancellationToken);
        return Results.NoContent();
    }

    /// <summary>Copies the form onto the change; on submit validates it, starts the approval or applies it at once.</summary>
    private static async Task<IResult?> ApplyAndSubmitAsync(
        AssetStatusConditionChange change,
        AssetRegistration asset,
        SaveAssetStatusConditionChangeRequest body,
        IAssetStatusConditionChangeRepository repository,
        IAssetRegistrationRepository assetRepository,
        IAssetConditionAssessmentRepository assessmentRepository,
        string? user,
        CancellationToken cancellationToken)
    {
        var errors = Validate(body, asset);
        if (errors.Count > 0)
        {
            return Results.ValidationProblem(errors);
        }

        var info = asset.BasicInformation;
        var now = DateTime.UtcNow;
        change.AssetTag = info.AssetTag;
        change.AssetName = info.AssetName;
        change.SiteName = asset.LocationAssignment.Location.SiteName;
        change.PreviousStatus = info.Status;
        change.PreviousCondition = info.Condition;
        change.NewStatus = AssetStatusConditionOptions.Statuses.Normalize(body.NewStatus) ?? string.Empty;
        change.StatusEffectiveFrom = body.StatusEffectiveFrom;
        change.NewCondition = AssetStatusConditionOptions.Conditions.Normalize(body.NewCondition) ?? string.Empty;
        change.ConditionAssessmentDate = body.ConditionAssessmentDate;
        change.ReasonCode = AssetStatusConditionOptions.Reasons.NormalizeOrKeep(body.ReasonCode);
        change.AssessmentMethod = AssetStatusConditionOptions.AssessmentMethods.NormalizeOrKeep(body.AssessmentMethod);
        change.AssessmentSource = AssetStatusConditionOptions.AssessmentSources.Normalize(body.AssessmentSource);
        change.AssessedBy = ContractText.TrimOrNull(body.AssessedBy);
        change.NextAssessmentDue = ContractText.DateOnly(body.NextAssessmentDue);
        change.Remarks = ContractText.TrimOrNull(body.Remarks);
        change.OperationalImpact = AssetStatusConditionOptions.OperationalImpacts.Normalize(body.OperationalImpact);
        change.RelatedWorkOrder = ContractText.TrimOrNull(body.RelatedWorkOrder);
        change.RelatedInspection = ContractText.TrimOrNull(body.RelatedInspection);
        change.DowntimeEstimate = body.DowntimeEstimate;
        change.DowntimeUnit = body.DowntimeEstimate is null ? null : AssetStatusConditionOptions.DowntimeUnits.Normalize(body.DowntimeUnit) ?? "Hours";

        // Keep when each piece of evidence was first added.
        var existing = change.Evidence.ToDictionary(e => $"{e.Kind}|{e.Url}|{e.Name}");
        change.Evidence = (body.Evidence ?? [])
            .Where(e => !string.IsNullOrWhiteSpace(e.Name) || !string.IsNullOrWhiteSpace(e.Url))
            .Select(e =>
            {
                var kind = string.Equals(e.Kind, "Link", StringComparison.OrdinalIgnoreCase) ? "Link" : "File";
                var name = ContractText.TrimOrNull(e.Name) ?? e.Url!.Trim();
                var url = ContractText.TrimOrNull(e.Url);
                return existing.GetValueOrDefault($"{kind}|{url}|{name}") ?? new AssetStatusConditionEvidence
                {
                    Name = name,
                    Url = url,
                    Kind = kind,
                    SizeBytes = e.SizeBytes,
                    AddedBy = user,
                    AddedAt = now
                };
            })
            .ToList();

        if (!body.Submit)
        {
            return null;
        }

        var pending = await repository.GetPendingAsync(asset.AssetRegistrationId, cancellationToken);
        if (pending is not null && pending.Id != change.Id)
        {
            return Results.Conflict(new { message = $"{info.AssetTag ?? asset.AssetRegistrationId} already has change {pending.ChangeNumber} waiting for approval." });
        }

        change.SubmittedBy = user;
        change.SubmittedAt = now;

        var statusChanged = !string.Equals(change.NewStatus, change.PreviousStatus, StringComparison.OrdinalIgnoreCase);
        var conditionChanged = !string.Equals(change.NewCondition, change.PreviousCondition, StringComparison.OrdinalIgnoreCase);
        if (!statusChanged && !conditionChanged)
        {
            // A re-assessment that confirms the current status and condition needs no approval.
            change.State = AssetStatusConditionOptions.StateApproved;
            change.Approvals = [];
            await ApplyToAssetAsync(change, asset, assetRepository, assessmentRepository, user, cancellationToken);
            return null;
        }

        change.State = AssetStatusConditionOptions.StatePendingApproval;
        change.Approvals = AssetStatusConditionOptions.ApprovalLevels
            .Select((level, index) => new AssetStatusConditionApproval
            {
                Level = level.Level,
                Role = level.Role,
                Approver = ContractText.TrimOrNull(body.Approvers?.ElementAtOrDefault(index)),
                Status = index == 0 ? AssetStatusConditionOptions.ApprovalPending : AssetStatusConditionOptions.ApprovalNotStarted
            })
            .ToList();
        return null;
    }

    private static Dictionary<string, string[]> Validate(SaveAssetStatusConditionChangeRequest body, AssetRegistration asset)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string field, string message) => errors[field] = [message];

        if (string.Equals(asset.BasicInformation.Status, "Disposed", StringComparison.OrdinalIgnoreCase))
        {
            Add("AssetRegistrationId", "Disposed assets cannot be updated");
        }

        void CheckOption(string field, string label, string? value, OptionList options, bool required)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                if (required)
                {
                    Add(field, $"{label} is required");
                }
            }
            else if (!options.IsValid(value))
            {
                Add(field, $"{label} must be one of: {string.Join(", ", options.All)}");
            }
        }

        var submit = body.Submit;
        CheckOption("NewStatus", "New status", body.NewStatus, AssetStatusConditionOptions.Statuses, submit);
        CheckOption("NewCondition", "New condition", body.NewCondition, AssetStatusConditionOptions.Conditions, submit);
        // Reason and method can also come from master data (failure reasons, inspection types), so any text is accepted.
        void CheckText(string field, string label, string? value, bool required)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                if (required)
                {
                    Add(field, $"{label} is required");
                }
            }
            else if (value.Trim().Length > TextMaxLength)
            {
                Add(field, $"{label} cannot be longer than {TextMaxLength} characters");
            }
        }

        CheckText("ReasonCode", "Reason / failure code", body.ReasonCode, submit);
        CheckText("AssessmentMethod", "Assessment method", body.AssessmentMethod, submit);
        CheckOption("AssessmentSource", "Assessment source", body.AssessmentSource, AssetStatusConditionOptions.AssessmentSources, submit);
        CheckOption("OperationalImpact", "Operational impact", body.OperationalImpact, AssetStatusConditionOptions.OperationalImpacts, false);
        CheckOption("DowntimeUnit", "Downtime unit", body.DowntimeUnit, AssetStatusConditionOptions.DowntimeUnits, false);

        // A little leeway for clocks ahead of the server.
        var latestAllowed = DateTime.UtcNow.AddDays(1);
        if (submit && body.StatusEffectiveFrom is null)
        {
            Add("StatusEffectiveFrom", "Status effective from is required");
        }
        if (body.ConditionAssessmentDate is null)
        {
            if (submit)
            {
                Add("ConditionAssessmentDate", "Condition assessment date is required");
            }
        }
        else if (body.ConditionAssessmentDate.Value.ToUniversalTime() > latestAllowed)
        {
            Add("ConditionAssessmentDate", "Condition assessment date cannot be in the future");
        }
        if (body.NextAssessmentDue is not null && body.ConditionAssessmentDate is not null
            && body.NextAssessmentDue.Value.Date <= body.ConditionAssessmentDate.Value.Date)
        {
            Add("NextAssessmentDue", "Next assessment due must be after the condition assessment date");
        }

        if (submit && string.IsNullOrWhiteSpace(body.AssessedBy))
        {
            Add("AssessedBy", "Assessed by is required");
        }
        else if (body.AssessedBy?.Trim().Length > TextMaxLength)
        {
            Add("AssessedBy", $"Assessed by cannot be longer than {TextMaxLength} characters");
        }

        if (submit && string.IsNullOrWhiteSpace(body.Remarks))
        {
            Add("Remarks", "Remarks / justification is required");
        }
        else if (body.Remarks?.Trim().Length > RemarksMaxLength)
        {
            Add("Remarks", $"Remarks cannot be longer than {RemarksMaxLength} characters");
        }

        if (body.RelatedWorkOrder?.Trim().Length > TextMaxLength || body.RelatedInspection?.Trim().Length > TextMaxLength)
        {
            Add("RelatedWorkOrder", $"Related work order and inspection cannot be longer than {TextMaxLength} characters");
        }
        if (body.DowntimeEstimate is < 0 or > 100000)
        {
            Add("DowntimeEstimate", "Downtime must be between 0 and 100000");
        }
        if (body.Evidence?.Count > MaxEvidence)
        {
            Add("Evidence", $"At most {MaxEvidence} evidence items can be attached");
        }
        if (body.Evidence?.Any(e => string.Equals(e.Kind, "Link", StringComparison.OrdinalIgnoreCase)
                && !Uri.TryCreate(e.Url?.Trim(), UriKind.Absolute, out _)) == true)
        {
            Add("Evidence", "Every link must be a full URL, e.g. https://...");
        }

        return errors;
    }

    // ======================= Approval =======================

    private static async Task<IResult> ApproveAsync(
        string id,
        AssetStatusConditionDecisionRequest? body,
        IAssetStatusConditionChangeRepository repository,
        IAssetRegistrationRepository assetRepository,
        IAssetConditionAssessmentRepository assessmentRepository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        var (change, level, problem) = await GetPendingLevelAsync(id, repository, cancellationToken);
        if (change is null)
        {
            return problem!;
        }

        var user = currentUserAccessor.GetCurrentUser()?.UserName;
        var now = DateTime.UtcNow;
        level!.Status = AssetStatusConditionOptions.ApprovalApproved;
        level.ActedBy = user;
        level.ActedAt = now;
        level.Comments = ContractText.TrimOrNull(body?.Comments);

        var nextLevel = change.Approvals.OrderBy(a => a.Level).FirstOrDefault(a => a.Status == AssetStatusConditionOptions.ApprovalNotStarted);
        if (nextLevel is not null)
        {
            nextLevel.Status = AssetStatusConditionOptions.ApprovalPending;
        }
        else
        {
            var asset = await assetRepository.GetByAssetRegistrationIdAsync(change.AssetRegistrationId, cancellationToken);
            if (asset is null)
            {
                return AssetNotFound(change.AssetRegistrationId);
            }
            change.State = AssetStatusConditionOptions.StateApproved;
            await ApplyToAssetAsync(change, asset, assetRepository, assessmentRepository, user, cancellationToken);
        }

        change.UpdatedBy = user;
        change.UpdatedAt = now;
        await repository.UpdateAsync(change.Id, change, cancellationToken);
        await eventLogger.LogAsync(EntityType, change.Id, $"{Describe(change)} - Level {level.Level} approved", EventAction.Updated, cancellationToken);
        return Results.Ok(AssetStatusConditionChangeResponse.FromEntity(change));
    }

    private static async Task<IResult> RejectAsync(
        string id,
        AssetStatusConditionDecisionRequest? body,
        IAssetStatusConditionChangeRepository repository,
        ICurrentUserAccessor currentUserAccessor,
        IEventLogger eventLogger,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(body?.Comments))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["Comments"] = ["A reason is required to reject a change"] });
        }

        var (change, level, problem) = await GetPendingLevelAsync(id, repository, cancellationToken);
        if (change is null)
        {
            return problem!;
        }

        var user = currentUserAccessor.GetCurrentUser()?.UserName;
        var now = DateTime.UtcNow;
        level!.Status = AssetStatusConditionOptions.ApprovalRejected;
        level.ActedBy = user;
        level.ActedAt = now;
        level.Comments = body.Comments.Trim();
        change.State = AssetStatusConditionOptions.StateRejected;
        change.UpdatedBy = user;
        change.UpdatedAt = now;

        await repository.UpdateAsync(change.Id, change, cancellationToken);
        await eventLogger.LogAsync(EntityType, change.Id, $"{Describe(change)} - Level {level.Level} rejected", EventAction.Updated, cancellationToken);
        return Results.Ok(AssetStatusConditionChangeResponse.FromEntity(change));
    }

    private static async Task<(AssetStatusConditionChange? Change, AssetStatusConditionApproval? Level, IResult? Problem)> GetPendingLevelAsync(
        string id,
        IAssetStatusConditionChangeRepository repository,
        CancellationToken cancellationToken)
    {
        var change = await repository.GetByIdAsync(id, cancellationToken);
        if (change is null || change.IsDeleted)
        {
            return (null, null, ChangeNotFound(id));
        }

        var level = change.State == AssetStatusConditionOptions.StatePendingApproval
            ? change.Approvals.OrderBy(a => a.Level).FirstOrDefault(a => a.Status == AssetStatusConditionOptions.ApprovalPending)
            : null;
        return level is null
            ? (null, null, Results.Conflict(new { message = $"Change {change.ChangeNumber} is {change.State} and has no approval waiting." }))
            : (change, level, null);
    }

    /// <summary>Writes the new status and condition to the asset and records the condition assessment.</summary>
    private static async Task ApplyToAssetAsync(
        AssetStatusConditionChange change,
        AssetRegistration asset,
        IAssetRegistrationRepository assetRepository,
        IAssetConditionAssessmentRepository assessmentRepository,
        string? user,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        asset.BasicInformation.Status = change.NewStatus;
        asset.BasicInformation.Condition = change.NewCondition;
        asset.UpdatedBy = user;
        asset.UpdatedAt = now;
        await assetRepository.UpdateAsync(asset.Id, asset, cancellationToken);

        var assessedOn = ContractText.DateOnly(change.ConditionAssessmentDate ?? now)!.Value;
        await assessmentRepository.CreateAsync(new AssetConditionAssessment
        {
            AssetRegistrationId = asset.AssetRegistrationId,
            AssetName = asset.BasicInformation.AssetName,
            AssetTag = asset.BasicInformation.AssetTag,
            AssessmentDate = assessedOn,
            AssessedBy = change.AssessedBy ?? user ?? string.Empty,
            OverallCondition = change.NewCondition,
            HealthScore = AssetStatusConditionOptions.HealthScoreFor(change.NewCondition),
            PhysicalCondition = change.NewCondition,
            Remarks = string.Join(" · ", new[] { change.ChangeNumber, change.ReasonCode, change.Remarks }.Where(s => !string.IsNullOrWhiteSpace(s))),
            CreatedBy = user,
            CreatedAt = now,
            ClientId = change.ClientId,
            TenantId = change.TenantId,
            IsDeleted = false
        }, cancellationToken);

        change.AppliedAt = now;
    }

    // ======================= Helpers =======================

    private static AssetRegistrationQuery AssetQuery(string? search, string? status, string? condition, int page, int pageSize) =>
        new(search, null, null, status, null, null, null, null, null, "assetTag", false, page, pageSize, condition);

    /// <summary>"poor, critical" as "Poor,Critical"; unknown values are kept so they match nothing.</summary>
    private static string? NormalizeConditions(string? conditions) =>
        string.IsNullOrWhiteSpace(conditions)
            ? null
            : string.Join(',', conditions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(c => AssetStatusConditionOptions.Conditions.NormalizeOrKeep(c)));

    /// <summary>By asset registration id, or else by asset tag (the update page is opened with ?tag=).</summary>
    private static async Task<AssetRegistration?> FindAssetAsync(string idOrTag, IAssetRegistrationRepository assetRepository, CancellationToken cancellationToken)
    {
        var key = idOrTag.Trim();
        var asset = await assetRepository.GetByAssetRegistrationIdAsync(key, cancellationToken);
        if (asset is not null)
        {
            return asset;
        }

        var matches = await assetRepository.FindByTagsOrSerialsAsync([key], cancellationToken);
        return matches.FirstOrDefault(a => string.Equals(a.BasicInformation.AssetTag, key, StringComparison.OrdinalIgnoreCase) && !a.IsDeleted)
            ?? matches.FirstOrDefault(a => !a.IsDeleted);
    }

    private static string Describe(AssetStatusConditionChange change) =>
        $"{change.ChangeNumber} {change.AssetTag ?? change.AssetRegistrationId}: {change.NewStatus} / {change.NewCondition} ({change.State})";

    private static IResult AssetNotFound(string assetRegistrationId) =>
        Results.NotFound(new { message = $"Asset '{assetRegistrationId}' was not found." });

    private static IResult ChangeNotFound(string id) =>
        Results.NotFound(new { message = $"Status & condition change '{id}' was not found." });
}
