import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, HardHat, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable, finalize } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { ShiftService } from '../shift/shift.service';
import { PersonStatus, avatarColor, initials } from '../people.data';
import { SkillService } from '../skill/skill.service';
import { TeamService } from '../team/team.service';
import { blankTechnician } from './technician.data';
import { TechnicianForm } from './technician-form/technician-form';
import { TechnicianFilters, TechnicianRecord } from './technician.model';
import { TechnicianService } from './technician.service';

type SortKey = 'id' | 'name' | 'primarySkill' | 'team';

/** Master Data Management > People > Technician */
@Component({
  selector: 'app-mdm-people-technician',
  imports: [FormsModule, RouterLink, LucideAngularModule, TechnicianForm],
  templateUrl: './technician.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../people.css', '../../shared/styles/mdm-purple-theme.css']
})
export class TechnicianPage extends ListPage<TechnicianRecord, TechnicianFilters, SortKey> {
  readonly service = inject(TechnicianService);
  readonly skills = inject(SkillService);
  private readonly teams = inject(TeamService);
  private readonly shifts = inject(ShiftService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly statuses: PersonStatus[] = ['Active', 'On Duty', 'On Leave', 'Inactive'];
  readonly initials = initials;
  readonly avatarColor = avatarColor;
  readonly icons = { HardHat, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', status: '', skill: '' });
    this.sortKey = 'id';
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load technicians: ${apiErrorMessage(err)}`) });
    this.teams.ensureLoaded();
    this.skills.ensureLoaded();
    this.shifts.ensureLoaded();
  }

  keyOf(r: TechnicianRecord): string {
    return r.id;
  }

  nameOf(r: TechnicianRecord): string {
    return r.name;
  }

  protected all(): TechnicianRecord[] {
    return this.service.all();
  }

  protected matches(r: TechnicianRecord, f: TechnicianFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.status || r.status === f.status) &&
      (!f.skill || r.primarySkill === f.skill || r.secondarySkills.includes(f.skill)) &&
      (!term || [r.id, r.name, r.primarySkill, ...r.secondarySkills, this.teamName(r)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: TechnicianRecord, key: SortKey): string {
    return key === 'team' ? this.teamName(r) : r[key];
  }

  protected removeRecords(ids: string[]): Observable<unknown> {
    return this.service.delete(ids).pipe(finalize(() => this.teams.removeMembers(ids.filter((id) => !this.service.find(id)))));
  }

  protected override deleteBlocker(r: TechnicianRecord): string | null {
    const led = this.teams.teamsLedBy(r.id);
    return led.length ? `${r.name} leads ${led[0].name}. Choose another team leader first.` : null;
  }

  // Teams own membership; a technician's team is the first team listing them
  teamName(r: TechnicianRecord): string {
    return this.teams.primaryTeamOf(r.id)?.name ?? '';
  }

  addNew(): void {
    this.openAdd(blankTechnician(this.service.nextId()));
  }

  onSaved(event: { record: TechnicianRecord; originalId: string | null; teamCode: string }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalId, this.teams.ref(event.teamCode)).subscribe({
      next: (saved) => {
        this.saving = false;
        if (event.originalId) this.teams.renameMember(event.originalId, saved.id);
        this.teams.setPrimaryTeam(saved.id, event.teamCode || null);
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

  setStatus(r: TechnicianRecord, status: PersonStatus): void {
    this.menuFor = null;
    this.service.setStatus(r, status, this.teams.ref(this.teams.primaryTeamOf(r.id)?.code)).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
