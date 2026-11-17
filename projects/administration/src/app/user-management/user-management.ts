import { Component, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, concatMap, finalize, from, tap } from 'rxjs';
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Ellipsis,
  LucideAngularModule,
  Mail,
  Plus,
  Search,
  Upload,
  Pencil,
  Trash2,
  User,
  UserCog,
  Users
} from 'lucide-angular';
import { ADMIN_DEPARTMENTS, ADMIN_LOCATIONS, AdminPage, CURRENT_USER, avatarTone, formatDate, initials } from '../shared/admin-common';
import { InviteDialog, InviteRequest } from './invite-dialog/invite-dialog';
import { UserDrawer } from './user-drawer/user-drawer';
import { downloadCsv, parseCsv } from './user-csv';
import { RoleAccessService, adminApiError } from '../role-access-control/role-access.service';
import { LAST_MONTH, LOCATION_TIME_ZONES, USER_ROLES, blankUser, roleModules, setUserRoles } from './user-management.data';
import { AdminUser, UserStatus } from './user-management.model';
import { UserAdminService, apiErrorMessage } from './user-management.service';
import { loginLabel, roleOf } from './user-format';

/** A status action waiting for confirmation in the dialog. */
interface PendingAction {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => void;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const EXPORT_HEADER = ['Name', 'Email', 'Employee ID', 'Department', 'Job Title', 'Primary Role', 'Secondary Roles', 'Location', 'Access Scope', 'MFA', 'Last Login', 'Status'];

/** Administration > User Management: accounts, roles, access scope and account status. */
@Component({
  standalone: true,
  selector: 'app-admin-user-management',
  imports: [FormsModule, RouterLink, LucideAngularModule, UserDrawer, InviteDialog],
  templateUrl: './user-management.html',
  styleUrls: ['../shared/admin-workspace.css', './user-management.css']
})
export class UserManagementPage extends AdminPage {
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  readonly service = inject(UserAdminService);
  private readonly roleService = inject(RoleAccessService);
  readonly icons = { ArrowDown, ArrowUp, Ban, ChevronLeft, ChevronRight, Clock, Download, Ellipsis, Mail, Pencil, Plus, Search, Trash2, Upload, User, UserCog, Users };
  readonly departments = ADMIN_DEPARTMENTS;
  readonly statuses: UserStatus[] = ['Active', 'Pending', 'Suspended'];
  readonly pageSizes = [10, 20, 50, 100];
  readonly initials = initials;

  search = '';
  department = '';
  status: '' | UserStatus = '';
  page = 0;
  pageSize = 10;
  checked = new Set<string>();
  menuFor: string | null = null;

  drawerUser: AdminUser | null = null;
  drawerMode: 'add' | 'edit' = 'edit';
  inviteOpen = false;
  pending: PendingAction | null = null;
  /** A create/update request from the drawer is in flight */
  saving = false;

  constructor() {
    super();
    // Primary / secondary role options come from the Role & Access Control API, fetched fresh on each visit
    this.roleService.load().subscribe({
      next: (roles) => setUserRoles(roles),
      error: (err) => this.notify(`Couldn't load roles: ${adminApiError(err, 'roles')}`, 'error')
    });
    // Load results from the Administration API show up as a toast
    let announced = false;
    effect(() => {
      const error = this.service.error();
      const loading = this.service.loading();
      if (error) this.notify(error, 'error');
      else if (!loading && !announced) {
        announced = true;
        const n = this.service.count();
        this.notify(n ? `Loaded ${n} user${n === 1 ? '' : 's'} from the server.` : 'No users yet. Add the first user.', 'success');
      }
    });
  }

  /* ===== Stats ===== */

  get total(): number {
    return this.service.count();
  }

  countOf(status: UserStatus): number {
    return this.service.count(status);
  }

  /** Change against last month's count, in whole percent. */
  trend(current: number, last: number): number {
    return last ? Math.round(((current - last) / last) * 100) : 0;
  }

  readonly lastMonth = LAST_MONTH;

  abs(n: number): number {
    return Math.abs(n);
  }

  /* ===== Table ===== */

  get rows(): AdminUser[] {
    const term = this.search.trim().toLowerCase();
    return this.service
      .all()
      .filter(
        (u) =>
          (!this.department || u.department === this.department) &&
          (!this.status || u.status === this.status) &&
          (!term || [u.name, u.email, u.employeeId].some((v) => v.toLowerCase().includes(term)))
      );
  }

  get pageRows(): AdminUser[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  /** Page buttons with -1 for a gap: 1 2 3 4 5 … 62. */
  get pageItems(): number[] {
    const n = this.pageCount;
    const p = this.page;
    const last = n - 1;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    if (p < 4) return [0, 1, 2, 3, 4, -1, last];
    if (p > last - 4) return [0, -1, last - 4, last - 3, last - 2, last - 1, last];
    return [0, -1, p - 1, p, p + 1, -1, last];
  }

  get showingFrom(): number {
    return this.rows.length ? this.page * this.pageSize + 1 : 0;
  }

  get showingTo(): number {
    return Math.min((this.page + 1) * this.pageSize, this.rows.length);
  }

  goTo(page: number): void {
    this.page = Math.min(Math.max(0, page), this.pageCount - 1);
  }

  onFilterChange(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.department = '';
    this.status = '';
    this.page = 0;
  }

  avatarBg(u: AdminUser): string {
    return avatarTone(u.name).bg;
  }

  avatarInk(u: AdminUser): string {
    return avatarTone(u.name).ink;
  }

  roleShort(u: AdminUser): string {
    return roleOf(u.primaryRole)?.short ?? u.primaryRole;
  }

  roleTone(u: AdminUser): string {
    return roleOf(u.primaryRole)?.tone ?? 'purple';
  }

  statusTone(u: AdminUser): string {
    return u.status === 'Active' ? 'green' : u.status === 'Pending' ? 'orange' : 'red';
  }

  /** Two lines for older dates ("24 Oct 2026" / "10:21"), one for today / yesterday. */
  loginDate(u: AdminUser): string {
    if (!u.lastLogin) return u.status === 'Pending' ? 'Invited' : 'Never';
    const label = loginLabel(u.lastLogin);
    return /^(Today|Yesterday)/.test(label) ? label : label.slice(0, label.lastIndexOf(' '));
  }

  loginTime(u: AdminUser): string {
    if (!u.lastLogin) return u.invitedAt ? formatDate(u.invitedAt) : '';
    const label = loginLabel(u.lastLogin);
    return /^(Today|Yesterday)/.test(label) ? '' : label.slice(label.lastIndexOf(' ') + 1);
  }

  isSelf(u: AdminUser): boolean {
    return u.id === this.service.currentUserId;
  }

  isOpen(u: AdminUser): boolean {
    return this.drawerMode === 'edit' && this.drawerUser?.id === u.id;
  }

  /* ===== Selection ===== */

  isChecked(u: AdminUser): boolean {
    return this.checked.has(u.id);
  }

  toggleCheck(u: AdminUser): void {
    if (this.checked.has(u.id)) this.checked.delete(u.id);
    else this.checked.add(u.id);
  }

  get allChecked(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((u) => this.checked.has(u.id));
  }

  toggleAll(): void {
    const all = this.allChecked;
    for (const u of this.pageRows) {
      if (all) this.checked.delete(u.id);
      else this.checked.add(u.id);
    }
  }

  clearChecked(): void {
    this.checked.clear();
  }

  private checkedUsers(): AdminUser[] {
    return this.service.all().filter((u) => this.checked.has(u.id));
  }

  /* ===== Row menu ===== */

  toggleMenu(u: AdminUser, event: Event): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === u.id ? null : u.id;
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuFor = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuFor = null;
    this.pending = null;
    this.inviteOpen = false;
  }

  /* ===== Drawer ===== */

  open(u: AdminUser): void {
    this.menuFor = null;
    this.drawerMode = 'edit';
    this.drawerUser = u;
  }

  addUser(): void {
    this.drawerMode = 'add';
    // New users open with Location / Time Zone / Access Scope unselected
    this.drawerUser = { ...blankUser(), employeeId: this.service.nextEmployeeId(), location: '', timeZone: '', accessScope: '' };
  }

  closeDrawer(): void {
    this.drawerUser = null;
  }

  onSaved(event: { user: AdminUser; isNew: boolean; password?: string }): void {
    if (this.saving) return;
    this.saving = true;
    if (event.isNew) {
      this.notify(`Adding ${event.user.name}...`);
      // The admin sets the password, so the account is active straight away
      this.service.create({ ...event.user, status: 'Active', lastLogin: null }, event.password ?? '').subscribe({
        next: (user) => {
          this.saving = false;
          this.notify(`${user.name} added successfully. They can sign in with ${user.email} and the password you set.`, 'success');
          this.drawerMode = 'edit';
          this.drawerUser = user;
        },
        error: (err) => {
          this.saving = false;
          this.notify(apiErrorMessage(err, `${event.user.name} could not be added.`), 'error');
        }
      });
      return;
    }
    const before = this.service.find(event.user.id);
    this.notify(`Saving ${event.user.name}...`);
    this.service.update(event.user, event.password).subscribe({
      next: (user) => {
        this.saving = false;
        this.drawerUser = user;
        const statusNote = before && before.status !== user.status ? ` Status is now ${user.status}.` : '';
        const passwordNote = event.password ? ' The new password is active.' : '';
        this.notify(`${user.name} updated successfully.${statusNote}${passwordNote}`, 'success');
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err, `${event.user.name} could not be updated.`), 'error');
      }
    });
  }

  /** Keeps the drawer showing the latest copy after a status change from the table. */
  private refreshDrawer(id: string): void {
    if (this.drawerMode === 'edit' && this.drawerUser?.id === id) this.drawerUser = this.service.find(id) ?? null;
  }

  /* ===== Status actions (all confirmed first) ===== */

  private ask(action: PendingAction): void {
    this.menuFor = null;
    this.pending = action;
  }

  cancelAction(): void {
    this.pending = null;
  }

  confirmAction(): void {
    const action = this.pending;
    this.pending = null;
    action?.run();
  }

  activate(u: AdminUser): void {
    this.ask({
      title: 'Activate user?',
      message: `${u.name} will be able to sign in again with their current roles and module access.`,
      confirmLabel: 'Activate',
      danger: false,
      run: () => this.setStatus([u], 'Active', '', () => `${u.name} is active again.`)
    });
  }

  suspend(u: AdminUser): void {
    const reason = this.service.lockoutReason(u);
    if (reason) {
      this.menuFor = null;
      this.notify(reason, 'error');
      return;
    }
    this.ask({
      title: 'Suspend user?',
      message: `${u.name} will be signed out and won't be able to sign in until the account is activated again.`,
      confirmLabel: 'Suspend',
      danger: true,
      run: () =>
        this.setStatus([u], 'Suspended', `Suspended by ${CURRENT_USER.name} on ${formatDate(new Date().toISOString())}.`, () => `${u.name} is suspended.`)
    });
  }

  // DEMO MODE: the invitation email is sent by the identity service once connected
  resendInvite(u: AdminUser): void {
    this.ask({
      title: 'Resend invitation?',
      message: `A new invitation link will be sent to ${u.email}. The previous link stops working.`,
      confirmLabel: 'Resend Invite',
      danger: false,
      run: () => {
        this.service.patchLocal({ ...u, invitedAt: new Date().toISOString() });
        this.refreshDrawer(u.id);
        this.notify(`Invitation sent again to ${u.email}.`);
      }
    });
  }

  // DEMO MODE: the reset link is sent by the identity service; admins never see or type passwords
  resetPassword(u: AdminUser): void {
    this.ask({
      title: 'Reset password?',
      message: `${u.name} will get an email at ${u.email} with a link to choose a new password. Current sessions are signed out.`,
      confirmLabel: 'Send Reset Link',
      danger: false,
      run: () => this.notify(`A password reset link was sent to ${u.email}.`)
    });
  }

  /** Row action: open the user in the details drawer for editing */
  editUser(u: AdminUser, e: Event): void {
    e.stopPropagation();
    this.menuFor = null;
    this.open(u);
  }

  remove(u: AdminUser, e?: Event): void {
    e?.stopPropagation();
    const reason = this.service.lockoutReason(u);
    if (reason) {
      this.menuFor = null;
      this.notify(reason, 'error');
      return;
    }
    this.ask({
      title: u.status === 'Pending' ? 'Cancel invitation and delete user?' : 'Delete user?',
      message: `${u.name} (${u.employeeId}) will be removed with their role assignments. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      run: () => this.doRemove([u])
    });
  }

  /** DELETE each account in turn; ones the server refuses stay in the list and are reported. */
  private doRemove(list: AdminUser[]): void {
    let removed = 0;
    const failed: string[] = [];
    this.notify(list.length === 1 ? `Deleting ${list[0].name}...` : `Deleting ${list.length} users...`);
    from(list)
      .pipe(
        concatMap((u) =>
          this.service.remove(u.id).pipe(
            tap(() => {
              removed++;
              this.checked.delete(u.id);
              if (this.drawerUser && this.drawerMode === 'edit' && this.drawerUser.id === u.id) this.drawerUser = null;
            }),
            catchError((err) => {
              failed.push(apiErrorMessage(err, `${u.name} could not be deleted.`));
              return EMPTY;
            })
          )
        ),
        finalize(() => {
          this.goTo(this.page);
          if (!failed.length) this.notify(list.length === 1 ? `${list[0].name} deleted successfully.` : `${list.length} users deleted successfully.`, 'success');
          else this.notify(`${removed} of ${list.length} deleted. ${failed[0]}`, 'error');
        })
      )
      .subscribe();
  }

  /** PUT each account with the new status in turn; ones the server refuses keep their old status and are reported. */
  private setStatus(list: AdminUser[], status: UserStatus, suspendReason: string, done: () => string): void {
    let changed = 0;
    const failed: string[] = [];
    this.notify(list.length === 1 ? `Updating ${list[0].name}...` : `Updating ${list.length} users...`);
    from(list)
      .pipe(
        concatMap((u) =>
          this.service.update({ ...u, status, suspendReason }).pipe(
            tap(() => {
              changed++;
              this.refreshDrawer(u.id);
            }),
            catchError((err) => {
              failed.push(apiErrorMessage(err, `${u.name} could not be updated.`));
              return EMPTY;
            })
          )
        ),
        finalize(() => (failed.length ? this.notify(`${changed} of ${list.length} updated. ${failed[0]}`, 'error') : this.notify(done(), 'success')))
      )
      .subscribe();
  }

  /* ===== Bulk actions ===== */

  /** The first selected account that can't be suspended or deleted, if any. */
  private bulkBlocker(list: AdminUser[]): string | null {
    const ids = list.map((u) => u.id);
    for (const u of list) {
      const reason = this.service.lockoutReason(u, ids);
      if (reason) return reason;
    }
    return null;
  }

  bulkActivate(): void {
    const list = this.checkedUsers().filter((u) => u.status === 'Suspended');
    if (!list.length) {
      this.notify('None of the selected users are suspended.', 'error');
      return;
    }
    this.ask({
      title: `Activate ${list.length} user${list.length === 1 ? '' : 's'}?`,
      message: 'Suspended accounts in the selection will be able to sign in again. Pending invitations are left as they are.',
      confirmLabel: 'Activate',
      danger: false,
      run: () => this.setStatus(list, 'Active', '', () => `${list.length} user${list.length === 1 ? '' : 's'} activated.`)
    });
  }

  bulkSuspend(): void {
    const list = this.checkedUsers().filter((u) => u.status === 'Active');
    const blocked = this.bulkBlocker(list);
    if (!list.length || blocked) {
      this.notify(blocked ?? 'None of the selected users are active.', 'error');
      return;
    }
    this.ask({
      title: `Suspend ${list.length} user${list.length === 1 ? '' : 's'}?`,
      message: 'Active accounts in the selection will be signed out and blocked from signing in.',
      confirmLabel: 'Suspend',
      danger: true,
      run: () => {
        const reason = `Suspended by ${CURRENT_USER.name} on ${formatDate(new Date().toISOString())}.`;
        this.setStatus(list, 'Suspended', reason, () => `${list.length} user${list.length === 1 ? '' : 's'} suspended.`);
      }
    });
  }

  bulkDelete(): void {
    const list = this.checkedUsers();
    const blocked = this.bulkBlocker(list);
    if (blocked) {
      this.notify(blocked, 'error');
      return;
    }
    this.ask({
      title: `Delete ${list.length} user${list.length === 1 ? '' : 's'}?`,
      message: "The selected accounts will be removed with their role assignments. This can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
      run: () => this.doRemove(list)
    });
  }

  /* ===== Invite / Import / Export ===== */

  openInvite(): void {
    this.inviteOpen = true;
  }

  closeInvite(): void {
    this.inviteOpen = false;
  }

  onInvited(req: InviteRequest): void {
    this.inviteOpen = false;
    this.page = 0;
    const invites = req.emails.map((email) => this.inviteUser(email, '', req.department, req.primaryRole, req.location));
    this.createAll(invites, (added, failed) =>
      failed.length
        ? `${added} invitation${added === 1 ? '' : 's'} sent; ${failed.length} failed: ${failed[0]}`
        : `${added} invitation${added === 1 ? '' : 's'} sent.`
    );
  }

  /** New pending account; the name defaults to the part of the email before the @. */
  private inviteUser(email: string, name: string, department: string, primaryRole: string, location: string, employeeId = ''): AdminUser {
    const guessed = email
      .split('@')[0]
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(' ');
    return {
      ...blankUser(),
      name: name || guessed,
      email: email.toLowerCase(),
      employeeId,
      department,
      jobTitle: primaryRole,
      location,
      timeZone: LOCATION_TIME_ZONES[location] ?? blankUser().timeZone,
      primaryRole,
      modules: roleModules([primaryRole])
    };
  }

  /**
   * POST each new account in turn (DEMO MODE: invitation emails are sent by the identity service once connected).
   * Rows without an employee ID get the next free number as they are created.
   */
  private createAll(users: AdminUser[], message: (added: number, failed: string[]) => string): void {
    let added = 0;
    const failed: string[] = [];
    this.notify(`Adding ${users.length} user${users.length === 1 ? '' : 's'}...`);
    from(users)
      .pipe(
        concatMap((u) =>
          this.service.create({ ...u, employeeId: u.employeeId || this.service.nextEmployeeId() }).pipe(
            tap(() => added++),
            catchError((err) => {
              failed.push(apiErrorMessage(err, `${u.email} could not be added.`));
              return EMPTY;
            })
          )
        ),
        finalize(() => this.notify(message(added, failed), failed.length ? 'error' : 'success'))
      )
      .subscribe();
  }

  export(): void {
    const rows = this.rows;
    downloadCsv(
      'users.csv',
      EXPORT_HEADER,
      rows.map((u) => [
        u.name, u.email, u.employeeId, u.department, u.jobTitle, u.primaryRole, u.secondaryRoles.join('; '), u.location, u.accessScope,
        u.mfa ? 'On' : 'Off', u.lastLogin ? loginLabel(u.lastLogin, true) : '', u.status
      ])
    );
    this.notify(`Exported ${rows.length} users.`, 'success');
  }

  pickImport(): void {
    this.importInput?.nativeElement.click();
  }

  /** Reads Name, Email, Employee ID, Department, Primary Role, Location; each valid row becomes a pending invitation. */
  onImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) {
      this.notify('Choose a CSV file under 1 MB (use Export for the layout).');
      return;
    }
    file.text().then((text) => this.importRows(parseCsv(text)));
  }

  private importRows([header, ...lines]: string[][]): void {
    const col = (name: string) => (header ?? []).findIndex((h) => h.toLowerCase() === name.toLowerCase());
    const [name, email, emp, dept, role, loc] = ['Name', 'Email', 'Employee ID', 'Department', 'Primary Role', 'Location'].map(col);
    if (email < 0 || dept < 0 || role < 0) {
      this.notify('The file needs Email, Department and Primary Role columns.');
      return;
    }
    const users: AdminUser[] = [];
    const inFile = (pick: (u: AdminUser) => string, value: string) => users.some((u) => pick(u).toUpperCase() === value.toUpperCase());
    let skipped = 0;
    for (const cells of lines) {
      const get = (i: number) => (i >= 0 ? cells[i] ?? '' : '');
      const e = get(email).toLowerCase();
      const empId = get(emp).toUpperCase();
      const roleOk = USER_ROLES.some((r) => r.name === get(role) && !r.secondaryOnly);
      const location = ADMIN_LOCATIONS.includes(get(loc)) ? get(loc) : ADMIN_LOCATIONS[0] ?? '';
      if (
        !EMAIL.test(e) || this.service.emailTaken(e, null) || inFile((u) => u.email, e) || !ADMIN_DEPARTMENTS.includes(get(dept)) || !roleOk ||
        (empId && (!/^EMP-\d{4,}$/.test(empId) || this.service.employeeIdTaken(empId, null) || inFile((u) => u.employeeId, empId)))
      ) {
        skipped++;
        continue;
      }
      users.push(this.inviteUser(e, get(name), get(dept), get(role), location, empId));
    }
    this.page = 0;
    this.createAll(users, (added, failed) => {
      const total = skipped + failed.length;
      return `Imported ${added} user${added === 1 ? '' : 's'} as pending invitations${total ? `, skipped ${total} (invalid or duplicate)` : ''}.`;
    });
  }
}
