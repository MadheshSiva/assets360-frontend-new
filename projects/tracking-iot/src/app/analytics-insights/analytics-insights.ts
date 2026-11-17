import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import * as XLSX from 'xlsx';
import {
  LucideAngularModule,
  Activity,
  ArrowRight,
  Bookmark,
  CalendarDays,
  ChevronDown,
  Database,
  Download,
  Info,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Trash2,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-angular';
import { ASSET_TYPES, Analytics, Conn, Filters, HEALTHS, Health, IotDevice, Param, SITES, TECHS, TODAY, VIBRATION_BASELINE, analyze, isoOf } from './analytics-data';

type RangePreset = '7' | '30' | '90' | 'month' | 'custom';

interface SavedView {
  name: string;
  site: string;
  preset: RangePreset;
  from: string;
  to: string;
  assetType: string;
  tech: string;
}

interface DeviceList {
  title: string;
  note: string;
  file: string;
  rows: IotDevice[];
  /** Extra column shown for this list. */
  extra: 'battery' | 'vibration' | 'lastSeen';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIEWS_KEY = 'a360.iotAnalytics.views';
/** Status colours ship with a legend and a tooltip, never colour alone. */
const CONN_COLORS: Record<Conn, string> = { Online: '#0d9488', Warning: '#f59e0b', Offline: '#dc2626' };
const HEALTH_COLORS: Record<Health, string> = { Healthy: '#0d9488', Warning: '#f59e0b', Critical: '#dc2626', Unknown: '#9ca3af' };
const PARAMS: { key: Param; label: string; unit: string; axis: string; color: string }[] = [
  { key: 'temperature', label: 'Temperature', unit: '°C', axis: 'Temperature (°C)', color: '#6d28d9' },
  { key: 'vibration', label: 'Vibration', unit: 'mm/s', axis: 'Vibration (mm/s)', color: '#0d9488' },
  { key: 'energy', label: 'Energy', unit: 'kWh', axis: 'Energy (kWh)', color: '#ea7a10' },
];
const ALERT_COLORS = ['#6d5df6', '#14b8a6', '#fb923c', '#a5a9d6'];
/** Sequential single-hue ramp for the heatmap, light → dark. */
const HEAT_STEPS = ['#eef8f6', '#c8ece6', '#97d8ce', '#5dbcb0', '#22998d', '#0b6b63'];

// SVG geometry (user units)
const LW = 460;
const LH = 210;
const LPAD = { l: 44, r: 10, t: 10, b: 26 };
const TW = 400;

@Component({
  selector: 'app-analytics-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './analytics-insights.html',
  styleUrls: ['./analytics-insights.css', './analytics-insights-charts.css'],
})
export class AnalyticsInsights implements OnDestroy {
  readonly icons = { Activity, ArrowRight, Bookmark, CalendarDays, ChevronDown, Database, Download, Info, Lightbulb, MapPin, ShieldCheck, Trash2, TrendingUp, TriangleAlert, X };
  readonly sites = SITES.map((s) => s.name);
  readonly assetTypes = ASSET_TYPES;
  readonly techs = TECHS;
  readonly healths = HEALTHS;
  readonly params = PARAMS;
  readonly connColors = CONN_COLORS;
  readonly healthColors = HEALTH_COLORS;
  readonly alertColors = ALERT_COLORS;
  readonly heatSteps = HEAT_STEPS;
  readonly lw = LW;
  readonly lh = LH;
  readonly tw = TW;
  readonly pad = LPAD;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly bucketLabels = ['12 AM', '', '4 AM', '', '8 AM', '', '12 PM', '', '4 PM', '', '8 PM', ''];
  readonly vibrationBaseline = VIBRATION_BASELINE;
  readonly Math = Math;

  // filters
  site = '';
  preset: RangePreset = '30';
  from = '';
  to = TODAY;
  assetType = '';
  tech = '';
  rangeOpen = false;

  param: Param = 'temperature';
  menuOpen = '';
  viewName = '';
  savedViews: SavedView[] = this.readViews();
  list: DeviceList | null = null;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  hoverDay: number | null = null;
  hoverTel: number | null = null;
  hoverCell: { b: number; d: number } | null = null;
  hoverHealth: Health | null = null;
  hoverAlert: number | null = null;

  private cacheKey = '';
  private cache!: Analytics;

  constructor() {
    this.setPreset('30');
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ===== Filters =====

  setPreset(p: RangePreset): void {
    this.preset = p;
    if (p === 'custom') {
      this.rangeOpen = true;
      return;
    }
    const end = new Date(TODAY + 'T00:00');
    const start = new Date(end);
    if (p === 'month') start.setDate(1);
    else start.setDate(start.getDate() - (Number(p) - 1));
    this.from = isoOf(start);
    this.to = TODAY;
    this.rangeOpen = false;
  }

  onCustomRange(): void {
    this.preset = 'custom';
    if (this.from > this.to) [this.from, this.to] = [this.to, this.from];
  }

  get presetLabel(): string {
    return { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', month: 'This month', custom: 'Custom range' }[this.preset];
  }

  fmtDate(iso: string): string {
    return iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}` : '';
  }

  get rangeLabel(): string {
    return `${this.fmtDate(this.from)} – ${this.fmtDate(this.to)}`;
  }

  get filters(): Filters {
    return { site: this.site, from: this.from, to: this.to, assetType: this.assetType, tech: this.tech };
  }

  /** Aggregated figures for the current filters (recomputed only when a filter changes). */
  get a(): Analytics {
    const key = JSON.stringify(this.filters);
    if (key !== this.cacheKey) {
      this.cacheKey = key;
      this.cache = analyze(this.filters);
    }
    return this.cache;
  }

  get hasDevices(): boolean {
    return this.a.devices.length > 0;
  }

  // ===== Formatting =====

  fmtCompact(n: number): string {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  }

  fmtDelta(n: number): string {
    return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;
  }

  shortDate(iso: string): string {
    return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  }

  // ===== Connectivity trend =====

  private xOf(i: number, n: number, w: number): number {
    return LPAD.l + 6 + (n > 1 ? (i / (n - 1)) * (w - LPAD.l - LPAD.r - 12) : (w - LPAD.l - LPAD.r) / 2);
  }

  private niceMax(v: number): { max: number; step: number } {
    if (v <= 0) return { max: 4, step: 1 };
    const raw = v / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
    return { max: step * 4, step };
  }

  /** x-axis labels: about 7 evenly spaced days. */
  private xLabels(days: string[], w: number): { x: number; label: string }[] {
    const n = days.length;
    const every = Math.max(1, Math.ceil(n / 7));
    return days.map((d, i) => ({ i, d })).filter(({ i }) => i % every === 0 || i === n - 1)
      .filter(({ i }, k, arr) => !(i === n - 1 && k > 0 && n - 1 - arr[k - 1].i < every * 0.6))
      .map(({ i, d }) => ({ x: this.xOf(i, n, w), label: this.shortDate(d) }));
  }

  get conn(): { lines: { key: Conn; d: string; color: string }[]; area: string; ticks: { y: number; label: string }[]; xLabels: { x: number; label: string }[]; xs: number[] } {
    const c = this.a.connectivity;
    const n = this.a.days.length;
    const { max, step } = this.niceMax(Math.max(1, ...c.online));
    const yOf = (v: number) => LH - LPAD.b - (v / max) * (LH - LPAD.t - LPAD.b);
    const xs = this.a.days.map((_, i) => this.xOf(i, n, LW));
    const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${yOf(v).toFixed(1)}`).join('');
    const online = path(c.online);
    return {
      lines: [
        { key: 'Online', d: online, color: CONN_COLORS.Online },
        { key: 'Warning', d: path(c.warning), color: CONN_COLORS.Warning },
        { key: 'Offline', d: path(c.offline), color: CONN_COLORS.Offline },
      ],
      area: n ? `${online}L${xs[n - 1]},${LH - LPAD.b}L${xs[0]},${LH - LPAD.b}Z` : '',
      ticks: Array.from({ length: 5 }, (_, i) => ({ y: yOf(step * i), label: (step * i).toLocaleString() })),
      xLabels: this.xLabels(this.a.days, LW),
      xs,
    };
  }

  connY(v: number): number {
    const { max } = this.niceMax(Math.max(1, ...this.a.connectivity.online));
    return LH - LPAD.b - (v / max) * (LH - LPAD.t - LPAD.b);
  }

  // ===== Heatmap =====

  get heatMax(): number {
    return Math.max(1, ...this.a.heat.flat());
  }

  heatColor(v: number): string {
    if (!v) return HEAT_STEPS[0];
    return HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, 1 + Math.floor((v / this.heatMax) * (HEAT_STEPS.length - 1) * 0.999))];
  }

  bucketRange(b: number): string {
    const h = (x: number) => (x === 0 || x === 24 ? '12 AM' : x === 12 ? '12 PM' : x < 12 ? `${x} AM` : `${x - 12} PM`);
    return `${h(b * 2)} – ${h(b * 2 + 2)}`;
  }

  // ===== Telemetry =====

  get paramMeta() {
    return PARAMS.find((p) => p.key === this.param)!;
  }

  get tel(): { d: string; area: string; ticks: { y: number; label: string }[]; xLabels: { x: number; label: string }[]; xs: number[]; ys: number[]; empty: boolean } {
    const vals = this.a.telemetry[this.param];
    const n = vals.length;
    const empty = !vals.some((v) => v > 0);
    const { max, step } = this.niceMax(Math.max(1, ...vals) * 1.15);
    const yOf = (v: number) => LH - LPAD.b - (v / max) * (LH - LPAD.t - LPAD.b);
    const xs = vals.map((_, i) => this.xOf(i, n, TW));
    const ys = vals.map(yOf);
    const d = vals.map((_, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join('');
    return {
      d,
      area: n ? `${d}L${xs[n - 1]},${LH - LPAD.b}L${xs[0]},${LH - LPAD.b}Z` : '',
      ticks: Array.from({ length: 5 }, (_, i) => ({ y: yOf(step * i), label: String(Math.round(step * i * 10) / 10) })),
      xLabels: this.xLabels(this.a.days, TW),
      xs,
      ys,
      empty,
    };
  }

  // ===== Health donut, alerts =====

  get donut(): { total: number; rows: { key: Health; count: number; pct: number; color: string; dash: string; offset: number; lx: number; ly: number }[] } {
    const total = this.a.devices.length;
    const r = 56;
    const C = 2 * Math.PI * r;
    let acc = 0;
    const rows = HEALTHS.map((key) => {
      const count = this.a.health[key];
      const len = total ? (count / total) * C : 0;
      const mid = (acc + len / 2) / C; // fraction around the ring, from 12 o'clock
      const ang = mid * 2 * Math.PI - Math.PI / 2;
      const row = { key, count, pct: total ? Math.round((count / total) * 100) : 0, color: HEALTH_COLORS[key], dash: `${Math.max(0, len - 2)} ${C}`, offset: -acc, lx: 80 + Math.cos(ang) * r, ly: 80 + Math.sin(ang) * r };
      acc += len;
      return row;
    });
    return { total, rows };
  }

  get hoverHealthCount(): number | null {
    return this.hoverHealth ? this.a.health[this.hoverHealth] : null;
  }

  get alertBars(): { category: string; count: number; width: number; color: string }[] {
    const max = this.alertAxis.max;
    return this.a.alerts.map((x, i) => ({ ...x, width: max ? (x.count / max) * 100 : 0, color: ALERT_COLORS[i] }));
  }

  get alertAxis(): { max: number; ticks: { pct: number; label: string }[] } {
    const { max, step } = this.niceMax(Math.max(1, ...this.a.alerts.map((x) => x.count)));
    return { max, ticks: Array.from({ length: 5 }, (_, i) => ({ pct: (i / 4) * 100, label: String(step * i) })) };
  }

  uptimeClass(v: number): string {
    return v >= 97 ? 'good' : v >= 95 ? 'fair' : 'poor';
  }

  coverageClass(v: number): string {
    return v >= 90 ? 'good' : v >= 85 ? 'fair' : 'poor';
  }

  // ===== Insights =====

  viewOfflineDevices(): void {
    const r = this.a.offlineRise;
    if (!r) return;
    this.list = { title: `Offline devices · ${r.site}`, note: `Offline events rose ${r.pct}% vs the previous period; ${r.devices.filter((d) => d.gateway === r.gateway).length} of these report through ${r.gateway}.`, file: `Offline_${r.site.replace(/\s+/g, '_')}`, rows: [...r.devices].sort((x, y) => (x.gateway === r.gateway ? -1 : 0) - (y.gateway === r.gateway ? -1 : 0)), extra: 'lastSeen' };
  }

  openBatteryAlert(): void {
    const rows = this.a.lowBattery;
    this.list = { title: 'Low battery tags', note: `${rows.length} tags are below 20% battery. Replace them before they stop reporting.`, file: 'Low_Battery_Tags', rows, extra: 'battery' };
  }

  openVibration(): void {
    const rows = this.a.highVibration;
    this.list = { title: 'Pump vibration above baseline', note: `Baseline ${VIBRATION_BASELINE} mm/s RMS. ${rows.length} assets exceed it.`, file: 'Pump_Vibration_Report', rows, extra: 'vibration' };
  }

  get lowBatteryTech(): string {
    const techs = [...new Set(this.a.lowBattery.map((d) => d.tech))];
    return techs.length === 1 ? techs[0] : '';
  }

  exportList(): void {
    const l = this.list;
    if (!l) return;
    const rows = l.rows.map((d, i) => ({
      '#': i + 1, Device: d.id, Asset: d.assetTag, 'Asset Type': d.assetType, Site: d.site, Gateway: d.gateway, Technology: d.tech, Status: d.status, Health: d.health,
      'Battery %': d.battery ?? '', 'Vibration (mm/s)': d.vibration ?? '', 'Last Seen': d.lastSeen,
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Devices');
    XLSX.writeFile(book, `${l.file}_${TODAY}.xlsx`);
  }

  // ===== Saved views =====

  private readViews(): SavedView[] {
    try {
      return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]') as SavedView[];
    } catch {
      return [];
    }
  }

  private writeViews(): void {
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(this.savedViews));
    } catch {}
  }

  saveView(): void {
    const name = this.viewName.trim();
    if (!name) return;
    const v: SavedView = { name, site: this.site, preset: this.preset, from: this.from, to: this.to, assetType: this.assetType, tech: this.tech };
    this.savedViews = [v, ...this.savedViews.filter((x) => x.name.toLowerCase() !== name.toLowerCase())].slice(0, 10);
    this.writeViews();
    this.viewName = '';
    this.menuOpen = '';
    this.showToast(`View "${name}" saved.`);
  }

  applyView(v: SavedView): void {
    this.site = v.site;
    this.assetType = v.assetType;
    this.tech = v.tech;
    if (v.preset === 'custom') {
      this.preset = 'custom';
      this.from = v.from;
      this.to = v.to;
    } else this.setPreset(v.preset);
    this.menuOpen = '';
    this.showToast(`View "${v.name}" applied.`);
  }

  deleteView(v: SavedView, event: Event): void {
    event.stopPropagation();
    this.savedViews = this.savedViews.filter((x) => x !== v);
    this.writeViews();
  }

  // ===== Export =====

  export(kind: 'xlsx' | 'csv'): void {
    this.menuOpen = '';
    const a = this.a;
    const scope = [this.site || 'All sites', this.assetType || 'All asset types', this.tech || 'All technologies', this.rangeLabel].join(' · ');
    const sites = a.sites.map((s) => ({ Site: s.name, 'Uptime %': +s.uptime.toFixed(1), Devices: s.devices, Alerts: s.alerts, 'Location Coverage %': +s.coverage.toFixed(1) }));
    if (kind === 'csv') {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sites), 'Sites');
      XLSX.writeFile(book, `IoT_Analytics_Sites_${TODAY}.csv`, { bookType: 'csv' });
      return;
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
      { Metric: 'Scope', Value: scope },
      { Metric: 'Average Device Uptime %', Value: +a.kpi.uptime.toFixed(1) },
      { Metric: 'Location Coverage %', Value: +a.kpi.coverage.toFixed(1) },
      { Metric: 'Telemetry Events', Value: Math.round(a.kpi.events) },
      { Metric: 'Alert Resolution %', Value: +a.kpi.resolution.toFixed(1) },
    ]), 'Summary');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(a.days.map((d, i) => ({
      Date: d, Online: a.connectivity.online[i], Warning: a.connectivity.warning[i], Offline: a.connectivity.offline[i],
      'Temperature °C': a.telemetry.temperature[i], 'Vibration mm/s': a.telemetry.vibration[i], 'Energy kWh': a.telemetry.energy[i],
    }))), 'Daily');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(HEALTHS.map((h) => ({ Health: h, Devices: a.health[h] }))), 'Device Health');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(a.alerts.map((x) => ({ Category: x.category, Alerts: x.count }))), 'Alerts');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sites), 'Sites');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(this.weekdays.map((day, d) => {
      const row: Record<string, string | number> = { Day: day };
      a.heat.forEach((r, b) => (row[this.bucketRange(b)] = r[d]));
      return row;
    })), 'Movement');
    XLSX.writeFile(book, `IoT_Analytics_${TODAY}.xlsx`);
  }

  print(): void {
    this.menuOpen = '';
    window.print();
  }

  // ===== Menus & toast =====

  toggleMenu(name: string, event: Event): void {
    event.stopPropagation();
    this.menuOpen = this.menuOpen === name ? '' : name;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuOpen = '';
    this.rangeOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
    this.list = null;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
