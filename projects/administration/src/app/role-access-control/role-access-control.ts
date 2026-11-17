import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, concatMap, defer, from, of, toArray } from 'rxjs';
import {
  ArrowUp, Briefcase, ChartColumn, ChevronRight, CircleCheck, Coins, Copy, Crown, Download, Ellipsis, Eye, FileText, Funnel, Hammer, Headset, Info,
  Lock, LucideAngularModule, LucideIconData, Package, Pencil, Plus, Search, Server, Settings, Shield, ShieldCheck, ShoppingCart, Trash2, Truck, Upload,
  UserCheck, Users, Warehouse, Wrench, X
} from 'lucide-angular';
import { AdminPage } from '../shared/admin-common';
import { PermissionMatrix } from './permission-matrix/permission-matrix';
import { RoleApprovals, approvalsError } from './role-approvals/role-approvals';
import { DATA_SCOPES, RoleIcon, RoleRecord, RoleStatus, RoleType, USERS_LAST_MONTH, blankRole } from './role-access.data';
import { RoleAccessService, adminApiError } from './role-access.service';
import { RoleDrawer, roleErrors } from './role-drawer/role-drawer';
import { RoleScope } from './role-scope/role-scope';
import { UsersDialog } from './users-dialog/users-dialog';

type Tab = 'modules' | 'scope' | 'approvals';

interface Filters {
  type: '' | RoleType;
  status: '' | RoleStatus;
  scope: string;
}

interface Confirm {
  title: string;
  message: string;
  action: string;
  run: () => void;
}

const ROLE_ICONS: Record<RoleIcon, LucideIconData> = {
  crown: Crown, settings: Settings, wrench: Wrench, box: Package, shield: Shield, chart: ChartColumn, briefcase: Briefcase, coins: Coins,
  search: Search, server: Server, lock: Lock, headset: Headset, hammer: Hammer, warehouse: Warehouse, cart: ShoppingCart, truck: Truck,
  file: FileText, eye: Eye
};

/** Administration > Role & Access Control: roles list, permission matrix (modules / data scope / approvals) and role details drawer. */
@Component({
  standalone: true,
  selector: 'app-admin-role-access-control',
  imports: [FormsModule, RouterLink, LucideAngularModule, PermissionMatrix, RoleScope, RoleApprovals, RoleDrawer, UsersDialog],
  templateUrl: './role-access-control.html',
  styleUrls: ['../shared/admin-workspace.css', './role-access-control.css']
})
export class RoleAccessControlPage extends AdminPage {
  private readonly service = inject(RoleAccessService);

  readonly icons = { ShieldCheck, Users, CircleCheck, FileText, UserCheck, Plus, Copy, Upload, Download, Search, Funnel, ChevronRight, ArrowUp, Info, Ellipsis, Trash2, Pencil, X };
  readonly scopes = DATA_SCOPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'modules', label: 'Modules' },
    { id: 'scope', label: 'Data Scope' },
    { id: 'approvals', label: 'Approvals' }
  ];

  search = '';
  filters: Filters = { type: '', status: '', scope: '' };
  showFilters = false;
  tab: Tab = 'modules';

  selectedId = '';
  draft: RoleRecord = blankRole();
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
      next: (roles) => {
        this.load(roles.find((r) => r.code === 'OPS_MANAGER') ?? roles[0]);
        this.notify(roles.length ? `Loaded ${roles.length} role${roles.length === 1 ? '' : 's'} from the server.` : 'No roles yet. Create the first role.', 'success');
      },
      error: (err) => this.notify(`Couldn't load roles: ${adminApiError(err, 'roles')}`, 'error')
    });
  }

  get loading(): boolean {
    return this.service.loading();
  }

  // ===== Stats =====
  get roles(): RoleRecord[] {
    return this.service.all();
  }

  get activeCount(): number {
    return this.roles.filter((r) => r.status === 'Active').length;
  }

  get customCount(): number {
    return this.roles.filter((r) => r.type === 'Custom').length;
  }

  get usersAssigned(): number {
    return this.roles.reduce((sum, r) => sum + r.users, 0);
  }

  get newThisMonth(): number {
    const month = new Date().toISOString().slice(0, 7);
    return this.roles.filter((r) => r.createdOn.startsWith(month)).length;
  }

  pct(n: number): number {
    return this.roles.length ? Math.round((n / this.roles.length) * 100) : 0;
  }

  get usersTrend(): number {
    return USERS_LAST_MONTH ? Math.round(((this.usersAssigned - USERS_LAST_MONTH) / USERS_LAST_MONTH) * 100) : 0;
  }

  // ===== List =====
  get filtered(): RoleRecord[] {
    const t = this.search.trim().toLowerCase();
    const f = this.filters;
    return this.roles.filter(
      (r) =>
        (!f.type || r.type === f.type) &&
        (!f.status || r.status === f.status) &&
        (!f.scope || r.dataScope === f.scope) &&
        (!t || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(t)))
    );
  }

  get filterCount(): number {
    return [this.filters.type, this.filters.status, this.filters.scope].filter(Boolean).length;
  }

  clearFilters(): void {
    this.filters = { type: '', status: '', scope: '' };
  }

  roleIcon(r: RoleRecord): LucideIconData {
    return ROLE_ICONS[r.icon] ?? Settings;
  }

  get dirty(): boolean {
    return this.isNew || JSON.stringify(this.draft) !== this.snapshot;
  }

  /** Existing system roles keep their name, code and type */
  get system(): boolean {
    return this.draft.type === 'System' && !this.isNew;
  }

  private load(r: RoleRecord | undefined): void {
    this.draft = r ? structuredClone(r) : blankRole();
    this.snapshot = JSON.stringify(this.draft);
    this.selectedId = r?.id ?? '';
    this.isNew = false;
    this.submitted = false;
  }

  /** Opens an unsaved draft (new role or copy) in the matrix and drawer */
  private startDraft(r: RoleRecord): void {
    this.draft = r;
    this.snapshot = JSON.stringify(r);
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
      message: `Your changes to ${this.draft.name || 'the new role'} haven't been saved.`,
      action: 'Discard',
      run
    };
  }

  select(r: RoleRecord): void {
    if (r.id === this.selectedId && !this.isNew) {
      this.drawerOpen = true;
      return;
    }
    this.guard(() => {
      this.load(r);
      this.drawerOpen = true;
    });
  }

  // ===== Toolbar actions =====
  createRole(): void {
    this.guard(() => {
      // New roles open with Data Scope / Session Timeout unselected
      this.startDraft({ ...blankRole(), dataScope: '' as RoleRecord['dataScope'], sessionTimeout: '' });
      this.tab = 'modules';
    });
  }

  duplicateRole(): void {
    this.menuOpen = false;
    const source = this.service.byId(this.selectedId);
    if (!source) {
      this.notify('Select a role to duplicate.');
      return;
    }
    this.guard(() => {
      const copy = structuredClone(source);
      copy.id = '';
      copy.name = `${source.name} (Copy)`.slice(0, 60);
      copy.code = this.service.uniqueCode(`${source.code}_COPY`.slice(0, 25));
      copy.type = 'Custom';
      copy.status = 'Active';
      copy.users = 0;
      copy.template = source.template || source.name;
      this.startDraft(copy);
      this.notify(`Copied ${source.name}. Review and save the new role.`);
    });
  }

  exportRoles(): void {
    const rows = this.filtered;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify(`Exported ${rows.length} role${rows.length === 1 ? '' : 's'}.`);
  }

  importRoles(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let rows: Partial<RoleRecord>[];
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        this.notify('Import failed: the file is not valid JSON.', 'error');
        return;
      }
      const valid = rows.filter((row) => row && typeof row.name === 'string' && typeof row.code === 'string');
      if (!valid.length) {
        this.notify('No roles found in the file (each needs a name and code).', 'error');
        return;
      }
      this.notify(`Importing ${valid.length} role${valid.length === 1 ? '' : 's'}...`);
      // One POST at a time so each unique code sees the roles created before it
      from(valid)
        .pipe(
          concatMap((row) =>
            defer(() => {
              // Imported roles are always custom and start unassigned
              const role = { ...blankRole(), ...row, id: '', type: 'Custom', users: 0 } as RoleRecord;
              role.code = this.service.uniqueCode(role.code.toUpperCase());
              return this.service.save(role);
            }).pipe(catchError(() => of(null)))
          ),
          toArray()
        )
        .subscribe((saved) => {
          const added = saved.filter(Boolean).length;
          const failed = saved.length - added;
          this.notify(
            `Imported ${added} role${added === 1 ? '' : 's'} as custom roles.` + (failed ? ` ${failed} failed (check names and codes).` : ''),
            failed ? 'error' : 'success'
          );
        });
    });
  }

  // ===== Save / cancel / delete =====
  saveRole(): void {
    this.submitted = true;
    const errors = roleErrors(this.draft, this.service.codeTaken(this.draft.code, this.draft.id));
    const first = Object.values(errors)[0];
    if (first) {
      this.drawerOpen = true;
      this.notify(`Fix the highlighted fields: ${first}`, 'error');
      return;
    }
    const approval = approvalsError(this.draft);
    if (approval) {
      this.tab = 'approvals';
      this.notify(approval, 'error');
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
        this.notify(`Couldn't ${wasNew ? 'create' : 'save'} ${this.draft.name}: ${adminApiError(err, 'roles')}`, 'error');
      }
    });
  }

  /** Row action: open the role in the details drawer for editing */
  editRole(r: RoleRecord, e: Event): void {
    e.stopPropagation();
    this.select(r);
  }

  cancelEdit(): void {
    if (this.isNew) {
      this.load(this.service.byId(this.selectedId) ?? this.roles[0]);
      this.notify('New role discarded.');
      return;
    }
    const wasDirty = this.dirty;
    this.load(this.service.byId(this.selectedId));
    if (wasDirty) this.notify('Changes discarded.');
  }

  /** Deletes the given role (row action) or the selected one (menu action) after confirmation */
  askDelete(role?: RoleRecord, e?: Event): void {
    e?.stopPropagation();
    this.menuOpen = false;
    const r = role ?? (this.isNew ? undefined : this.service.byId(this.selectedId));
    if (!r) return;
    if (r.type === 'System') {
      this.notify(`${r.name} is a system role and can't be deleted.`, 'error');
      return;
    }
    this.confirm = {
      title: `Delete ${r.name}?`,
      message: r.users
        ? `${r.users} user${r.users === 1 ? '' : 's'} will lose this role's access. This can't be undone.`
        : "This role isn't assigned to anyone. This can't be undone.",
      action: 'Delete Role',
      run: () => {
        this.notify(`Deleting ${r.name}...`);
        this.service.remove(r.id).subscribe({
          next: () => {
            if (r.id === this.selectedId || !this.service.byId(this.selectedId)) this.load(this.roles[0]);
            this.notify(`${r.name} deleted successfully.`, 'success');
          },
          error: (err) => this.notify(`Couldn't delete ${r.name}: ${adminApiError(err, 'roles')}`, 'error')
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
    // Role members come from the users API once wired
    return [];
  }
}
