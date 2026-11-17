import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { ACCESS_ROLES, DESIGNATIONS, EMAIL, EMPLOYMENT_TYPES, nowStamp, readPhoto } from '../../people.data';
import { MasterLookups } from '../../name-lookup';
import { SiteService } from '../../../organization/site/site.service';
import { SkillService } from '../../skill/skill.service';
import { TeamService } from '../../team/team.service';
import { NATIONALITIES, blankEmployee } from '../employee.data';
import { EmployeeRecord } from '../employee.model';
import { EmployeeService } from '../employee.service';

type FormTab = 'basic' | 'employment' | 'contact' | 'skills' | 'access';
type FieldKey = 'id' | 'name' | 'department' | 'designation' | 'email' | 'photo' | 'status' | 'reportingManager' | 'certifications';

const TAB_OF: Record<FieldKey, FormTab> = {
  id: 'basic',
  name: 'basic',
  department: 'basic',
  designation: 'basic',
  email: 'basic',
  photo: 'basic',
  status: 'basic',
  reportingManager: 'employment',
  certifications: 'skills'
};

/** Right-hand "Add / Edit Employee" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-employee-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './employee-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class EmployeeForm implements OnChanges {
  // 'edit' changes `employee`; 'add' creates one, pre-filled from it (the page passes the next free ID)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() employee: EmployeeRecord | null = null;
  @Output() saved = new EventEmitter<{ record: EmployeeRecord; originalId: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(EmployeeService);
  readonly skillService = inject(SkillService);
  readonly teams = inject(TeamService);
  private readonly lookups = inject(MasterLookups);
  private readonly siteService = inject(SiteService);
  readonly icons = { X, Camera, Plus, Trash2 };
  readonly designations = DESIGNATIONS;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly accessRoles = ACCESS_ROLES;
  readonly nationalities = NATIONALITIES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'employment', label: 'Employment' },
    { id: 'contact', label: 'Contact' },
    { id: 'skills', label: 'Skills & Certification' },
    { id: 'access', label: 'Access & Settings' }
  ];

  tab: FormTab = 'basic';
  form: EmployeeRecord = blankEmployee('');
  errors: Partial<Record<FieldKey, string>> = {};
  private original: EmployeeRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.employee : null;
    this.form = this.employee ? structuredClone(this.employee) : blankEmployee(this.service.nextId());
    this.errors = {};
    this.tab = 'basic';
  }

  // Department names from the departments API, plus the current value so an edit keeps it
  get departments(): string[] {
    const names = this.lookups.departments.names;
    return this.form.department && !names.includes(this.form.department) ? [this.form.department, ...names] : names;
  }

  // Names of sites already loaded from the sites API, plus the current value so an edit keeps it
  get sites(): string[] {
    const names = this.siteService.all().map((s) => s.name);
    return this.form.site && !names.includes(this.form.site) ? [this.form.site, ...names] : names;
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get skillOptions(): string[] {
    return this.skillService.activeNames(this.form.skills);
  }

  // Anyone else who isn't inactive can be the manager
  get managers(): EmployeeRecord[] {
    return this.service.all().filter((e) => e.id !== this.original?.id && (e.status !== 'Inactive' || e.id === this.form.reportingManager));
  }

  get teamName(): string {
    return this.original ? (this.teams.primaryTeamOf(this.original.id)?.name ?? 'Not in a team') : 'Set on the Team page';
  }

  hasSkill(name: string): boolean {
    return this.form.skills.includes(name);
  }

  toggleSkill(name: string): void {
    this.form.skills = this.hasSkill(name) ? this.form.skills.filter((s) => s !== name) : [...this.form.skills, name];
  }

  addCertification(): void {
    this.form.certifications = [...this.form.certifications, { name: '', expiry: '' }];
  }

  removeCertification(index: number): void {
    this.form.certifications = this.form.certifications.filter((_, i) => i !== index);
  }

  isExpired(expiry: string): boolean {
    return !!expiry && expiry < new Date().toISOString().slice(0, 10);
  }

  onPhotoPicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.form.photo = url;
        const { photo, ...rest } = this.errors;
        this.errors = rest;
      },
      (message) => (this.errors = { ...this.errors, photo: message })
    );
  }

  /** True on the final tab, where the primary button saves instead of advancing. */
  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  /** Move to the next tab. */
  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    // Enter key / primary button on earlier tabs just advances
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const originalId = this.original?.id ?? null;
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!f.id.trim()) errors.id = 'Enter an employee ID.';
    else if (this.service.isIdTaken(f.id, originalId)) errors.id = `${f.id.trim()} is already used.`;
    if (!f.name.trim()) errors.name = 'Enter the full name.';
    if (!f.department) errors.department = 'Select a department.';
    if (!f.status) errors.status = 'Select a status.';
    if (!f.designation) errors.designation = 'Select a designation.';
    if (!f.email.trim()) errors.email = 'Enter an email address.';
    else if (!EMAIL.test(f.email.trim())) errors.email = 'Enter a valid email address.';
    else if (this.service.isEmailTaken(f.email, originalId)) errors.email = 'Another employee uses this email.';
    if (f.reportingManager && f.reportingManager === originalId) errors.reportingManager = 'An employee can’t report to themselves.';
    if (f.certifications.some((c) => !c.name.trim())) errors.certifications = 'Name every certification or remove the empty ones.';
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))!.id;
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...f,
        id: f.id.trim().toUpperCase(),
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: f.phone.trim(),
        certifications: f.certifications.map((c) => ({ ...c, name: c.name.trim() })),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalId
    });
  }
}
