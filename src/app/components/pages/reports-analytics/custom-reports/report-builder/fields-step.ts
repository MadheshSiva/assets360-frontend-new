import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, ChevronUp, LucideAngularModule, Search } from 'lucide-angular';
import { DATA_SOURCES } from '../custom-reports.data';
import { applySource, calcAsField, groupsOf, isNumeric, removeField } from '../custom-reports.engine';
import { CustomReport, FieldDef } from '../custom-reports.model';

type FieldView = 'all' | 'selected' | 'numeric';

interface TreeGroup {
  key: string;
  label: string;
  fields: FieldDef[];
}

/** Builder step 2: field tree with search and per-group checkboxes. */
@Component({
  selector: 'cr-fields-step',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="cr-step-head cr-step-head--row">
      <div>
        <h3>Select Fields</h3>
        <p class="muted">Choose the fields you want to include in your report.</p>
      </div>
      <label class="cr-inline-field">
        <span>Data source</span>
        <select class="select" [ngModel]="report.sourceKey" (ngModelChange)="changeSource($event)" aria-label="Data source">
          @for (s of sources; track s.key) {
            <option [value]="s.key">{{ s.label }}</option>
          }
        </select>
      </label>
    </div>

    <div class="cr-tree-tools">
      <label class="search">
        <lucide-icon [img]="Search" [size]="15" />
        <input type="search" placeholder="Search fields..." [(ngModel)]="query" aria-label="Search fields" />
      </label>
      <select class="select" [(ngModel)]="view" aria-label="Show fields">
        <option value="all">All fields</option>
        <option value="selected">Selected only</option>
        <option value="numeric">Numeric only</option>
      </select>
    </div>

    <div class="cr-tree">
      @for (g of tree; track g.key) {
        <div class="cr-tree__group">
          <div class="cr-tree__head">
            <button type="button" class="icon-btn" (click)="toggleCollapse(g.key)" [attr.aria-expanded]="!isCollapsed(g.key)"
              [attr.aria-label]="(isCollapsed(g.key) ? 'Expand ' : 'Collapse ') + g.label">
              <lucide-icon [img]="isCollapsed(g.key) ? ChevronDown : ChevronUp" [size]="15" />
            </button>
            <label class="cr-check">
              <input type="checkbox" [checked]="allChecked(g)" [indeterminate]="someChecked(g)" (change)="toggleGroup(g)" />
              <strong>{{ g.label }}</strong>
            </label>
            <span class="muted">{{ checkedCount(g) }}/{{ g.fields.length }}</span>
          </div>
          @if (!isCollapsed(g.key)) {
            @for (f of g.fields; track f.key) {
              <label class="cr-check cr-tree__field">
                <input type="checkbox" [checked]="isSelected(f.key)" (change)="toggle(f.key)" />
                <span>{{ f.label }}</span>
                <em class="cr-kind">{{ f.kind }}</em>
              </label>
            }
          }
        </div>
      } @empty {
        <p class="empty">No fields match “{{ query }}”.</p>
      }
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class FieldsStep {
  @Input({ required: true }) report!: CustomReport;
  @Output() notice = new EventEmitter<string>();

  readonly Search = Search;
  readonly ChevronDown = ChevronDown;
  readonly ChevronUp = ChevronUp;
  readonly sources = DATA_SOURCES;

  query = '';
  view: FieldView = 'all';
  private collapsed = new Set<string>();

  get tree(): TreeGroup[] {
    const q = this.query.trim().toLowerCase();
    const groups: TreeGroup[] = groupsOf(this.report.sourceKey).map((g) => ({ key: g.key, label: g.label, fields: g.fields }));
    if (this.report.calcFields.length) {
      groups.push({ key: 'calculated', label: 'Calculated Fields', fields: this.report.calcFields.map(calcAsField) });
    }
    return groups
      .map((g) => ({ ...g, fields: g.fields.filter((f) => this.visible(f, q)) }))
      .filter((g) => g.fields.length > 0);
  }

  private visible(f: FieldDef, q: string): boolean {
    if (q && !f.label.toLowerCase().includes(q)) return false;
    if (this.view === 'selected') return this.isSelected(f.key);
    if (this.view === 'numeric') return isNumeric(f.kind);
    return true;
  }

  isCollapsed(key: string): boolean {
    return this.collapsed.has(key);
  }

  toggleCollapse(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
  }

  isSelected(key: string): boolean {
    return this.report.fields.includes(key);
  }

  checkedCount(g: TreeGroup): number {
    return g.fields.filter((f) => this.isSelected(f.key)).length;
  }

  allChecked(g: TreeGroup): boolean {
    return this.checkedCount(g) === g.fields.length;
  }

  someChecked(g: TreeGroup): boolean {
    const n = this.checkedCount(g);
    return n > 0 && n < g.fields.length;
  }

  toggle(key: string): void {
    if (this.isSelected(key)) removeField(this.report, key);
    else this.report.fields = [...this.report.fields, key];
  }

  toggleGroup(g: TreeGroup): void {
    if (this.allChecked(g)) {
      for (const f of g.fields) removeField(this.report, f.key);
    } else {
      const add = g.fields.map((f) => f.key).filter((k) => !this.isSelected(k));
      this.report.fields = [...this.report.fields, ...add];
    }
  }

  changeSource(key: string): void {
    const label = DATA_SOURCES.find((s) => s.key === key)?.label ?? key;
    const removed = applySource(this.report, key);
    this.notice.emit(removed ? `Data source set to ${label}. ${removed} field(s) not in this source were removed.` : `Data source set to ${label}.`);
  }
}
