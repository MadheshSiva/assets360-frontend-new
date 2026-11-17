import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { InspectionPlan } from '../shared/inspection.models';

const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually'];

/** Side drawer to create or edit an inspection plan. */
@Component({
  selector: 'app-insp-plan-form-drawer',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-label="Inspection plan">
      <div class="drawer-head">
        <h2 class="grow">{{ form.id ? 'Edit Plan' : 'New Inspection Plan' }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="18"></lucide-icon></button>
      </div>
      <div class="drawer-body">
        @if (error()) { <div class="alert">{{ error() }}</div> }
        <div class="form-grid">
          <label class="field span-2"><span class="field-label">Plan name <span class="req">*</span></span>
            <input class="control" [(ngModel)]="form.planName" placeholder="e.g. Monthly Equipment Safety" /></label>
          @if (form.id) {
            <label class="field"><span class="field-label">Plan code</span><input class="control" [ngModel]="form.planCode" readonly /></label>
          }
          <label class="field"><span class="field-label">Inspection type <span class="req">*</span></span>
            <select class="control" [ngModel]="form.inspectionTypeName" (ngModelChange)="pickType($event)">
              <option value="">Select Type</option>
              @for (t of api.types.items(); track t.id) { <option [value]="t.inspectionTypeName">{{ t.inspectionTypeName }}</option> }
              @if (form.inspectionTypeName && !hasType(form.inspectionTypeName)) { <option [value]="form.inspectionTypeName">{{ form.inspectionTypeName }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Category</span><input class="control" [(ngModel)]="form.category" placeholder="e.g. Safety" /></label>
          <label class="field"><span class="field-label">Frequency</span>
            <select class="control" [(ngModel)]="form.frequency">
              <option value="" disabled>Select Frequency</option>
              @for (f of frequencies; track f) { <option [value]="f">{{ f }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Scope (asset count)</span><input class="control" type="number" min="0" [(ngModel)]="form.assetCount" /></label>
          <label class="field"><span class="field-label">Next due date</span><input class="control" type="date" [(ngModel)]="form.nextDueDate" /></label>
          <label class="field"><span class="field-label">Inspector</span>
            <select class="control" [(ngModel)]="form.inspectorName">
              <option value="">Unassigned</option>
              @for (p of peopleList(); track p) { <option [value]="p">{{ p }}</option> }
            </select></label>
          <label class="field span-2"><span class="field-label">Checklist</span>
            <select class="control" [ngModel]="form.checklistCode" (ngModelChange)="pickChecklist($event)">
              <option value="">No checklist</option>
              @for (c of api.checklists.items(); track c.id) { <option [value]="c.checklistCode">{{ c.templateName }} ({{ c.checklistCode }})</option> }
              @if (form.checklistCode && !hasChecklist(form.checklistCode)) { <option [value]="form.checklistCode">{{ form.checklistName || form.checklistCode }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Lead time (days)</span><input class="control" type="number" min="0" [(ngModel)]="form.leadTimeDays" />
            <span class="field-hint">Inspections are generated this many days before the due date.</span></label>
          <div class="field">
            <span class="field-label">Options</span>
            <label class="check"><input type="checkbox" [(ngModel)]="form.autoGenerate" /> Auto-generate inspections</label>
            <label class="check"><input type="checkbox" [(ngModel)]="form.isActive" /> Active</label>
          </div>
        </div>
      </div>
      <div class="drawer-foot">
        <button type="button" class="btn btn-outline" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save Plan' }}</button>
      </div>
    </aside>
  `,
  styleUrls: ['../shared/insp-page.css']
})
export class PlanFormDrawer implements OnInit {
  readonly api = inject(InspectionApi);
  readonly plan = input<InspectionPlan | null>(null);
  readonly people = input<string[]>([]);
  readonly saved = output<InspectionPlan>();
  readonly closed = output<void>();

  readonly icons = { X };
  readonly frequencies = FREQUENCIES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  form: Partial<InspectionPlan> = {};

  ngOnInit(): void {
    const p = this.plan();
    this.form = p
      ? { ...p, nextDueDate: p.nextDueDate ? p.nextDueDate.slice(0, 10) : null }
      : {
          planName: '',
          inspectionTypeName: '',
          category: '',
          frequency: '',
          assetCount: 1,
          nextDueDate: null,
          inspectorName: '',
          checklistCode: '',
          checklistName: '',
          leadTimeDays: 3,
          autoGenerate: true,
          isActive: true
        };
  }

  peopleList(): string[] {
    const names = this.people();
    return this.form.inspectorName && !names.includes(this.form.inspectorName) ? [this.form.inspectorName, ...names] : names;
  }

  hasType(name: string): boolean {
    return this.api.types.items().some((t) => t.inspectionTypeName === name);
  }

  hasChecklist(code: string): boolean {
    return this.api.checklists.items().some((c) => c.checklistCode === code);
  }

  /** Picking a type pre-fills category, frequency and checklist from its defaults when those are empty. */
  pickType(name: string): void {
    this.form.inspectionTypeName = name;
    const t = this.api.types.items().find((x) => x.inspectionTypeName === name);
    if (!t) return;
    if (!this.form.category) this.form.category = t.category;
    if (!this.form.id && t.defaultFrequency && FREQUENCIES.includes(t.defaultFrequency)) this.form.frequency = t.defaultFrequency;
    if (!this.form.checklistCode && t.defaultChecklistCode) {
      this.form.checklistCode = t.defaultChecklistCode;
      this.form.checklistName = t.defaultChecklistName;
    }
  }

  pickChecklist(code: string): void {
    const c = this.api.checklists.items().find((x) => x.checklistCode === code);
    this.form.checklistCode = code;
    this.form.checklistName = c ? c.templateName : code ? this.form.checklistName : '';
  }

  save(): void {
    const f = this.form;
    if (!f.planName?.trim()) return this.error.set('Plan name is required.');
    if (!f.inspectionTypeName) return this.error.set('Select an inspection type.');
    if (!f.frequency) return this.error.set('Select a frequency.');
    this.error.set(null);
    this.saving.set(true);
    const record: Partial<InspectionPlan> = {
      ...f,
      planName: f.planName.trim(),
      assetCount: Math.max(0, Number(f.assetCount) || 0),
      leadTimeDays: Math.max(0, Number(f.leadTimeDays) || 0),
      nextDueDate: f.nextDueDate || null,
      status: f.isActive ? 'Active' : 'Inactive'
    };
    this.api.plans.save(record).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.saved.emit(saved);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(e));
      }
    });
  }
}
