import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Download, Ellipsis, LoaderCircle, Lock, LucideAngularModule, Play } from 'lucide-angular';
import { ExportJob } from './data-export-api.model';
import { JOB_TONES, MODULE_TONES, destinationIcon, formatStamp, moduleIcon } from './dx-format';

/** Export Jobs table: run, sample download and the row menu (edit / pause / resume / delete). */
@Component({
  standalone: true,
  selector: 'dx-export-jobs',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget dx-jobs">
      <div class="widget__head">
        <h2>Export Jobs <span class="muted">({{ visible.length }})</span></h2>
        @if (selected.length) {
          <span class="muted">{{ selected.length }} selected</span>
          <button type="button" class="btn btn--sm btn--outline" (click)="runSelected()">
            <lucide-icon [img]="icons.Play" [size]="13"></lucide-icon> Run selected
          </button>
        }
        <select class="select dx-select-sm" [(ngModel)]="module" aria-label="Data source">
          <option value="">All data sources</option>
          @for (m of modules; track m) {
            <option [value]="m">{{ m }}</option>
          }
        </select>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th><input type="checkbox" [checked]="allSelected" (change)="toggleAll()" aria-label="Select all exports" /></th>
              <th>Export Name</th>
              <th>Data Source</th>
              <th>Format</th>
              <th>Destination</th>
              <th>Schedule</th>
              <th>Last Run</th>
              <th>Next Run</th>
              <th>Status</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (j of visible; track j.id) {
              <tr [class.dx-row-hl]="j.id === highlightId">
                <td><input type="checkbox" [checked]="isSelected(j)" (change)="toggle(j)" [attr.aria-label]="'Select ' + j.name" /></td>
                <td>
                  <span class="dx-name">
                    <lucide-icon [img]="moduleIcon(j.module)" [size]="15"></lucide-icon>
                    <span>
                      <strong>{{ j.name }}</strong>
                      @if (j.encrypted) {
                        <lucide-icon class="dx-lock" [img]="icons.Lock" [size]="11" title="AES-256 encrypted"></lucide-icon>
                      }
                    </span>
                  </span>
                </td>
                <td><span class="pill" [attr.data-tone]="moduleTone(j.module)">{{ j.module }}</span></td>
                <td><span class="dx-format">{{ j.format }}</span></td>
                <td>
                  <span class="dx-dest"><lucide-icon [img]="destinationIcon(j.destination)" [size]="14"></lucide-icon>{{ j.destination }}</span>
                </td>
                <td class="dx-two">{{ j.frequency }}<small>{{ scheduleDetail(j) }}</small></td>
                <td class="dx-two">{{ stampDate(j.lastRun) }}<small>{{ stampTime(j.lastRun) }}</small></td>
                <td class="dx-two">
                  @if (j.status === 'Running') {
                    In progress
                  } @else {
                    {{ stampDate(j.nextRun) }}<small>{{ stampTime(j.nextRun) }}</small>
                  }
                </td>
                <td>
                  <span class="pill" [attr.data-tone]="tone(j)" [title]="j.lastError || ''">
                    @if (j.status === 'Running') {
                      <lucide-icon class="dx-spin" [img]="icons.LoaderCircle" [size]="11"></lucide-icon>
                    } @else {
                      <i></i>
                    }
                    {{ j.status }}
                  </span>
                </td>
                <td>{{ j.owner }}</td>
                <td>
                  <span class="dx-actions">
                    <button type="button" class="icon-btn dx-act" [disabled]="j.status === 'Running'" (click)="run.emit(j)" [attr.aria-label]="'Run ' + j.name" title="Run now">
                      <lucide-icon [img]="icons.Play" [size]="15"></lucide-icon>
                    </button>
                    <button type="button" class="icon-btn dx-act" (click)="download.emit(j)" [attr.aria-label]="'Download sample of ' + j.name" title="Download sample (CSV)">
                      <lucide-icon [img]="icons.Download" [size]="15"></lucide-icon>
                    </button>
                    <span class="row-menu">
                      <button type="button" class="icon-btn" (click)="toggleMenu(j, $event)" [attr.aria-label]="'More actions for ' + j.name" aria-haspopup="menu">
                        <lucide-icon [img]="icons.Ellipsis" [size]="15"></lucide-icon>
                      </button>
                      @if (menuId === j.id) {
                        <div class="menu" role="menu">
                          <button type="button" role="menuitem" (click)="pick('edit', j)">Edit</button>
                          @if (j.status === 'Paused') {
                            <button type="button" role="menuitem" (click)="pick('resume', j)">Resume</button>
                          } @else if (j.status !== 'Draft') {
                            <button type="button" role="menuitem" [disabled]="j.status === 'Running'" (click)="pick('pause', j)">Pause</button>
                          }
                          <button type="button" role="menuitem" class="danger" (click)="pick('remove', j)">Delete</button>
                        </div>
                      }
                    </span>
                  </span>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="11" class="empty">No export jobs match the current filters.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `
})
export class ExportJobsTable {
  @Input({ required: true }) jobs: ExportJob[] = [];
  @Input() highlightId = '';
  @Output() run = new EventEmitter<ExportJob>();
  @Output() download = new EventEmitter<ExportJob>();
  @Output() edit = new EventEmitter<ExportJob>();
  @Output() pause = new EventEmitter<ExportJob>();
  @Output() resume = new EventEmitter<ExportJob>();
  @Output() remove = new EventEmitter<ExportJob>();

  readonly icons = { Play, Download, Ellipsis, Lock, LoaderCircle };
  readonly moduleIcon = moduleIcon;
  readonly destinationIcon = destinationIcon;
  module = '';
  menuId = '';
  private selectedIds = new Set<string>();

  get modules(): string[] {
    return Array.from(new Set(this.jobs.map((j) => j.module))).sort();
  }

  get visible(): ExportJob[] {
    return this.module ? this.jobs.filter((j) => j.module === this.module) : this.jobs;
  }

  get selected(): ExportJob[] {
    return this.visible.filter((j) => this.selectedIds.has(j.id));
  }

  get allSelected(): boolean {
    return this.visible.length > 0 && this.selected.length === this.visible.length;
  }

  isSelected(j: ExportJob): boolean {
    return this.selectedIds.has(j.id);
  }

  toggle(j: ExportJob): void {
    if (this.selectedIds.has(j.id)) this.selectedIds.delete(j.id);
    else this.selectedIds.add(j.id);
  }

  toggleAll(): void {
    if (this.allSelected) this.selectedIds.clear();
    else for (const j of this.visible) this.selectedIds.add(j.id);
  }

  runSelected(): void {
    for (const j of this.selected) if (j.status !== 'Running') this.run.emit(j);
    this.selectedIds.clear();
  }

  tone(j: ExportJob): string {
    return JOB_TONES[j.status];
  }

  moduleTone(m: string): string {
    return MODULE_TONES[m] ?? 'grey';
  }

  scheduleDetail(j: ExportJob): string {
    if (j.frequency === 'Hourly') return `Every hour at :${j.time}`;
    return j.time;
  }

  stampDate(s: string | null): string {
    return s ? formatStamp(s.split('T')[0]) : '—';
  }

  stampTime(s: string | null): string {
    return s ? (s.split('T')[1] ?? '') : '';
  }

  toggleMenu(j: ExportJob, event: Event): void {
    event.stopPropagation();
    this.menuId = this.menuId === j.id ? '' : j.id;
  }

  pick(action: 'edit' | 'pause' | 'resume' | 'remove', j: ExportJob): void {
    this.menuId = '';
    this[action].emit(j);
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuId = '';
  }
}
