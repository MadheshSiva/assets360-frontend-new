import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, Info, LucideAngularModule, Play, Plus, Trash2 } from 'lucide-angular';
import { DatasetField, DeliveryType, ExportDraft, ExportFilter, ExportFormat, ExportJob, Frequency } from './data-export-api.model';
import { DataExportService } from './data-export-api.service';

const OPERATORS: Record<string, string[]> = {
  text: ['equals', 'not equals', 'contains'],
  id: ['equals', 'starts with'],
  number: ['=', '>', '<', '≥', '≤'],
  money: ['=', '>', '<', '≥', '≤'],
  percent: ['=', '>', '<', '≥', '≤'],
  date: ['in last', 'before', 'after']
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

function blankDraft(datasetId: string): ExportDraft {
  return {
    id: null, name: '', datasetId, format: 'CSV', fields: [], filters: [], delivery: 'S3', target: 's3://piq-asset360-exports/',
    frequency: 'Daily', time: '02:00', encrypted: true
  };
}

/** Five-step Export Builder: dataset, fields, filters, delivery, review. Emits drafts; the page saves them. */
@Component({
  standalone: true,
  selector: 'dx-export-builder',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget dx-builder">
      <div class="widget__head">
        <h2>{{ draft.id ? 'Edit Export' : 'Export Builder' }}</h2>
        @if (draft.id) {
          <button type="button" class="btn btn--link" (click)="reset()">New export</button>
        }
      </div>
      <ol class="dx-steps">
        @for (s of steps; track s; let i = $index) {
          <li [class.active]="i === step" [class.done]="i < step">
            <button type="button" (click)="goTo(i)" [attr.aria-current]="i === step ? 'step' : null">
              <span class="dx-step-num">
                @if (i < step) {
                  <lucide-icon [img]="icons.Check" [size]="12"></lucide-icon>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="dx-step-label">{{ s }}</span>
            </button>
          </li>
        }
      </ol>

      <div class="dx-step-body">
        @switch (step) {
          @case (0) {
            <label class="dx-row-field">
              <span>Dataset</span>
              <select class="select" [ngModel]="draft.datasetId" (ngModelChange)="setDataset($event)" name="ds">
                @for (d of service.datasets; track d.id) {
                  <option [value]="d.id">{{ d.name }}</option>
                }
              </select>
            </label>
            <label class="dx-row-field">
              <span>File format</span>
              <select class="select" [(ngModel)]="draft.format" name="fmt">
                @for (f of formats; track f) {
                  <option [value]="f">{{ f }}</option>
                }
              </select>
            </label>
            <p class="muted dx-small">{{ datasetSummary }}</p>
          }
          @case (1) {
            <div class="dx-field-tools">
              <input class="select dx-grow" placeholder="Search fields…" [(ngModel)]="fieldSearch" name="fs" aria-label="Search fields" />
              <button type="button" class="btn btn--link" (click)="selectAll()">All</button>
              <button type="button" class="btn btn--link" (click)="clearFields()">None</button>
            </div>
            <div class="dx-field-list">
              @for (g of fieldGroups; track g.group) {
                <strong>{{ g.group }}</strong>
                @for (fl of g.fields; track fl.name) {
                  <label class="dx-check">
                    <input type="checkbox" [checked]="hasField(fl.name)" (change)="toggleField(fl.name)" />
                    {{ fl.name }}
                  </label>
                }
              } @empty {
                <p class="muted">No fields match.</p>
              }
            </div>
            <small class="muted">{{ draft.fields.length }} of {{ allFields.length }} fields selected</small>
          }
          @case (2) {
            @for (r of draft.filters; track $index; let i = $index) {
              <div class="dx-filter-row">
                <select class="select" [(ngModel)]="r.field" [name]="'ff' + i" (ngModelChange)="fieldChanged(r)" aria-label="Field">
                  <option value="">Field…</option>
                  @for (fl of allFields; track fl.name) {
                    <option [value]="fl.name">{{ fl.name }}</option>
                  }
                </select>
                <select class="select" [(ngModel)]="r.operator" [name]="'fo' + i" aria-label="Operator">
                  @for (o of operatorsFor(r); track o) {
                    <option [value]="o">{{ o }}</option>
                  }
                </select>
                <input class="select" [(ngModel)]="r.value" [name]="'fv' + i" [placeholder]="valueHint(r)" aria-label="Value" maxlength="80" />
                <button type="button" class="icon-btn" (click)="removeFilter(i)" aria-label="Remove filter">
                  <lucide-icon [img]="icons.Trash2" [size]="14"></lucide-icon>
                </button>
              </div>
            } @empty {
              <p class="muted dx-small">No filters — every row of the dataset is exported.</p>
            }
            <button type="button" class="btn btn--sm btn--outline" (click)="addFilter()">
              <lucide-icon [img]="icons.Plus" [size]="13"></lucide-icon> Add filter
            </button>
          }
          @case (3) {
            <div class="dx-row-field">
              <span>Destination</span>
              <span class="dx-radios" role="radiogroup" aria-label="Destination">
                @for (d of deliveries; track d) {
                  <label><input type="radio" name="delivery" [value]="d" [ngModel]="draft.delivery" (ngModelChange)="setDelivery($event)" /> {{ d }}</label>
                }
              </span>
            </div>
            @if (draft.delivery === 'API') {
              <label class="dx-row-field">
                <span>Connection</span>
                <select class="select" [(ngModel)]="draft.target" name="tgt">
                  <option value="">Select…</option>
                  @for (c of service.connections; track c.id) {
                    <option [value]="c.name">{{ c.name }} ({{ c.status }})</option>
                  }
                </select>
              </label>
            } @else {
              <label class="dx-row-field">
                <span>{{ targetLabel }}</span>
                <input class="select" [(ngModel)]="draft.target" name="tgt" [placeholder]="targetHint" maxlength="200" />
              </label>
            }
            <label class="dx-row-field">
              <span>Frequency</span>
              <select class="select" [(ngModel)]="draft.frequency" name="freq">
                @for (fq of frequencies; track fq) {
                  <option [value]="fq">{{ fq }}</option>
                }
              </select>
            </label>
            @if (needsTime) {
              <div class="dx-row-field">
                <span>Run at</span>
                <span class="dx-inline">
                  @if (draft.frequency === 'Weekly') {
                    <select class="select" [(ngModel)]="weekday" name="wd" aria-label="Day">
                      @for (d of weekdays; track d) {
                        <option [value]="d">{{ d }}</option>
                      }
                    </select>
                  }
                  <input class="select" type="time" [(ngModel)]="clock" name="clk" aria-label="Time (Asia/Dubai)" />
                  <small class="muted">GST</small>
                </span>
              </div>
            }
          }
          @case (4) {
            <label class="dx-row-field">
              <span>Export name <span class="req">*</span></span>
              <input class="select" [(ngModel)]="draft.name" name="nm" maxlength="80" placeholder="e.g. Weekly Asset Feed" />
            </label>
            <dl class="dx-dl dx-dl--tight">
              <dt>Dataset</dt><dd>{{ datasetName }} · {{ draft.format }}</dd>
              <dt>Fields</dt><dd>{{ fieldsSummary }}</dd>
              <dt>Filters</dt><dd>{{ filtersSummary }}</dd>
              <dt>Delivery</dt><dd>{{ draft.delivery }} → {{ draft.target || '—' }}</dd>
              <dt>Schedule</dt><dd>{{ scheduleSummary }}</dd>
            </dl>
          }
        }
        @if (submitted && error) {
          <p class="dx-error">{{ error }}</p>
        }
      </div>

      <div class="dx-row-field dx-enc">
        <span>Encryption <lucide-icon class="widget__info" [img]="icons.Info" [size]="13" title="Files are encrypted at rest and in transit"></lucide-icon></span>
        <label class="switch">
          <input type="checkbox" [(ngModel)]="draft.encrypted" name="enc" />
          <i></i>{{ draft.encrypted ? 'On' : 'Off' }}
        </label>
        <small class="muted">{{ draft.encrypted ? 'AES-256 encryption enabled' : 'Not recommended' }}</small>
      </div>

      <div class="dx-builder-actions">
        <button type="button" class="btn btn--sm" [disabled]="step === 0" (click)="back()">Back</button>
        @if (step < steps.length - 1) {
          <button type="button" class="btn btn--sm btn--outline" (click)="next()">Next</button>
        }
        <span class="dx-grow"></span>
        <button type="button" class="btn btn--sm btn--outline" (click)="saveDraft()">Save Draft</button>
        <button type="button" class="btn btn--sm btn--primary" (click)="runExport()">
          <lucide-icon [img]="icons.Play" [size]="13"></lucide-icon> {{ draft.id ? 'Save & Run' : 'Run Export' }}
        </button>
      </div>
    </section>
  `
})
export class ExportBuilder {
  readonly service = inject(DataExportService);
  @Output() draftSaved = new EventEmitter<ExportDraft>();
  @Output() runRequested = new EventEmitter<ExportDraft>();

  readonly icons = { Check, Info, Play, Plus, Trash2 };
  readonly steps = ['Select Dataset', 'Choose Fields', 'Apply Filters', 'Set Delivery', 'Review'];
  readonly formats: ExportFormat[] = ['CSV', 'XLSX', 'JSON', 'Parquet'];
  readonly deliveries: DeliveryType[] = ['S3', 'Secure FTP', 'Email', 'API'];
  readonly frequencies: Frequency[] = ['On demand', 'Hourly', 'Daily', 'Weekly', 'Monthly', 'Real-time'];
  readonly weekdays = WEEKDAYS;

  step = 0;
  draft: ExportDraft = blankDraft('DS-11');
  fieldSearch = '';
  weekday = 'Mon';
  clock = '02:00';
  submitted = false;
  error = '';

  constructor() {
    this.selectAll();
  }

  /** Loads a job for editing, or starts a blank export (optionally on a dataset). */
  load(job: ExportJob | null, datasetId?: string): void {
    this.step = 0;
    this.submitted = false;
    this.error = '';
    this.fieldSearch = '';
    if (!job) {
      this.draft = blankDraft(datasetId ?? 'DS-11');
      this.weekday = 'Mon';
      this.clock = '02:00';
      this.selectAll();
      return;
    }
    this.draft = {
      id: job.id, name: job.name, datasetId: job.datasetId, format: job.format === 'API' ? 'JSON' : job.format, fields: job.fields.slice(),
      filters: job.filters.map((x) => ({ ...x })), delivery: job.delivery, target: job.target, frequency: job.frequency, time: job.time,
      encrypted: job.encrypted
    };
    const parts = job.time.split(' ');
    this.weekday = parts.length > 1 ? parts[0] : 'Mon';
    const t = parts[parts.length - 1];
    this.clock = /^\d{2}:\d{2}$/.test(t) ? t : /^\d{2}$/.test(t) ? `00:${t}` : '02:00';
  }

  reset(): void {
    this.load(null);
  }

  // ----- Dataset & fields -----

  get allFields(): DatasetField[] {
    return this.service.fields(this.draft.datasetId);
  }

  get fieldGroups(): { group: string; fields: DatasetField[] }[] {
    const q = this.fieldSearch.trim().toLowerCase();
    const groups: { group: string; fields: DatasetField[] }[] = [];
    for (const fl of this.allFields) {
      if (q && !fl.name.toLowerCase().includes(q)) continue;
      let g = groups.find((x) => x.group === fl.group);
      if (!g) groups.push((g = { group: fl.group, fields: [] }));
      if (!g.fields.some((x) => x.name === fl.name)) g.fields.push(fl);
    }
    return groups;
  }

  get datasetName(): string {
    return this.service.dataset(this.draft.datasetId)?.name ?? '';
  }

  get datasetSummary(): string {
    const ds = this.service.dataset(this.draft.datasetId);
    return ds ? `${ds.rows.toLocaleString('en-US')} rows · ${this.allFields.length} fields · refreshed ${ds.refreshed.replace('T', ' ')}` : '';
  }

  setDataset(id: string): void {
    this.draft.datasetId = id;
    this.draft.filters = [];
    this.selectAll();
  }

  hasField(name: string): boolean {
    return this.draft.fields.includes(name);
  }

  toggleField(name: string): void {
    this.draft.fields = this.hasField(name) ? this.draft.fields.filter((x) => x !== name) : this.draft.fields.concat(name);
  }

  selectAll(): void {
    this.draft.fields = Array.from(new Set(this.allFields.map((x) => x.name)));
  }

  clearFields(): void {
    this.draft.fields = [];
  }

  // ----- Filters -----

  addFilter(): void {
    this.draft.filters.push({ field: '', operator: 'equals', value: '' });
  }

  removeFilter(i: number): void {
    this.draft.filters.splice(i, 1);
  }

  private fieldType(name: string): string {
    return this.allFields.find((x) => x.name === name)?.type ?? 'text';
  }

  operatorsFor(r: ExportFilter): string[] {
    return OPERATORS[this.fieldType(r.field)];
  }

  fieldChanged(r: ExportFilter): void {
    r.operator = this.operatorsFor(r)[0];
    r.value = '';
  }

  valueHint(r: ExportFilter): string {
    const t = this.fieldType(r.field);
    if (t === 'date') return r.operator === 'in last' ? '30 days' : '2026-10-01';
    if (t === 'text' || t === 'id') return 'Value';
    return '0';
  }

  private filterError(): string {
    for (const r of this.draft.filters) {
      if (!r.field || !r.operator || !r.value.trim()) return 'Complete or remove every filter row.';
      const t = this.fieldType(r.field);
      if ((t === 'number' || t === 'money' || t === 'percent') && Number.isNaN(Number(r.value))) return `${r.field} needs a number.`;
      if (t === 'date' && r.operator === 'in last' && !/^\d+\s+(days?|weeks?|months?)$/i.test(r.value.trim())) return `Use e.g. "30 days" for ${r.field}.`;
      if (t === 'date' && r.operator !== 'in last' && !/^\d{4}-\d{2}-\d{2}$/.test(r.value.trim())) return `Use YYYY-MM-DD for ${r.field}.`;
    }
    return '';
  }

  // ----- Delivery -----

  get needsTime(): boolean {
    return this.draft.frequency !== 'Real-time' && this.draft.frequency !== 'On demand';
  }

  get targetLabel(): string {
    return this.draft.delivery === 'S3' ? 'Bucket path' : this.draft.delivery === 'Email' ? 'Recipients' : 'Host / folder';
  }

  get targetHint(): string {
    return this.draft.delivery === 'S3' ? 's3://bucket/folder/' : this.draft.delivery === 'Email' ? 'name@purpleiq.com, …' : 'sftp.purpleiq.com/exports';
  }

  setDelivery(d: DeliveryType): void {
    this.draft.delivery = d;
    this.draft.target = d === 'S3' ? 's3://piq-asset360-exports/' : d === 'Email' ? '' : d === 'Secure FTP' ? 'sftp.purpleiq.com/exports' : '';
  }

  get deliveryError(): string {
    const t = this.draft.target.trim();
    switch (this.draft.delivery) {
      case 'S3':
        return /^s3:\/\/[a-z0-9][a-z0-9.-]{2,62}(\/[\w.\-/]*)?$/.test(t) ? '' : 'Enter an S3 path such as s3://bucket/folder/.';
      case 'Secure FTP':
        return /^[a-z0-9.-]+\.[a-z]{2,}(\/[\w.\-/]*)?$/i.test(t) ? '' : 'Enter an SFTP host and folder, without credentials.';
      case 'Email': {
        const list = t.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        if (!list.length) return 'Add at least one recipient.';
        return list.every((x) => EMAIL.test(x)) ? '' : 'One of the recipient addresses is not valid.';
      }
      default:
        return t ? '' : 'Choose an API connection.';
    }
  }

  private composeTime(): void {
    if (this.draft.frequency === 'Real-time') this.draft.time = 'Continuous';
    else if (this.draft.frequency === 'On demand') this.draft.time = 'Manual';
    else if (this.draft.frequency === 'Hourly') this.draft.time = (this.clock || '00:00').slice(3, 5);
    else if (this.draft.frequency === 'Weekly') this.draft.time = `${this.weekday} ${this.clock}`;
    else this.draft.time = this.clock;
  }

  // ----- Review -----

  get fieldsSummary(): string {
    const f = this.draft.fields;
    return f.length > 4 ? `${f.slice(0, 4).join(', ')} +${f.length - 4} more` : f.join(', ') || '—';
  }

  get filtersSummary(): string {
    return this.draft.filters.map((r) => `${r.field} ${r.operator} ${r.value}`).join('; ') || 'None';
  }

  get scheduleSummary(): string {
    if (!this.needsTime) return this.draft.frequency;
    return this.draft.frequency === 'Weekly' ? `Weekly, ${this.weekday} ${this.clock} (GST)` : `${this.draft.frequency}, ${this.clock} (GST)`;
  }

  // ----- Navigation & save -----

  private stepError(i: number): string {
    if (i === 0) return this.service.dataset(this.draft.datasetId) ? '' : 'Choose a dataset.';
    if (i === 1) return this.draft.fields.length ? '' : 'Select at least one field.';
    if (i === 2) return this.filterError();
    if (i === 3) return this.deliveryError || (this.needsTime && !/^\d{2}:\d{2}$/.test(this.clock) ? 'Choose a run time.' : '');
    return this.nameError();
  }

  private nameError(): string {
    const n = this.draft.name.trim();
    if (!n) return 'Give the export a name.';
    if (this.service.nameTaken(n, this.draft.id)) return 'An export with this name already exists.';
    return '';
  }

  next(): void {
    this.submitted = true;
    this.error = this.stepError(this.step);
    if (this.error) return;
    this.submitted = false;
    this.step++;
  }

  back(): void {
    this.error = '';
    this.step = Math.max(0, this.step - 1);
  }

  goTo(i: number): void {
    if (i <= this.step) {
      this.error = '';
      this.step = i;
      return;
    }
    // Moving forward checks every step in between
    for (let s = this.step; s < i; s++) {
      const e = this.stepError(s);
      if (e) {
        this.step = s;
        this.submitted = true;
        this.error = e;
        return;
      }
    }
    this.error = '';
    this.step = i;
  }

  saveDraft(): void {
    this.submitted = true;
    this.error = this.nameError();
    if (this.error) {
      this.step = 4;
      return;
    }
    this.composeTime();
    this.draftSaved.emit(this.draft);
  }

  runExport(): void {
    this.submitted = true;
    for (let s = 0; s < this.steps.length; s++) {
      const e = this.stepError(s);
      if (e) {
        this.step = s;
        this.error = e;
        return;
      }
    }
    this.error = '';
    this.composeTime();
    this.runRequested.emit(this.draft);
  }
}
