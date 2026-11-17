import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { EmployeeService } from '../../employee/employee.service';
import { MasterLookups } from '../../name-lookup';
import { nowStamp } from '../../people.data';
import { ShiftService } from '../../shift/shift.service';
import { TechnicianService } from '../../technician/technician.service';
import { blankTeam } from '../team.data';
import { TeamRecord } from '../team.model';
import { TeamService } from '../team.service';

type FormTab = 'basic' | 'members' | 'roles' | 'settings';
type FieldKey = 'name' | 'code' | 'department' | 'status' | 'members';

interface Person {
  id: string;
  name: string;
  detail: string;
}

/** Right-hand "Add / Edit Team" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-team-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './team-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class TeamForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() team: TeamRecord | null = null;
  @Output() saved = new EventEmitter<{ record: TeamRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(TeamService);
  readonly shifts = inject(ShiftService);
  private readonly employees = inject(EmployeeService);
  private readonly technicians = inject(TechnicianService);
  readonly icons = { X, Plus, Trash2 };
  private readonly lookups = inject(MasterLookups);

  // Department names from the departments API, plus the current value so an edit keeps it
  get departments(): string[] {
    const names = this.lookups.departments.names;
    return this.form.department && !names.includes(this.form.department) ? [this.form.department, ...names] : names;
  }
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'members', label: 'Members' },
    { id: 'roles', label: 'Roles & Responsibilities' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: TeamRecord = blankTeam();
  memberSearch = '';
  showMembersOnly = false;
  errors: Partial<Record<FieldKey, string>> = {};
  private original: TeamRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.team : null;
    this.form = this.team ? structuredClone(this.team) : blankTeam();
    this.memberSearch = '';
    this.showMembersOnly = this.isEdit;
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  // Active technicians and employees; current members stay listed whatever their status
  get technicianOptions(): Person[] {
    return this.technicians
      .all()
      .filter((t) => t.status !== 'Inactive' || this.form.members.includes(t.id))
      .map((t) => ({ id: t.id, name: t.name, detail: `${t.id} · ${t.primarySkill}` }));
  }

  get employeeOptions(): Person[] {
    return this.employees
      .all()
      .filter((e) => e.status !== 'Inactive' || this.form.members.includes(e.id))
      .map((e) => ({ id: e.id, name: e.name, detail: `${e.id} · ${e.designation}` }));
  }

  get filteredPeople(): Person[] {
    const term = this.memberSearch.trim().toLowerCase();
    return [...this.technicianOptions, ...this.employeeOptions].filter(
      (p) => (!this.showMembersOnly || this.form.members.includes(p.id)) && (!term || `${p.name} ${p.detail}`.toLowerCase().includes(term))
    );
  }

  isMember(id: string): boolean {
    return this.form.members.includes(id);
  }

  // The leader is always a member and can't be removed
  toggleMember(id: string): void {
    if (id === this.form.leaderId) return;
    this.form.members = this.isMember(id) ? this.form.members.filter((m) => m !== id) : [...this.form.members, id];
  }

  onLeaderChange(): void {
    if (this.form.leaderId && !this.isMember(this.form.leaderId)) this.form.members = [this.form.leaderId, ...this.form.members];
  }

  addResponsibility(): void {
    this.form.responsibilities = [...this.form.responsibilities, ''];
  }

  removeResponsibility(index: number): void {
    this.form.responsibilities = this.form.responsibilities.filter((_, i) => i !== index);
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
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!f.name.trim()) errors.name = 'Enter a team name.';
    else if (this.service.isNameTaken(f.name, this.original?.code ?? null)) errors.name = `${f.name.trim()} already exists.`;
    if (!f.code.trim()) errors.code = 'Enter a code.';
    else if (this.service.isCodeTaken(f.code, this.original?.code ?? null)) errors.code = `${f.code.trim()} is already used.`;
    if (!f.department) errors.department = 'Select a department.';
    if (!f.status) errors.status = 'Select a status.';
    if (f.status === 'Active' && !f.members.length) errors.members = 'An active team needs at least one member.';
    this.errors = errors;

    if (Object.keys(errors).length) {
      this.tab = errors.name || errors.code || errors.department || errors.status ? 'basic' : 'members';
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...f,
        name: f.name.trim(),
        code: f.code.trim().toUpperCase(),
        description: f.description.trim(),
        responsibilities: f.responsibilities.map((r) => r.trim()).filter(Boolean),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: this.original?.code ?? null
    });
  }
}
