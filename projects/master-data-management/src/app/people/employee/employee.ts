import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Users } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable, finalize } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { SkillService } from '../skill/skill.service';
import { avatarColor, initials } from '../people.data';
import { TeamService } from '../team/team.service';
import { blankEmployee } from './employee.data';
import { EmployeeForm } from './employee-form/employee-form';
import { EmployeeFilters, EmployeeRecord, EmployeeStatus } from './employee.model';
import { EmployeeService } from './employee.service';
import { MasterLookups } from '../name-lookup';

type SortKey = 'id' | 'name' | 'department' | 'designation';

/** Master Data Management > People > Employee */
@Component({
  selector: 'app-mdm-people-employee',
  imports: [FormsModule, RouterLink, LucideAngularModule, EmployeeForm],
  templateUrl: './employee.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../people.css', '../../shared/styles/mdm-purple-theme.css']
})
export class EmployeePage extends ListPage<EmployeeRecord, EmployeeFilters, SortKey> {
  readonly service = inject(EmployeeService);
  private readonly teams = inject(TeamService);
  private readonly skills = inject(SkillService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  private readonly lookups = inject(MasterLookups);

  // Department names from the departments API
  get departments(): string[] {
    const names = this.lookups.departments.names;
    return names;
  }
  readonly statuses: EmployeeStatus[] = ['Active', 'On Leave', 'Inactive'];
  readonly initials = initials;
  readonly avatarColor = avatarColor;
  readonly icons = { Users, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', department: '', status: '' });
    this.sortKey = 'id';
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load employees: ${apiErrorMessage(err)}`) });
    this.teams.ensureLoaded();
    this.skills.ensureLoaded();
  }

  keyOf(r: EmployeeRecord): string {
    return r.id;
  }

  nameOf(r: EmployeeRecord): string {
    return r.name;
  }

  protected all(): EmployeeRecord[] {
    return this.service.all();
  }

  protected matches(r: EmployeeRecord, f: EmployeeFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.department || r.department === f.department) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.id, r.name, r.department, r.designation, r.email].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: EmployeeRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(ids: string[]): Observable<unknown> {
    // The API takes deleted employees out of their teams
    return this.service.delete(ids).pipe(finalize(() => this.teams.removeMembers(ids.filter((id) => !this.service.find(id)))));
  }

  // Team leaders and managers with reports must be replaced first
  protected override deleteBlocker(r: EmployeeRecord): string | null {
    const led = this.teams.teamsLedBy(r.id);
    if (led.length) return `${r.name} leads ${led[0].name}. Choose another team leader first.`;
    const reports = this.service.reportsOf(r.id).length;
    return reports ? `${reports} employee${reports === 1 ? ' reports' : 's report'} to ${r.name}. Change their manager first.` : null;
  }

  addNew(): void {
    this.openAdd(blankEmployee(this.service.nextId()));
  }

  onSaved(event: { record: EmployeeRecord; originalId: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalId).subscribe({
      next: (saved) => {
        this.saving = false;
        if (event.originalId) this.teams.renameMember(event.originalId, saved.id);
        this.carrySelection(event.originalId, saved.id);
        this.notify(`${saved.name} ${event.originalId ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  setStatus(r: EmployeeRecord, status: EmployeeStatus): void {
    this.menuFor = null;
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
