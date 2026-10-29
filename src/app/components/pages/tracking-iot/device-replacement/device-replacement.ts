import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  LucideAngularModule,
  Activity,
  ArrowLeft,
  ArrowRight,
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Bluetooth,
  Box,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Cpu,
  Database,
  FileText,
  History,
  Info,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Thermometer,
  TriangleAlert,
  Wrench,
  X,
  ChevronDown,
  Link2,
  Radio,
  ScanLine,
} from 'lucide-angular';
import { Candidate, CheckResult, Compat, DeviceKind, ExistingDevice, HistoryEvent, QUEUE, REASONS, SESSION, STOCK, checksFor, compatOf } from './replacement-data';

type OptKey = 'telemetry' | 'alerts' | 'group' | 'gateway' | 'history' | 'endPrior';
interface OptDef { key: OptKey; label: string; desc: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_ICONS: Record<DeviceKind, typeof Cpu> = { beacon: Bluetooth, vibration: Activity, temperature: Thermometer, gps: MapPin };
const DEFAULT_OPTS: Record<OptKey, boolean> = { telemetry: true, alerts: true, group: true, gateway: true, history: true, endPrior: true };

@Component({
  selector: 'app-device-replacement',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './device-replacement.html',
  styleUrls: ['./device-replacement.css', './device-replacement-steps.css', './device-replacement-panels.css'],
})
export class DeviceReplacement implements OnDestroy {
  readonly icons = { ChevronDown, Link2, Radio, ScanLine, Activity, ArrowLeft, ArrowRight, Box, Check, CircleAlert, CircleCheck, CircleX, Clock, Database, FileText, History, Info, LoaderCircle, RotateCcw, Search, Settings, ShieldCheck, Tag, TriangleAlert, Wrench, X };
  readonly reasons = REASONS;
  readonly steps = ['Select Existing Device', 'Choose Replacement', 'Validate Compatibility', 'Transfer Configuration', 'Confirm & Close'];
  readonly leftOpts: OptDef[] = [
    { key: 'telemetry', label: 'Copy telemetry settings', desc: 'Transfer sampling intervals and telemetry configuration' },
    { key: 'alerts', label: 'Copy alert rules', desc: 'Transfer threshold and alert rules' },
    { key: 'group', label: 'Copy device group', desc: 'Assign the same device group as current device' },
    { key: 'gateway', label: 'Copy gateway assignment', desc: 'Use the same gateway assignment' },
  ];
  readonly rightOpts: OptDef[] = [
    { key: 'history', label: 'Retain historical data under asset', desc: 'Keep all historical telemetry data with the asset (recommended)' },
    { key: 'endPrior', label: 'End prior device assignment at replacement time', desc: 'Automatically end the current device assignment when new device is assigned (recommended)' },
  ];

  step = 1;
  device: ExistingDevice = QUEUE[0];
  reason = QUEUE[0].reason;
  candidateId = '';
  search = '';
  opts: Record<OptKey, boolean> = { ...DEFAULT_OPTS };

  /** id of the candidate the compatibility check was last run for */
  checkedFor = '';
  checkedAt = '';
  checking = false;
  checkProgress = 0;

  historyOpen = false;
  pickerOpen = false;
  /** Continue to Confirmation pressed before the check ran: open step 5 once it passes. */
  private confirmAfterCheck = false;
  confirmChecked = false;
  done = false;
  doneNewId = '';
  draftNote = '';
  toast = '';

  private timers: ReturnType<typeof setTimeout>[] = [];
  private toastTimer?: ReturnType<typeof setTimeout>;
  private sub?: Subscription;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.sub = this.route.queryParamMap.subscribe((q) => this.init(q.get('device')));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.timers.forEach((t) => clearTimeout(t));
    clearTimeout(this.toastTimer);
  }

  private init(wanted: string | null): void {
    const fromQuery = wanted ? this.queue.find((d) => d.id.toLowerCase() === wanted.toLowerCase()) : undefined;
    const draft = SESSION.draft;
    if (fromQuery) {
      this.pickDevice(fromQuery);
      if (draft && draft.deviceId === fromQuery.id) this.applyDraft();
    } else if (draft && this.queue.some((d) => d.id === draft.deviceId)) {
      this.applyDraft();
    } else {
      const first = this.queue.find((d) => d.id === 'BLE-20951') || this.queue[0];
      if (first) this.pickDevice(first);
    }
    if (wanted && !fromQuery) this.showToast(`Device ${wanted} is not in the replacement queue — showing ${this.device.id}.`);
  }

  private applyDraft(): void {
    const d = SESSION.draft;
    const dev = d ? this.queue.find((x) => x.id === d.deviceId) : undefined;
    if (!d || !dev) return;
    this.pickDevice(dev);
    this.reason = d.reason;
    if (this.candidates.some((c) => c.id === d.candidateId)) this.candidateId = d.candidateId;
    this.opts = { ...DEFAULT_OPTS, ...d.opts };
    this.step = Math.min(4, Math.max(1, d.step));
    if (this.step >= 3) this.step = 2; // checks are re-run after a restore
    this.draftNote = `Draft saved at ${d.savedAt} restored`;
  }

  // ===== Data views =====

  get queue(): ExistingDevice[] {
    return QUEUE.filter((d) => d.status !== 'Retired' || (this.done && d.id === this.device.id));
  }

  get replacedCount(): number {
    return SESSION.completed.length;
  }

  /** Stock candidates of the same device family as the existing device. */
  get candidates(): Candidate[] {
    return STOCK.filter((c) => c.kind === this.device.kind);
  }

  get filteredCandidates(): Candidate[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.candidates;
    return this.candidates.filter((c) => [c.id, c.model, c.tag].some((v) => v.toLowerCase().includes(q)));
  }

  get candidate(): Candidate | undefined {
    return STOCK.find((c) => c.id === this.candidateId) || (this.done ? this.doneCandidate : undefined);
  }

  private doneCandidate?: Candidate;

  get candidateLabel(): string {
    return this.candidate ? this.candidate.id : '—';
  }

  get candidateModel(): string {
    return this.candidate ? this.candidate.model : '—';
  }

  get checks(): CheckResult[] {
    return this.candidate ? checksFor(this.device, this.candidate) : [];
  }

  get checkRun(): boolean {
    return !!this.candidateId && this.checkedFor === this.candidateId && !this.checking;
  }

  get passCount(): number {
    return this.checks.filter((c) => c.status === 'pass').length;
  }

  get warnCount(): number {
    return this.checks.filter((c) => c.status === 'warn').length;
  }

  get blocking(): CheckResult | undefined {
    return this.checks.find((c) => c.status === 'fail');
  }

  compat(c: Candidate): Compat {
    return compatOf(this.device, c);
  }

  compatTip(c: Candidate): string {
    const missing = this.device.channels.filter((ch) => !c.channels.includes(ch));
    const notes: string[] = [];
    if (missing.length) notes.push(`${c.model} has no ${missing.join(', ').toLowerCase()} channel`);
    checksFor(this.device, c).filter((r) => r.key !== 'chan' && r.status !== 'pass').forEach((r) => notes.push(r.text));
    return notes.join(' · ');
  }

  checkState(i: number): 'pending' | 'running' | 'done' {
    if (!this.checking) return 'done';
    if (i < this.checkProgress) return 'done';
    return i === this.checkProgress ? 'running' : 'pending';
  }

  kindIcon(k: DeviceKind): typeof Cpu {
    return KIND_ICONS[k];
  }

  batteryIcon(v: number): typeof Cpu {
    return v < 20 ? BatteryLow : v < 60 ? BatteryMedium : v < 95 ? Battery : BatteryFull;
  }

  healthClass(h: string): string {
    return 'hs--' + h.toLowerCase().replace(/\s+/g, '-');
  }

  get requestId(): string {
    return SESSION.requests[this.device.id] || '';
  }

  get todayLabel(): string {
    const d = new Date();
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  get historyEvents(): HistoryEvent[] {
    return this.device.history;
  }

  get historyPill(): { cls: string; text: string } {
    return this.opts.history ? { cls: 'pill--ok', text: 'Preserved' } : { cls: 'pill--warn', text: 'Not retained' };
  }

  get chosenOpts(): OptDef[] {
    return [...this.leftOpts, ...this.rightOpts];
  }

  optDesc(o: OptDef): string {
    return o.key === 'gateway' ? `${o.desc} (${this.device.gateway})` : o.desc;
  }

  fmt(iso: string): string {
    const [d, t] = iso.split('T');
    const [y, m, day] = d.split('-').map(Number);
    return `${day} ${MONTHS[m - 1]} ${y}${t ? ' ' + t : ''}`;
  }

  fmtDate(iso: string): string {
    return this.fmt(iso.split('T')[0]);
  }

  fmtTime(iso: string): string {
    return iso.split('T')[1] ?? '';
  }

  // ===== Stepper =====

  get nextBlock(): string {
    if (!this.queue.length) return 'No devices awaiting replacement';
    if (!this.candidate) return 'Select a replacement device';
    if (this.checking) return 'Compatibility check in progress…';
    if (this.checkRun && this.blocking) return `${this.candidate.id} failed "${this.blocking.name}" — choose another device`;
    return '';
  }

  get nextLabel(): string {
    return 'Continue to Confirmation';
  }

  /** Runs the compatibility check if needed, then opens the confirmation step. */
  next(): void {
    if (this.nextBlock || this.step >= 5) return;
    if (!this.checkRun) {
      this.confirmAfterCheck = true;
      this.runCheck();
      return;
    }
    this.step = 5;
    this.confirmChecked = false;
  }

  private static readonly ANCHORS = ['dr-sel', 'dr-cand', 'dr-val', 'dr-cfg'];

  /** Stepper click: steps 1–4 jump to their section, step 5 continues to confirmation. */
  goStep(n: number): void {
    if (this.done || this.checking) return;
    if (n === 5) {
      this.next();
      return;
    }
    if (this.step === 5) this.step = 4;
    setTimeout(() => document.getElementById(DeviceReplacement.ANCHORS[n - 1])?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  back(): void {
    if (this.step === 5) this.step = 4;
  }

  // ===== Actions =====

  pickDevice(d: ExistingDevice): void {
    if (this.device.id !== d.id) this.search = '';
    this.device = d;
    this.reason = d.reason;
    const list = this.candidates;
    const best = list.find((c) => this.compat(c) === 'Compatible') || list[0];
    this.candidateId = best ? best.id : '';
    this.checkedFor = '';
    this.historyOpen = false;
    this.pickerOpen = false;
    this.confirmAfterCheck = false;
    this.step = 1;
  }

  selectCandidate(c: Candidate): void {
    if (this.step > 4 || this.checking) return;
    if (this.candidateId !== c.id) this.confirmAfterCheck = false;
    this.candidateId = c.id;
    this.step = 2;
  }

  toggleOpt(k: OptKey): void {
    this.opts[k] = !this.opts[k];
    if (this.checkRun && !this.blocking) this.step = 4;
  }

  runCheck(): void {
    const c = this.candidate;
    if (!c || this.checking) {
      if (!c) this.showToast('Select a replacement device to check.');
      return;
    }
    this.checking = true;
    this.checkProgress = 0;
    this.step = Math.max(this.step, 3);
    const n = this.checks.length;
    for (let i = 1; i <= n; i++) {
      this.timers.push(setTimeout(() => {
        this.checkProgress = i;
        if (i === n) {
          this.checking = false;
          this.checkedFor = c.id;
          const t = new Date();
          this.checkedAt = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          const b = this.blocking;
          this.step = b ? 3 : 4;
          if (this.confirmAfterCheck && !b) {
            this.step = 5;
            this.confirmChecked = false;
          }
          this.confirmAfterCheck = false;
          this.showToast(b ? `${c.id}: blocking issue — ${b.name}.` : `${c.id}: ${this.passCount}/${n} checks passed${this.warnCount ? `, ${this.warnCount} warning(s)` : ''}.`);
        }
      }, i * 380));
    }
  }

  createRequest(): void {
    if (this.requestId) {
      this.showToast(`Replacement request ${this.requestId} is already open for ${this.device.id}.`);
      return;
    }
    const id = `REQ-${SESSION.nextRequest++}`;
    SESSION.requests[this.device.id] = id;
    this.device.history.unshift({ at: this.nowIso(), kind: 'replace', text: `Replacement request ${id} created (${this.reason})` });
    this.showToast(`Replacement request ${id} created for ${this.device.id}.`);
  }

  saveDraft(): void {
    const t = this.nowIso().split('T')[1];
    SESSION.draft = { deviceId: this.device.id, reason: this.reason, candidateId: this.candidateId, step: this.step, opts: { ...this.opts }, savedAt: t };
    this.draftNote = `Draft saved at ${t}`;
    this.showToast(`Draft saved for ${this.device.id} — it will be restored when you return to this page.`);
  }

  discardDraft(): void {
    SESSION.draft = null;
    this.draftNote = '';
    this.showToast('Draft discarded.');
  }

  confirm(): void {
    const c = this.candidate;
    if (!c || !this.confirmChecked || this.done) return;
    const at = this.nowIso();
    const d = this.device;
    d.status = 'Retired';
    d.reason = this.reason;
    d.history.unshift({ at, kind: 'replace', text: `Replaced by ${c.id} (${c.model}); assignment to ${d.assetName} ended — kept in history` });
    const idx = STOCK.indexOf(c);
    if (idx >= 0) STOCK.splice(idx, 1);
    SESSION.completed.push({ oldId: d.id, newId: c.id, asset: d.assetName, at });
    if (SESSION.draft && SESSION.draft.deviceId === d.id) SESSION.draft = null;
    delete SESSION.requests[d.id];
    this.doneCandidate = c;
    this.doneNewId = c.id;
    this.done = true;
    this.draftNote = '';
    this.showToast(`Replacement completed: ${d.id} → ${c.id} on ${d.assetName}.`);
  }

  replaceAnother(): void {
    this.done = false;
    this.doneCandidate = undefined;
    this.doneNewId = '';
    this.step = 1;
    this.opts = { ...DEFAULT_OPTS };
    this.confirmChecked = false;
    const first = this.queue[0];
    if (first) this.pickDevice(first);
    else this.candidateId = '';
  }

  viewHealth(): void {
    this.router.navigate(['/tracking-iot/device-health']);
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.pickerOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.historyOpen = false;
    this.pickerOpen = false;
  }

  private nowIso(): string {
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }
}
