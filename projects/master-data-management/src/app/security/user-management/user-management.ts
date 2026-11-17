import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, UserRound } from 'lucide-angular';
import { Observable } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { avatarColor, initials } from '../../people/people.data';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { blankUser } from '../security.data';
import { SecurityStatus, UserRecord } from '../security.model';
import { RoleService, SecurityLoader, UserService } from '../security.service';
import { UserForm } from './user-form/user-form';

type SortKey = 'name' | 'username' | 'department';
interface Filters {
  search: string;
  role: string;
  status: '' | SecurityStatus;
}

/** Master Data Management > Security > User Management */
@Component({
  selector: 'app-mdm-security-user-management',
  imports: [FormsModule, RouterLink, LucideAngularModule, UserForm],
  templateUrl: './user-management.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../security.css', '../../shared/styles/mdm-purple-theme.css']
})
export class UserManagementPage extends ListPage<UserRecord, Filters, SortKey> {
  readonly service = inject(UserService);
  readonly roles = inject(RoleService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly initials = initials;
  readonly avatarColor = avatarColor;
  readonly icons = { UserRound, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', role: '', status: '' });
    inject(SecurityLoader).load().subscribe({ error: (err) => this.notify(`Couldn't load users: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: UserRecord): string {
    return r.code;
  }

  nameOf(r: UserRecord): string {
    return r.name;
  }

  protected all(): UserRecord[] {
    return this.service.all();
  }

  protected matches(r: UserRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.role || r.primaryRole === f.role || r.additionalRoles.includes(f.role)) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.username, r.email, r.department].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: UserRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  protected override deleteBlocker(r: UserRecord): string | null {
    return this.lockoutReason(r);
  }

  /** You can't remove yourself or the last active System Administrator. */
  private lockoutReason(r: UserRecord): string | null {
    if (r.code === this.service.currentUser) return 'You can’t remove or deactivate your own account.';
    const adminRole = this.roles.all().find((x) => x.name === 'System Administrator')?.code;
    if (adminRole && (r.primaryRole === adminRole || r.additionalRoles.includes(adminRole))) {
      const otherAdmins = this.service.withRole(adminRole).filter((u) => u.status === 'Active' && u.code !== r.code);
      if (!otherAdmins.length) return `${r.name} is the last active System Administrator.`;
    }
    return null;
  }

  roleName(code: string): string {
    return this.roles.nameOf(code);
  }

  extraRoleNames(r: UserRecord): string {
    return r.additionalRoles.map((c) => this.roleName(c)).join(', ');
  }

  isCurrentUser(r: UserRecord): boolean {
    return r.code === this.service.currentUser;
  }

  addNew(): void {
    this.openAdd({ ...blankUser(), code: this.service.nextCode() });
  }

  onSaved(event: { record: UserRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    const invite = !event.originalCode && event.record.sendInvite;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        this.carrySelection(event.originalCode, saved.code);
        this.notify(event.originalCode ? `${saved.name} updated.` : `${saved.name} added.${invite ? ` An invitation will be sent to ${saved.email}.` : ''}`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: UserRecord): void {
    this.menuFor = null;
    if (r.status === 'Active') {
      const reason = this.lockoutReason(r);
      if (reason) {
        this.notify(reason);
        return;
      }
    }
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} ${status === 'Active' ? 'can sign in again' : 'can no longer sign in'}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }

  // Flags the account so the user must pick a new password; the reset email itself is sent by the identity service
  resetPassword(r: UserRecord): void {
    this.menuFor = null;
    this.service.persist({ ...r, mustChangePassword: true }, r.code).subscribe({
      next: () => this.notify(`A password reset link will be sent to ${r.email}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
