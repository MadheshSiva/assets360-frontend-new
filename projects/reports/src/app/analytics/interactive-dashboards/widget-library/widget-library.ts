import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChartColumn, ChartLine, ChartPie, Database, Grid3x3, GripVertical, LucideAngularModule, MapPin, Plus, Table } from 'lucide-angular';
import { WIDGET_TYPES, WidgetType, WidgetTypeDef } from '../interactive-dashboards.data';

/** dataTransfer type used when a library item is dragged onto the dashboard grid */
export const LIBRARY_DRAG_TYPE = 'application/x-asset360-widget';

const TYPE_ICONS: Record<WidgetType, typeof Table> = {
  kpi: Database, line: ChartLine, bar: ChartColumn, donut: ChartPie, table: Table, map: MapPin, heatmap: Grid3x3
};

/** Widget Library: click or drag a widget type onto the dashboard. */
@Component({
  selector: 'app-idb-widget-library',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <section class="widget idb-lib" aria-label="Widget library">
      <div class="widget__head">
        <span class="widget__grip"><lucide-icon [img]="icons.GripVertical" [size]="16" /></span>
        <h2>Widget Library</h2>
      </div>
      <p class="muted idb-lib__hint">{{ disabled ? 'You have view access to this dashboard.' : 'Drag and drop widgets to build your dashboard.' }}</p>
      <div class="idb-lib__grid">
        @for (t of types; track t.type) {
          <button type="button" class="idb-lib__item" [draggable]="!disabled" [disabled]="disabled"
            (dragstart)="onDragStart($event, t)" (click)="pick.emit(t.type)" [attr.aria-label]="'Add ' + t.label">
            <span class="idb-lib__grip"><lucide-icon [img]="icons.GripVertical" [size]="13" /></span>
            <span class="idb-lib__icon"><lucide-icon [img]="iconFor(t.type)" [size]="22" /></span>
            {{ t.label }}
          </button>
        }
      </div>
      <button type="button" class="btn btn--outline idb-lib__add" [disabled]="disabled" (click)="pick.emit(null)">
        <lucide-icon [img]="icons.Plus" [size]="16" /> Add Widget
      </button>
    </section>
  `,
  styleUrls: ['../../shared/analytics-page.css'],
  styles: [
    `
      .idb-lib__hint { margin: -4px 0 10px; font-size: 12px; }
      .idb-lib__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .idb-lib__item {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 6px 10px;
        border: 1px solid var(--ra-border); border-radius: 10px; background: #fff; font: inherit; font-weight: 600; font-size: 12.5px;
        color: #0f172a; cursor: grab;
      }
      .idb-lib__item:hover:not(:disabled) { border-color: var(--ra-purple); box-shadow: 0 4px 12px rgba(91, 42, 168, 0.1); }
      .idb-lib__item:disabled { opacity: 0.5; cursor: not-allowed; }
      .idb-lib__grip { position: absolute; top: 6px; left: 6px; color: #94a3b8; }
      .idb-lib__icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--ra-purple-soft); color: var(--ra-purple); }
      .idb-lib__add { width: 100%; margin-top: 10px; }
    `
  ]
})
export class WidgetLibrary {
  @Input() disabled = false;
  /** null = open the Add Widget dialog without a preselected type */
  @Output() pick = new EventEmitter<WidgetType | null>();

  readonly icons = { GripVertical, Plus };
  readonly types = WIDGET_TYPES;

  iconFor(type: WidgetType): typeof Table {
    return TYPE_ICONS[type];
  }

  onDragStart(event: DragEvent, t: WidgetTypeDef): void {
    event.dataTransfer?.setData(LIBRARY_DRAG_TYPE, t.type);
    event.dataTransfer?.setData('text/plain', `widget:${t.type}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
}
