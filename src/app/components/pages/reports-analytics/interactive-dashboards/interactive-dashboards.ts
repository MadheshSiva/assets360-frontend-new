import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Calendar, ChartColumn, Check, ChevronDown, CirclePlus, Clock, Download, Ellipsis, FileText, GitCompareArrows, GripVertical, Info,
  LucideAngularModule, Pencil, RefreshCw, Share2, Star, User, Users, X
} from 'lucide-angular';
import { AnalyticsPage, CURRENT_USER, RA_CATEGORIES, downloadCsv } from '../shared/analytics-common';
import { DashboardStore } from './dashboard-store.service';
import { DashboardWidget } from './dashboard-widget/dashboard-widget';
import { AddWidgetDialog, NewWidget } from './dialogs/add-widget-dialog';
import { CreateDashboardDialog, NewDashboard } from './dialogs/create-dashboard-dialog';
import { ShareDashboardDialog, ShareResult } from './dialogs/share-dashboard-dialog';
import {
  AttentionAsset, DashFilters, Dashboard, WidgetConfig, WidgetSpan, WidgetType, buildWidgetData, widgetCsv
} from './interactive-dashboards.data';
import { LIBRARY_DRAG_TYPE, WidgetLibrary } from './widget-library/widget-library';

type MenuKey = 'picker' | 'mine' | 'shared' | 'favorites' | 'more' | 'info';

const SPAN_STEPS: WidgetSpan[] = [3, 4, 5, 6, 7, 8, 12];

/** Reports & Analytics > Interactive Dashboards (configurable, drag-and-drop widget dashboards) */
@Component({
  selector: 'app-ra-interactive-dashboards',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, LucideAngularModule, DashboardWidget, WidgetLibrary, AddWidgetDialog, CreateDashboardDialog, ShareDashboardDialog],
  templateUrl: './interactive-dashboards.html',
  styleUrls: ['../shared/analytics-page.css', './interactive-dashboards.css']
})
export class InteractiveDashboardsPage extends AnalyticsPage implements OnInit {
  readonly store = inject(DashboardStore);
  private readonly route = inject(ActivatedRoute);

  readonly icons = {
    Calendar, ChartColumn, Check, ChevronDown, CirclePlus, Clock, Download, Ellipsis, FileText, GitCompareArrows, GripVertical, Info,
    Pencil, RefreshCw, Share2, Star, User, Users, X
  };
  readonly categories = ['All categories', ...RA_CATEGORIES];
  readonly me = CURRENT_USER.name;

  category = this.categories[0];
  compare = false;
  filters: DashFilters = this.buildFilters();
  current!: Dashboard;

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

  override updatedMinutes = 2;

  ngOnInit(): void {
    const requested = this.route.snapshot.queryParamMap.get('dashboard');
    this.current = (requested && this.store.get(requested)) || this.store.dashboards[0];
  }

  get canEdit(): boolean {
    return this.current.role !== 'Viewer';
  }

  get myDashboards(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.owner === this.me);
  }

  get sharedWithMe(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.owner !== this.me);
  }

  get favorites(): Dashboard[] {
    return this.store.dashboards.filter((d) => d.favorite);
  }

  get sharedText(): string {
    const d = this.current;
    if (d.sharing === 'organization') return 'Everyone in Purple IQ Group';
    const users = d.sharedWith.length;
    const groups = d.groups.length;
    if (!users && !groups) return 'Only you';
    const parts = [];
    if (users) parts.push(`${users} ${users === 1 ? 'user' : 'users'}`);
    if (groups) parts.push(`${groups} ${groups === 1 ? 'group' : 'groups'}`);
    return parts.join(' and ');
  }

  get shareLink(): string {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return `${origin}${this.basePath}/interactive-dashboards?dashboard=${encodeURIComponent(this.current.id)}`;
  }

  // ===== Filters =====

  private buildFilters(): DashFilters {
    return { period: this.period, organization: this.organization, location: this.location, category: this.category, compare: this.compare };
  }

  /** A new filters object makes every widget recompute its data */
  onFilterChange(): void {
    this.filters = this.buildFilters();
  }

  toggleCompare(): void {
    this.compare = !this.compare;
    this.onFilterChange();
  }

  override refresh(): void {
    super.refresh();
    this.onFilterChange();
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

  open(d: Dashboard): void {
    this.menu = null;
    if (this.editMode) this.finishEditing();
    this.current = d;
  }

  toggleFavorite(d: Dashboard, event: Event): void {
    event.stopPropagation();
    this.store.toggleFavorite(d);
  }

  onCreated(n: NewDashboard): void {
    this.createOpen = false;
    const d = this.store.create(n.name, n.description, n.sharing, n.copyCurrent ? this.current.widgets : []);
    this.open(d);
    this.startEditing();
    this.notify(`Dashboard “${d.name}” created. Add widgets from the Widget Library.`);
  }

  openShare(): void {
    if (this.current.role !== 'Owner') {
      this.notify(`Only the owner (${this.current.owner}) can change sharing. Use Copy link from the ⋯ menu instead.`);
      return;
    }
    this.shareOpen = true;
  }

  onShared(r: ShareResult): void {
    this.shareOpen = false;
    this.current.sharing = r.sharing;
    this.current.sharedWith = r.sharedWith;
    this.current.groups = r.groups;
    this.store.touch(this.current);
    this.notify(`Sharing updated: ${this.sharedText}.`);
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

  resetDemo(): void {
    this.menu = null;
    this.editMode = false;
    this.snapshot = null;
    this.store.reset();
    this.current = this.store.dashboards[0];
    this.notify('Demo dashboards restored.');
  }

  // ===== Edit mode =====

  startEditing(): void {
    if (!this.canEdit) return;
    this.snapshot = this.current.widgets.map((w) => ({ ...w }));
    this.editMode = true;
  }

  finishEditing(): void {
    this.editMode = false;
    this.snapshot = null;
  }

  discardChanges(): void {
    if (this.snapshot) this.store.replaceWidgets(this.current, this.snapshot);
    this.finishEditing();
    this.notify('Layout changes discarded.');
  }

  saveLayout(): void {
    this.store.touch(this.current);
    this.finishEditing();
    this.notify(`Layout of “${this.current.name}” saved.`);
  }

  removeWidget(w: WidgetConfig): void {
    this.store.replaceWidgets(this.current, this.current.widgets.filter((x) => x.id !== w.id));
    this.notify(`“${w.title}” removed.`);
  }

  resizeWidget(w: WidgetConfig, step: number): void {
    const i = SPAN_STEPS.indexOf(w.span);
    const span = SPAN_STEPS[Math.min(SPAN_STEPS.length - 1, Math.max(0, i + step))];
    // Replace the object so the widget re-renders for its new size
    this.store.replaceWidgets(this.current, this.current.widgets.map((x) => (x.id === w.id ? { ...x, span } : x)));
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
    } else if (this.dragId) {
      const list = [...this.current.widgets];
      const from = list.findIndex((w) => w.id === this.dragId);
      if (from >= 0 && from !== index) {
        const [moved] = list.splice(from, 1);
        list.splice(Math.min(index, list.length), 0, moved);
        this.store.replaceWidgets(this.current, list);
      }
    }
    this.onDragEnd();
  }

  onDragEnd(): void {
    this.dragId = null;
    this.overIndex = null;
  }

  // ===== Adding widgets =====

  openAdd(type: WidgetType | null, index = this.current.widgets.length): void {
    if (!this.canEdit) {
      this.notify(`You have view access to “${this.current.name}”. Copy it with Create Dashboard to customise it.`);
      return;
    }
    this.addDialog = { type: type ?? 'kpi', index };
  }

  onWidgetAdded(n: NewWidget): void {
    const at = this.addDialog?.index ?? this.current.widgets.length;
    this.addDialog = null;
    const list = [...this.current.widgets];
    list.splice(at, 0, { id: this.store.nextWidgetId(), type: n.type, metric: n.metric, title: n.title, span: n.span });
    this.store.replaceWidgets(this.current, list);
    this.notify(`“${n.title}” added to ${this.current.name}.`);
  }

  // ===== Export / views =====

  exportWidget(w: WidgetConfig): void {
    const csv = widgetCsv(w, buildWidgetData(w, this.filters));
    downloadCsv(`${w.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, csv.header, csv.rows);
  }

  /** Every widget in long format: widget, row label, column, value */
  exportDashboard(): void {
    const rows: (string | number)[][] = [];
    this.current.widgets.forEach((w) => {
      const csv = widgetCsv(w, buildWidgetData(w, this.filters));
      csv.rows.forEach((r) => r.slice(1).forEach((v, j) => rows.push([w.title, r[0], csv.header[j + 1] ?? '', v])));
      if (csv.header.length === 1) csv.rows.forEach((r) => rows.push([w.title, '', csv.header[0], r[0]]));
    });
    downloadCsv(`${this.current.id}.csv`, ['Widget', 'Item', 'Field', 'Value'], rows);
    this.notify(`Exported ${this.current.widgets.length} widgets from “${this.current.name}”.`);
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
    this.saveView(this.viewName.trim());
  }

  onNotice(message: string): void {
    this.notify(message);
  }

  scoreTone(score: number): string {
    return score < 50 ? 'red' : score < 65 ? 'orange' : 'green';
  }

  nameTaken = (name: string): boolean => this.store.nameTaken(name);
}
