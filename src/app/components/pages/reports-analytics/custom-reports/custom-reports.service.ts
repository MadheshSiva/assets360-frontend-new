import { Injectable } from '@angular/core';
import { CURRENT_USER } from '../shared/analytics-common';
import { CUSTOM_REPORT_SEED, DATA_SOURCES, MODULE_SOURCES, blankDefinition } from './custom-reports.data';
import { sourceOf } from './custom-reports.engine';
import { CustomReport, ReportStatus } from './custom-reports.model';

// DEMO MODE: custom reports live in memory until the reporting API exists

/** Current date-time in Asia/Dubai (UTC+4) as 'YYYY-MM-DDTHH:mm'. */
export function dubaiNow(): string {
  return new Date(Date.now() + 4 * 3600_000).toISOString().slice(0, 16);
}

export function cloneReport(r: CustomReport): CustomReport {
  return JSON.parse(JSON.stringify(r)) as CustomReport;
}

const STARTER_FIELDS: Record<string, string[]> = {
  'assets': ['assetId', 'assetName', 'category', 'location', 'condition'],
  'assets-iot': ['assetId', 'category', 'sensorType', 'runHours', 'utilizationPct'],
  'assets-movement': ['movementNo', 'assetId', 'movementType', 'toLocation', 'custodian'],
  'assets-maint': ['assetId', 'assetName', 'location', 'maintenanceCost', 'openWorkOrders'],
  'assets-insp': ['assetId', 'location', 'inspectionResult', 'openFindings', 'lastInspectionDate'],
  'inventory': ['itemCode', 'itemName', 'warehouse', 'quantityOnHand', 'reorderLevel'],
  'operations': ['workOrderNo', 'productionLine', 'outputUnits', 'onTimePct'],
  'compliance': ['auditName', 'standard', 'complianceScore', 'auditFindings'],
  'contracts': ['contractNo', 'vendor', 'contractValue', 'warrantyExpiry'],
  'assets-fin': ['assetId', 'category', 'purchaseCost', 'bookValue', 'depreciation']
};

@Injectable({ providedIn: 'root' })
export class CustomReportsService {
  private items: CustomReport[] = CUSTOM_REPORT_SEED.map(cloneReport);
  private seq = CUSTOM_REPORT_SEED.length;

  get reports(): CustomReport[] {
    return this.items;
  }

  get stats(): { total: number; published: number; scheduled: number; drafts: number } {
    const count = (s: ReportStatus) => this.items.filter((r) => r.status === s).length;
    return { total: this.items.length, published: count('Published'), scheduled: count('Scheduled'), drafts: count('Draft') };
  }

  get(id: string): CustomReport | undefined {
    return this.items.find((r) => r.id === id);
  }

  isNameTaken(name: string, exceptId = ''): boolean {
    const n = name.trim().toLowerCase();
    return this.items.some((r) => r.id !== exceptId && r.name.trim().toLowerCase() === n);
  }

  /** "Name (copy)", "Name (copy 2)"… until free. */
  uniqueName(name: string, suffix = 'copy'): string {
    if (!this.isNameTaken(name)) return name;
    let i = 1;
    let candidate = `${name} (${suffix})`;
    while (this.isNameTaken(candidate)) candidate = `${name} (${suffix} ${++i})`;
    return candidate;
  }

  newId(): string {
    return `CR-${String(++this.seq).padStart(4, '0')}`;
  }

  blank(): CustomReport {
    return {
      ...blankDefinition(),
      id: '',
      name: '',
      description: '',
      owner: CURRENT_USER.name,
      module: 'Assets',
      status: 'Draft',
      favourite: false,
      updatedAt: dubaiNow(),
      visibility: 'My team',
      schedule: 'Not scheduled'
    };
  }

  /** Creates or updates; returns the stored copy. */
  save(report: CustomReport): CustomReport {
    const stored = cloneReport(report);
    stored.module = sourceOf(stored.sourceKey).module;
    stored.updatedAt = dubaiNow();
    if (!stored.id) {
      stored.id = this.newId();
      this.items = [stored, ...this.items];
    } else {
      const i = this.items.findIndex((r) => r.id === stored.id);
      if (i < 0) this.items = [stored, ...this.items];
      else this.items = this.items.map((r) => (r.id === stored.id ? stored : r));
    }
    return stored;
  }

  duplicate(id: string): CustomReport | undefined {
    const src = this.get(id);
    if (!src) return undefined;
    const copy = cloneReport(src);
    copy.id = this.newId();
    copy.name = this.uniqueName(src.name);
    copy.owner = CURRENT_USER.name;
    copy.status = 'Draft';
    copy.favourite = false;
    copy.updatedAt = dubaiNow();
    this.items = [copy, ...this.items];
    return copy;
  }

  remove(id: string): void {
    this.items = this.items.filter((r) => r.id !== id);
  }

  toggleFavourite(id: string): void {
    const r = this.get(id);
    if (r) r.favourite = !r.favourite;
  }

  setStatus(id: string, status: ReportStatus): void {
    const r = this.get(id);
    if (!r) return;
    r.status = status;
    r.updatedAt = dubaiNow();
  }

  /** Adds imported templates as drafts owned by the current user; returns how many were added. */
  importReports(list: CustomReport[]): number {
    for (const r of list) {
      const copy = cloneReport(r);
      copy.id = this.newId();
      copy.name = this.uniqueName(copy.name, 'imported');
      copy.owner = CURRENT_USER.name;
      copy.status = 'Draft';
      copy.updatedAt = dubaiNow();
      copy.module = sourceOf(copy.sourceKey).module;
      this.items = [copy, ...this.items];
    }
    return list.length;
  }

  /** Used by Standard Reports > "Duplicate to custom report". Returns the final (unique) name. */
  addFromStandard(input: { name: string; module: string; description: string }): string {
    const sourceKey = MODULE_SOURCES[input.module] ?? DATA_SOURCES[0].key;
    const report = this.blank();
    report.id = this.newId();
    report.name = this.uniqueName(input.name.trim() || 'Untitled report');
    report.description = input.description;
    report.sourceKey = sourceKey;
    report.module = sourceOf(sourceKey).module;
    // Start with the first few fields of the source so the copy previews straight away
    report.fields = [...(STARTER_FIELDS[sourceKey] ?? [])];
    this.items = [report, ...this.items];
    return report.name;
  }
}
