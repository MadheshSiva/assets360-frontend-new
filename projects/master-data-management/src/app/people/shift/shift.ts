import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { Observable, switchMap } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { TeamService } from '../team/team.service';
import { SHIFT_TYPES, shiftHours } from './shift.data';
import { ShiftForm } from './shift-form/shift-form';
import { ShiftFilters, ShiftRecord } from './shift.model';
import { ShiftService } from './shift.service';

type SortKey = 'name' | 'code' | 'startTime' | 'duration';

/** Master Data Management > People > Shift */
@Component({
  selector: 'app-mdm-people-shift',
  imports: [FormsModule, RouterLink, LucideAngularModule, ShiftForm],
  templateUrl: './shift.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../people.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ShiftPage extends ListPage<ShiftRecord, ShiftFilters, SortKey> {
  readonly service = inject(ShiftService);
  readonly teams = inject(TeamService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly types = SHIFT_TYPES;
  readonly icons = { CalendarClock, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', shiftType: '', status: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load shifts: ${apiErrorMessage(err)}`) });
    this.teams.ensureLoaded();
  }

  keyOf(r: ShiftRecord): string {
    return r.code;
  }

  nameOf(r: ShiftRecord): string {
    return r.name;
  }

  protected all(): ShiftRecord[] {
    return this.service.all();
  }

  protected matches(r: ShiftRecord, f: ShiftFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (!f.shiftType || r.shiftType === f.shiftType) && (!f.status || r.status === f.status) && (!term || [r.name, r.code].some((v) => v.toLowerCase().includes(term)));
  }

  protected sortValue(r: ShiftRecord, key: SortKey): string | number {
    return key === 'duration' ? (this.duration(r) ?? -1) : r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  // Shifts still assigned to teams can't be deleted
  protected override deleteBlocker(r: ShiftRecord): string | null {
    const count = this.teams.teamsOnShift(r.code).length;
    return count ? `${r.name} is assigned to ${count} team${count === 1 ? '' : 's'}. Move them to another shift first.` : null;
  }

  duration(r: ShiftRecord): number | null {
    return shiftHours(r.startTime, r.endTime);
  }

  duplicate(r: ShiftRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active' });
  }

  onSaved(event: { record: ShiftRecord; originalCode: string | null; teamCodes: string[] }): void {
    if (this.saving) return;
    this.saving = true;
    let saved: ShiftRecord | null = null;
    // The shift first, then the teams put on or taken off it
    this.service
      .persist(event.record, event.originalCode)
      .pipe(
        switchMap((shift) => {
          saved = shift;
          this.carrySelection(event.originalCode, shift.code);
          return this.teams.assignShift(shift.code, event.teamCodes, event.originalCode ?? shift.code);
        })
      )
      .subscribe({
        complete: () => {
          this.saving = false;
          this.notify(`${saved!.name} ${event.originalCode ? 'updated' : 'added'}.`);
          this.closeForm();
        },
        error: (err) => {
          this.saving = false;
          this.notify(saved ? `${saved.name} saved, but its teams weren't updated: ${apiErrorMessage(err)}` : apiErrorMessage(err));
          // The shift itself is saved; reopening it edits the saved record
          if (saved) this.closeForm();
        }
      });
  }

  toggleStatus(r: ShiftRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
