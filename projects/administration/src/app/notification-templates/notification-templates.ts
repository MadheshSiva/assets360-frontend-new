import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Bell, BookOpen, Box, Calendar, ChevronDown, CircleCheck, Download, EllipsisVertical, FileText, Funnel, LucideAngularModule, Mail,
  MessageSquare, Plus, Search, Send, Share2, ShieldCheck, Smartphone, Truck, TriangleAlert, Upload, User, Wrench
} from 'lucide-angular';
import { AdminPage, CURRENT_USER } from '../shared/admin-common';
import { CATEGORY_PREFIX, LIBRARY, SORT_OPTIONS, TEMPLATE_CATEGORIES } from './notification-templates.data';
import { Channel, CHANNEL_LABELS, CHANNELS, NotificationTemplate, TemplateStatus } from './notification-templates.model';
import { NotificationTemplateService, apiErrorMessage } from './notification-templates.service';
import { TemplateEditor } from './template-editor/template-editor';
import { relativeTime, validateTemplate } from './template-render';
import { TemplateSettings } from './template-settings/template-settings';

type ConfirmKind = 'delete' | 'discard';

/** Administration > Notification Templates */
@Component({
  standalone: true,
  selector: 'app-admin-notification-templates',
  imports: [FormsModule, RouterLink, LucideAngularModule, TemplateEditor, TemplateSettings],
  templateUrl: './notification-templates.html',
  styleUrls: ['../shared/admin-workspace.css', './notification-templates.css']
})
export class NotificationTemplatesPage extends AdminPage {
  private readonly service = inject(NotificationTemplateService);

  readonly icons = { Mail, CircleCheck, FileText, Share2, Plus, BookOpen, Upload, Download, Search, Funnel, ChevronDown, Send, EllipsisVertical };
  readonly listIcons = { mail: Mail, file: FileText, truck: Truck, calendar: Calendar, shield: ShieldCheck, box: Box, user: User, wrench: Wrench, bell: Bell, alert: TriangleAlert };
  readonly channelIcons = { email: Mail, sms: MessageSquare, inApp: Smartphone, push: Bell };
  readonly channels = CHANNELS;
  readonly channelLabels = CHANNEL_LABELS;
  readonly categories = TEMPLATE_CATEGORIES;
  readonly statuses: TemplateStatus[] = ['Active', 'Draft', 'Inactive'];
  readonly sortOptions = SORT_OPTIONS;
  readonly library = LIBRARY;

  // List filters
  search = '';
  sortBy = SORT_OPTIONS[0];
  categoryFilter = '';
  statusFilter: '' | TemplateStatus = '';
  channelFilter: '' | Channel = '';
  filtersOpen = false;

  // Selected template: `draft` is the editable copy shared by the editor and the settings drawer
  draft: NotificationTemplate | null = null;
  submitted = false;
  /** True while a save or delete request is in flight. */
  saving = false;
  headMenuOpen = false;
  libraryOpen = false;
  confirm: { kind: ConfirmKind; title: string; message: string; payload: string } | null = null;

  constructor() {
    super();
    this.service.load().subscribe({
      next: () => {
        if (this.draft) return;
        const first = this.visible()[0];
        if (first) this.load(first.id);
      },
      error: (err) => this.notify(`Could not load templates: ${apiErrorMessage(err)}`)
    });
  }

  // ===== Stats =====

  count(status: TemplateStatus): number {
    return this.service.all().filter((t) => t.status === status).length;
  }

  get total(): number {
    return this.service.all().length;
  }

  pct(n: number): number {
    return this.total ? Math.round((n / this.total) * 100) : 0;
  }

  /** Channels used by at least one template. */
  usedChannels(): Channel[] {
    return CHANNELS.filter((c) => this.service.all().some((t) => t.channels[c]));
  }

  usedChannelNames(): string {
    return this.usedChannels().map((c) => CHANNEL_LABELS[c]).join(', ');
  }

  // ===== List =====

  visible(): NotificationTemplate[] {
    const term = this.search.trim().toLowerCase();
    const rows = this.service.all().filter(
      (t) =>
        (!this.categoryFilter || t.category === this.categoryFilter) &&
        (!this.statusFilter || t.status === this.statusFilter) &&
        (!this.channelFilter || t.channels[this.channelFilter]) &&
        (!term || [t.name, t.code, t.category, t.owner, t.triggerEvent].some((v) => v.toLowerCase().includes(term)))
    );
    const sorted = [...rows];
    switch (this.sortBy) {
      case 'Name': return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'Category': return sorted.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      case 'Status': return sorted.sort((a, b) => this.statuses.indexOf(a.status) - this.statuses.indexOf(b.status) || a.name.localeCompare(b.name));
      default: return sorted.sort((a, b) => b.updated.localeCompare(a.updated));
    }
  }

  get activeFilterCount(): number {
    return [this.categoryFilter, this.statusFilter, this.channelFilter].filter(Boolean).length;
  }

  clearFilters(): void {
    this.categoryFilter = '';
    this.statusFilter = '';
    this.channelFilter = '';
    this.filtersOpen = false;
  }

  relative(iso: string): string {
    return relativeTime(iso);
  }

  statusTone(status: TemplateStatus): string {
    return status === 'Active' ? 'green' : status === 'Draft' ? 'orange' : 'grey';
  }

  // ===== Selection =====

  /** True when the editable copy differs from the stored template. */
  get dirty(): boolean {
    if (!this.draft) return false;
    const saved = this.service.get(this.draft.id);
    return !saved || JSON.stringify(saved) !== JSON.stringify(this.draft);
  }

  pick(id: string): void {
    if (this.draft?.id === id) return;
    if (this.dirty) {
      this.confirm = { kind: 'discard', title: 'Discard unsaved changes?', message: `Your changes to ${this.draft?.name || 'this template'} have not been saved.`, payload: id };
      return;
    }
    this.load(id);
  }

  private load(id: string): void {
    const t = this.service.get(id);
    this.draft = t ? structuredClone(t) : null;
    this.submitted = false;
    this.headMenuOpen = false;
  }

  cancelEdits(): void {
    if (!this.draft) return;
    const changed = this.dirty;
    this.load(this.draft.id);
    this.notify(changed ? 'Changes discarded.' : 'No changes to discard.');
  }

  // ===== Save / publish / test =====

  private errors(full: boolean): Record<string, string> {
    if (!this.draft) return {};
    return validateTemplate(this.draft, this.service.codeTaken(this.draft.code, this.draft.id), full);
  }

  /** Shows field errors and a toast with the first one; returns true when valid. */
  private check(full: boolean): boolean {
    this.submitted = true;
    const errs = Object.values(this.errors(full));
    if (errs.length) {
      this.notify(`Please fix ${errs.length} issue${errs.length === 1 ? '' : 's'}: ${errs[0]}`);
      return false;
    }
    return true;
  }

  /** New drafts are created through the API on their first save (POST); stored templates are updated (PUT). */
  private persist(message: string): void {
    if (!this.draft || this.saving) return;
    this.draft.name = this.draft.name.trim();
    this.draft.code = this.draft.code.trim();
    this.draft.updated = new Date().toISOString();
    this.saving = true;
    const request = this.service.isPersisted(this.draft.id) ? this.service.update(this.draft) : this.service.create(this.draft);
    request.subscribe({
      next: (saved) => {
        this.saving = false;
        this.draft = structuredClone(saved);
        this.submitted = false;
        this.notify(message);
      },
      error: (err) => {
        this.saving = false;
        this.notify(`Could not save: ${apiErrorMessage(err)}`);
      }
    });
  }

  saveDraft(): void {
    if (!this.draft || !this.check(false)) return;
    this.draft.status = 'Draft';
    this.persist(`${this.draft.name} saved as draft (${this.draft.version}).`);
  }

  saveTemplate(): void {
    if (!this.draft || !this.check(true)) return;
    this.persist(`${this.draft.name} saved (${this.draft.status}).`);
  }

  publish(): void {
    if (!this.draft || !this.check(true)) return;
    const m = /^v(\d+)\.(\d+)$/.exec(this.draft.version);
    this.draft.version = !m || m[1] === '0' ? 'v1.0' : `v${m[1]}.${Number(m[2]) + 1}`;
    this.draft.status = 'Active';
    this.persist(`${this.draft.name} published as ${this.draft.version}.`);
  }

  /** DEMO MODE: nothing is sent; the toast lists what would go out. */
  testSend(): void {
    const t = this.draft;
    if (!t || !this.check(true)) return;
    this.submitted = false;
    const via = CHANNELS.filter((c) => t.channels[c]).map((c) => CHANNEL_LABELS[c]).join(', ');
    this.notify(`DEMO MODE: test "${t.name}" sent to ${CURRENT_USER.email} via ${via} using sample values.`);
  }

  previewAction(label: string): void {
    this.notify(`DEMO MODE: "${label}" would open the record in Asset360.`);
  }

  // ===== Create / library / duplicate / delete =====

  private uniqueCode(prefix: string): string {
    let n = 1;
    while (this.service.codeTaken(`NT-${prefix}-${String(n).padStart(3, '0')}`, null)) n++;
    return `NT-${prefix}-${String(n).padStart(3, '0')}`;
  }

  private blank(name: string, category: string): NotificationTemplate {
    return {
      id: this.service.newId(),
      name,
      code: this.uniqueCode(CATEGORY_PREFIX[category] ?? 'GEN'),
      category,
      owner: CURRENT_USER.name,
      description: '',
      status: 'Draft',
      version: 'v0.1',
      updated: new Date().toISOString(),
      triggerEvent: '',
      channels: { email: true, sms: false, inApp: true, push: false },
      language: 'English (Default)',
      priority: 'Normal',
      deliveryTiming: 'Send Immediately',
      retryPolicy: '3 retries (1hr apart)',
      email: { subject: '', fromName: 'Asset360 Notifications', replyTo: 'noreply@asset360.com', recipientType: 'Assignee', body: '' },
      sms: { text: '' },
      inApp: { title: name, body: '', link: '{{portal_url}}' },
      push: { title: '', body: '' },
      icon: 'mail',
      tone: 'purple'
    };
  }

  /** New drafts (Create / library) open with their settings dropdowns unselected; imports keep the defaults. */
  private unselected(t: NotificationTemplate): NotificationTemplate {
    return { ...t, language: '', priority: '', deliveryTiming: '', retryPolicy: '' };
  }

  /** Adds an empty draft and opens it; the user fills it in and saves. */
  create(): void {
    if (this.dirty) {
      this.notify('Save or cancel the current changes first.');
      return;
    }
    const t = this.unselected(this.blank('New Template', ''));
    this.service.save(t);
    this.clearFilters();
    this.search = '';
    this.load(t.id);
    this.notify('New draft template created. Fill in the subject and message, then save.');
  }

  useLibrary(index: number): void {
    const item = this.library[index];
    this.libraryOpen = false;
    if (!item) return;
    if (this.dirty) {
      this.notify('Save or cancel the current changes first.');
      return;
    }
    const t = this.unselected(this.blank(item.name, item.category));
    t.triggerEvent = item.trigger;
    t.email.subject = item.subject;
    t.email.body = item.body;
    t.sms.text = item.sms;
    t.channels.sms = true;
    t.inApp.body = item.subject;
    this.service.save(t);
    this.clearFilters();
    this.search = '';
    this.load(t.id);
    this.notify(`${item.name} added from the library as a draft.`);
  }

  duplicate(): void {
    if (!this.draft) return;
    this.headMenuOpen = false;
    const copy = structuredClone(this.draft);
    copy.id = this.service.newId();
    copy.name = `${this.draft.name} (Copy)`;
    copy.code = this.uniqueCode(CATEGORY_PREFIX[copy.category] ?? 'GEN');
    copy.status = 'Draft';
    copy.version = 'v0.1';
    copy.owner = CURRENT_USER.name;
    copy.updated = new Date().toISOString();
    this.service.save(copy);
    this.load(copy.id);
    this.notify(`Created ${copy.name} as a draft.`);
  }

  askDelete(): void {
    if (!this.draft) return;
    this.headMenuOpen = false;
    this.confirm = { kind: 'delete', title: 'Delete template?', message: `${this.draft.name} (${this.draft.code}) will be removed. Workflows using it will stop sending this message.`, payload: this.draft.id };
  }

  confirmYes(): void {
    const c = this.confirm;
    this.confirm = null;
    if (!c) return;
    if (c.kind === 'discard') {
      this.load(c.payload);
      return;
    }
    const name = this.service.get(c.payload)?.name ?? 'Template';
    this.saving = true;
    this.service.remove(c.payload).subscribe({
      next: () => {
        this.saving = false;
        const next = this.visible()[0];
        if (next) this.load(next.id);
        else this.draft = null;
        this.notify(`${name} deleted.`);
      },
      error: (err) => {
        this.saving = false;
        this.notify(`Could not delete: ${apiErrorMessage(err)}`);
      }
    });
  }

  // ===== Import / export =====

  exportTemplates(): void {
    const rows = this.visible();
    this.download(`notification-templates-${new Date().toISOString().slice(0, 10)}.json`, rows);
    this.notify(`Exported ${rows.length} template${rows.length === 1 ? '' : 's'} to JSON.`);
  }

  exportCurrent(): void {
    if (!this.draft) return;
    this.headMenuOpen = false;
    this.download(`${this.draft.code}.json`, [this.draft]);
    this.notify(`Exported ${this.draft.name}.`);
  }

  private download(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Imports templates exported by this page; each arrives as a draft with a fresh code if needed. */
  importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.notify('Import failed: the file is not valid JSON.');
        return;
      }
      const items = (Array.isArray(parsed) ? parsed : [parsed]) as Partial<NotificationTemplate>[];
      let lastId = '';
      let added = 0;
      for (const item of items) {
        if (!item || typeof item.name !== 'string' || !item.email || typeof item.email.body !== 'string') continue;
        const category = typeof item.category === 'string' && this.categories.includes(item.category) ? item.category : this.categories[0];
        const t = this.blank(item.name, category);
        if (typeof item.code === 'string' && /^[A-Z0-9-]{3,20}$/.test(item.code) && !this.service.codeTaken(item.code, null)) t.code = item.code;
        t.triggerEvent = typeof item.triggerEvent === 'string' ? item.triggerEvent : '';
        t.email = { ...t.email, ...item.email };
        if (item.channels) t.channels = { ...t.channels, ...item.channels };
        if (item.sms) t.sms = { ...t.sms, ...item.sms };
        if (item.inApp) t.inApp = { ...t.inApp, ...item.inApp };
        if (item.push) t.push = { ...t.push, ...item.push };
        this.service.save(t);
        lastId = t.id;
        added++;
      }
      if (!added) {
        this.notify('Import failed: no templates with a name and email body were found.');
        return;
      }
      this.load(lastId);
      this.notify(`Imported ${added} template${added === 1 ? '' : 's'} as draft.`);
    });
  }
}
