import { Injectable } from '@angular/core';
import { CURRENT_USER } from '../shared/analytics-common';
import { Dashboard, METRICS, SEED_DASHBOARDS, Sharing, WIDGET_SIZES, WidgetConfig, WidgetSpan } from './interactive-dashboards.data';

const STORAGE_KEY = 'asset360.ra.interactive-dashboards.v1';
const SPANS = WIDGET_SIZES.map((s) => s.span).concat([5, 7]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowText(): string {
  const d = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Drops widgets whose data source or type is unknown (e.g. stored by an older version). */
function validWidget(w: WidgetConfig): boolean {
  const metric = METRICS.find((m) => m.key === w?.metric);
  return !!metric && metric.types.includes(w.type) && typeof w.id === 'string' && typeof w.title === 'string' && SPANS.includes(w.span);
}

/**
 * DEMO MODE: dashboards and their widget layouts live in memory and are mirrored to localStorage
 * (when the browser allows it) until the dashboard API exists.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  dashboards: Dashboard[] = this.load();
  private seq = Date.now() % 100000;

  get(id: string): Dashboard | undefined {
    return this.dashboards.find((d) => d.id === id);
  }

  nextWidgetId(): string {
    return `w${++this.seq}`;
  }

  /** Records a change to a dashboard and persists it. */
  touch(d: Dashboard): void {
    d.updatedAt = nowText();
    this.persist();
  }

  replaceWidgets(d: Dashboard, widgets: WidgetConfig[]): void {
    d.widgets = widgets;
    this.touch(d);
  }

  create(name: string, description: string, sharing: Sharing, widgets: WidgetConfig[]): Dashboard {
    let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dashboard';
    while (this.get(id)) id = `${id}-${++this.seq}`;
    const d: Dashboard = {
      id, name, description, owner: CURRENT_USER.name, sharing, sharedWith: [], groups: [], role: 'Owner', favorite: false,
      updatedAt: nowText(), widgets: clone(widgets).map((w) => ({ ...w, id: this.nextWidgetId() }))
    };
    this.dashboards.push(d);
    this.persist();
    return d;
  }

  toggleFavorite(d: Dashboard): void {
    d.favorite = !d.favorite;
    this.persist();
  }

  reset(): void {
    this.dashboards = clone(SEED_DASHBOARDS);
    this.persist();
  }

  nameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.dashboards.some((d) => d.name.toLowerCase() === n);
  }

  private load(): Dashboard[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw) as Dashboard[];
        if (Array.isArray(list) && list.length && list.every((d) => typeof d?.id === 'string' && typeof d.name === 'string' && Array.isArray(d.widgets))) {
          list.forEach((d) => {
            d.widgets = d.widgets.filter(validWidget);
            d.sharedWith = Array.isArray(d.sharedWith) ? d.sharedWith : [];
            d.groups = Array.isArray(d.groups) ? d.groups : [];
          });
          return list;
        }
      }
    } catch {
      // Storage blocked or corrupt: fall back to the seed dashboards
    }
    return clone(SEED_DASHBOARDS);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dashboards));
    } catch {
      // Storage unavailable (private mode, quota): keep the in-memory copy only
    }
  }

  static spanOk(span: number): span is WidgetSpan {
    return SPANS.includes(span as WidgetSpan);
  }
}
