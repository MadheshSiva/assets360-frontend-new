import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowRight, LucideAngularModule, RefreshCw, WandSparkles } from 'lucide-angular';
import { DataJob, FieldMapping } from '../data-import.model';
import { ObjectField, defaultMapping, objectDef } from '../data-import.data';

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Field Mapping tab: source column → Asset360 field. */
@Component({
  selector: 'app-adm-job-mapping',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../../shared/admin-workspace.css', '../data-import-export.css'],
  template: `
    <div class="panel__head">
      <h3>Field Mapping <small class="muted">· {{ mappedCount }} of {{ rows.length }} columns mapped</small></h3>
      <button type="button" class="btn btn--sm" (click)="reset()"><lucide-icon [img]="icons.RefreshCw" [size]="14"></lucide-icon> Reset</button>
      <button type="button" class="btn btn--sm btn--outline" (click)="autoMap()"><lucide-icon [img]="icons.WandSparkles" [size]="14"></lucide-icon> Auto-map</button>
      <button type="button" class="btn btn--sm btn--primary" [disabled]="!dirty" (click)="save()">Save Mapping</button>
    </div>

    @if (missingRequired.length) {
      <div class="note note--warn">Required fields not mapped: {{ missingRequired.join(', ') }}</div>
    }
    @if (duplicateTargets.length) {
      <div class="note note--warn">Mapped more than once: {{ duplicateTargets.join(', ') }}</div>
    }

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>{{ job.type === 'Import' ? 'Source Column' : 'Export Column' }}</th><th>Sample Value</th><th></th><th>Asset360 Field</th><th>Required</th><th>Status</th></tr>
        </thead>
        <tbody>
          @for (m of rows; track $index) {
            <tr>
              <td><code>{{ m.source }}</code></td>
              <td class="muted">{{ m.sample }}</td>
              <td><lucide-icon [img]="icons.ArrowRight" [size]="14"></lucide-icon></td>
              <td>
                <select class="select select--sm" [name]="'map' + $index" [(ngModel)]="m.target" (ngModelChange)="dirty = true">
                  <option value="" disabled>Select Target</option>
                  <option value="">— Do not {{ job.type === 'Import' ? 'import' : 'export' }} —</option>
                  @for (f of fields; track f.label) { <option [value]="f.label">{{ f.label }}</option> }
                </select>
              </td>
              <td>@if (isRequired(m.target)) { <span class="pill" data-tone="pink">Required</span> } @else { <span class="muted">Optional</span> }</td>
              <td>
                @if (m.target) { <span class="pill" data-tone="green"><i></i>Mapped</span> }
                @else { <span class="pill" data-tone="grey"><i></i>Skipped</span> }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class JobMapping implements OnChanges {
  @Input({ required: true }) job!: DataJob;
  @Output() mappingChange = new EventEmitter<FieldMapping[]>();

  readonly icons = { ArrowRight, WandSparkles, RefreshCw };
  rows: FieldMapping[] = [];
  fields: ObjectField[] = [];
  dirty = false;

  ngOnChanges(): void {
    this.rows = this.job.mapping.map((m) => ({ ...m }));
    this.fields = objectDef(this.job.dataObject).fields;
    this.dirty = false;
  }

  get mappedCount(): number {
    return this.rows.filter((m) => m.target).length;
  }

  get missingRequired(): string[] {
    const mapped = new Set(this.rows.map((m) => m.target));
    return this.fields.filter((f) => f.required && !mapped.has(f.label)).map((f) => f.label);
  }

  get duplicateTargets(): string[] {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const m of this.rows) {
      if (!m.target) continue;
      if (seen.has(m.target)) dup.add(m.target);
      seen.add(m.target);
    }
    return [...dup];
  }

  isRequired(target: string): boolean {
    return this.fields.some((f) => f.label === target && f.required);
  }

  /** Match unmapped columns to fields with the same normalised name. */
  autoMap(): void {
    const taken = new Set(this.rows.map((m) => m.target).filter(Boolean));
    for (const m of this.rows) {
      if (m.target) continue;
      const hit = this.fields.find((f) => norm(f.label) === norm(m.source) && !taken.has(f.label));
      if (hit) {
        m.target = hit.label;
        taken.add(hit.label);
        this.dirty = true;
      }
    }
  }

  reset(): void {
    this.rows = defaultMapping(this.job.dataObject);
    this.dirty = true;
  }

  save(): void {
    if (this.duplicateTargets.length) return;
    this.mappingChange.emit(this.rows.map((m) => ({ ...m })));
    this.dirty = false;
  }
}
