import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, Hexagon, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { EmployeeService } from '../employee/employee.service';
import { TechnicianService } from '../technician/technician.service';
import { SKILL_CATEGORIES } from './skill.data';
import { SkillForm } from './skill-form/skill-form';
import { SkillFilters, SkillRecord } from './skill.model';
import { SkillService } from './skill.service';

type SortKey = 'name' | 'code' | 'category';

/** Master Data Management > People > Skill */
@Component({
  selector: 'app-mdm-people-skill',
  imports: [FormsModule, RouterLink, LucideAngularModule, SkillForm],
  templateUrl: './skill.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../people.css', '../../shared/styles/mdm-purple-theme.css']
})
export class SkillPage extends ListPage<SkillRecord, SkillFilters, SortKey> {
  readonly service = inject(SkillService);
  private readonly employees = inject(EmployeeService);
  private readonly technicians = inject(TechnicianService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly categories = SKILL_CATEGORIES;
  readonly icons = { Hexagon, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', category: '', type: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load skills: ${apiErrorMessage(err)}`) });
    this.employees.ensureLoaded();
    this.technicians.ensureLoaded();
  }

  keyOf(r: SkillRecord): string {
    return r.code;
  }

  nameOf(r: SkillRecord): string {
    return r.name;
  }

  protected all(): SkillRecord[] {
    return this.service.all();
  }

  protected matches(r: SkillRecord, f: SkillFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.category || r.category === f.category) && (!f.type || r.type === f.type) && (!term || [r.name, r.code].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: SkillRecord, key: SortKey): string {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Skills held by people can't be deleted; they can be marked inactive instead
  protected override deleteBlocker(r: SkillRecord): string | null {
    const count = this.usage(r);
    return count ? `${r.name} is held by ${count} people. Mark it Inactive instead.` : null;
  }

  usage(r: SkillRecord): number {
    return this.employees.usesSkill(r.name) + this.technicians.usesSkill(r.name);
  }

  levelRange(r: SkillRecord): string {
    return r.levels.length ? `${r.levels[0]} - ${r.levels[r.levels.length - 1]}` : '-';
  }

  duplicate(r: SkillRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: SkillRecord; originalCode: string | null; originalName: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        // People refer to skills by name; the API renamed them, this keeps the loaded lists in step
        if (event.originalName) {
          this.employees.renameSkill(event.originalName, saved.name);
          this.technicians.renameSkill(event.originalName, saved.name);
        }
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

  toggleStatus(r: SkillRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
