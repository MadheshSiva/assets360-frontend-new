import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Users } from 'lucide-angular';
import { Observable } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { ROLE_TYPES } from '../security.data';
import { RoleRecord, RoleType, SecurityStatus } from '../security.model';
import { RoleService, SecurityLoader, UserService } from '../security.service';
import { RoleForm } from './role-form/role-form';

type SortKey = 'name' | 'code' | 'type' | 'users';
interface Filters {
  search: string;
  type: '' | RoleType;
  status: '' | SecurityStatus;
}

/** Master Data Management > Security > Role Master */
@Component({
  selector: 'app-mdm-security-role-master',
  imports: [FormsModule, RouterLink, LucideAngularModule, RoleForm],
  templateUrl: './role-master.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../security.css', '../../shared/styles/mdm-purple-theme.css']
})
export class RoleMasterPage extends ListPage<RoleRecord, Filters, SortKey> {
  readonly service = inject(RoleService);
  private readonly users = inject(UserService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly types = ROLE_TYPES;
  readonly icons = { Users, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', type: '', status: '' });
    inject(SecurityLoader).load().subscribe({ error: (err) => this.notify(`Couldn't load roles: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: RoleRecord): string {
    return r.code;
  }

  nameOf(r: RoleRecord): string {
    return r.name;
  }

  protected all(): RoleRecord[] {
    return this.service.all();
  }

  protected matches(r: RoleRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.type || r.type === f.type) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: RoleRecord, key: SortKey): string | number {
    return key === 'users' ? this.userCount(r) : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // System roles stay, and roles held by users can't be deleted
  protected override deleteBlocker(r: RoleRecord): string | null {
    if (r.type === 'System') return `${r.name} is a system role and can't be deleted.`;
    const users = this.userCount(r);
    return users ? `${users} user${users === 1 ? ' holds' : 's hold'} ${r.name}. Change their roles first.` : null;
  }

  userCount(r: RoleRecord): number {
    return this.users.withRole(r.code).length;
  }

  duplicate(r: RoleRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, type: r.type === 'System' ? 'Business' : r.type, status: 'Active' });
  }

  onSaved(event: { record: RoleRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        if (event.originalCode) this.users.recodeRole(event.originalCode, saved.code);
        this.carrySelection(event.originalCode, saved.code);
        this.notify(`${saved.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: RoleRecord): void {
    this.menuFor = null;
    if (r.type === 'System' && r.status === 'Active') {
      this.notify(`${r.name} is a system role and stays active.`);
      return;
    }
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => {
        const users = this.userCount(r);
        this.notify(`${r.name} marked ${status}.${status === 'Inactive' && users ? ` ${users} users lose its access.` : ''}`);
      },
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
