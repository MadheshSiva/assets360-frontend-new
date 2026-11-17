import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Box,
  Calendar,
  Camera,
  ChartColumn,
  Eye,
  EyeOff,
  LayoutDashboard,
  LucideAngularModule,
  LucideIconData,
  MapPin,
  Package,
  Pencil,
  ShieldCheck,
  Wrench,
  X
} from 'lucide-angular';
import { ADMIN_LOCATIONS, avatarTone, initials } from '../../shared/admin-common';
import scopeOptions from '../../role-access-control/role-scope-options.json';
import { ALL_LOCATIONS, LOCATION_TIME_ZONES, TIME_ZONES, USER_MODULES, USER_ROLES, roleModules } from '../user-management.data';
import { AdminUser, UserStatus } from '../user-management.model';
import { UserAdminService } from '../user-management.service';
import { loginLabel, roleOf } from '../user-format';

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const EMPLOYEE_ID = /^EMP-\d{4,}$/;
const PHONE = /^\+?[\d\s()-]{7,20}$/;
/** Same rule as the Administration API: at least 8 characters with letters and numbers. */
export const MIN_PASSWORD = 8;
function passwordProblem(p: string): string | null {
  if (p.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Use both letters and numbers.';
  return null;
}
const MODULE_ICONS: Record<string, LucideIconData> = {
  Dashboard: LayoutDashboard,
  Assets: Box,
  Maintenance: Wrench,
  Inventory: Package,
  Compliance: ShieldCheck,
  Reports: ChartColumn
};

/**
 * Right "User Details" drawer. Edits roles, scope, MFA, status and module access of a user; the profile
 * fields open for editing with the pencil, and are open straight away when adding a user.
 * New users are invited by email; no password is ever typed here.
 */
@Component({
  standalone: true,
  selector: 'app-user-drawer',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './user-drawer.html',
  styleUrls: ['../../shared/admin-workspace.css', '../user-management.css', './user-drawer.css']
})
export class UserDrawer implements OnChanges {
  @Input({ required: true }) user!: AdminUser;
  @Input() mode: 'add' | 'edit' = 'edit';
  /** `password` is set for a new user, and for an existing one only when it is being changed. */
  @Output() saved = new EventEmitter<{ user: AdminUser; isNew: boolean; password?: string }>();
  @Output() closed = new EventEmitter<void>();

  private readonly service = inject(UserAdminService);
  readonly icons = { X, Camera, Pencil, MapPin, Calendar, Eye, EyeOff };
  readonly minPassword = MIN_PASSWORD;
  // Same department list as the Role form (role-scope-options.json)
  readonly departments: string[] = scopeOptions.departments;
  readonly locations = ADMIN_LOCATIONS;
  readonly timeZones = TIME_ZONES;
  readonly modules = USER_MODULES;
  readonly allLocations = ALL_LOCATIONS;
  readonly statuses: UserStatus[] = ['Active', 'Pending', 'Suspended'];
  readonly initials = initials;

  form!: AdminUser;
  errors: Record<string, string> = {};
  editingProfile = false;
  /** Sign-in password; never stored in the page model */
  password = '';
  confirmPassword = '';
  showPassword = false;

  ngOnChanges(): void {
    this.form = { ...this.user, secondaryRoles: [...this.user.secondaryRoles], modules: [...this.user.modules] };
    this.errors = {};
    this.password = '';
    this.confirmPassword = '';
    this.showPassword = false;
    this.editingProfile = this.isAdd;
  }

  get isAdd(): boolean {
    return this.mode === 'add';
  }

  get isSelf(): boolean {
    return this.user.id === this.service.currentUserId;
  }

  get primaryOptions() {
    return USER_ROLES.filter((r) => !r.secondaryOnly);
  }

  get secondaryOptions() {
    return USER_ROLES.filter((r) => r.name !== this.form.primaryRole && !this.form.secondaryRoles.includes(r.name));
  }

  avatarBg(): string {
    return avatarTone(this.form.name || '?').bg;
  }

  avatarInk(): string {
    return avatarTone(this.form.name || '?').ink;
  }

  statusTone(): string {
    return this.form.status === 'Active' ? 'green' : this.form.status === 'Pending' ? 'orange' : 'red';
  }

  editProfile(): void {
    this.editingProfile = true;
  }

  onLocationChange(): void {
    this.form.timeZone = LOCATION_TIME_ZONES[this.form.location] ?? this.form.timeZone;
  }

  // Changing roles grants their modules; tiles can still be switched off afterwards
  onPrimaryChange(): void {
    this.form.secondaryRoles = this.form.secondaryRoles.filter((r) => r !== this.form.primaryRole);
    this.grantRoleModules();
    delete this.errors['primaryRole'];
  }

  addSecondary(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const role = select.value;
    select.value = '';
    if (!role || this.form.secondaryRoles.includes(role)) return;
    this.form.secondaryRoles = [...this.form.secondaryRoles, role];
    this.grantRoleModules();
  }

  removeSecondary(role: string): void {
    this.form.secondaryRoles = this.form.secondaryRoles.filter((r) => r !== role);
  }

  roleTone(role: string): string {
    return roleOf(role)?.tone ?? 'purple';
  }

  private grantRoleModules(): void {
    const granted = new Set([...this.form.modules, ...roleModules([this.form.primaryRole, ...this.form.secondaryRoles])]);
    this.form.modules = USER_MODULES.filter((m) => granted.has(m));
  }

  hasModule(m: string): boolean {
    return this.form.modules.includes(m);
  }

  toggleModule(m: string): void {
    this.form.modules = this.hasModule(m) ? this.form.modules.filter((x) => x !== m) : USER_MODULES.filter((x) => x === m || this.form.modules.includes(x));
    delete this.errors['modules'];
  }

  moduleIcon(m: string): LucideIconData {
    return MODULE_ICONS[m] ?? Box;
  }

  lastLoginText(): string {
    return this.form.lastLogin ? loginLabel(this.form.lastLogin, true) : this.form.status === 'Pending' ? 'Not signed in yet' : 'Never';
  }

  createdText(): string {
    return this.form.created ? loginLabel(this.form.created, true) : '—';
  }

  onPhotoPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 1024 * 1024) {
      this.errors = { ...this.errors, photo: 'Use a PNG, JPG or WebP image under 1 MB.' };
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.form.photo = String(reader.result);
      delete this.errors['photo'];
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.form.photo = null;
  }

  private validate(): boolean {
    const f = this.form;
    const e: Record<string, string> = {};
    const exceptId = this.isAdd ? null : this.user.id;
    if (!f.name.trim()) e['name'] = 'Full name is required.';
    if (!f.email.trim()) e['email'] = 'Email address is required.';
    else if (!EMAIL.test(f.email.trim())) e['email'] = 'Enter a valid email address.';
    else if (this.service.emailTaken(f.email, exceptId)) e['email'] = 'Another user already has this email.';
    if (!f.employeeId.trim()) e['employeeId'] = 'Employee ID is required.';
    else if (!EMPLOYEE_ID.test(f.employeeId.trim().toUpperCase())) e['employeeId'] = 'Use the format EMP-0001.';
    else if (this.service.employeeIdTaken(f.employeeId, exceptId)) e['employeeId'] = 'This employee ID is already used.';
    if (!f.department) e['department'] = 'Department is required.';
    // Required for a new user; optional when editing (blank keeps the current password)
    if (this.isAdd && !this.password) e['password'] = 'Password is required.';
    else if (this.password) {
      const problem = passwordProblem(this.password);
      if (problem) e['password'] = problem;
      else if (this.password !== this.confirmPassword) e['confirmPassword'] = 'Passwords do not match.';
    }
    if (f.phone.trim() && !PHONE.test(f.phone.trim())) e['phone'] = 'Enter a valid phone number.';
    if (!f.primaryRole) e['primaryRole'] = 'Primary role is required.';
    if (!f.accessScope) e['accessScope'] = 'Access scope is required.';
    if (!f.modules.length) e['modules'] = 'Give access to at least one module.';
    if (f.status === 'Suspended' && !f.suspendReason.trim()) e['suspendReason'] = 'Say why the account is suspended.';
    if (!this.isAdd && f.status !== 'Active' && this.user.status === 'Active') {
      const reason = this.service.lockoutReason(this.user);
      if (reason) e['status'] = reason;
    }
    this.errors = e;
    // Profile errors are only visible with the profile fields open
    if (['name', 'email', 'password', 'confirmPassword', 'employeeId', 'department', 'phone'].some((k) => e[k])) this.editingProfile = true;
    return Object.keys(e).length === 0;
  }

  save(): void {
    if (!this.validate()) return;
    const f = this.form;
    this.saved.emit({
      user: {
        ...f,
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        employeeId: f.employeeId.trim().toUpperCase(),
        jobTitle: f.jobTitle.trim(),
        phone: f.phone.trim(),
        suspendReason: f.status === 'Suspended' ? f.suspendReason.trim() : ''
      },
      isNew: this.isAdd,
      password: this.password || undefined
    });
  }

  close(): void {
    this.closed.emit();
  }
}
