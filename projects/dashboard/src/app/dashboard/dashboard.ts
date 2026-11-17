import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { MainDashboard } from '../main-dashboard/main-dashboard';
import { WipDashboard } from '../wip-dashboard/wip-dashboard';
import { InspectionDashboard } from '../inspection-dashboard/inspection-dashboard';
import { MapComponent, MapPin } from 'shared-ui';
import { WidgetDragHandle } from '../shared/widget-drag-handle/widget-drag-handle';
import { loadOrder, saveOrder, reorderByKey, moveWithinVisible } from '../shared/dashboard-widgets/widget-order.util';
import { WIDGET_CATALOG, WidgetCategory, WidgetCategoryKey } from '../shared/dashboard-widgets/widget-catalog';
// STATIC DASHBOARD: the Add Widget popup is switched off (see the commented markup at the end of dashboard.html).
// import { WidgetPicker } from '../shared/widget-picker/widget-picker';
import { loadSelectedWidgets, saveSelectedWidgets } from '../shared/dashboard-widgets/widget-selection';
import { DashboardWidgetsApi } from '../shared/dashboard-widgets/dashboard-widgets.api';

/**
 * STATIC DASHBOARD: every module shows all of its widgets, with one tab per module (Assets, Work Orders,
 * WIP, Inspection). The first-visit setup ("No widgets yet") and the Add Widget popup flow are commented out;
 * to bring them back, restore the commented lines in ngOnInit and the commented markup in dashboard.html.
 */
const ALL_WIDGET_IDS: string[] = WIDGET_CATALOG.flatMap((c) => c.widgets.map((w) => `${c.key}.${w.id}`));

interface AssetsStatCard {
  label: string;
  value: string;
  icon: string;
  iconBg: string;
  change: string;
  changeType: 'up' | 'down' | 'neutral';
  link?: string;
}

interface WorkStatusItem { label: string; value: string; color: string; }
interface Point { x: number; y: number; }
interface MaintenanceItem { id: string; asset: string; type: string; due: string; priority: string; priorityClass: string; }
interface WorkOrder { id: string; title: string; asset: string; status: string; statusClass: string; }
interface AssetBar { name: string; count: number; percent: number; }
interface CostItem { label: string; value: string; trend: string; trendType: 'up' | 'down'; }
interface AlertItem { title: string; detail: string; type: string; }
interface Technician { name: string; load: number; }

interface PopupColumn {
  key: string;
  label: string;
}

interface PopupRow {
  [key: string]: string | number | undefined;
}

interface CardPopup {
  title: string;
  summary: string;
  icon?: string;
  iconBg?: string;
  columns: PopupColumn[];
  rows: PopupRow[];
}

type DateCell = {
  date: Date;
  iso: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

/** Work Order stat card layout (labels, icons, colours); values stay 0 until a data source is wired. */
const WORK_ORDER_STAT_SHELLS: AssetsStatCard[] = [
  { label: 'Total Work Orders', value: '0', icon: 'clipboard', iconBg: '#2563eb', change: '', changeType: 'neutral' },
  { label: 'Completed', value: '0', icon: 'check', iconBg: '#22c55e', change: '', changeType: 'neutral' },
  { label: 'In Progress', value: '0', icon: 'clock', iconBg: '#f59e0b', change: '', changeType: 'neutral' },
  { label: 'Overdue', value: '0', icon: 'alert', iconBg: '#ef4444', change: '', changeType: 'neutral' },
  { label: 'PM Due This Week', value: '0', icon: 'calendar', iconBg: '#7c3aed', change: '', changeType: 'neutral', link: 'View schedule' },
  { label: 'Maintenance Cost', value: '$0', icon: 'dollar', iconBg: '#0891b2', change: '', changeType: 'neutral' },
];

@Component({
  standalone: true,
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule, DragDropModule, MainDashboard, WipDashboard, InspectionDashboard, MapComponent, WidgetDragHandle /* , WidgetPicker */],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', './dashboard-tabs.css'],
})
export class Dashboard implements OnInit, OnDestroy {
  // ===== Module tabs: one per module that has selected widgets =====
  readonly moduleTabs: Record<WidgetCategoryKey, { tab: string; title: string }> = {
    asset: { tab: 'Assets', title: 'Assets Dashboard' },
    workOrder: { tab: 'Work Orders', title: 'Work Order' },
    wip: { tab: 'WIP Dashboard', title: 'WIP Dashboard' },
    inspection: { tab: 'Inspection', title: 'Inspection Dashboard' },
  };
  activeModule: WidgetCategoryKey | null = null;

  /** Modules with at least one selected widget, in catalog order. */
  get visibleModules(): WidgetCategoryKey[] {
    return this.catalog.map((c) => c.key).filter((key) => this.selectedByCategory[key].length > 0);
  }

  switchModule(key: WidgetCategoryKey): void {
    this.activeModule = key;
    // after the view marks the new tab active, slide the pill to it
    requestAnimationFrame(() => this.moveGlider());
  }

  // ===== Sliding tab pill =====
  private tabBarEl?: HTMLElement;
  private tabBarObserver?: ResizeObserver;
  private gliderPlaced = false;

  /** The tab bar lives inside an *ngIf, so (re)attach whenever it appears. */
  @ViewChild('tabBar') set tabBar(ref: ElementRef<HTMLElement> | undefined) {
    this.tabBarObserver?.disconnect();
    this.tabBarEl = ref?.nativeElement;
    this.gliderPlaced = false;
    if (!this.tabBarEl) return;
    // tab widths change when the active label turns bold; keep sliding rather than jumping
    this.tabBarObserver = new ResizeObserver(() => this.moveGlider());
    this.tabBarObserver.observe(this.tabBarEl);
    requestAnimationFrame(() => this.moveGlider());
  }

  /** Put the glass pill under the active tab; slides between tabs, jumps on first placement. */
  private moveGlider(animate = true): void {
    const bar = this.tabBarEl;
    const glider = bar?.querySelector<HTMLElement>('.tab-glider');
    const tab = bar?.querySelector<HTMLElement>('.dash-tab.active');
    if (!bar || !glider || !tab) return;
    glider.classList.toggle('no-anim', !(animate && this.gliderPlaced));
    glider.style.width = `${tab.offsetWidth}px`;
    glider.style.height = `${tab.offsetHeight}px`;
    glider.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
    glider.classList.add('is-ready');
    bar.classList.add('has-glider');
    this.gliderPlaced = true;
  }

  ngOnDestroy(): void {
    this.tabBarObserver?.disconnect();
  }

  /** Edit a tab = reopen the picker on that module's widgets. */
  editModule(key: WidgetCategoryKey): void {
    this.openWidgetPicker(key);
  }

  /** Delete a tab = remove all of that module's widgets. */
  deleteModule(key: WidgetCategoryKey): void {
    if (!confirm(`Remove the ${this.moduleTabs[key].tab} tab and its widgets?`)) return;
    const ids = this.selectedIds.filter((id) => !id.startsWith(key + '.'));
    const before = this.selectedByCategory;
    this.setSelection(ids);
    saveSelectedWidgets(ids);
    this.selectionEdited = true;
    this.syncWidgets(before);
  }

  // ===== Widget selection (Add Widget popup) =====
  readonly catalog: WidgetCategory[] = WIDGET_CATALOG;
  // Full ids, e.g. 'asset.stat:Total Assets', 'workOrder.timeline'
  selectedIds: string[] = [];
  // Local ids per category, passed down to each module's widgets
  selectedByCategory: Record<WidgetCategoryKey, string[]> = { asset: [], workOrder: [], wip: [], inspection: [] };

  isWidgetPickerOpen = false;
  // Module group the popup opens expanded on
  pickerExpand: WidgetCategoryKey | null = null;

  get hasWidgets(): boolean {
    return this.selectedIds.length > 0;
  }

  openWidgetPicker(expand: WidgetCategoryKey | null = null): void {
    this.closePicker();
    this.pickerExpand = expand;
    this.isWidgetPickerOpen = true;
  }

  onWidgetsApplied(ids: string[]): void {
    const before = new Set(this.visibleModules);
    const previous = this.selectedByCategory;
    this.setSelection(ids);
    saveSelectedWidgets(ids);
    this.selectionEdited = true;
    this.syncWidgets(previous);
    // Jump to a module that just got its first widgets, so the user sees what they added
    const added = this.visibleModules.find((key) => !before.has(key));
    if (added) this.activeModule = added;
  }

  // Message shown when the server save fails; the selection is still kept on this device
  widgetSaveError = '';
  // Set once the user changes widgets, so a slower server load doesn't overwrite their choice
  private selectionEdited = false;

  /**
   * Saves each module whose widget list changed to /api/widgets (one record per module).
   * A module emptied here has its record deleted.
   */
  private syncWidgets(previous: Record<WidgetCategoryKey, string[]>): void {
    const changed = this.catalog
      .map((c) => c.key)
      .filter((key) => previous[key].join('\n') !== this.selectedByCategory[key].join('\n'));
    this.widgetSaveError = '';
    for (const key of changed) {
      this.widgetsApi.save(key, this.selectedByCategory[key]).catch((err: unknown) => {
        console.error(`Saving ${key} dashboard widgets failed:`, err);
        this.widgetSaveError = "Couldn't save your widgets to the server. They're kept on this device for now.";
      });
    }
  }

  /**
   * The server copy wins when it has any widgets. If it has none yet, the selection saved on this
   * device (from before the API existed) is uploaded so it isn't lost.
   */
  private async loadServerWidgets(): Promise<void> {
    let saved: Map<string, string[]>;
    try {
      saved = await this.widgetsApi.load();
    } catch (err) {
      console.error('Loading dashboard widgets failed:', err);
      this.widgetSaveError = "Couldn't load your widgets from the server. Showing the ones saved on this device.";
      return;
    }
    if (this.selectionEdited) return;
    const empty: Record<WidgetCategoryKey, string[]> = { asset: [], workOrder: [], wip: [], inspection: [] };
    if (!saved.size) {
      if (this.selectedIds.length) this.syncWidgets(empty);
      return;
    }
    const ids = this.catalog.flatMap((c) => (saved.get(c.key) ?? []).map((local) => `${c.key}.${local}`));
    this.setSelection(ids);
    saveSelectedWidgets(ids);
  }
  private setSelection(ids: string[]): void {
    this.selectedIds = ids;
    const byCategory: Record<WidgetCategoryKey, string[]> = { asset: [], workOrder: [], wip: [], inspection: [] };
    for (const id of ids) {
      const dot = id.indexOf('.');
      const key = id.slice(0, dot) as WidgetCategoryKey;
      if (byCategory[key]) byCategory[key].push(id.slice(dot + 1));
    }
    this.selectedByCategory = byCategory;
    // Keep the active tab valid: fall back to the first module that still has widgets
    const modules = this.visibleModules;
    if (!this.activeModule || !modules.includes(this.activeModule)) {
      this.activeModule = modules[0] ?? null;
    }
  }

  // ===== Work Order widgets (rendered by this component) =====
  woHas(id: string): boolean {
    return this.selectedByCategory.workOrder.includes(id);
  }

  // 'sideStack' groups three separately selectable widgets
  private woWidgetVisible = (id: string): boolean =>
    id === 'sideStack' ? this.woHas('topAssets') || this.woHas('costSummary') || this.woHas('quickActions') : this.woHas(id);

  get visibleWorkOrderWidgets(): string[] {
    return this.assetsWidgetOrder.filter(this.woWidgetVisible);
  }

  get visibleStatCards(): AssetsStatCard[] {
    return this.statCards.filter((c) => this.woHas('stat:' + c.label));
  }

  // ===== Widget drag-and-drop ordering (Work Order widgets) =====
  readonly assetsWidgetOrder: string[] = loadOrder('piq.dashboard.assets.widgetOrder', [
    'timeline', 'compliance', 'workStatus', 'recent', 'sideStack', 'alerts', 'workload', 'maintenance',
  ]);

  trackByWidgetId = (_: number, id: string) => id;

  onAssetsWidgetDrop(event: CdkDragDrop<string[]>): void {
    moveWithinVisible(this.assetsWidgetOrder, this.woWidgetVisible, event.previousIndex, event.currentIndex);
    saveOrder('piq.dashboard.assets.widgetOrder', this.assetsWidgetOrder);
  }

  onStatCardDrop(event: CdkDragDrop<AssetsStatCard[]>): void {
    moveWithinVisible(this.statCards, (c) => this.woHas('stat:' + c.label), event.previousIndex, event.currentIndex);
    saveOrder('piq.dashboard.assets.statOrder', this.statCards.map((c) => c.label));
  }
  cardPopup: CardPopup | null = null;
  mapPins: MapPin[] = [];

  openCardPopup(card: AssetsStatCard): void {
    this.closePicker();
    this.cardPopup = this.buildCardPopup(card);
  }

  closeCardPopup(): void {
    this.cardPopup = null;
  }

  private buildCardPopup(card: AssetsStatCard): CardPopup | null {
    switch (card.label) {
      case 'Total Work Orders':
        return {
          title: card.label,
          summary: `${card.value} total work orders · ${card.change}`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'label', label: 'Status' },
            { key: 'value', label: 'Count' },
            { key: 'percent', label: 'Percent' },
          ],
          rows: this.getWorkStatusRows(),
        };

      case 'Completed':
        return {
          title: 'Completed Work Orders',
          summary: `${card.value} completed work orders · ${card.change}`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'id', label: 'Work Order ID' },
            { key: 'title', label: 'Title' },
            { key: 'asset', label: 'Asset' },
            { key: 'status', label: 'Status' },
          ],
          rows: this.getRecentWorkOrderRows('Completed'),
        };

      case 'In Progress':
        return {
          title: 'In Progress Work Orders',
          summary: `${card.value} in progress work orders · ${card.change}`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'id', label: 'Work Order ID' },
            { key: 'title', label: 'Title' },
            { key: 'asset', label: 'Asset' },
            { key: 'status', label: 'Status' },
          ],
          rows: this.getRecentWorkOrderRows('In Progress'),
        };

      case 'Overdue':
        return {
          title: 'Overdue Work Orders',
          summary: `${card.value} overdue work orders · ${card.change}`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'id', label: 'Work Order ID' },
            { key: 'asset', label: 'Asset' },
            { key: 'type', label: 'Type' },
            { key: 'due', label: 'Due Date' },
            { key: 'priority', label: 'Priority' },
            { key: 'status', label: 'Status' },
          ],
          rows: this.getMaintenanceRows(),
        };

      case 'PM Due This Week':
        return {
          title: card.label,
          summary: `${card.value} preventive maintenance items due this week`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'id', label: 'Work Order ID' },
            { key: 'asset', label: 'Asset' },
            { key: 'type', label: 'Type' },
            { key: 'due', label: 'Due Date' },
            { key: 'priority', label: 'Priority' },
            { key: 'status', label: 'Status' },
          ],
          rows: this.getMaintenanceRows(),
        };

      case 'Maintenance Cost':
        return {
          title: card.label,
          summary: `${card.value} maintenance cost · ${card.change}`,
          icon: card.icon,
          iconBg: card.iconBg,
          columns: [
            { key: 'label', label: 'Period' },
            { key: 'value', label: 'Cost' },
            { key: 'trend', label: 'Trend' },
          ],
          rows: this.getCostRows(),
        };

      default:
        return null;
    }
  }

  private getWorkStatusRows(): PopupRow[] {
    return this.workStatus.map((item) => ({
      label: item.label,
      value: item.value,
      percent: this.extractPercent(item.value),
    }));
  }

  private getRecentWorkOrderRows(status: string): PopupRow[] {
    const rows = this.recentWorkOrders
      .filter((order) => order.status === status)
      .map((order) => ({
        id: order.id,
        title: order.title,
        asset: order.asset,
        status: order.status,
      }));

    return rows;
  }

  private getMaintenanceRows(): PopupRow[] {
    return this.upcomingMaintenance.map((item) => ({
      id: item.id,
      asset: item.asset,
      type: item.type,
      due: item.due,
      priority: item.priority,
      status: 'Pending',
    }));
  }

  private getCostRows(): PopupRow[] {
    return this.costSummary.map((item) => ({
      label: item.label,
      value: item.value,
      trend: item.trend,
    }));
  }

  private extractPercent(value: string): string {
    const match = value.match(/\(([^)]+)\)/);
    return match ? match[1] : '-';
  }

  // ===== Date Range Picker State =====
  isPickerOpen = false;
  startDate: Date | null = null;
  endDate: Date | null = null;
  // The month that the LEFT calendar is showing
  viewMonth: Date = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  // The selection stage: 'start' or 'end'
  selecting: 'start' | 'end' = 'start';
  // Hover preview of the end date
  hoverDate: Date | null = null;

  readonly weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  readonly monthLabels = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  presets: { label: string; getRange: () => { start: Date; end: Date } }[] = [
    {
      label: 'Today',
      getRange: () => {
        const t = new Date();
        return { start: t, end: t };
      },
    },
    {
      label: 'Yesterday',
      getRange: () => {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return { start: y, end: y };
      },
    },
    {
      label: 'Last 7 Days',
      getRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return { start, end };
      },
    },
    {
      label: 'Last 30 Days',
      getRange: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        return { start, end };
      },
    },
    {
      label: 'This Month',
      getRange: () => {
        const now = new Date();
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        };
      },
    },
    {
      label: 'Last Month',
      getRange: () => {
        const now = new Date();
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0),
        };
      },
    },
  ];

  // ===== Data Properties =====
  statCards: AssetsStatCard[] = [];
  workStatus: WorkStatusItem[] = [];
  /** Y positions of the timeline chart's grid lines (chart layout). */
  chartGrid: number[] = [42, 78, 114, 150, 186];
  weekLabels: string[] = [];
  createdPoints: Point[] = [];
  completedPoints: Point[] = [];
  overduePoints: Point[] = [];
  upcomingMaintenance: MaintenanceItem[] = [];
  recentWorkOrders: WorkOrder[] = [];
  topAssets: AssetBar[] = [];
  costSummary: CostItem[] = [];
  /** Quick action links (UI config, not data). */
  quickActions: string[] = ['Create Work Order', 'Schedule Preventive Maintenance', 'Add New Asset', 'Purchase Request'];
  alerts: AlertItem[] = [];
  technicians: Technician[] = [];
  /** PM compliance %, null until a data source is wired. */
  pmCompliance: number | null = null;

  /** Total shown in the Work Order Status donut (the Total Work Orders stat card value). */
  get workOrderTotal(): string {
    return this.statCards.find((c) => c.label === 'Total Work Orders')?.value ?? '0';
  }

  /** Donut segments from the "(nn%)" share in each work status value; grey ring when there is no data. */
  get workStatusGradient(): string {
    let acc = 0;
    const stops = this.workStatus.map((item) => {
      const p = parseFloat(this.extractPercent(item.value)) || 0;
      const stop = `${item.color} ${acc}% ${acc + p}%`;
      acc += p;
      return stop;
    });
    return acc > 0 ? `conic-gradient(${stops.join(', ')}, #f1f5f9 ${acc}% 100%)` : '#f1f5f9';
  }

  /** SVG polyline points for a line series. */
  toPolyline(points: Point[]): string {
    return points.map((p) => `${p.x},${p.y}`).join(' ');
  }

  constructor(
    private host: ElementRef<HTMLElement>,
    private widgetsApi: DashboardWidgetsApi,
  ) {}

  async ngOnInit(): Promise<void> {
    // STATIC DASHBOARD: show all widgets of every module instead of the user's saved selection.
    this.setSelection(ALL_WIDGET_IDS);
    // Widget selection flow (commented out): load the user's saved widgets from this device, then the server.
    // this.setSelection(loadSelectedWidgets());
    // void this.loadServerWidgets();
    // No work order data source yet: stat cards keep their labels with zero values, the other widgets render empty
    this.statCards = reorderByKey(WORK_ORDER_STAT_SHELLS.map((c) => ({ ...c })), 'piq.dashboard.assets.statOrder', (c) => c.label);
  }

  // ===== Picker Open/Close =====
  togglePicker(): void {
    this.isPickerOpen = !this.isPickerOpen;
    if (this.isPickerOpen) {
      // Initialize the visible month to the month of the current start date
      this.viewMonth = new Date(
        (this.startDate ?? new Date()).getFullYear(),
        (this.startDate ?? new Date()).getMonth(),
        1
      );
      this.selecting = 'start';
      this.hoverDate = null;
    }
  }

  closePicker(): void {
    this.isPickerOpen = false;
  }

  // Close when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isPickerOpen) return;
    const target = event.target as Node;
    if (!this.host.nativeElement.contains(target)) {
      this.isPickerOpen = false;
    }
  }

  // Close on Escape
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isPickerOpen) this.isPickerOpen = false;
    if (this.cardPopup) this.closeCardPopup();
  }

  // ===== Calendar Generation =====
  get leftMonthCells(): DateCell[] {
    return this.buildMonthGrid(this.viewMonth);
  }

  get rightMonthCells(): DateCell[] {
    const next = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 1);
    return this.buildMonthGrid(next);
  }

  get leftMonthLabel(): string {
    return `${this.monthLabels[this.viewMonth.getMonth()]} ${this.viewMonth.getFullYear()}`;
  }

  get rightMonthLabel(): string {
    const next = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 1);
    return `${this.monthLabels[next.getMonth()]} ${next.getFullYear()}`;
  }

  private buildMonthGrid(monthAnchor: Date): DateCell[] {
    const year = monthAnchor.getFullYear();
    const month = monthAnchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: DateCell[] = [];

    // Leading days from previous month
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      cells.push(this.makeCell(d, false));
    }
    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push(this.makeCell(d, true));
    }
    // Trailing days from next month to fill 6 rows (42 cells)
    while (cells.length < 42) {
      const d = new Date(year, month + 1, cells.length - (startWeekday + daysInMonth) + 1);
      cells.push(this.makeCell(d, false));
    }
    return cells;
  }

  private makeCell(date: Date, inCurrentMonth: boolean): DateCell {
    const today = new Date();
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    return {
      date,
      iso: this.toIso(date),
      day: date.getDate(),
      inCurrentMonth,
      isToday,
    };
  }

  // ===== Navigation between months =====
  prevMonth(): void {
    this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() - 1, 1);
  }

  nextMonth(): void {
    this.viewMonth = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 1);
  }

  // ===== Cell State Checks =====
  isInRange(cell: DateCell): boolean {
    if (!this.startDate) return false;
    const end = this.endDate ?? this.hoverDate;
    if (!end) return false;
    const t = cell.date.getTime();
    const s = this.startDate.getTime();
    const e = end.getTime();
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    return t > lo && t < hi;
  }

  isStart(cell: DateCell): boolean {
    if (!this.startDate) return false;
    return this.sameDay(cell.date, this.startDate);
  }

  isEnd(cell: DateCell): boolean {
    if (!this.endDate) return false;
    return this.sameDay(cell.date, this.endDate);
  }

  isPreviewEnd(cell: DateCell): boolean {
    if (this.endDate) return false;
    if (this.selecting !== 'end' || !this.hoverDate) return false;
    if (!this.startDate) return false;
    // Only preview when the hover date would become the end
    if (this.hoverDate.getTime() < this.startDate.getTime()) return false;
    return this.sameDay(cell.date, this.hoverDate);
  }

  // ===== Selecting a Day =====
  onPickDay(cell: DateCell): void {
    if (this.selecting === 'start' || (this.startDate && this.endDate)) {
      this.startDate = new Date(cell.date);
      this.endDate = null;
      this.selecting = 'end';
    } else if (this.selecting === 'end' && this.startDate) {
      if (cell.date.getTime() < this.startDate.getTime()) {
        // If user picks earlier date as end, swap so range is valid
        this.endDate = this.startDate;
        this.startDate = new Date(cell.date);
      } else {
        this.endDate = new Date(cell.date);
      }
      this.selecting = 'start';
    }
    this.hoverDate = null;
    // Snap the visible month so the selected start is visible
    this.viewMonth = new Date(
      (this.startDate ?? cell.date).getFullYear(),
      (this.startDate ?? cell.date).getMonth(),
      1
    );
  }

  onHoverDay(cell: DateCell): void {
    if (this.selecting === 'end' && this.startDate && !this.endDate) {
      this.hoverDate = new Date(cell.date);
    }
  }

  clearHover(): void {
    if (this.selecting === 'end' && !this.endDate) {
      this.hoverDate = null;
    }
  }

  // ===== Preset =====
  applyPreset(preset: { label: string; getRange: () => { start: Date; end: Date } }): void {
    const { start, end } = preset.getRange();
    this.startDate = start;
    this.endDate = end;
    this.viewMonth = new Date(start.getFullYear(), start.getMonth(), 1);
    this.selecting = 'start';
  }

  applySelection(): void {
    if (this.startDate && !this.endDate) {
      // Single day when only start is picked
      this.endDate = new Date(this.startDate);
    }
    this.isPickerOpen = false;
  }

  resetPicker(): void {
    this.startDate = null;
    this.endDate = null;
    this.hoverDate = null;
    this.selecting = 'start';
  }

  // ===== Display =====
  get displayRange(): string {
    if (!this.startDate) return 'Select date range';
    if (!this.endDate || this.sameDay(this.startDate, this.endDate)) {
      return this.formatDate(this.startDate);
    }
    return `${this.formatDate(this.startDate)} - ${this.formatDate(this.endDate)}, ${this.endDate.getFullYear()}`;
  }

  // ===== Helpers =====
  private formatDate(d: Date): string {
    return `${this.monthLabels[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  }

  private sameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  trackByIso = (_: number, cell: DateCell) => cell.iso;
}
