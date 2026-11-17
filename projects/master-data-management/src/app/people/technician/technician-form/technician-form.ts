import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Camera, LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { EmployeeService } from '../../employee/employee.service';
import { EMAIL, EMPLOYMENT_TYPES, PersonStatus, nowStamp, readPhoto } from '../../people.data';
import { ShiftService } from '../../shift/shift.service';
import { SkillService } from '../../skill/skill.service';
import { TeamService } from '../../team/team.service';
import { SKILL_LEVELS, blankTechnician } from '../technician.data';
import { TechnicianRecord } from '../technician.model';
import { TechnicianService } from '../technician.service';

type FormTab = 'basic' | 'skills' | 'employment' | 'contact' | 'settings';
type FieldKey = 'id' | 'name' | 'email' | 'photo' | 'status' | 'team' | 'skillLevel' | 'certifications' | 'hourlyRate' | 'maxOpenWorkOrders';

const TAB_OF: Record<FieldKey, FormTab> = {
  id: 'basic',
  name: 'basic',
  email: 'basic',
  photo: 'basic',
  status: 'basic',
  team: 'basic',
  skillLevel: 'skills',
  certifications: 'skills',
  hourlyRate: 'employment',
  maxOpenWorkOrders: 'settings'
};

/** Right-hand "Add / Edit Technician" panel. Emits the record and the chosen team; the page saves both. */
@Component({
  selector: 'app-technician-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './technician-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class TechnicianForm implements OnChanges {
  // 'edit' changes `technician`; 'add' creates one, pre-filled from it (the page passes the next free ID)
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() technician: TechnicianRecord | null = null;
  @Output() saved = new EventEmitter<{ record: TechnicianRecord; originalId: string | null; teamCode: string }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(TechnicianService);
  readonly skillService = inject(SkillService);
  readonly teams = inject(TeamService);
  readonly shifts = inject(ShiftService);
  readonly employees = inject(EmployeeService);
  readonly icons = { X, Camera, Plus, Trash2 };
  readonly levels = SKILL_LEVELS;
  readonly employmentTypes = EMPLOYMENT_TYPES;
  readonly statuses: PersonStatus[] = ['Active', 'On Duty', 'On Leave', 'Inactive'];
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'skills', label: 'Skills & Certification' },
    { id: 'employment', label: 'Employment' },
    { id: 'contact', label: 'Contact' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: TechnicianRecord = blankTechnician('');
  teamCode = '';
  errors: Partial<Record<FieldKey, string>> = {};
  private original: TechnicianRecord | null = null;
  private originalTeam = '';

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.technician : null;
    this.form = this.technician ? structuredClone(this.technician) : blankTechnician(this.service.nextId());
    this.originalTeam = this.original ? (this.teams.primaryTeamOf(this.original.id)?.code ?? '') : '';
    this.teamCode = this.originalTeam;
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get primaryOptions(): string[] {
    return this.skillService.activeNames(this.form.primarySkill ? [this.form.primarySkill] : []);
  }

  // Secondary skills exclude the primary one
  get secondaryOptions(): string[] {
    return this.skillService.activeNames(this.form.secondarySkills).filter((s) => s !== this.form.primarySkill);
  }

  get teamOptions() {
    return this.teams.all().filter((t) => t.status !== 'Inactive' || t.code === this.teamCode);
  }

  // Employees not already linked to another technician
  get employeeOptions() {
    const linked = new Set(this.service.all().filter((t) => t.id !== this.original?.id && t.employeeId).map((t) => t.employeeId));
    return this.employees.all().filter((e) => !linked.has(e.id));
  }

  get shiftName(): string {
    const team = this.teams.find(this.teamCode);
    return team ? (this.shifts.find(team.shiftCode)?.name ?? 'No fixed shift') : 'Pick a team on Basic Information';
  }

  hasSecondary(name: string): boolean {
    return this.form.secondarySkills.includes(name);
  }

  toggleSecondary(name: string): void {
    this.form.secondarySkills = this.hasSecondary(name) ? this.form.secondarySkills.filter((s) => s !== name) : [...this.form.secondarySkills, name];
  }

  onPrimaryChange(): void {
    this.form.secondarySkills = this.form.secondarySkills.filter((s) => s !== this.form.primarySkill);
  }

  // Linking an employee fills the contact details the technician record doesn't have yet
  onEmployeeChange(): void {
    const e = this.employees.find(this.form.employeeId);
    if (!e) return;
    if (!this.form.name.trim()) this.form.name = e.name;
    if (!this.form.email.trim()) this.form.email = e.email;
    if (!this.form.phone.trim()) this.form.phone = e.phone;
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
    if (!f.id.trim()) errors.id = 'Enter a technician ID.';
    else if (this.service.isIdTaken(f.id, originalId)) errors.id = `${f.id.trim()} is already used.`;
    if (!f.name.trim()) errors.name = 'Enter the full name.';
    if (!f.email.trim()) errors.email = 'Enter an email address.';
    else if (!EMAIL.test(f.email.trim())) errors.email = 'Enter a valid email address.';
    else if (this.service.isEmailTaken(f.email, originalId)) errors.email = 'Another technician uses this email.';
    if (!f.status) errors.status = 'Select a status.';
    if (!f.skillLevel) errors.skillLevel = 'Select a skill level.';
    // A leader stays in the team they lead
    const led = originalId ? this.teams.teamsLedBy(originalId).find((t) => t.code === this.originalTeam) : undefined;
    if (led && this.teamCode !== this.originalTeam) errors.team = `${f.name.trim() || 'This technician'} leads ${led.name}. Choose another leader there first.`;
    if (f.certifications.some((c) => !c.name.trim())) errors.certifications = 'Name every certification or remove the empty ones.';
    if (f.hourlyRate !== null && !(f.hourlyRate >= 0)) errors.hourlyRate = 'Rate can’t be negative.';
    if (!Number.isInteger(f.maxOpenWorkOrders) || f.maxOpenWorkOrders < 1 || f.maxOpenWorkOrders > 50) errors.maxOpenWorkOrders = 'Enter 1 to 50.';
    this.errors = errors;

    const keys = Object.keys(errors) as FieldKey[];
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))!.id;
      return;
    }

    const stamp = nowStamp();
    const available = f.status === 'Active' || f.status === 'On Duty';
    this.saved.emit({
      record: {
        ...f,
        id: f.id.trim().toUpperCase(),
        name: f.name.trim(),
        email: f.email.trim().toLowerCase(),
        phone: f.phone.trim(),
        employmentType: f.source === 'Contractor' ? 'Contract' : f.employmentType,
        // People who are away can't be dispatched
        availableForDispatch: available && f.availableForDispatch,
        certifications: f.certifications.map((c) => ({ ...c, name: c.name.trim() })),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalId,
      teamCode: this.teamCode
    });
  }
}
