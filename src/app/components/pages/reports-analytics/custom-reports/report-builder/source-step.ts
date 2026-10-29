import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Database, LucideAngularModule } from 'lucide-angular';
import { DATA_SOURCES } from '../custom-reports.data';
import { applySource, groupsOf } from '../custom-reports.engine';
import { CustomReport, DataSource } from '../custom-reports.model';

/** Builder step 1: pick the data source (a module or a combination of modules). */
@Component({
  selector: 'cr-source-step',
  imports: [LucideAngularModule],
  template: `
    <div class="cr-step-head">
      <h3>Data Source</h3>
      <p class="muted">Choose the Asset360 data the report reads from. Combined sources join records on the asset.</p>
    </div>
    <div class="cr-sources" role="radiogroup" aria-label="Data source">
      @for (s of sources; track s.key) {
        <button type="button" class="cr-source" role="radio" [attr.aria-checked]="s.key === report.sourceKey"
          [class.cr-source--active]="s.key === report.sourceKey" (click)="choose(s)">
          <span class="cr-source__icon"><lucide-icon [img]="Database" [size]="16" /></span>
          <span class="cr-source__body">
            <strong>{{ s.label }}</strong>
            <small>{{ s.description }}</small>
            <em>{{ fieldCount(s) }} fields · {{ s.module }}</em>
          </span>
        </button>
      }
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class SourceStep {
  @Input({ required: true }) report!: CustomReport;
  @Output() notice = new EventEmitter<string>();

  readonly Database = Database;
  readonly sources = DATA_SOURCES;

  fieldCount(s: DataSource): number {
    return groupsOf(s.key).reduce((n, g) => n + g.fields.length, 0);
  }

  choose(s: DataSource): void {
    if (s.key === this.report.sourceKey) return;
    const removed = applySource(this.report, s.key);
    this.notice.emit(removed ? `Data source set to ${s.label}. ${removed} field(s) not in this source were removed.` : `Data source set to ${s.label}.`);
  }
}
