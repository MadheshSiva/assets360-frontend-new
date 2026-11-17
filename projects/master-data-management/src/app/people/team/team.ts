import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Users } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { ShiftService } from '../shift/shift.service';
import { EmployeeService } from '../employee/employee.service';
import { MasterLookups } from '../name-lookup';
import { TechnicianService } from '../technician/technician.service';
import { TeamForm } from './team-form/team-form';
import { TeamFilters, TeamRecord } from './team.model';
import { TeamService } from './team.service';

type SortKey = 'name' | 'code' | 'department' | 'members';

/** Master Data Management > People > Team */
@Component({
  selector: 'app-mdm-people-team',
  imports: [FormsModule, RouterLink, LucideAngularModule, TeamForm],
  templateUrl: './team.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../people.css', '../../shared/styles/mdm-purple-theme.css']
})
export class TeamPage extends ListPage<TeamRecord, TeamFilters, SortKey> {
  readonly service = inject(TeamService);
  private readonly employees = inject(EmployeeService);
  private readonly technicians = inject(TechnicianService);
  private readonly shifts = inject(ShiftService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  private readonly lookups = inject(MasterLookups);

  // Department names from the departments API
  get departments(): string[] {
    const names = this.lookups.departments.names;
    return names;
  }
  readonly statuses: TeamRecord['status'][] = ['Active', 'On Leave', 'Inactive'];
  readonly icons = { Users, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', department: '', status: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load teams: ${apiErrorMessage(err)}`) });
    this.shifts.ensureLoaded();
  }

  keyOf(r: TeamRecord): string {
    return r.code;
  }

  nameOf(r: TeamRecord): string {
    return r.name;
  }

  protected all(): TeamRecord[] {
    return this.service.all();
  }

  protected matches(r: TeamRecord, f: TeamFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.department || r.department === f.department) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.department, this.leaderName(r)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: TeamRecord, key: SortKey): string | number {
    return key === 'members' ? r.members.length : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // The API keeps technicians on their team, so a team with technicians can't be deleted
  protected override deleteBlocker(r: TeamRecord): string | null {
    const count = this.service.technicianMembers(r).length;
    return count ? `${r.name} still has ${count} technician${count === 1 ? '' : 's'}. Move them to another team first.` : null;
  }

  /** Name of an employee (EMP…) or technician (TECH…). */
  personName(id: string): string {
    return (id.startsWith('TECH') ? this.technicians.find(id)?.name : this.employees.find(id)?.name) ?? id;
  }

  leaderName(r: TeamRecord): string {
    return r.leaderId ? this.personName(r.leaderId) : '';
  }

  duplicate(r: TeamRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: TeamRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persistTeam(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
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

  setStatus(r: TeamRecord, status: TeamRecord['status']): void {
    this.menuFor = null;
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
