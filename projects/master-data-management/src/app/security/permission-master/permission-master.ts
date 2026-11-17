import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, KeyRound, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable, of, switchMap } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { PERMISSION_TYPES } from '../security.data';
import { PermissionRecord, PermissionType } from '../security.model';
import { ModuleService, PermissionService, RoleService, SecurityLoader } from '../security.service';
import { PermissionForm } from './permission-form/permission-form';

type SortKey = 'name' | 'code' | 'module' | 'type';
interface Filters {
  search: string;
  module: string;
  type: '' | PermissionType;
}

/** Master Data Management > Security > Permission Master */
@Component({
  selector: 'app-mdm-security-permission-master',
  imports: [FormsModule, RouterLink, LucideAngularModule, PermissionForm],
  templateUrl: './permission-master.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../security.css', '../../shared/styles/mdm-purple-theme.css']
})
export class PermissionMasterPage extends ListPage<PermissionRecord, Filters, SortKey> {
  readonly service = inject(PermissionService);
  readonly modules = inject(ModuleService);
  private readonly roles = inject(RoleService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly types = PERMISSION_TYPES;
  readonly icons = { KeyRound, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', module: '', type: '' });
    inject(SecurityLoader).load().subscribe({ error: (err) => this.notify(`Couldn't load permissions: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: PermissionRecord): string {
    return r.code;
  }

  nameOf(r: PermissionRecord): string {
    return r.name;
  }

  protected all(): PermissionRecord[] {
    return this.service.all();
  }

  protected matches(r: PermissionRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.module || r.module === f.module) &&
      (!f.type || r.type === f.type) &&
      (!term || [r.name, r.code, r.description, this.moduleName(r)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: PermissionRecord, key: SortKey): string {
    return key === 'module' ? this.moduleName(r) : r[key];
  }

  moduleName(r: PermissionRecord): string {
    return this.modules.nameOf(r.module);
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Permissions granted to roles can't be deleted
  protected override deleteBlocker(r: PermissionRecord): string | null {
    const roles = this.roles.withPermission(r.code).length;
    return roles ? `${roles} role${roles === 1 ? ' grants' : 's grant'} ${r.name}. Remove it from them first.` : null;
  }

  roleCount(r: PermissionRecord): number {
    return this.roles.withPermission(r.code).length;
  }

  duplicate(r: PermissionRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: PermissionRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    let name = event.record.name;
    this.service
      .persist(event.record, event.originalCode)
      .pipe(
        switchMap((saved) => {
          name = saved.name;
          if (event.originalCode) this.roles.recode('permissions', event.originalCode, saved.code);
          this.carrySelection(event.originalCode, saved.code);
          this.closeForm();
          // Roles granting the permission also need its module
          const missing = this.roles.withPermission(saved.code).filter((role) => saved.module && !role.modules.includes(saved.module));
          return missing.length ? this.roles.persistAll(missing.map((role) => ({ ...role, modules: [...role.modules, saved.module] }))) : of([]);
        })
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notify(`${name} ${event.originalCode ? 'updated' : 'added'}.`);
        },
        error: (err) => {
          this.saving = false;
          this.notify(apiErrorMessage(err));
        }
      });
  }

  toggleStatus(r: PermissionRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.${status === 'Inactive' ? ' Roles keep it but it no longer applies.' : ''}`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
