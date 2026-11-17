import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, defer, from, of, toArray } from 'rxjs';
import {
  BadgeCheck, Box, Building2, ChevronRight, Coins, Copy, Download, Ellipsis, Eye, Funnel, Hammer, List, Lock, LucideAngularModule, LucideIconData,
  Pencil, Plus, Search, Server, Shield, Trash2, Upload, User, Users, Wrench, X
} from 'lucide-angular';
import { ASSET360_MODULES, AdminPage } from '../shared/admin-common';
import { RoleAccessService, adminApiError } from '../role-access-control/role-access.service';
import { UsersDialog } from '../role-access-control/users-dialog/users-dialog';
import { ExceptionList } from './exception-list/exception-list';
import { FeatureList } from './feature-list/feature-list';
import { FEATURES, PolicyIcon, PolicyRecord, PolicyStatus, PolicyType, blankPolicy } from './module-access.data';
import { ModuleAccessService } from './module-access.service';
import { ModuleTable } from './module-table/module-table';
import { PolicyDrawer, policyErrors } from './policy-drawer/policy-drawer';

type Tab = 'modules' | 'features' | 'exceptions';

interface Filters {
  type: '' | PolicyType;
  status: '' | PolicyStatus;
  module: string;
}

interface Confirm {
  title: string;
  message: string;
  action: string;
  run: () => void;
}

const POLICY_ICONS: Record<PolicyIcon, LucideIconData> = {
  user: User, users: Users, wrench: Wrench, box: Box, shield: Shield, eye: Eye, coins: Coins, server: Server, hammer: Hammer,
  badge: BadgeCheck, search: Search, building: Building2
};

/** Administration > Module Access: access policies, their module / feature access and per-user exceptions. */
@Component({
  standalone: true,
  selector: 'app-admin-module-access',
  imports: [FormsModule, RouterLink, LucideAngularModule, ModuleTable, FeatureList, ExceptionList, PolicyDrawer, UsersDialog],
  templateUrl: './module-access.html',
  styleUrls: ['../shared/admin-workspace.css', './module-access.css']
})
export class ModuleAccessPage extends AdminPage {
  private readonly service = inject(ModuleAccessService);
  private readonly roles = inject(RoleAccessService);

  readonly icons = { Box, List, Lock, Users, Plus, Copy, Upload, Download, Search, Funnel, ChevronRight, Ellipsis, Pencil, Trash2, X };
  readonly modules = ASSET360_MODULES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'modules', label: 'Modules' },
    { id: 'features', label: 'Features' },
    { id: 'exceptions', label: 'Exceptions' }
  ];

  search = '';
  listSearch = '';
  filters: Filters = { type: '', status: '', module: '' };
  showFilters = false;
  tab: Tab = 'modules';

  selectedId = '';
  draft: PolicyRecord = blankPolicy();
  private snapshot = '';
  isNew = false;
  submitted = false;
  drawerOpen = true;
  menuOpen = false;
  usersOpen = false;
  /** A create/update request is in flight */
  saving = false;
  confirm: Confirm | null = null;

  constructor() {
    super();
    this.service.load().subscribe({
      next: (all) => {
        this.load(all.find((p) => p.code === 'OPS-MGR-001') ?? all[0]);
        this.notify(
          all.length ? `Loaded ${all.length} access polic${all.length === 1 ? 'y' : 'ies'} from the server.` : 'No access policies yet. Create the first policy.',
          'success'
        );
      },
      error: (err) => this.notify(`Couldn't load access policies: ${adminApiError(err, 'access policy')}`, 'error')
    });
    // Role options for the policy drawer
    this.roles.ensureLoaded().subscribe({ error: (err) => this.notify(`Couldn't load roles: ${adminApiError(err, 'roles')}`, 'error') });
  }

  get loading(): boolean {
    return this.service.loading();
  }

  // ===== Stats =====
  get policies(): PolicyRecord[] {
    return this.service.all();
  }

  readonly featureCount = FEATURES.length;
  readonly restrictedCount = FEATURES.filter((f) => f.restricted).length;

  get usersCovered(): number {
    return this.policies.reduce((sum, p) => sum + p.users, 0);
  }

  // ===== List =====
  get filtered(): PolicyRecord[] {
    const terms = [this.search, this.listSearch].map((t) => t.trim().toLowerCase()).filter(Boolean);
    const f = this.filters;
    return this.policies.filter(
      (p) =>
        (!f.type || p.type === f.type) &&
        (!f.status || p.status === f.status) &&
        (!f.module || p.grants.some((g) => g.module === f.module && g.enabled)) &&
        terms.every((t) => this.matches(p, t))
    );
  }

  /** Name, code, type, or a module the policy has enabled */
  private matches(p: PolicyRecord, t: string): boolean {
    return [p.name, p.code, p.type, p.description].some((v) => v.toLowerCase().includes(t)) || p.grants.some((g) => g.enabled && g.module.toLowerCase().includes(t));
  }

  get filterCount(): number {
    return [this.filters.type, this.filters.status, this.filters.module].filter(Boolean).length;
  }

  clearFilters(): void {
    this.filters = { type: '', status: '', module: '' };
  }

  policyIcon(p: PolicyRecord): LucideIconData {
    return POLICY_ICONS[p.icon] ?? Users;
  }

  typeTone(t: PolicyType): string {
    return t === 'Role' ? 'blue' : t === 'Team' ? 'purple' : 'pink';
  }

  get dirty(): boolean {
    return this.isNew || JSON.stringify(this.draft) !== this.snapshot;
  }

  lastUpdated(): string {
    if (!this.draft.updatedAt) return 'Not saved yet';
    const d = new Date(this.draft.updatedAt);
    return `Last updated ${d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }

  private load(p: PolicyRecord | undefined): void {
    this.draft = p ? structuredClone(p) : blankPolicy();
    this.snapshot = JSON.stringify(this.draft);
    this.selectedId = p?.id ?? '';
    this.isNew = false;
    this.submitted = false;
  }

  private startDraft(p: PolicyRecord): void {
    this.draft = p;
    this.snapshot = JSON.stringify(p);
    this.isNew = true;
    this.submitted = false;
    this.drawerOpen = true;
  }

  /** Runs the action now, or after the user agrees to drop unsaved edits */
  private guard(run: () => void): void {
    if (!this.dirty) {
      run();
      return;
    }
    this.confirm = {
      title: 'Discard unsaved changes?',
      message: `Your changes to ${this.draft.name || 'the new policy'} haven't been saved.`,
      action: 'Discard',
      run
    };
  }

  select(p: PolicyRecord): void {
    if (p.id === this.selectedId && !this.isNew) {
      this.drawerOpen = true;
      return;
    }
    this.guard(() => {
      this.load(p);
      this.drawerOpen = true;
    });
  }

  // ===== Toolbar actions =====
  createPolicy(): void {
    this.guard(() => {
      // New policies open with Data Scope / Landing Module unselected
      this.startDraft({ ...blankPolicy(), dataScope: '', landingModule: '' });
      this.tab = 'modules';
    });
  }

  clonePolicy(): void {
    this.menuOpen = false;
    const source = this.service.byId(this.selectedId);
    if (!source) {
      this.notify('Select a policy to clone.');
      return;
    }
    this.guard(() => {
      const copy = structuredClone(source);
      copy.id = '';
      copy.name = `${source.name} (Copy)`.slice(0, 60);
      copy.code = this.service.uniqueCode(`${source.code}-COPY`.slice(0, 17));
      copy.status = 'Active';
      copy.users = 0;
      copy.exceptions = [];
      copy.updatedAt = '';
      this.startDraft(copy);
      this.notify(`Cloned ${source.name}. Review and save the new policy.`);
    });
  }

  exportPolicies(): void {
    const rows = this.filtered;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `access-policies-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`Exported ${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}.`);
  }

  importPolicies(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let rows: Partial<PolicyRecord>[];
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        this.notify('Import failed: the file is not valid JSON.', 'error');
        return;
      }
      const valid = rows.filter((row) => row && typeof row.name === 'string' && typeof row.code === 'string');
      if (!valid.length) {
        this.notify('No policies found in the file (each needs a name and code).', 'error');
        return;
      }
      this.notify(`Importing ${valid.length} polic${valid.length === 1 ? 'y' : 'ies'}...`);
      // One POST at a time so each unique code sees the policies created before it
      from(valid)
        .pipe(
          concatMap((row) =>
            defer(() => {
              const base = blankPolicy();
              // Only take module grants that line up with the 13 Asset360 modules
              const grants = Array.isArray(row.grants) && row.grants.length === base.grants.length ? row.grants : base.grants;
              const policy = { ...base, ...row, grants, id: '', users: 0 } as PolicyRecord;
              policy.code = this.service.uniqueCode(policy.code.toUpperCase());
              return this.service.save(policy);
            }).pipe(catchError(() => of(null)))
          ),
          toArray()
        )
        .subscribe((saved) => {
          const added = saved.filter(Boolean).length;
          const failed = saved.length - added;
          this.notify(`Imported ${added} polic${added === 1 ? 'y' : 'ies'}.` + (failed ? ` ${failed} failed (check names and codes).` : ''), failed ? 'error' : 'success');
        });
    });
  }

  // ===== Save / cancel / delete =====
  savePolicy(): void {
    this.submitted = true;
    const errors = policyErrors(this.draft, this.service.codeTaken(this.draft.code, this.draft.id), this.service.nameTaken(this.draft.name, this.draft.id));
    const first = Object.values(errors)[0];
    if (first) {
      this.drawerOpen = true;
      this.notify(`Fix the highlighted fields: ${first}`, 'error');
      return;
    }
    if (this.saving) return;
    this.draft.name = this.draft.name.trim();
    this.draft.code = this.draft.code.trim();
    const wasNew = this.isNew;
    this.saving = true;
    this.notify(`${wasNew ? 'Creating' : 'Saving'} ${this.draft.name}...`);
    this.service.save(this.draft).subscribe({
      next: (stored) => {
        this.saving = false;
        this.load(stored);
        this.notify(`${stored.name} ${wasNew ? 'created' : 'saved'} successfully.`, 'success');
      },
      error: (err) => {
        this.saving = false;
        this.notify(`Couldn't ${wasNew ? 'create' : 'save'} ${this.draft.name}: ${adminApiError(err, 'access policy')}`, 'error');
      }
    });
  }

  /** Row action: open the policy in the details drawer for editing */
  editPolicy(p: PolicyRecord, e: Event): void {
    e.stopPropagation();
    this.select(p);
  }

  cancelEdit(): void {
    if (this.isNew) {
      this.load(this.service.byId(this.selectedId) ?? this.policies[0]);
      this.notify('New policy discarded.');
      return;
    }
    const wasDirty = this.dirty;
    this.load(this.service.byId(this.selectedId));
    if (wasDirty) this.notify('Changes discarded.');
  }

  /** Saved policies: PUT the stored copy with the new status, keeping any other unsaved edits in the draft. */
  toggleStatus(): void {
    this.menuOpen = false;
    const stored = this.service.byId(this.selectedId);
    const status: PolicyStatus = this.draft.status === 'Active' ? 'Inactive' : 'Active';
    if (this.isNew || !stored) {
      this.draft.status = status;
      this.notify(`${this.draft.name || 'The new policy'} set to ${status}. Save the policy to apply it.`);
      return;
    }
    const wasDirty = this.dirty;
    this.service.save({ ...structuredClone(stored), status }).subscribe({
      next: (saved) => {
        if (wasDirty) this.draft.status = saved.status;
        else this.load(saved);
        this.notify(`${saved.name} set to ${saved.status}.`, 'success');
      },
      error: (err) => this.notify(`Couldn't update ${stored.name}: ${adminApiError(err, 'access policy')}`, 'error')
    });
  }

  /** Deletes the given policy (row action) or the selected one (menu action) after confirmation */
  askDelete(policy?: PolicyRecord, e?: Event): void {
    e?.stopPropagation();
    this.menuOpen = false;
    const p = policy ?? (this.isNew ? undefined : this.service.byId(this.selectedId));
    if (!p) return;
    this.confirm = {
      title: `Delete ${p.name}?`,
      message: p.users
        ? `${p.users} user${p.users === 1 ? '' : 's'} lose the module access this policy grants. This can't be undone.`
        : "No users are covered by this policy. This can't be undone.",
      action: 'Delete Policy',
      run: () => {
        this.notify(`Deleting ${p.name}...`);
        this.service.remove(p.id).subscribe({
          next: () => {
            if (p.id === this.selectedId || !this.service.byId(this.selectedId)) this.load(this.policies[0]);
            this.notify(`${p.name} deleted successfully.`, 'success');
          },
          error: (err) => this.notify(`Couldn't delete ${p.name}: ${adminApiError(err, 'access policy')}`, 'error')
        });
      }
    };
  }

  confirmYes(): void {
    const run = this.confirm?.run;
    this.confirm = null;
    run?.();
  }

  toggleMenu(e: Event): void {
    e.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  allUsers(): string[] {
    // Policy members come from the users API once wired
    return [];
  }
}
