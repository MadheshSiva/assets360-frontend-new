import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { KPI_MODULES, KPI_UNITS, KpiDef, KpiDirection, KpiMetric, KpiModule, KpiUnit } from './kpi-dashboard.data';

export interface KpiFormValue {
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  /** Catalogue metric measured from live records; '' = manually reported value */
  metric: string;
  value: number | null;
  target: number | null;
  direction: KpiDirection;
  owner: string;
  /** yyyy-MM-dd or '' */
  reviewDue: string;
}

/**
 * Create KPI / Edit KPI. Built-in KPIs keep their module, unit and measure (name, target, direction, owner and review date can change).
 * A custom KPI either measures a catalogue metric or reports its value by hand.
 */
@Component({
  selector: 'app-ra-kpi-form-dialog',
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="backdrop($event)">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="kd-form-title" (ngSubmit)="submit()">
        <h2 id="kd-form-title">{{ editing ? 'Edit KPI' : 'Create KPI' }}</h2>
        <p>{{ editing ? 'Change the target, direction or owner. Status recalculates immediately.' : 'Adds the KPI to the library and as a tile on the current view.' }}</p>
        <div class="field" [class.invalid]="tried && !!nameError">
          <label for="kd-name">KPI name <span class="req">*</span></label>
          <input id="kd-name" name="name" maxlength="60" [(ngModel)]="form.name" />
          @if (tried && nameError) { <small>{{ nameError }}</small> }
        </div>
        <div class="field">
          <label for="kd-metric">Measure</label>
          <select id="kd-metric" name="metric" [(ngModel)]="form.metric" (ngModelChange)="metricChanged()" [disabled]="builtIn">
            <option value="">Manual value (reported by the owner)</option>
            @for (m of metrics; track m.id) { <option [value]="m.id">{{ m.name }} ({{ m.source }})</option> }
          </select>
        </div>
        <div class="rak-form-grid kd-form-grid">
          <div class="field">
            <label for="kd-module">Module</label>
            <select id="kd-module" name="module" [(ngModel)]="form.module" [disabled]="builtIn">
              @for (m of modules; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="kd-unit">Unit</label>
            <select id="kd-unit" name="unit" [(ngModel)]="form.unit" [disabled]="builtIn || !!form.metric">
              @for (u of units; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
            </select>
          </div>
          <div class="field" [class.invalid]="tried && !valueOk">
            <label for="kd-value">Current value @if (manual) { <span class="req">*</span> }</label>
            <input id="kd-value" name="value" type="number" min="0" step="any" [(ngModel)]="form.value" [disabled]="!manual"
              [placeholder]="manual ? '' : 'Measured from live data'" />
            @if (tried && !valueOk) { <small>Enter a number of 0 or more.</small> }
          </div>
          <div class="field" [class.invalid]="tried && !targetOk">
            <label for="kd-target">Target <span class="req">*</span></label>
            <input id="kd-target" name="target" type="number" min="0" step="any" [(ngModel)]="form.target" />
            @if (tried && !targetOk) { <small>Enter a target greater than 0.</small> }
            @if (flow) { <small class="muted">Annual amount, pro-rated to the selected period.</small> }
          </div>
          <div class="field">
            <label for="kd-direction">Direction</label>
            <select id="kd-direction" name="direction" [(ngModel)]="form.direction">
              <option value="higher">Higher is better</option>
              <option value="lower">Lower is better</option>
            </select>
          </div>
          <div class="field" [class.invalid]="tried && !form.owner.trim()">
            <label for="kd-owner">Owner <span class="req">*</span></label>
            <input id="kd-owner" name="owner" maxlength="100" list="kd-owner-list" placeholder="Select or type a name" [(ngModel)]="form.owner" />
            <datalist id="kd-owner-list">
              @for (p of owners; track p) { <option [value]="p"></option> }
            </datalist>
            @if (tried && !form.owner.trim()) { <small>Choose an owner.</small> }
          </div>
          <div class="field">
            <label for="kd-review">Next review due</label>
            <input id="kd-review" name="reviewDue" type="date" [(ngModel)]="form.reviewDue" />
          </div>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="saving">{{ editing ? 'Save changes' : 'Create KPI' }}</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../shared/analytics-page.css', '../inspection-analytics/kit/kit.css']
})
export class KpiFormDialog implements OnInit {
  readonly modules = KPI_MODULES;
  readonly units: { value: KpiUnit; label: string }[] = [
    { value: '%', label: 'Percent (%)' },
    { value: 'count', label: 'Count' },
    { value: 'AED', label: 'Amount (AED)' },
    { value: 'x', label: 'Ratio (x)' },
    { value: 'hrs', label: 'Hours' }
  ];

  /** KPI being edited; null to create a new one */
  @Input() kpi: KpiDef | null = null;
  /** The KPI's current value for the filter bar (shown for measured KPIs) */
  @Input() currentValue: number | null = null;
  @Input() defaultModule: KpiModule = 'Asset';
  /** Names already used (case-insensitive check) */
  @Input() takenNames: string[] = [];
  /** Metrics a custom KPI can measure (/options) */
  @Input() metrics: KpiMetric[] = [];
  /** Owner suggestions (/options) */
  @Input() owners: string[] = [];
  /** True while the save request runs */
  @Input() saving = false;
  @Output() saved = new EventEmitter<KpiFormValue>();
  @Output() closed = new EventEmitter<void>();

  form: KpiFormValue = { name: '', module: 'Asset', unit: '%', metric: '', value: null, target: null, direction: 'higher', owner: '', reviewDue: '' };
  tried = false;

  get editing(): boolean {
    return !!this.kpi;
  }

  get builtIn(): boolean {
    return !!this.kpi && !this.kpi.custom;
  }

  get manual(): boolean {
    return !this.form.metric;
  }

  get flow(): boolean {
    return this.kpi?.flow ?? false;
  }

  ngOnInit(): void {
    const k = this.kpi;
    this.form = k
      ? {
          name: k.name, module: k.module, unit: k.unit, metric: k.metric ?? '', value: k.metric ? this.currentValue : k.manualValue, target: k.target,
          direction: k.direction, owner: k.owner, reviewDue: k.reviewDue ?? ''
        }
      : { ...this.form, module: this.defaultModule };
    // KPI_UNITS is the source of truth for the unit list
    if (!KPI_UNITS.includes(this.form.unit)) this.form.unit = '%';
  }

  /** A measured KPI takes the metric's unit and direction. */
  metricChanged(): void {
    const m = this.metrics.find((x) => x.id === this.form.metric);
    if (m) {
      this.form.unit = m.unit;
      this.form.direction = m.direction;
      this.form.value = null;
    }
  }

  get nameError(): string {
    const name = this.form.name.trim();
    if (!name) return 'Enter a KPI name.';
    const own = this.kpi?.name.toLowerCase();
    return this.takenNames.some((n) => n.toLowerCase() === name.toLowerCase() && n.toLowerCase() !== own) ? 'A KPI with this name already exists.' : '';
  }

  get valueOk(): boolean {
    if (!this.manual) return true;
    return this.form.value !== null && Number.isFinite(Number(this.form.value)) && Number(this.form.value) >= 0;
  }

  get targetOk(): boolean {
    return this.form.target !== null && Number.isFinite(Number(this.form.target)) && Number(this.form.target) > 0;
  }

  submit(): void {
    this.tried = true;
    if (this.saving || this.nameError || !this.valueOk || !this.targetOk || !this.form.owner.trim()) return;
    this.saved.emit({
      ...this.form,
      name: this.form.name.trim(),
      owner: this.form.owner.trim(),
      value: this.manual ? Number(this.form.value) : null,
      target: Number(this.form.target)
    });
  }

  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
