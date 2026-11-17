import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import {
  Calendar, ChartColumn, Check, ChevronDown, CirclePlus, Clock, Download, Ellipsis, FileText, GitCompareArrows, GripVertical, Info,
  LucideAngularModule, Pencil, RefreshCw, Share2, Star, User, Users, X
} from 'lucide-angular';
import { AnalyticsPage, downloadCsv } from '../shared/analytics-common';
import { DashboardData, DashboardStore, FilterOption } from './dashboard-store.service';
import { DashboardWidget } from './dashboard-widget/dashboard-widget';
import { AddWidgetDialog, NewWidget } from './dialogs/add-widget-dialog';
import { CreateDashboardDialog, NewDashboard } from './dialogs/create-dashboard-dialog';
import { ShareDashboardDialog, ShareResult } from './dialogs/share-dashboard-dialog';
import {
  AttentionAsset, DashFilters, Dashboard, LOADING_DATA, WidgetConfig, WidgetData, WidgetType, toWidgetData, widgetCsv
} from './interactive-dashboards.data';
import { LIBRARY_DRAG_TYPE, WidgetLibrary } from './widget-library/widget-library';

type MenuKey = 'picker' | 'mine' | 'shared' | 'favorites' | 'more' | 'info';

const SPAN_STEPS = [3, 4, 5, 6, 7, 8, 12];

/** Reports & Analytics > Interactive Dashboards (configurable, drag-and-drop widget dashboards) */
@Component({
  selector: 'app-ra-interactive-dashboards',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, DashboardWidget, WidgetLibrary, AddWidgetDialog, CreateDashboardDialog, ShareDashboardDialog],
  templateUrl: './interactive-dashboards.html',
  styleUrls: ['../shared/analytics-page.css', './interactive-dashboards.css']
})
export class InteractiveDashboardsPage extends AnalyticsPage implements OnInit, OnDestroy {
  readonly store = inject(DashboardStore);
  private readonly route = inject(ActivatedRoute);

  readonly icons = {
    Calendar, ChartColumn, Check, ChevronDown, CirclePlus, Clock, Download, Ellipsis, FileText, GitCompareArrows, GripVertical, Info,
    Pencil, RefreshCw, Share2, Star, User, Users, X
  };

  // Filter bar: values from GET /options (date presets) and GET /filters; '' means all
  override period = 'This month';
  override organization = '';
  override location = '';
  category = '';
  compare = false;
  filters: DashFilters = this.buildFilters();
  current: Dashboard | null = null;
  /** Mapped widget data by widget id, from GET /{id}/data */
  widgetData: Record<string, WidgetData> = {};
  private generatedAt: Date | null = null;
  private dataSub: Subscription | null = null;
  private minuteTimer: ReturnType<typeof setInterval> | null = null;
  busy = false;

  // Edit mode: drag to reorder, resize and remove; "Discard changes" restores the snapshot
  editMode = false;
  private snapshot: WidgetConfig[] | null = null;
  dragId: string | null = null;
  overIndex: number | null = null;

  menu: MenuKey | null = null;
  addDialog: { type: WidgetType; index: number } | null = null;
  createOpen = false;
  shareOpen = false;
  expanded: WidgetConfig | null = null;
  detail: AttentionAsset | null = null;
  saveViewOpen = false;
  viewName = '';
  viewTried = false;

  override updatedMinutes = 0;

  ngOnInit(): void {
    this.minuteTimer = setInterval(() => this.tickUpdated(), 30_000);
    forkJoin([this.store.loadOptions(), this.store.loadFilters()]).subscribe({
      next: () => {
        if (!this.store.datePresets().includes(this.period)) this.period = this.store.defaultDatePreset();
        this.onFilterChange();
      },
      error: (e: Error) => this.notify(e.message)
    });
    this.store.load().subscribe({
      next: (list) => {
        const requested = this.route.snapshot.queryParamMap.get('dashboard');
        const target = (requested && list.find((d) => d.id === requested)) || list[0];
        if (target) this.open(target);
      },
      error: (e: Error) => this.notify(e.message)
    });
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.dataSub?.unsubscribe();
    if (this.minuteTimer) clearInterval(this.minuteTimer);
  }

  get datePresets(): string[] {
    return this.store.datePresets();
  }

  get orgOptions(): FilterOption[] {
    return this.withCurrent(this.store.organizations(), this.organization);
  }

  get locationOptions(): FilterOption[] {
    return this.withCurrent(this.store.locations(), this.location);
  }

  get categoryOptions(): FilterOption[] {
    return this.withCurrent(this.store.categories(), this.category);
  }

  /** Keeps a dashboard's saved default selectable even if /filters does not list it. */
  private withCurrent(options: FilterOption[], value: string): FilterOption[] {
    return value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  }

  private labelOf(options: FilterOption[], value: string, all: string): string {
    return value ? options.find((o) => o.value === value)?.label ?? value : all;
  }

  get filterSummary(): string {
    return [
      this.period,
      this.labelOf(this.orgOptions, this.organization, 'All organizations'),
      this.labelOf(this.locationOptions, this.location, 'All locations'),
      this.labelOf(this.categoryOptions, this.category, 'All categories')
    ].join(' · ');
  }

  get canEdit(): boolean {
    return !!this.current?.canEdit;
  }

  get myDashboards(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.role === 'Owner');
  }

  get sharedWithMe(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.role !== 'Owner');
  }

  get favorites(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.favorite);
  }

  get sharedText(): string {
    const d = this.current;
    if (!d) return '';
    if (d.sharing === 'organization') return 'Everyone in the organization';
    const users = d.sharedWith.length;
    const groups = d.groups.length;
    if (!users && !groups) return d.sharedSummary || 'Only you';
    const parts = [];
    if (users) parts.push(`${users} ${users === 1 ? 'user' : 'users'}`);
    if (groups) parts.push(`${groups} ${groups === 1 ? 'group' : 'groups'}`);
    return parts.join(' and ');
  }

  get shareLink(): string {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return `${origin}${this.basePath}/interactive-dashboards?dashboard=${encodeURIComponent(this.current?.id ?? '')}`;
  }

  dataFor(w: WidgetConfig): WidgetData {
    return this.widgetData[w.id] ?? LOADING_DATA;
  }

  // ===== Filters and data =====

  private buildFilters(): DashFilters {
    return { period: this.period, organization: this.organization, location: this.location, category: this.category, compare: this.compare };
  }

  /** A new filters object reloads every widget from the API */
  onFilterChange(): void {
    this.filters = this.buildFilters();
    this.loadData();
  }

  toggleCompare(): void {
    // The API always returns the previous-period figure for KPI cards; Compare only changes how it is shown
    this.compare = !this.compare;
    this.filters = this.buildFilters();
  }

  /** GET /{id}/data. Widgets show their last values until the new ones arrive. */
  private loadData(notifyWhenDone = false): void {
    const d = this.current;
    if (!d?.loaded) return;
    this.dataSub?.unsubscribe();
    this.refreshing = true;
    this.dataSub = this.store.loadData(d, this.filters).subscribe({
      next: (data) => {
        this.refreshing = false;
        if (this.current?.id !== d.id) return;
        this.applyData(data, true);
        if (notifyWhenDone) this.notify('Data refreshed.');
      },
      error: (e: Error) => {
        this.refreshing = false;
        this.notify(`Widgets could not be loaded: ${e.message}`);
      }
    });
  }

  private applyData(data: DashboardData, replaceAll: boolean): void {
    const d = this.current;
    if (!d) return;
    const next: Record<string, WidgetData> = replaceAll ? {} : { ...this.widgetData };
    d.widgets.forEach((w) => {
      const dto = data.widgets[w.id];
      if (dto) next[w.id] = toWidgetData(w, dto);
      else if (replaceAll) next[w.id] = { empty: true };
    });
    this.widgetData = next;
    this.generatedAt = data.generatedAt;
    this.tickUpdated();
  }

  private tickUpdated(): void {
    this.updatedMinutes = this.generatedAt ? Math.max(0, Math.floor((Date.now() - this.generatedAt.getTime()) / 60_000)) : 0;
  }

  override refresh(): void {
    if (this.refreshing) return;
    this.loadData(true);
  }

  // ===== Dashboards =====

  toggleMenu(key: MenuKey, event: Event): void {
    event.stopPropagation();
    this.menu = this.menu === key ? null : key;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menu = null;
  }

  @HostListener('document:keydown.escape')
  closeDialogs(): void {
    this.menu = null;
    this.addDialog = null;
    this.createOpen = false;
    this.shareOpen = false;
    this.expanded = null;
    this.detail = null;
    this.saveViewOpen = false;
  }

  /** GET /{id}, then applies the dashboard's default filters and loads its data. */
  open(d: Dashboard, startEditing = false): void {
    this.menu = null;
    if (this.editMode) this.finishEditing();
    this.store.open(d.id).subscribe({
      next: (full) => {
        this.current = full;
        this.widgetData = {};
        this.applyDefaults(full);
        this.onFilterChange();
        if (startEditing) this.startEditing();
      },
      error: (e: Error) => this.notify(`“${d.name}” could not be opened: ${e.message}`)
    });
  }

  private applyDefaults(d: Dashboard): void {
    const f = d.defaultFilters;
    if (!f) return;
    if (f.datePreset && this.store.datePresets().includes(f.datePreset)) this.period = f.datePreset;
    this.organization = f.organization ?? '';
    this.location = f.location ?? '';
    this.category = f.assetCategory ?? '';
  }

  toggleFavorite(d: Dashboard, event: Event): void {
    event.stopPropagation();
    this.store.setFavorite(d, !d.favorite).subscribe({
      next: (next) => {
        if (this.current?.id === next.id) this.current = { ...this.current, favorite: next.favorite };
        this.notify(next.favorite ? `“${next.name}” added to favorites.` : `“${next.name}” removed from favorites.`);
      },
      error: (e: Error) => this.notify(`Favorites could not be updated: ${e.message}`)
    });
  }

  onCreated(n: NewDashboard): void {
    if (this.busy) return;
    this.busy = true;
    const start =
      n.start === 'copy' ? { widgets: this.current?.widgets ?? [] } : n.start.startsWith('template:') ? { templateKey: n.start.slice('template:'.length) } : {};
    this.store.create(n.name, n.description, n.sharing, start).subscribe({
      next: (d) => {
        this.busy = false;
        this.createOpen = false;
        this.open(d, !d.widgets.length);
        this.notify(d.widgets.length ? `Dashboard “${d.name}” created.` : `Dashboard “${d.name}” created. Add widgets from the Widget Library.`);
      },
      error: (e: Error) => {
        this.busy = false;
        this.notify(`Dashboard could not be created: ${e.message}`);
      }
    });
  }

  duplicateCurrent(): void {
    this.menu = null;
    const d = this.current;
    if (!d) return;
    this.store.duplicate(d).subscribe({
      next: (copy) => {
        this.open(copy);
        this.notify(`“${copy.name}” created as a private copy.`);
      },
      error: (e: Error) => this.notify(`Dashboard could not be copied: ${e.message}`)
    });
  }

  deleteCurrent(): void {
    this.menu = null;
    const d = this.current;
    if (!d) return;
    if (!d.canShare) {
      this.notify(`Only the owner (${d.owner}) can delete this dashboard.`);
      return;
    }
    if (!confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
    this.store.remove(d).subscribe({
      next: () => {
        this.editMode = false;
        this.snapshot = null;
        this.current = null;
        this.widgetData = {};
        this.notify(`“${d.name}” deleted.`);
        const next = this.store.dashboards[0];
        if (next) this.open(next);
      },
      error: (e: Error) => this.notify(`Dashboard could not be deleted: ${e.message}`)
    });
  }

  openShare(): void {
    if (!this.current) return;
    if (!this.current.canShare) {
      this.notify(`Only the owner (${this.current.owner}) can change sharing. Use Copy link from the ⋯ menu instead.`);
      return;
    }
    this.shareOpen = true;
  }

  onShared(r: ShareResult): void {
    const d = this.current;
    if (!d || this.busy) return;
    this.busy = true;
    this.store.share(d, r.sharing, r.sharedWith, r.groups).subscribe({
      next: (next) => {
        this.busy = false;
        this.shareOpen = false;
        this.current = next;
        this.notify(`Sharing updated: ${this.sharedText}.`);
      },
      error: (e: Error) => {
        this.busy = false;
        this.notify(`Sharing could not be saved: ${e.message}`);
      }
    });
  }

  async copyLink(): Promise<void> {
    this.menu = null;
    try {
      await navigator.clipboard.writeText(this.shareLink);
      this.notify('Dashboard link copied.');
    } catch {
      this.notify(`Copy the link: ${this.shareLink}`);
    }
  }

  // ===== Edit mode =====

  startEditing(): void {
    if (!this.canEdit || !this.current) return;
    this.snapshot = this.current.widgets.map((w) => ({ ...w, settings: { ...w.settings } }));
    this.editMode = true;
  }

  finishEditing(): void {
    this.editMode = false;
    this.snapshot = null;
  }

  /** Every edit is saved as it happens, so discarding puts the pre-edit widget list back with PUT /{id}. */
  discardChanges(): void {
    const d = this.current;
    const snapshot = this.snapshot;
    if (!d || !snapshot) {
      this.finishEditing();
      return;
    }
    const same = snapshot.length === d.widgets.length && snapshot.every((w, i) => {
      const c = d.widgets[i];
      return c.id === w.id && c.span === w.span && c.x === w.x && c.y === w.y && c.h === w.h;
    });
    if (same) {
      this.finishEditing();
      this.notify('No layout changes to discard.');
      return;
    }
    this.store.replaceWidgets(d, snapshot).subscribe({
      next: (next) => {
        this.current = next;
        this.finishEditing();
        this.loadData();
        this.notify('Layout changes discarded.');
      },
      error: (e: Error) => this.notify(`Changes could not be discarded: ${e.message}`)
    });
  }

  saveLayout(): void {
    // Moves, resizes, additions and removals were saved as they happened
    if (!this.current) return;
    this.finishEditing();
    this.notify(`Layout of “${this.current.name}” saved.`);
  }

  removeWidget(w: WidgetConfig): void {
    const d = this.current;
    if (!d) return;
    this.store.removeWidget(d, w.id).subscribe({
      next: () => {
        if (this.current?.id !== d.id) return;
        const widgets = this.current.widgets.filter((x) => x.id !== w.id);
        this.current = { ...this.current, widgets, widgetCount: widgets.length };
        if (this.expanded?.id === w.id) this.expanded = null;
        this.notify(`“${w.title}” removed.`);
      },
      error: (e: Error) => this.notify(`“${w.title}” could not be removed: ${e.message}`)
    });
  }

  resizeWidget(w: WidgetConfig, step: number): void {
    const d = this.current;
    if (!d) return;
    const span = step > 0 ? SPAN_STEPS.find((s) => s > w.span) ?? 12 : [...SPAN_STEPS].reverse().find((s) => s < w.span) ?? SPAN_STEPS[0];
    if (span === w.span) return;
    // Replace the object so the widget re-renders for its new size
    this.persistLayout(d.widgets.map((x) => (x.id === w.id ? { ...x, span } : x)));
  }

  /** Shows the new order/sizes straight away, saves them with PUT /layout and puts the old layout back if that fails. */
  private persistLayout(widgets: WidgetConfig[]): void {
    const d = this.current;
    if (!d) return;
    const before = d.widgets;
    this.current = { ...d, widgets };
    this.store.saveLayout(d, widgets).subscribe({
      next: (next) => {
        if (this.current?.id === next.id) this.current = next;
      },
      error: (e: Error) => {
        if (this.current?.id === d.id) this.current = { ...this.current, widgets: before };
        this.notify(`Layout could not be saved: ${e.message}`);
      }
    });
  }

  // ===== Drag and drop (native HTML5) =====

  onDragStart(event: DragEvent, w: WidgetConfig): void {
    if (!this.editMode) {
      event.preventDefault();
      return;
    }
    this.dragId = w.id;
    event.dataTransfer?.setData('text/plain', `move:${w.id}`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  private isLibraryDrag(event: DragEvent): boolean {
    return !!event.dataTransfer && Array.from(event.dataTransfer.types).includes(LIBRARY_DRAG_TYPE);
  }

  onDragOver(event: DragEvent, index: number): void {
    if (!this.dragId && !(this.isLibraryDrag(event) && this.canEdit)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.dragId ? 'move' : 'copy';
    this.overIndex = index;
  }

  onDrop(event: DragEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    const libType = event.dataTransfer?.getData(LIBRARY_DRAG_TYPE) as WidgetType | undefined;
    if (libType) {
      this.openAdd(libType, index);
    } else if (this.dragId && this.current) {
      const list = [...this.current.widgets];
      const from = list.findIndex((w) => w.id === this.dragId);
      if (from >= 0 && from !== index) {
        const [moved] = list.splice(from, 1);
        list.splice(Math.min(index, list.length), 0, moved);
        this.persistLayout(list);
      }
    }
    this.onDragEnd();
  }

  onDragEnd(): void {
    this.dragId = null;
    this.overIndex = null;
  }

  // ===== Adding widgets =====

  openAdd(type: WidgetType | null, index = this.current?.widgets.length ?? 0): void {
    if (!this.current) return;
    if (!this.canEdit) {
      this.notify(`You have view access to “${this.current.name}”. Copy it with Create Dashboard to customise it.`);
      return;
    }
    this.addDialog = { type: type ?? 'kpi', index };
  }

  /** POST /widgets (added at the end), then PUT /layout when it was dropped between widgets, then loads its data. */
  onWidgetAdded(n: NewWidget): void {
    const d = this.current;
    if (!d || this.busy) return;
    const at = this.addDialog?.index ?? d.widgets.length;
    this.busy = true;
    this.store.addWidget(d, n).subscribe({
      next: (w) => {
        this.busy = false;
        this.addDialog = null;
        if (this.current?.id !== d.id) return;
        // Saved at the end; a drop between widgets then moves it there (reverting to the end if that fails)
        const atEnd = at >= this.current.widgets.length;
        const list = [...this.current.widgets];
        list.splice(Math.min(at, list.length), 0, w);
        this.current = { ...this.current, widgets: [...this.current.widgets, w], widgetCount: list.length };
        if (!atEnd) this.persistLayout(list);
        this.notify(`“${w.title}” added to ${d.name}.`);
        this.store.loadWidgetData(d, w.id, this.filters).subscribe({
          next: (data) => this.applyData(data, false),
          error: (e: Error) => (this.widgetData = { ...this.widgetData, [w.id]: { empty: true, error: e.message } })
        });
      },
      error: (e: Error) => {
        this.busy = false;
        this.notify(`Widget could not be added: ${e.message}`);
      }
    });
  }

  // ===== Export / views =====

  /** One widget as CSV, from the values already loaded from the API. */
  exportWidget(w: WidgetConfig): void {
    const csv = widgetCsv(w, this.dataFor(w));
    downloadCsv(`${w.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, csv.header, csv.rows);
  }

  /** GET /{id}/export: Excel workbook built by the API for the current filters. */
  exportDashboard(): void {
    const d = this.current;
    if (!d || this.busy) return;
    this.busy = true;
    this.notify(`Preparing the export of “${d.name}”…`);
    this.store.export(d, this.filters).subscribe({
      next: ({ blob, fileName }) => {
        this.busy = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        this.notify(`Exported ${d.widgets.length} widgets from “${d.name}”.`);
      },
      error: (e: Error) => {
        this.busy = false;
        this.notify(`Export failed: ${e.message}`);
      }
    });
  }

  openSaveView(): void {
    this.menu = null;
    this.viewName = '';
    this.viewTried = false;
    this.saveViewOpen = true;
  }

  confirmSaveView(): void {
    this.viewTried = true;
    if (!this.viewName.trim()) return;
    this.saveViewOpen = false;
    // No saved-view endpoint in the Report Analytics API: stays a client-side notice (shared AnalyticsPage behaviour)
    this.saveView(this.viewName.trim());
  }

  onNotice(message: string): void {
    this.notify(message);
  }

  scoreTone(score: number | null): string {
    if (score === null) return 'grey';
    return score < 40 ? 'red' : score < 70 ? 'orange' : 'green';
  }

  nameTaken = (name: string): boolean => this.store.nameTaken(name);
}
