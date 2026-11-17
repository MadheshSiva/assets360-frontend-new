import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule,
  Bell,
  Bold,
  Braces,
  CalendarClock,
  CircleCheck,
  Clock,
  Ellipsis,
  FilePen,
  Inbox,
  Info,
  Italic,
  Link,
  List,
  ListOrdered,
  Mail,
  Monitor,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  TriangleAlert,
  Underline,
  UserPlus,
  Wrench,
  X
} from 'lucide-angular';
import { AuthService } from 'shared-ui';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { NotificationTemplate } from '../shared/inspection.models';
import { fmtDate, pillClass } from '../shared/insp-utils';
import { NotificationPreview } from './notification-preview';

type Tab = 'templates' | 'rules' | 'history';
type Field = 'subject' | 'body';

export const TEMPLATE_VARIABLES = [
  'inspection_id',
  'inspection_title',
  'inspector_name',
  'asset_name',
  'location',
  'due_date',
  'inspection_url'
];

const EVENTS = [
  'Inspection assigned',
  'Upcoming inspection reminder',
  'Inspection overdue',
  'Critical finding raised',
  'Corrective action due',
  'Inspection completed'
];

@Component({
  selector: 'app-insp-notification-templates',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, NotificationPreview],
  templateUrl: './notification-templates.html',
  styleUrls: ['../shared/insp-page.css', './notification-templates.css']
})
export class NotificationTemplatesPage implements OnInit {
  readonly icons = {
    Bell, Bold, Braces, CalendarClock, CircleCheck, Clock, Ellipsis, FilePen, Inbox, Info, Italic, Link, List,
    ListOrdered, Mail, Monitor, Plus, Search, Send, SlidersHorizontal, TriangleAlert, Underline, UserPlus, Wrench, X
  };
  readonly api = inject(InspectionApi);
  private readonly auth = inject(AuthService);
  readonly store = this.api.notificationTemplates;
  readonly pillClass = pillClass;
  readonly variables = TEMPLATE_VARIABLES;
  readonly channels = ['Email', 'In-app', 'Push'];
  readonly recipientOptions = ['Assigned inspector', 'Supervisor', 'Approver', 'Asset owner', 'Site manager', 'Quality team'];
  readonly timings = [
    'Send immediately on assignment',
    'Send immediately',
    '1 day before due date',
    '3 days before due date',
    'On due date',
    '1 day after due date',
    'Daily digest at 08:00'
  ];
  readonly subtabs: { key: Tab; label: string }[] = [
    { key: 'templates', label: 'Notification Templates' },
    { key: 'rules', label: 'Delivery Rules' },
    { key: 'history', label: 'Delivery History' }
  ];

  readonly bodyRef = viewChild<ElementRef<HTMLTextAreaElement>>('body');
  readonly subjectRef = viewChild<ElementRef<HTMLInputElement>>('subject');

  tab: Tab = 'templates';
  readonly search = signal('');
  readonly statusFilter = signal<'All' | 'Active' | 'Draft'>('All');
  showFilter = false;
  readonly selectedId = signal<string | null>(null);
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const st = this.statusFilter();
    return this.store
      .items()
      .filter((t) => st === 'All' || this.statusOf(t) === st)
      .filter((t) => !q || `${t.templateName} ${t.event}`.toLowerCase().includes(q));
  });
  readonly events = computed(() => [...new Set([...EVENTS, ...this.store.items().map((t) => t.event).filter(Boolean)])]);

  /** Sample values for the preview: the first In Progress inspection. */
  readonly sample = computed<Record<string, string>>(() => {
    const rows = this.api.inspections.items();
    const i = rows.find((r) => r.status === 'In Progress') ?? rows[0];
    // No inspection yet: leave the {{variables}} unfilled in the preview.
    if (!i) return {} as Record<string, string>;
    return {
      inspection_id: i.inspectionCode,
      inspection_title: i.title,
      inspector_name: i.assignedTo,
      asset_name: [i.assetName, i.assetCode].filter(Boolean).join(' '),
      location: i.location || i.siteName,
      due_date: fmtDate(i.dueDate),
      inspection_url: `${location.origin}/inspection/execution?code=${encodeURIComponent(i.inspectionCode)}`,
      asset_code: i.assetCode
    };
  });

  draft: NotificationTemplate | null = null;
  dirty = false;
  saving = false;
  menuFor: string | null = null;
  confirmDelete: string | null = null;
  showVarMenu = false;
  lastField: Field = 'body';
  readonly toast = signal<string | null>(null);

  constructor() {
    effect(() => {
      const first = this.store.items()[0];
      if (first && this.selectedId() === null) this.select(first);
    });
  }

  ngOnInit(): void {
    this.store.load();
    this.api.inspections.load();
  }

  statusOf(t: NotificationTemplate): string {
    return t.status === 'Active' || (t.status !== 'Draft' && t.isActive) ? 'Active' : 'Draft';
  }

  eventIcon(event: string): { icon: typeof Bell; cls: string } {
    const e = event.toLowerCase();
    if (e.includes('assign')) return { icon: UserPlus, cls: 'ev ev--purple' };
    if (e.includes('remind') || e.includes('upcoming')) return { icon: CalendarClock, cls: 'ev ev--blue' };
    if (e.includes('overdue')) return { icon: Clock, cls: 'ev ev--red' };
    if (e.includes('finding') || e.includes('critical')) return { icon: TriangleAlert, cls: 'ev ev--red' };
    if (e.includes('action')) return { icon: Wrench, cls: 'ev ev--blue' };
    if (e.includes('complete')) return { icon: CircleCheck, cls: 'ev ev--blue' };
    return { icon: Bell, cls: 'ev ev--purple' };
  }

  select(t: NotificationTemplate): void {
    this.selectedId.set(t.id);
    const d = structuredClone(t);
    d.channels = d.channels ?? [];
    d.recipients = d.recipients ?? [];
    d.ccRecipients = d.ccRecipients ?? [];
    this.draft = d;
    this.dirty = false;
    this.menuFor = null;
  }

  newTemplate(): void {
    this.tab = 'templates';
    this.selectedId.set('');
    this.draft = {
      id: '',
      status: 'Draft',
      createdBy: null,
      createdAt: null,
      updatedBy: null,
      updatedAt: null,
      clientId: null,
      tenantId: null,
      templateCode: '',
      templateName: 'New Template',
      event: '',
      channels: ['Email', 'In-app'],
      subject: 'Inspection {{inspection_id}}',
      messageBody: 'Hello {{inspector_name}},\n\n',
      recipients: ['Assigned inspector'],
      ccRecipients: [],
      buttonLabel: 'Open Inspection',
      timing: '',
      respectUserLocale: true,
      preventDuplicates: true,
      isActive: false
    };
    this.dirty = true;
  }

  touch(): void {
    this.dirty = true;
  }

  varLabel(v: string): string {
    return `{{${v}}}`;
  }

  hasChannel(c: string): boolean {
    return !!this.draft?.channels.includes(c);
  }

  toggleChannel(c: string): void {
    const d = this.draft;
    if (!d) return;
    d.channels = d.channels.includes(c) ? d.channels.filter((x) => x !== c) : this.channels.filter((x) => x === c || d.channels.includes(x));
    this.dirty = true;
  }

  setSendTo(v: string): void {
    if (!this.draft) return;
    this.draft.recipients = v ? [v] : [];
    this.dirty = true;
  }

  setCc(v: string): void {
    if (!this.draft) return;
    this.draft.ccRecipients = v ? [v] : [];
    this.dirty = true;
  }

  // ===== Editing helpers =====
  insertVariable(name: string): void {
    this.showVarMenu = false;
    this.insertText(`{{${name}}}`, this.lastField);
  }

  /** Inserts text at the caret of the subject or body field. */
  private insertText(text: string, field: Field): void {
    const d = this.draft;
    if (!d) return;
    const el = field === 'subject' ? this.subjectRef()?.nativeElement : this.bodyRef()?.nativeElement;
    const value = field === 'subject' ? d.subject : d.messageBody;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    if (field === 'subject') d.subject = next;
    else d.messageBody = next;
    this.dirty = true;
    this.restoreCaret(el, start + text.length, start + text.length);
  }

  /** Wraps the body selection with markers (bold/italic/underline/link) or prefixes lines (lists). */
  format(kind: 'bold' | 'italic' | 'underline' | 'ul' | 'ol' | 'link'): void {
    const d = this.draft;
    const el = this.bodyRef()?.nativeElement;
    if (!d || !el) return;
    const v = d.messageBody;
    const s = el.selectionStart ?? v.length;
    const e = el.selectionEnd ?? v.length;
    const sel = v.slice(s, e);
    let out: string;
    if (kind === 'ul' || kind === 'ol') {
      const lines = (sel || 'List item').split('\n');
      out = lines.map((l, i) => (kind === 'ul' ? `- ${l}` : `${i + 1}. ${l}`)).join('\n');
    } else if (kind === 'link') {
      out = `[${sel || 'link text'}]({{inspection_url}})`;
    } else {
      const mark = kind === 'bold' ? '**' : kind === 'italic' ? '*' : '__';
      out = `${mark}${sel || 'text'}${mark}`;
    }
    d.messageBody = v.slice(0, s) + out + v.slice(e);
    this.dirty = true;
    this.restoreCaret(el, s, s + out.length);
  }

  private restoreCaret(el: HTMLInputElement | HTMLTextAreaElement | undefined, start: number, end: number): void {
    if (!el) return;
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  }

  // ===== Library actions =====
  duplicate(t: NotificationTemplate): void {
    this.menuFor = null;
    this.selectedId.set('');
    this.draft = {
      ...structuredClone(t),
      id: '',
      templateCode: '',
      templateName: `${t.templateName} (copy)`,
      status: 'Draft',
      isActive: false,
      createdAt: null,
      updatedAt: null
    };
    this.dirty = true;
  }

  remove(t: NotificationTemplate): void {
    this.menuFor = null;
    this.confirmDelete = null;
    this.store.remove(t.id).subscribe({
      next: () => {
        if (this.selectedId() === t.id) this.reselect();
        this.flash('Template deleted.');
      },
      error: (err) => this.flash(apiErrorMessage(err))
    });
  }

  private reselect(): void {
    this.draft = null;
    const first = this.store.items()[0];
    if (first) this.select(first);
    else this.selectedId.set(null);
  }

  // ===== Footer =====
  cancel(): void {
    const orig = this.store.byId(this.selectedId());
    if (orig) this.select(orig);
    else this.reselect();
  }

  save(activate: boolean): void {
    const d = this.draft;
    if (!d || this.saving) return;
    if (!d.templateName.trim() || !d.subject.trim()) {
      this.flash('Template name and subject are required.');
      return;
    }
    if (!d.event || !d.timing) {
      this.flash('Select an event and a notification timing.');
      return;
    }
    if (activate && !d.channels.length) {
      this.flash('Select at least one channel before activating.');
      return;
    }
    const record: NotificationTemplate = { ...d, status: activate ? 'Active' : 'Draft', isActive: activate };
    const { id, ...rest } = record;
    this.saving = true;
    this.store.save(id ? record : rest).subscribe({
      next: (saved) => {
        this.saving = false;
        this.select(saved);
        this.flash(activate ? 'Template saved and activated.' : 'Draft saved.');
      },
      error: (err) => {
        this.saving = false;
        this.flash(apiErrorMessage(err));
      }
    });
  }

  sendTest(): void {
    if (!this.draft) return;
    this.flash(`Test sent to ${this.auth.getUserEmail() || 'you'}`);
  }

  refreshPreview(): void {
    this.api.inspections.load(true);
    this.flash('Preview refreshed with the latest sample data.');
  }

  lastEdited(d: NotificationTemplate): string {
    return fmtDate(d.updatedAt || d.createdAt);
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 3000);
  }
}
