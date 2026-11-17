import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, Box, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { Observable } from 'rxjs';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { MODULE_CATEGORIES } from '../security.data';
import { ModuleRecord, SecurityStatus } from '../security.model';
import { ModuleService, PermissionService, RoleService, SecurityLoader } from '../security.service';
import { ModuleForm } from './module-form/module-form';

type SortKey = 'name' | 'code' | 'category';
interface Filters {
  search: string;
  category: string;
  status: '' | SecurityStatus;
}

/** Master Data Management > Security > Module Access Master */
@Component({
  selector: 'app-mdm-security-module-access-master',
  imports: [FormsModule, RouterLink, LucideAngularModule, ModuleForm],
  templateUrl: './module-access-master.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../security.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ModuleAccessMasterPage extends ListPage<ModuleRecord, Filters, SortKey> {
  readonly service = inject(ModuleService);
  private readonly permissions = inject(PermissionService);
  private readonly roles = inject(RoleService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly categories = MODULE_CATEGORIES;
  readonly icons = { Box, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };
  saving = false;

  constructor() {
    super({ search: '', category: '', status: '' });
    inject(SecurityLoader).load().subscribe({ error: (err) => this.notify(`Couldn't load modules: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: ModuleRecord): string {
    return r.code;
  }

  nameOf(r: ModuleRecord): string {
    return r.name;
  }

  protected all(): ModuleRecord[] {
    return this.service.all();
  }

  protected matches(r: ModuleRecord, f: Filters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.category || r.category === f.category) && (!f.status || r.status === f.status) && (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: ModuleRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Modules with permissions or granted to roles can't be deleted
  protected override deleteBlocker(r: ModuleRecord): string | null {
    const perms = this.permissions.ofModule(r.code).length;
    if (perms) return `${r.name} has ${perms} permission${perms === 1 ? '' : 's'}. Delete or move them first.`;
    const roles = this.roles.withModule(r.code).length;
    return roles ? `${roles} role${roles === 1 ? ' has' : 's have'} access to ${r.name}. Remove it from them first.` : null;
  }

  usage(r: ModuleRecord): { permissions: number; roles: number } {
    return { permissions: this.permissions.ofModule(r.code).length, roles: this.roles.withModule(r.code).length };
  }

  onSaved(event: { record: ModuleRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        if (event.originalCode) {
          this.permissions.recodeModule(event.originalCode, saved.code);
          this.roles.recode('modules', event.originalCode, saved.code);
        }
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

  toggleStatus(r: ModuleRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r.code, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.${status === 'Inactive' ? ' It is hidden from every role.' : ''}`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
