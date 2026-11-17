import { Component, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { SiteService } from '../../../organization/site/site.service';
import { EmployeeService } from '../../../people/employee/employee.service';
import { EMAIL, readPhoto } from '../../../people/people.data';
import { DATE_FORMATS, LANGUAGES, TIME_ZONES, blankUser } from '../../security.data';
import { UserRecord } from '../../security.model';
import { RoleService, UserService } from '../../security.service';

type Tab = 'basic' | 'access' | 'preferences';

const USERNAME = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** Right-hand "Add / Edit User" panel. Passwords are never typed here; new users get an invitation. */
@Component({
  selector: 'app-user-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './user-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', './user-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class UserForm extends MasterForm<UserRecord, Tab> implements OnChanges {
  protected readonly store = inject(UserService);
  readonly roles = inject(RoleService);
  private readonly employees = inject(EmployeeService);
  readonly icons = { X, Camera };
  private readonly siteMaster = inject(SiteService);
  readonly languages = LANGUAGES;
  readonly timeZones = TIME_ZONES;
  readonly dateFormats = DATE_FORMATS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'access', label: 'Roles & Access' },
    { id: 'preferences', label: 'Preferences' }
  ];

  constructor() {
    super();
    this.siteMaster.ensureLoaded().subscribe({ error: () => undefined });
  }

  /** Active sites from the Site master, plus any the user already holds so they can be unticked. */
  get sites(): string[] {
    const names = this.siteMaster.all().filter((s) => s.status === 'Active').map((s) => s.name);
    return [...names, ...(this.form?.sites ?? []).filter((s) => !names.includes(s))];
  }

  // Username and email follow the name until typed by hand
  private usernameTouched = false;
  private emailTouched = false;

  override ngOnChanges(): void {
    super.ngOnChanges();
    this.usernameTouched = this.isEdit;
    this.emailTouched = this.isEdit;
  }

  protected blank(): UserRecord {
    return { ...blankUser(), code: this.store.nextCode() };
  }

  // Departments from the department master, plus the one the user already has
  get departments(): string[] {
    return this.store.departmentNames(this.original?.department ?? '');
  }

  get isSelf(): boolean {
    return this.original?.code === this.store.currentUser;
  }

  // Active roles, plus ones the user already holds
  get roleOptions() {
    const held = [this.form.primaryRole, ...this.form.additionalRoles];
    return this.roles.all().filter((r) => r.status === 'Active' || held.includes(r.code));
  }

  get extraRoleOptions() {
    return this.roleOptions.filter((r) => r.code !== this.form.primaryRole);
  }

  get employeeOptions() {
    return this.employees.all().filter((e) => e.status !== 'Inactive' || e.id === this.form.employeeId);
  }

  onNameChange(): void {
    if (!this.usernameTouched) {
      this.form.username = this.form.name.trim().toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '.');
      this.onUsernameChange(false);
    }
  }

  onUsernameChange(byHand = true): void {
    if (byHand) this.usernameTouched = true;
    if (!this.emailTouched && this.form.username) this.form.email = `${this.form.username}@dcs.ae`;
  }

  onEmailInput(): void {
    this.emailTouched = true;
  }

  // The primary role can't also be an additional one
  onPrimaryChange(): void {
    this.form.additionalRoles = this.form.additionalRoles.filter((c) => c !== this.form.primaryRole);
  }

  // Linking an employee fills an empty name, email and phone
  onEmployeeLink(): void {
    const e = this.employees.find(this.form.employeeId);
    if (!e) return;
    if (!this.form.name.trim()) {
      this.form.name = e.name;
      this.onNameChange();
    }
    if (!this.form.phone.trim()) this.form.phone = e.phone;
  }

  toggle(list: 'additionalRoles' | 'sites', value: string): void {
    const current = this.form[list];
    this.form[list] = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  }

  onPhotoPicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.form.photo = url;
        delete this.errors['photo'];
      },
      (message) => (this.errors = { ...this.errors, photo: message })
    );
  }

  // Two people can share a name; usernames and emails must be unique instead
  protected override nameTaken(): boolean {
    return false;
  }

  protected validate(f: UserRecord) {
    const errors: Record<string, string> = {};
    const code = this.original?.code ?? null;
    const username = f.username.trim().toLowerCase();
    if (!username) errors['username'] = 'Enter a username.';
    else if (!USERNAME.test(username)) errors['username'] = 'Use lower-case letters, numbers and . _ - only.';
    else if (this.store.isUsernameTaken(username, code)) errors['username'] = `${username} is already taken.`;
    if (!f.email.trim()) errors['email'] = 'Enter an email address.';
    else if (!EMAIL.test(f.email.trim())) errors['email'] = 'Enter a valid email address.';
    else if (this.store.isEmailTaken(f.email, code)) errors['email'] = 'Another user has this email.';
    if (!f.department) errors['department'] = 'Select a department.';
    if (!f.primaryRole) errors['primaryRole'] = 'Select a primary role.';
    if (!f.status) errors['status'] = 'Select a status.';
    else if (this.isSelf && f.status !== 'Active') errors['status'] = 'You can’t deactivate your own account.';
    if (f.accountExpiry && f.accountExpiry <= new Date().toISOString().slice(0, 10) && f.status === 'Active') errors['accountExpiry'] = 'The expiry date must be in the future.';
    if (!f.sites.length) errors['sites'] = 'Give access to at least one site.';
    const tab: Tab = Object.keys(errors).some((k) => ['username', 'email', 'department', 'primaryRole', 'status', 'photo'].includes(k)) ? 'basic' : 'access';
    return { errors, tab };
  }

  protected override tidy(f: UserRecord): UserRecord {
    return { ...f, username: f.username.trim().toLowerCase(), email: f.email.trim().toLowerCase(), phone: f.phone.trim() };
  }
}
