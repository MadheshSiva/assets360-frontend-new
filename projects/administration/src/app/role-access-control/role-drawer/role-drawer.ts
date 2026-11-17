import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Info, Lock, LucideAngularModule, X } from 'lucide-angular';
import { avatarTone, initials } from '../../shared/admin-common';
import { ChipSelect } from '../chip-select/chip-select';
import scopeOptions from '../role-scope-options.json';
import { DATA_SCOPES, DataScope, ROLE_TYPES, RoleRecord, SESSION_TIMEOUTS } from '../role-access.data';
import { RoleAccessService } from '../role-access.service';

export type RoleErrors = Partial<Record<'name' | 'code' | 'dataScope' | 'sessionTimeout' | 'locations' | 'departments' | 'approvalLimit', string>>;

/** Validation shared by the drawer (inline messages) and the page (blocks Save). */
export function roleErrors(r: RoleRecord, codeTaken: boolean): RoleErrors {
  const e: RoleErrors = {};
  if (!r.name.trim()) e.name = 'Role name is required.';
  else if (r.name.trim().length < 3) e.name = 'Use at least 3 characters.';
  if (!r.code.trim()) e.code = 'Role code is required.';
  else if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(r.code.trim())) e.code = 'Use A–Z, 0–9 and _ (2–30 characters).';
  else if (codeTaken) e.code = 'Another role already uses this code.';
  if (!r.dataScope) e.dataScope = 'Data scope is required.';
  if (!r.sessionTimeout) e.sessionTimeout = 'Session timeout is required.';
  if (r.dataScope === 'Assigned Locations' && !r.locations.length) e.locations = 'Pick at least one location.';
  if (r.dataScope === 'Own Department' && !r.departments.length) e.departments = 'Pick at least one department.';
  if (!(r.approvalLimit >= 0)) e.approvalLimit = 'Enter 0 or a positive amount.';
  return e;
}

/** Right-hand "Role Details" drawer. Edits go straight into the page's draft; Save / Cancel are the page's. */
@Component({
  selector: 'app-role-drawer',
  imports: [FormsModule, LucideAngularModule, ChipSelect],
  templateUrl: './role-drawer.html',
  styleUrls: ['../../shared/admin-workspace.css', './role-drawer.css']
})
export class RoleDrawer implements OnChanges {
  @Input({ required: true }) role!: RoleRecord;
  @Input() isNew = false;
  /** True for system roles: name, code and type are locked */
  @Input() system = false;
  @Input() submitted = false;
  @Input() dirty = false;
  @Output() changed = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() viewUsers = new EventEmitter<void>();

  private readonly service = inject(RoleAccessService);
  readonly icons = { X, Info, Lock };
  readonly types = ROLE_TYPES;
  readonly scopes = DATA_SCOPES;
  readonly timeouts = SESSION_TIMEOUTS;
  readonly locations: string[] = scopeOptions.locations;
  readonly departments: string[] = scopeOptions.departments;

  avatars: string[] = [];

  ngOnChanges(): void {
    this.avatars = []; // member names come from the users API once wired
  }

  get errors(): RoleErrors {
    return roleErrors(this.role, this.service.codeTaken(this.role.code, this.role.id));
  }

  /** Errors show once the user tried to save, or as soon as a field has content */
  show(key: keyof RoleErrors): string | null {
    const msg = this.errors[key];
    if (!msg) return null;
    if (this.submitted) return msg;
    return key === 'name' ? (this.role.name ? msg : null) : key === 'code' ? (this.role.code ? msg : null) : null;
  }

  onCode(v: string): void {
    this.role.code = v.toUpperCase().replace(/[\s-]+/g, '_');
    this.changed.emit();
  }

  onScope(scope: DataScope): void {
    this.role.dataScope = scope;
    if (scope === 'All Locations') this.role.locations = [...this.locations];
    this.changed.emit();
  }

  setLocations(v: string[]): void {
    this.role.locations = v;
    this.changed.emit();
  }

  setDepartments(v: string[]): void {
    this.role.departments = v;
    this.changed.emit();
  }

  /** The built-in administrator role always stays active */
  statusLocked(): boolean {
    return this.role.code === 'SYS_ADMIN' && !this.isNew;
  }

  get active(): boolean {
    return this.role.status === 'Active';
  }

  set active(v: boolean) {
    this.role.status = v ? 'Active' : 'Inactive';
    this.changed.emit();
  }

  extraUsers(): number {
    return Math.max(this.role.users - this.avatars.length, 0);
  }

  tone(name: string): { bg: string; ink: string } {
    return avatarTone(name);
  }

  initialsOf(name: string): string {
    return initials(name);
  }
}
