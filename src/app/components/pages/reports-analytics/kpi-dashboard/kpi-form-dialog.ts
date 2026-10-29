import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RA_PEOPLE } from '../shared/analytics-common';
import { KPI_MODULES, KPI_UNITS, KpiDef, KpiDirection, KpiModule, KpiUnit } from './kpi-dashboard.data';

export interface KpiFormValue {
  name: string;
  module: KpiModule;
  unit: KpiUnit;
  value: number | null;
  target: number | null;
  direction: KpiDirection;
  owner: string;
}

/** Create KPI / Edit KPI form. Editing keeps the KPI's id and history. */
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
        <div class="rak-form-grid kd-form-grid">
          <div class="field">
            <label for="kd-module">Module</label>
            <select id="kd-module" name="module" [(ngModel)]="form.module" [disabled]="editing">
              @for (m of modules; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="kd-unit">Unit</label>
            <select id="kd-unit" name="unit" [(ngModel)]="form.unit" [disabled]="editing">
              @for (u of units; track u.value) { <option [value]="u.value">{{ u.label }}</option> }
            </select>
          </div>
          <div class="field" [class.invalid]="tried && !valueOk">
            <label for="kd-value">Current value <span class="req">*</span></label>
            <input id="kd-value" name="value" type="number" min="0" step="any" [(ngModel)]="form.value" [disabled]="editing" />
            @if (tried && !valueOk) { <small>Enter a number of 0 or more.</small> }
          </div>
          <div class="field" [class.invalid]="tried && !targetOk">
            <label for="kd-target">Target <span class="req">*</span></label>
            <input id="kd-target" name="target" type="number" min="0" step="any" [(ngModel)]="form.target" />
            @if (tried && !targetOk) { <small>Enter a target greater than 0.</small> }
          </div>
          <div class="field">
            <label for="kd-direction">Direction</label>
            <select id="kd-direction" name="direction" [(ngModel)]="form.direction">
              <option value="higher">Higher is better</option>
              <option value="lower">Lower is better</option>
            </select>
          </div>
          <div class="field" [class.invalid]="tried && !form.owner">
            <label for="kd-owner">Owner <span class="req">*</span></label>
            <select id="kd-owner" name="owner" [(ngModel)]="form.owner">
              <option value="">Select owner</option>
              @for (p of people; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            @if (tried && !form.owner) { <small>Choose an owner.</small> }
          </div>
        </div>
        <p class="muted rak-demo">DEMO MODE: KPIs are kept for this session only.</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">{{ editing ? 'Save changes' : 'Create KPI' }}</button>
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
  readonly people = RA_PEOPLE;

  /** KPI being edited; null to create a new one */
  @Input() kpi: KpiDef | null = null;
  @Input() defaultModule: KpiModule = 'Asset';
  /** Names already used (case-insensitive check) */
  @Input() takenNames: string[] = [];
  @Output() saved = new EventEmitter<KpiFormValue>();
  @Output() closed = new EventEmitter<void>();

  form: KpiFormValue = { name: '', module: 'Asset', unit: '%', value: null, target: null, direction: 'higher', owner: '' };
  tried = false;

  get editing(): boolean {
    return !!this.kpi;
  }

  ngOnInit(): void {
    const k = this.kpi;
    this.form = k
      ? { name: k.name, module: k.module, unit: k.unit, value: k.value, target: k.target, direction: k.direction, owner: k.owner }
      : { ...this.form, module: this.defaultModule };
    // KPI_UNITS is the source of truth for the unit list
    if (!KPI_UNITS.includes(this.form.unit)) this.form.unit = '%';
  }

  get nameError(): string {
    const name = this.form.name.trim();
    if (!name) return 'Enter a KPI name.';
    const own = this.kpi?.name.toLowerCase();
    return this.takenNames.some((n) => n.toLowerCase() === name.toLowerCase() && n.toLowerCase() !== own) ? 'A KPI with this name already exists.' : '';
  }

  get valueOk(): boolean {
    return this.form.value !== null && Number.isFinite(Number(this.form.value)) && Number(this.form.value) >= 0;
  }

  get targetOk(): boolean {
    return this.form.target !== null && Number.isFinite(Number(this.form.target)) && Number(this.form.target) > 0;
  }

  submit(): void {
    this.tried = true;
    if (this.nameError || !this.valueOk || !this.targetOk || !this.form.owner) return;
    this.saved.emit({ ...this.form, name: this.form.name.trim(), value: Number(this.form.value), target: Number(this.form.target) });
  }

  backdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }
}
