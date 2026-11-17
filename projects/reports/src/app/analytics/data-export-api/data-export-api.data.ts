import { ExportSummary, RunStats } from './data-export-api.model';

// Empty states and formatting for the Data Export / API page. All figures come from /api/data-export.

/** Run stats before the API has answered (or when there are no runs): one zero bucket per day. */
export function emptyRunStats(days: number): RunStats {
  const labels: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    labels.push(new Date(today.getTime() - i * 86_400_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
  }
  const zeros = () => labels.map(() => 0);
  return { labels, success: zeros(), failed: zeros(), generatedBytes: zeros(), accessOk: zeros(), accessFailed: zeros(), successRate: null };
}

export function emptySummary(): ExportSummary {
  return {
    activeExports: 0,
    activeExportsWeekAgo: 0,
    connections: 0,
    connectionsWeekAgo: 0,
    scheduledJobs: 0,
    scheduledJobsWeekAgo: 0,
    successRate30: null,
    successRatePrevious30: null,
    generatedBytes30: 0,
    generatedBytesPrevious30: 0,
    deliveryNote: 'not delivered: no transport configured'
  };
}

/** Date → "2026-10-29T10:40" in local time */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "2026-10-29T10:40" → "29 Oct 2026, 10:40" */
export function formatStamp(stamp: string | null): string {
  if (!stamp) return '—';
  const [date, time] = stamp.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '';
  return `${String(d).padStart(2, '0')} ${month} ${y}${time ? ', ' + time : ''}`;
}

/** 1536 → "1.5 KB"; null → "—" */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
