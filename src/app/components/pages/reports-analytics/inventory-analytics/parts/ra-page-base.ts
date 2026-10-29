import { Directive } from '@angular/core';
import { AnalyticsPage, CURRENT_USER, RA_PEOPLE, downloadCsv } from '../../shared/analytics-common';
import { KpiMenuAction } from './kpi-card';
import { DetailsDialogData, FormDialogData, KpiCardData, ListDialogData } from './ra-parts';

type FormValues = Record<string, string | number>;

const PRIORITIES = ['High', 'Medium', 'Low'];
// DEMO MODE: reference numbers for requests raised from the insights; the procurement / workflow APIs will issue real ones
let requestSeq = 418;

/**
 * Adds what the Inventory, Financial and WIP / Production pages share on top of AnalyticsPage:
 * the Compare Periods switch, the list / details / form dialogs and the standard request forms.
 */
@Directive()
export abstract class RaDashboardPage extends AnalyticsPage {
  compare = false;
  listDialog: ListDialogData | null = null;
  detailsDialog: DetailsDialogData | null = null;
  formDialog: FormDialogData | null = null;
  private formDone: ((values: FormValues) => string) | null = null;

  /** Used for file names, e.g. "inventory-analytics" */
  protected abstract readonly slug: string;

  get scopeText(): string {
    return `${this.period} · ${this.organization} · ${this.location}`;
  }

  // ===== Dialogs =====

  openList(data: ListDialogData): void {
    this.listDialog = data;
  }

  openDetails(data: DetailsDialogData): void {
    this.detailsDialog = data;
  }

  openForm(data: FormDialogData, done: (values: FormValues) => string): void {
    this.formDialog = data;
    this.formDone = done;
  }

  closeForm(): void {
    this.formDialog = null;
    this.formDone = null;
  }

  formSubmitted(values: FormValues): void {
    const message = this.formDone ? this.formDone(values) : '';
    this.closeForm();
    if (message) this.notify(message);
  }

  openSaveView(): void {
    this.openForm(
      {
        title: 'Save View',
        intro: `Saves the current filters (${this.scopeText}) as a named view.`,
        submitLabel: 'Save View',
        fields: [{ key: 'name', label: 'View name', type: 'text', value: '', required: true, hint: 'e.g. UAE sites – this quarter' }]
      },
      (v) => {
        this.saveView(String(v['name']));
        return '';
      }
    );
  }

  // ===== KPI menu =====

  kpiAction(k: KpiCardData, action: KpiMenuAction): void {
    const change = `${k.delta > 0 ? '+' : ''}${k.delta.toFixed(1)}%`;
    if (action === 'details') {
      this.openDetails({
        title: k.label,
        subtitle: this.scopeText,
        items: [
          { label: 'Current period', value: k.value },
          { label: 'Previous period', value: k.previous },
          { label: 'Change', value: `${change} (${k.delta > 0 === k.goodWhenUp ? 'favourable' : 'unfavourable'})` },
          { label: 'Period', value: this.period },
          { label: 'Organization', value: this.organization },
          { label: 'Location', value: this.location }
        ]
      });
    } else {
      downloadCsv(`${this.slug}-${k.id}.csv`, ['KPI', 'Value', 'Previous period', 'Change', 'Period', 'Organization', 'Location'], [
        [k.label, k.value, k.previous, change, this.period, this.organization, this.location]
      ]);
    }
  }

  // ===== Standard request forms =====

  protected nextRef(prefix: string): string {
    requestSeq += 1;
    return `${prefix}-2026-${String(requestSeq).padStart(5, '0')}`;
  }

  openPurchaseRequest(item: string, quantity: number, supplier: string, priority = 'High'): void {
    this.openForm(
      {
        title: 'Create Purchase Request',
        intro: 'Raises a purchase request in Procurement for the selected stock.',
        submitLabel: 'Create Request',
        fields: [
          { key: 'item', label: 'Item(s)', type: 'text', value: item, required: true },
          { key: 'quantity', label: 'Quantity', type: 'number', value: quantity, required: true },
          { key: 'supplier', label: 'Preferred supplier', type: 'text', value: supplier },
          { key: 'needBy', label: 'Needed by', type: 'date', value: '2026-11-12', required: true },
          { key: 'priority', label: 'Priority', type: 'select', value: priority, options: PRIORITIES },
          { key: 'requester', label: 'Requested by', type: 'select', value: CURRENT_USER.name, options: RA_PEOPLE },
          { key: 'notes', label: 'Justification', type: 'textarea', value: '' }
        ]
      },
      (v) => `Purchase request ${this.nextRef('PR')} created for ${v['item']} (demo mode).`
    );
  }

  openActionPlan(subject: string, owner = RA_PEOPLE[1]): void {
    this.openForm(
      {
        title: 'Create Action Plan',
        intro: subject,
        submitLabel: 'Create Action Plan',
        fields: [
          { key: 'title', label: 'Action title', type: 'text', value: subject, required: true },
          { key: 'owner', label: 'Owner', type: 'select', value: owner, options: RA_PEOPLE, required: true },
          { key: 'due', label: 'Due date', type: 'date', value: '2026-11-15', required: true },
          { key: 'priority', label: 'Priority', type: 'select', value: 'High', options: PRIORITIES },
          { key: 'notes', label: 'Planned actions', type: 'textarea', value: '', required: true, hint: 'What will be done and how success is measured.' }
        ]
      },
      (v) => `Action plan ${this.nextRef('AP')} assigned to ${v['owner']} (demo mode).`
    );
  }
}
