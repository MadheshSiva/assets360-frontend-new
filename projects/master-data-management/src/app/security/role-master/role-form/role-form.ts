import { Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChevronDown, ChevronRight, LucideAngularModule, Search, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { ROLE_TYPES, blankRole } from '../../security.data';
import { ModuleRecord, PermissionRecord, RoleRecord } from '../../security.model';
import { ModuleService, PermissionService, RoleService } from '../../security.service';

type Tab = 'permissions' | 'modules';

interface PermissionGroup {
  module: ModuleRecord;
  permissions: PermissionRecord[];
}

/**
 * Right-hand "Add / Edit Role" panel. Role details sit on top; permissions (grouped by module)
 * and module access are picked below. Granting a permission also opens its module.
 */
@Component({
  selector: 'app-role-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './role-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', './role-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class RoleForm extends MasterForm<RoleRecord, Tab> implements OnChanges {
  // Users holding the role being edited
  @Input() userCount = 0;

  protected readonly store = inject(RoleService);
  readonly modules = inject(ModuleService);
  readonly permissions = inject(PermissionService);
  readonly icons = { X, Search, ChevronDown, ChevronRight };
  readonly types = ROLE_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'permissions', label: 'Permissions' },
    { id: 'modules', label: 'Module Access' }
  ];

  copyFrom = '';
  search = '';
  expanded = new Set<string>();

  override ngOnChanges(): void {
    super.ngOnChanges();
    this.copyFrom = '';
    this.search = '';
    // Open the groups that already have permissions
    this.expanded = new Set(this.groups.filter((g) => g.permissions.some((p) => this.hasPermission(p.code))).slice(0, 2).map((g) => g.module.code));
  }

  protected blank(): RoleRecord {
    return blankRole();
  }

  get otherRoles(): RoleRecord[] {
    return this.store.all().filter((r) => r.code !== this.original?.code);
  }

  /** Active permissions (plus those already granted) by module, filtered by the search. */
  get groups(): PermissionGroup[] {
    const term = this.search.trim().toLowerCase();
    return this.modules
      .all()
      .map((module) => ({
        module,
        permissions: this.permissions
          .ofModule(module.code)
          .filter((p) => (p.status === 'Active' || this.hasPermission(p.code)) && (!term || `${p.name} ${p.code} ${module.name}`.toLowerCase().includes(term)))
      }))
      .filter((g) => g.permissions.length);
  }

  hasPermission(code: string): boolean {
    return this.form.permissions.includes(code);
  }

  groupState(g: PermissionGroup): 'all' | 'some' | 'none' {
    const count = g.permissions.filter((p) => this.hasPermission(p.code)).length;
    return count === 0 ? 'none' : count === g.permissions.length ? 'all' : 'some';
  }

  toggleExpanded(code: string): void {
    if (this.expanded.has(code)) {
      this.expanded.delete(code);
    } else {
      this.expanded.add(code);
    }
  }

  togglePermission(p: PermissionRecord): void {
    this.form.permissions = this.hasPermission(p.code) ? this.form.permissions.filter((c) => c !== p.code) : [...this.form.permissions, p.code];
    this.grantModule(p.module);
  }

  toggleGroup(g: PermissionGroup): void {
    const codes = g.permissions.map((p) => p.code);
    const all = this.groupState(g) === 'all';
    this.form.permissions = all ? this.form.permissions.filter((c) => !codes.includes(c)) : [...new Set([...this.form.permissions, ...codes])];
    this.grantModule(g.module.code);
  }

  private grantModule(code: string): void {
    if (!this.form.modules.includes(code)) this.form.modules = [...this.form.modules, code];
  }

  hasModule(code: string): boolean {
    return this.form.modules.includes(code);
  }

  // Taking a module away also takes away its permissions
  toggleModule(m: ModuleRecord): void {
    if (this.hasModule(m.code)) {
      const codes = this.permissions.ofModule(m.code).map((p) => p.code);
      this.form.modules = this.form.modules.filter((c) => c !== m.code);
      this.form.permissions = this.form.permissions.filter((c) => !codes.includes(c));
    } else {
      this.form.modules = [...this.form.modules, m.code];
    }
  }

  permissionCount(m: ModuleRecord): number {
    return this.permissions.ofModule(m.code).filter((p) => this.hasPermission(p.code)).length;
  }

  onCopyFrom(): void {
    const source = this.store.find(this.copyFrom);
    if (!source) return;
    this.form.permissions = [...source.permissions];
    this.form.modules = [...source.modules];
  }

  protected validate(f: RoleRecord) {
    const errors: Record<string, string> = {};
    if (!f.type) errors['type'] = 'Select a role type.';
    if (!f.modules.length) errors['access'] = 'Give the role access to at least one module.';
    if (!f.status) errors['status'] = 'Select a status.';
    else if (this.original?.type === 'System' && f.status !== 'Active') errors['status'] = 'System roles stay active.';
    if (f.type === 'Read Only') {
      const writes = f.permissions.filter((c) => this.permissions.find(c)?.type !== 'Read');
      if (writes.length) errors['access'] = `A read-only role can only hold Read permissions; ${writes.length} others are ticked.`;
    }
    return { errors, tab: 'permissions' as Tab };
  }

  protected override tidy(f: RoleRecord): RoleRecord {
    return { ...f, description: f.description.trim() };
  }
}
