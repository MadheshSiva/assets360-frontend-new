import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChartColumn, LucideAngularModule, X } from 'lucide-angular';
import { avatarTone, initials } from '../../shared/admin-common';
import { ChipSelect } from '../../role-access-control/chip-select/chip-select';
import { RoleAccessService } from '../../role-access-control/role-access.service';
import { AccessSummary, POLICY_SCOPES, POLICY_TYPES, PolicyRecord, accessSummary } from '../module-access.data';
import { ModuleAccessService } from '../module-access.service';

export type PolicyErrors = Partial<Record<'name' | 'code' | 'description' | 'roles' | 'dataScope' | 'landingModule' | 'sessionTimeout', string>>;

/** Validation shared by the drawer (inline messages) and the page (blocks Save). */
export function policyErrors(p: PolicyRecord, codeTaken: boolean, nameTaken: boolean): PolicyErrors {
  const e: PolicyErrors = {};
  if (!p.name.trim()) e.name = 'Policy name is required.';
  else if (nameTaken) e.name = 'Another policy already has this name.';
  if (!p.code.trim()) e.code = 'Policy code is required.';
  else if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(p.code.trim()) || p.code.trim().length > 20) e.code = 'Use A–Z, 0–9 and hyphens (max 20).';
  else if (codeTaken) e.code = 'Another policy already uses this code.';
  if (p.description.length > 500) e.description = 'Keep it under 500 characters.';
  if (p.type === 'Role' && !p.roles.length) e.roles = 'Role policies need at least one role.';
  if (!p.dataScope) e.dataScope = 'Data scope is required.';
  const landing = p.grants.find((g) => g.module === p.landingModule);
  if (!p.landingModule) e.landingModule = 'Default landing module is required.';
  else if (!landing || !landing.enabled) e.landingModule = 'Pick a module that is enabled in this policy.';
  if (!Number.isInteger(p.sessionTimeout) || p.sessionTimeout < 5 || p.sessionTimeout > 1440) e.sessionTimeout = 'Enter 5 to 1440 minutes.';
  return e;
}

/** Right-hand "Access Policy Details" drawer. Edits go straight into the page's draft. */
@Component({
  selector: 'app-policy-drawer',
  imports: [FormsModule, LucideAngularModule, ChipSelect],
  templateUrl: './policy-drawer.html',
  styleUrls: ['../../shared/admin-workspace.css', './policy-drawer.css']
})
export class PolicyDrawer implements OnChanges {
  @Input({ required: true }) policy!: PolicyRecord;
  @Input() isNew = false;
  @Input() submitted = false;
  @Input() dirty = false;
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() viewUsers = new EventEmitter<void>();

  private readonly service = inject(ModuleAccessService);
  private readonly roles = inject(RoleAccessService);
  readonly icons = { X, ChartColumn };
  readonly types = POLICY_TYPES;
  readonly scopes = POLICY_SCOPES;

  avatars: string[] = [];

  ngOnChanges(): void {
    this.avatars = []; // member names come from the users API once wired
  }

  get roleOptions(): string[] {
    return this.roles.all().map((r) => r.name);
  }

  get enabledModules(): string[] {
    return this.policy.grants.filter((g) => g.enabled).map((g) => g.module);
  }

  get summary(): AccessSummary {
    return accessSummary(this.policy);
  }

  get errors(): PolicyErrors {
    return policyErrors(
      this.policy,
      this.service.codeTaken(this.policy.code, this.policy.id),
      this.service.nameTaken(this.policy.name, this.policy.id)
    );
  }

  /** Name / code errors show while typing; the rest after a save attempt */
  show(key: keyof PolicyErrors): string | null {
    const msg = this.errors[key];
    if (!msg) return null;
    if (this.submitted || key === 'description' || (key === 'landingModule' && this.policy.landingModule)) return msg;
    return key === 'name' ? (this.policy.name ? msg : null) : key === 'code' ? (this.policy.code ? msg : null) : null;
  }

  onCode(v: string): void {
    this.policy.code = v.toUpperCase().replace(/[\s_]+/g, '-');
  }

  setRoles(v: string[]): void {
    this.policy.roles = v;
  }

  get active(): boolean {
    return this.policy.status === 'Active';
  }

  set active(v: boolean) {
    this.policy.status = v ? 'Active' : 'Inactive';
  }

  extraUsers(): number {
    return Math.max(this.policy.users - this.avatars.length, 0);
  }

  tone(name: string): { bg: string; ink: string } {
    return avatarTone(name);
  }

  initialsOf(name: string): string {
    return initials(name);
  }
}
