import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { METRICS, MetricDef, MetricKey, WIDGET_SIZES, WIDGET_TYPES, WidgetSpan, WidgetType } from '../interactive-dashboards.data';

export interface NewWidget {
  type: WidgetType;
  metric: MetricKey;
  title: string;
  span: WidgetSpan;
}

/** Asks which data source a new widget shows, its title and size. */
@Component({
  selector: 'app-idb-add-widget-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <form class="dialog" (click)="$event.stopPropagation()" (ngSubmit)="submit()" novalidate role="dialog" aria-modal="true" aria-label="Add widget">
        <h2>Add widget</h2>
        <p>Choose what the widget shows. Values follow the dashboard filters.</p>
        <div class="field">
          <label for="aw-type">Widget type</label>
          <select id="aw-type" name="type" [(ngModel)]="type" (ngModelChange)="onTypeChange()">
            @for (t of types; track t.type) { <option [value]="t.type">{{ t.label }}</option> }
          </select>
        </div>
        <div class="field" [class.invalid]="tried && !metric">
          <label for="aw-metric">Data source / metric <span class="req">*</span></label>
          <select id="aw-metric" name="metric" [(ngModel)]="metric" (ngModelChange)="onMetricChange()">
            <option value="">Select a metric</option>
            @for (m of metrics; track m.key) { <option [value]="m.key">{{ m.label }}</option> }
          </select>
          @if (tried && !metric) { <small>Choose the metric this widget shows.</small> }
          @else if (selected) { <small>{{ selected.description }}</small> }
        </div>
        <div class="field" [class.invalid]="tried && !title.trim()">
          <label for="aw-title">Title <span class="req">*</span></label>
          <input id="aw-title" name="title" [(ngModel)]="title" maxlength="60" />
          @if (tried && !title.trim()) { <small>Enter a title.</small> }
        </div>
        <div class="field">
          <label for="aw-size">Size</label>
          <select id="aw-size" name="span" [(ngModel)]="span">
            @for (s of sizes; track s.span) { <option [ngValue]="s.span">{{ s.label }}</option> }
          </select>
        </div>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Add widget</button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css']
})
export class AddWidgetDialog implements OnInit {
  @Input() initialType: WidgetType = 'kpi';
  @Output() added = new EventEmitter<NewWidget>();
  @Output() cancel = new EventEmitter<void>();

  readonly types = WIDGET_TYPES;
  readonly sizes = WIDGET_SIZES;
  type: WidgetType = 'kpi';
  metric: MetricKey | '' = '';
  title = '';
  span: WidgetSpan = 3;
  tried = false;

  ngOnInit(): void {
    this.type = this.initialType;
    this.onTypeChange();
  }

  get metrics(): MetricDef[] {
    return METRICS.filter((m) => m.types.includes(this.type));
  }

  get selected(): MetricDef | undefined {
    return METRICS.find((m) => m.key === this.metric);
  }

  onTypeChange(): void {
    this.span = WIDGET_TYPES.find((t) => t.type === this.type)?.span ?? 6;
    if (!this.metrics.some((m) => m.key === this.metric)) this.metric = '';
    if (this.metrics.length === 1) this.metric = this.metrics[0].key;
    this.onMetricChange();
  }

  onMetricChange(): void {
    // Keep a title the user typed; otherwise follow the metric
    if (this.title.trim() && !METRICS.some((m) => m.label === this.title)) return;
    this.title = this.selected?.label ?? '';
  }

  submit(): void {
    this.tried = true;
    if (!this.metric || !this.title.trim()) return;
    this.added.emit({ type: this.type, metric: this.metric, title: this.title.trim(), span: this.span });
  }
}
