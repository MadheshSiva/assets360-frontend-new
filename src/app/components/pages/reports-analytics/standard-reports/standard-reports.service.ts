import { Injectable } from '@angular/core';
import { RA_CATEGORIES, RA_LOCATIONS, RA_MONTHS, money, percent } from '../shared/analytics-common';
import { ReportPeriod, ReportSchedule, SR_TODAY, StandardReport, seedStandardReports } from './standard-reports.data';
import { nextRun, pad } from './standard-reports.util';

export interface PreviewRow {
  label: string;
  value: number;
  display: string;
  /** Share of the total (count / money / hours), or the gap to the average (percent) */
  share: string;
}

/** DEMO MODE: standard reports kept in memory; replace with the reporting API. */
@Injectable({ providedIn: 'root' })
export class StandardReportsService {
  reports: StandardReport[] = seedStandardReports();

  get today(): string {
    return SR_TODAY;
  }

  find(id: string): StandardReport | undefined {
    return this.reports.find((r) => r.id === id);
  }

  /** Apply the reporting period to every report. */
  applyPeriod(period: ReportPeriod): void {
    this.reports = this.reports.map((r) => ({ ...r, period: { ...period } }));
  }

  saveSchedule(id: string, schedule: ReportSchedule): StandardReport | undefined {
    return this.update(id, (r) => ({
      ...r,
      schedule: { ...schedule, recipients: [...schedule.recipients] },
      frequency: schedule.frequency,
      nextScheduled: nextRun(schedule, SR_TODAY),
      status: r.status === 'Needs review' ? r.status : 'Scheduled',
      updatedOn: SR_TODAY
    }));
  }

  // DEMO MODE: "runs" the report instantly with the current clock time
  runNow(id: string): StandardReport | undefined {
    const now = new Date();
    return this.update(id, (r) => ({
      ...r,
      generatedOn: `${SR_TODAY}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
      status: r.status === 'Needs review' ? r.status : 'Ready'
    }));
  }

  markReviewed(id: string): StandardReport | undefined {
    return this.update(id, (r) => ({ ...r, status: r.schedule ? 'Scheduled' : 'Ready', reviewDue: null, updatedOn: SR_TODAY }));
  }

  /**
   * Deterministic sample rows for the viewer and CSV export. Totals match RA_METRICS so the figures agree
   * with the analytics pages; the split varies per report.
   */
  previewRows(report: StandardReport): PreviewRow[] {
    const p = report.preview;
    const labels = p.dimension === 'category' ? RA_CATEGORIES : p.dimension === 'site' ? RA_LOCATIONS.slice(1, 7) : RA_MONTHS;
    const seed = Number(report.id.slice(-3));
    const weights = labels.map((_, i) => 0.55 + (((seed * 7 + i * 13 + i * i * 5) % 17) / 17) * 0.9);

    if (p.unit === 'percent') {
      const offsets = weights.map((w) => (w - 1) * 8);
      const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      return labels.map((label, i) => {
        const value = Math.min(100, Math.round((p.total + offsets[i] - mean) * 10) / 10);
        const gap = Math.round((value - p.total) * 10) / 10;
        return { label, value, display: percent(value), share: `${gap >= 0 ? '+' : ''}${gap} pts` };
      });
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const values = weights.map((w) => Math.round((p.total * w) / totalWeight));
    // Put the rounding difference on the largest row so the rows add up to the headline total
    const diff = p.total - values.reduce((a, b) => a + b, 0);
    values[weights.indexOf(Math.max(...weights))] += diff;
    return labels.map((label, i) => ({
      label,
      value: values[i],
      display: this.formatValue(report, values[i]),
      share: percent((values[i] / p.total) * 100)
    }));
  }

  formatValue(report: StandardReport, value: number): string {
    switch (report.preview.unit) {
      case 'money':
        return money(value);
      case 'percent':
        return percent(value);
      case 'hours':
        return `${value.toLocaleString('en-US')} h`;
      default:
        return value.toLocaleString('en-US');
    }
  }

  private update(id: string, change: (r: StandardReport) => StandardReport): StandardReport | undefined {
    let updated: StandardReport | undefined;
    this.reports = this.reports.map((r) => {
      if (r.id !== id) return r;
      updated = change(r);
      return updated;
    });
    return updated;
  }
}
