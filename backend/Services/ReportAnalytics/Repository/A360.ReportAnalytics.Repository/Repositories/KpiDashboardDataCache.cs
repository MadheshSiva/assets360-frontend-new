using System.Collections.Concurrent;

namespace A360.ReportAnalytics.Repository.Repositories;

/// <summary>
/// A read-through cache over <see cref="IDashboardDataRepository"/> for one KPI Dashboard request. The KPI Dashboard runs the analytics
/// calculators once per month of the period (for sparklines and the trend), so every record set is read from MongoDB once:
/// date-ranged reads (costs, downtime, assessments) load [WideFromUtc, WideToUtc) once and are narrowed in memory with the same rules
/// as the database query; other reads are kept per argument set. Requests outside the wide range go to the database. Nothing is written.
/// </summary>
public sealed class KpiDashboardDataCache : IDashboardDataRepository
{
    private readonly IDashboardDataRepository _inner;
    private readonly DateTime _wideFromUtc;
    private readonly DateTime _wideToUtc;
    private readonly ConcurrentDictionary<string, Lazy<Task<object>>> _cache = new();

    public KpiDashboardDataCache(IDashboardDataRepository inner, DateTime wideFromUtc, DateTime wideToUtc)
    {
        _inner = inner;
        _wideFromUtc = wideFromUtc;
        _wideToUtc = wideToUtc;
    }

    public Task<IReadOnlyList<DashboardAsset>> GetAssetsAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("assets", scope), () => _inner.GetAssetsAsync(scope, cancellationToken));

    public Task<IReadOnlyList<DashboardWorkOrder>> GetWorkOrdersAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime? fromUtc, DateTime? toUtc, bool openOnly, CancellationToken cancellationToken = default) =>
        Memo(Key("work-orders", scope, assetKeys, fromUtc, toUtc, openOnly), () => _inner.GetWorkOrdersAsync(scope, assetKeys, fromUtc, toUtc, openOnly, cancellationToken));

    public Task<IReadOnlyList<DashboardCost>> GetMaintenanceCostsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default) =>
        Memo(Key("costs", scope, assetKeys, fromUtc, toUtc), () => _inner.GetMaintenanceCostsAsync(scope, assetKeys, fromUtc, toUtc, cancellationToken));

    public async Task<IReadOnlyList<DashboardHealthAssessment>> GetHealthAssessmentsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        if (toUtc > _wideToUtc)
        {
            return await Memo(Key("assessments", scope, assetKeys, toUtc), () => _inner.GetHealthAssessmentsAsync(scope, assetKeys, toUtc, cancellationToken));
        }

        var all = await Memo(Key("assessments-wide", scope, assetKeys), () => _inner.GetHealthAssessmentsAsync(scope, assetKeys, _wideToUtc, cancellationToken));
        return all.Where(assessment => assessment.AssessmentDate < toUtc).ToList();
    }

    public Task<IReadOnlyList<DashboardInspection>> GetLatestInspectionsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("latest-inspections", scope, assetKeys), () => _inner.GetLatestInspectionsAsync(scope, assetKeys, cancellationToken));

    public Task<IReadOnlyList<DashboardPreventiveSchedule>> GetPreventiveSchedulesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("preventive", scope, assetKeys), () => _inner.GetPreventiveSchedulesAsync(scope, assetKeys, cancellationToken));

    public Task<IReadOnlyList<DashboardSparePart>> GetSparePartsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime toUtc, CancellationToken cancellationToken = default) =>
        Memo(Key("spare-parts", scope, assetKeys, toUtc), () => _inner.GetSparePartsAsync(scope, assetKeys, toUtc, cancellationToken));

    public async Task<IReadOnlyList<DashboardDowntime>> GetDowntimeAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        if (fromUtc < _wideFromUtc || toUtc > _wideToUtc)
        {
            return await Memo(Key("downtime", scope, assetKeys, fromUtc, toUtc), () => _inner.GetDowntimeAsync(scope, assetKeys, fromUtc, toUtc, cancellationToken));
        }

        // Same rule as the query: started before toUtc and not ended by fromUtc.
        var all = await Memo(Key("downtime-wide", scope, assetKeys), () => _inner.GetDowntimeAsync(scope, assetKeys, _wideFromUtc, _wideToUtc, cancellationToken));
        return all.Where(record => record.Start < toUtc && (record.End is null || record.End > fromUtc)).ToList();
    }

    public async Task<IReadOnlyList<DashboardCostRecord>> GetCostRecordsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        if (fromUtc < _wideFromUtc || toUtc > _wideToUtc)
        {
            return await Memo(Key("cost-records", scope, assetKeys, fromUtc, toUtc), () => _inner.GetCostRecordsAsync(scope, assetKeys, fromUtc, toUtc, cancellationToken));
        }

        var all = await Memo(Key("cost-records-wide", scope, assetKeys), () => _inner.GetCostRecordsAsync(scope, assetKeys, _wideFromUtc, _wideToUtc, cancellationToken));
        return all.Where(record => record.CreatedAt >= fromUtc && record.CreatedAt < toUtc).ToList();
    }

    public Task<IReadOnlyList<DashboardSlaRule>> GetSlaRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("sla", scope), () => _inner.GetSlaRulesAsync(scope, cancellationToken));

    public Task<IReadOnlyList<DashboardTechnician>> GetTechniciansAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("technicians", scope), () => _inner.GetTechniciansAsync(scope, cancellationToken));

    public Task<IReadOnlyList<DashboardInspectionRecord>> GetInspectionRecordsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("inspection-records", scope, assetKeys), () => _inner.GetInspectionRecordsAsync(scope, assetKeys, cancellationToken));

    public Task<IReadOnlyList<DashboardFinding>> GetFindingsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("findings", scope, assetKeys), () => _inner.GetFindingsAsync(scope, assetKeys, cancellationToken));

    public Task<IReadOnlyList<DashboardSeverityRule>> GetSeverityRulesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("severities", scope), () => _inner.GetSeverityRulesAsync(scope, cancellationToken));

    public Task<DashboardInspectionFilterOptions> GetInspectionFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        _inner.GetInspectionFilterOptionsAsync(tenantId, clientId, cancellationToken);

    public Task<IReadOnlyList<DashboardJob>> GetJobsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("jobs", scope, assetKeys), () => _inner.GetJobsAsync(scope, assetKeys, cancellationToken));

    public Task<IReadOnlyList<DashboardJobTask>> GetJobTasksAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default) =>
        Memo(Key("job-tasks", scope, jobIds), () => _inner.GetJobTasksAsync(scope, jobIds, cancellationToken));

    public Task<IReadOnlyList<DashboardMaterialUse>> GetMaterialUsesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default) =>
        Memo(Key("materials", scope, jobIds), () => _inner.GetMaterialUsesAsync(scope, jobIds, cancellationToken));

    public Task<IReadOnlyList<DashboardJobIssue>> GetJobIssuesAsync(
        DashboardDataScope scope, IReadOnlyCollection<string> jobIds, CancellationToken cancellationToken = default) =>
        Memo(Key("job-issues", scope, jobIds), () => _inner.GetJobIssuesAsync(scope, jobIds, cancellationToken));

    public Task<IReadOnlyList<DashboardWipStatus>> GetWipStatusesAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("wip-statuses", scope), () => _inner.GetWipStatusesAsync(scope, cancellationToken));

    public Task<IReadOnlyList<DashboardLocationMaster>> GetLocationMastersAsync(DashboardDataScope scope, CancellationToken cancellationToken = default) =>
        Memo(Key("location-masters", scope), () => _inner.GetLocationMastersAsync(scope, cancellationToken));

    public Task<IReadOnlyList<DashboardPredictiveAlert>> GetPredictiveAlertsAsync(
        DashboardDataScope scope, IReadOnlyCollection<string>? assetKeys, CancellationToken cancellationToken = default) =>
        Memo(Key("predictive", scope, assetKeys), () => _inner.GetPredictiveAlertsAsync(scope, assetKeys, cancellationToken));

    public Task<DashboardFilterOptions> GetFilterOptionsAsync(string? tenantId, string? clientId, CancellationToken cancellationToken = default) =>
        _inner.GetFilterOptionsAsync(tenantId, clientId, cancellationToken);

    private async Task<T> Memo<T>(string key, Func<Task<T>> load) where T : class
    {
        var entry = _cache.GetOrAdd(key, _ => new Lazy<Task<object>>(async () => await load()));
        return (T)await entry.Value;
    }

    private static string Key(string name, DashboardDataScope scope, params object?[] parts) =>
        string.Join('|', new object?[] { name, scope }.Concat(parts.Select(part => part switch
        {
            null => "*",
            IReadOnlyCollection<string> keys => KeysHash(keys),
            DateTime date => date.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture),
            _ => part
        })));

    private static string KeysHash(IReadOnlyCollection<string> keys)
    {
        var hash = new HashCode();
        foreach (var key in keys.Order(StringComparer.Ordinal))
        {
            hash.Add(key, StringComparer.Ordinal);
        }

        return $"{keys.Count}:{hash.ToHashCode()}";
    }
}
