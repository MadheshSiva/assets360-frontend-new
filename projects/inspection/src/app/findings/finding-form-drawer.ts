import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { AuthService } from 'shared-ui';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { InspectionFinding } from '../shared/inspection.models';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

/** Side drawer to raise a new finding or edit an existing one. */
@Component({
  selector: 'app-insp-finding-form-drawer',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <aside class="drawer" role="dialog" aria-label="Finding">
      <div class="drawer-head">
        <h2 class="grow">{{ form.id ? 'Edit Finding' : 'New Finding' }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()"><lucide-icon [img]="icons.X" [size]="18"></lucide-icon></button>
      </div>
      <div class="drawer-body">
        @if (error()) { <div class="alert">{{ error() }}</div> }
        <div class="form-grid">
          <label class="field span-2"><span class="field-label">Finding title <span class="req">*</span></span>
            <input class="control" [(ngModel)]="form.title" placeholder="e.g. Elevated bearing temperature" /></label>
          <label class="field"><span class="field-label">Inspection</span>
            <select class="control" [ngModel]="form.inspectionCode" (ngModelChange)="pickInspection($event)">
              <option value="">Not linked</option>
              @for (i of api.inspections.items(); track i.id) { <option [value]="i.inspectionCode">{{ i.inspectionCode }} — {{ i.title }}</option> }
              @if (form.inspectionCode && !hasInspection(form.inspectionCode)) { <option [value]="form.inspectionCode">{{ form.inspectionCode }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Severity <span class="req">*</span></span>
            <select class="control" [(ngModel)]="form.severity">
              <option value="" disabled>Select Severity</option>
              @for (s of severities; track s) { <option [value]="s">{{ s }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Asset code</span><input class="control" [(ngModel)]="form.assetCode" placeholder="e.g. CNC-00123" /></label>
          <label class="field"><span class="field-label">Asset name</span><input class="control" [(ngModel)]="form.assetName" /></label>
          <label class="field span-2"><span class="field-label">Source task</span><input class="control" [(ngModel)]="form.sourceTask" placeholder="Checklist task that raised the finding" /></label>
          <label class="field"><span class="field-label">Recorded value</span><input class="control" [(ngModel)]="form.recordedValue" placeholder="e.g. 86.5 °C" /></label>
          <label class="field"><span class="field-label">Acceptance</span><input class="control" [(ngModel)]="form.acceptance" placeholder="e.g. 0 – 80 °C" /></label>
          <label class="field span-2"><span class="field-label">Observation</span><textarea class="control" rows="3" [(ngModel)]="form.observation"></textarea></label>
          <label class="field"><span class="field-label">Owner <span class="req">*</span></span>
            <select class="control" [(ngModel)]="form.owner">
              <option value="">Select Owner</option>
              @for (p of withCurrent(form.owner); track p) { <option [value]="p">{{ p }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Due date</span><input class="control" type="date" [(ngModel)]="form.dueDate" /></label>
          <label class="field span-2"><span class="field-label">Corrective action</span><textarea class="control" rows="2" [(ngModel)]="form.correctiveAction"></textarea></label>
          <label class="field"><span class="field-label">Action assigned to</span>
            <select class="control" [(ngModel)]="form.assignedTo">
              <option value="">Unassigned</option>
              @for (p of withCurrent(form.assignedTo); track p) { <option [value]="p">{{ p }}</option> }
            </select></label>
          <label class="field"><span class="field-label">Work order</span><input class="control" [(ngModel)]="form.workOrder" placeholder="e.g. WO-00847" /></label>
          <label class="field span-2"><span class="field-label">Evidence</span>
            <input class="control" type="file" accept="image/*" multiple (change)="addFiles($event)" />
            <span class="field-hint">{{ form.evidence?.length || 0 }} item(s) attached. Images are stored with the finding.</span></label>
        </div>
      </div>
      <div class="drawer-foot">
        <button type="button" class="btn btn-outline" (click)="closed.emit()">Cancel</button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save Finding' }}</button>
      </div>
    </aside>
  `,
  styleUrls: ['../shared/insp-page.css']
})
export class FindingFormDrawer implements OnInit {
  readonly api = inject(InspectionApi);
  private readonly auth = inject(AuthService);
  readonly finding = input<InspectionFinding | null>(null);
  readonly people = input<string[]>([]);
  readonly saved = output<InspectionFinding>();
  readonly closed = output<void>();

  readonly icons = { X };
  readonly severities = SEVERITIES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  form: Partial<InspectionFinding> = {};

  ngOnInit(): void {
    const f = this.finding();
    this.form = f
      ? { ...f, dueDate: f.dueDate ? f.dueDate.slice(0, 10) : null, evidence: [...(f.evidence ?? [])] }
      : {
          title: '',
          inspectionCode: '',
          assetCode: '',
          assetName: '',
          sourceTask: '',
          severity: '',
          owner: '',
          dueDate: null,
          recordedValue: '',
          acceptance: '',
          observation: '',
          evidence: [],
          correctiveAction: '',
          assignedTo: '',
          workOrder: '',
          workOrderStatus: '',
          workflowStep: 'Open',
          status: 'Open',
          activity: []
        };
  }

  withCurrent(name: string | undefined): string[] {
    const list = this.people();
    return name && !list.includes(name) ? [name, ...list] : list;
  }

  hasInspection(code: string): boolean {
    return this.api.inspections.items().some((i) => i.inspectionCode === code);
  }

  /** Linking an inspection copies its asset when the asset fields are still empty. */
  pickInspection(code: string): void {
    this.form.inspectionCode = code;
    const i = this.api.inspections.items().find((x) => x.inspectionCode === code);
    if (i && !this.form.assetCode) {
      this.form.assetCode = i.assetCode;
      this.form.assetName = i.assetName;
    }
    if (i && !this.form.owner) this.form.owner = i.assignedTo;
  }

  addFiles(ev: Event): void {
    const files = Array.from((ev.target as HTMLInputElement).files ?? []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => (this.form.evidence = [...(this.form.evidence ?? []), String(reader.result)]);
      reader.readAsDataURL(file);
    }
  }

  save(): void {
    const f = this.form;
    if (!f.title?.trim()) return this.error.set('Finding title is required.');
    if (!f.severity) return this.error.set('Select a severity.');
    if (!f.owner) return this.error.set('Select an owner.');
    this.error.set(null);
    this.saving.set(true);
    const by = this.auth.getUser()?.userName || this.auth.getUserEmail() || 'Unknown user';
    const record: Partial<InspectionFinding> = { ...f, title: f.title.trim(), dueDate: f.dueDate || null };
    record.activity = [
      ...(f.activity ?? []),
      { at: new Date().toISOString(), by, text: f.id ? 'Finding details updated' : 'Finding raised' }
    ];
    this.api.findings.save(record).subscribe({
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
