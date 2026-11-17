import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowRight, LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { FieldMapping, Integration, TRANSFORMS } from './integration-api.data';
import { IntegrationApiService } from './integration-api.service';

/** Data Mapping tab: editable source → target field table. */
@Component({
  standalone: true,
  selector: 'app-integration-mapping-tab',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/admin-workspace.css', './integration-api.css'],
  template: `
    <section class="sub-panel">
      <div class="panel__head">
        <h3>Field Mapping ({{ rows.length }})</h3>
        <select class="select int-select-sm" aria-label="Filter by data object" [(ngModel)]="objectFilter">
          <option value="">Select Data Object</option>
          @for (o of integration.dataObjects; track o) {
            <option [value]="o">{{ o }}</option>
          }
        </select>
        <button type="button" class="btn btn--sm btn--outline" (click)="add()">
          <lucide-icon [img]="icons.Plus" [size]="14"></lucide-icon> Add Mapping
        </button>
      </div>
      <div class="table-wrap">
        <table class="table int-mapping">
          <thead>
            <tr>
              <th>Data Object</th>
              <th>Source Field ({{ integration.name }})</th>
              <th></th>
              <th>Target Field (Asset360)</th>
              <th>Transform</th>
              <th class="center">Required</th>
              <th><span class="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of visibleRows(); track m.id) {
              <tr>
                <td>
                  <select [attr.aria-label]="'Data object for ' + m.source" [(ngModel)]="m.object" (ngModelChange)="touch()">
                    <option value="" disabled>Select Object</option>
                    @for (o of integration.dataObjects; track o) {
                      <option [value]="o">{{ o }}</option>
                    }
                  </select>
                </td>
                <td [class.invalid]="submitted && !m.source.trim()">
                  <input aria-label="Source field" placeholder="e.g. MATNR" [(ngModel)]="m.source" (ngModelChange)="touch()" />
                </td>
                <td class="muted"><lucide-icon [img]="icons.ArrowRight" [size]="14"></lucide-icon></td>
                <td [class.invalid]="submitted && targetError(m)">
                  <input aria-label="Target field" placeholder="e.g. asset_code" [(ngModel)]="m.target" (ngModelChange)="touch()" />
                  @if (submitted && targetError(m)) {
                    <small>{{ targetError(m) }}</small>
                  }
                </td>
                <td>
                  <select aria-label="Transform" [(ngModel)]="m.transform" (ngModelChange)="touch()">
                    <option value="" disabled>Select Transform</option>
                    @for (t of transforms; track t) {
                      <option [value]="t">{{ t }}</option>
                    }
                  </select>
                </td>
                <td class="center"><input type="checkbox" aria-label="Required" [(ngModel)]="m.required" (ngModelChange)="touch()" /></td>
                <td>
                  <button type="button" class="icon-btn icon-btn--bare" aria-label="Remove mapping" (click)="remove(m)">
                    <lucide-icon [img]="icons.Trash2" [size]="15"></lucide-icon>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="center muted">No field mappings yet. Add one to start mapping data.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <div class="int-foot">
        @if (dirty) {
          <span class="muted">Unsaved mapping changes</span>
        }
        <button type="button" class="btn" [disabled]="!dirty" (click)="reset()">Discard</button>
        <button type="button" class="btn btn--primary" [disabled]="!dirty" (click)="save()">Save Mapping</button>
      </div>
    </section>
  `
})
export class IntegrationMappingTab implements OnChanges {
  private readonly service = inject(IntegrationApiService);

  @Input({ required: true }) integration!: Integration;
  @Output() notice = new EventEmitter<string>();

  readonly icons = { Plus, Trash2, ArrowRight };
  readonly transforms = TRANSFORMS;

  rows: FieldMapping[] = [];
  objectFilter = '';
  dirty = false;
  submitted = false;

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes['integration']?.previousValue as Integration | undefined;
    // Keep in-progress edits when the same integration is refreshed (e.g. after a sync)
    if (!prev || prev.id !== this.integration.id || !this.dirty) {
      this.reset();
      if (!prev || prev.id !== this.integration.id) this.objectFilter = '';
    }
  }

  visibleRows(): FieldMapping[] {
    return this.objectFilter ? this.rows.filter((m) => m.object === this.objectFilter) : this.rows;
  }

  touch(): void {
    this.dirty = true;
  }

  targetError(m: FieldMapping): string {
    const t = m.target.trim();
    if (!t) return 'Required';
    const dup = this.rows.some((x) => x !== m && x.object === m.object && x.target.trim().toLowerCase() === t.toLowerCase());
    return dup ? 'Already mapped' : '';
  }

  add(): void {
    const object = this.objectFilter || this.integration.dataObjects[0] || 'Assets';
    this.rows = [...this.rows, { id: this.service.newMappingId(), object, source: '', target: '', transform: 'None', required: false }];
    this.dirty = true;
  }

  remove(m: FieldMapping): void {
    this.rows = this.rows.filter((x) => x !== m);
    this.dirty = true;
  }

  reset(): void {
    this.rows = this.integration.mappings.map((m) => ({ ...m }));
    this.dirty = false;
    this.submitted = false;
  }

  save(): void {
    this.submitted = true;
    const invalid = this.rows.filter((m) => !m.source.trim() || this.targetError(m));
    if (invalid.length) {
      this.notice.emit(`Fix ${invalid.length} mapping row${invalid.length > 1 ? 's' : ''} before saving.`);
      return;
    }
    this.service.saveMappings(this.integration.id, this.rows);
    this.dirty = false;
    this.submitted = false;
    this.notice.emit(`${this.rows.length} field mappings saved.`);
  }
}
