import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Calendar, Eye, LucideAngularModule, Users } from 'lucide-angular';
import { SCHEDULES, VISIBILITIES } from '../custom-reports.data';
import { CustomReport } from '../custom-reports.model';

/** Report Configuration bar: name, description, visibility, schedule and the save / publish actions. */
@Component({
  selector: 'cr-report-config',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <h2 class="cr-config__title">Report Configuration</h2>
    <div class="cr-config">
      <div class="field cr-config__name" [class.invalid]="showErrors && !!nameError">
        <label for="cr-name">Report Name <span class="req">*</span></label>
        <input id="cr-name" [(ngModel)]="report.name" maxlength="80" placeholder="e.g. Monthly Asset Performance" />
        @if (showErrors && nameError) { <small>{{ nameError }}</small> }
      </div>
      <div class="field cr-config__desc">
        <label for="cr-desc">Description</label>
        <textarea id="cr-desc" [(ngModel)]="report.description" rows="2" maxlength="300" placeholder="What does this report answer?"></textarea>
      </div>
      <div class="field">
        <label for="cr-vis"><lucide-icon [img]="Users" [size]="13" /> Visibility</label>
        <select id="cr-vis" [(ngModel)]="report.visibility">
          @for (v of visibilities; track v) { <option [value]="v">{{ v }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="cr-sched"><lucide-icon [img]="Calendar" [size]="13" /> Schedule</label>
        <select id="cr-sched" [(ngModel)]="report.schedule">
          @for (s of schedules; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </div>
      <div class="cr-config__actions">
        <button type="button" class="btn btn--sm" (click)="saveDraft.emit()">Save Draft</button>
        <button type="button" class="btn btn--sm btn--outline" (click)="preview.emit()"><lucide-icon [img]="Eye" [size]="14" /> Preview Report</button>
        <button type="button" class="btn btn--primary" (click)="saveReport.emit()">Save Report</button>
        <button type="button" class="btn" (click)="publish.emit()">{{ report.status === 'Published' ? 'Unpublish' : 'Publish' }}</button>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class ReportConfig {
  @Input({ required: true }) report!: CustomReport;
  @Input() nameError = '';
  @Input() showErrors = false;
  @Output() saveDraft = new EventEmitter<void>();
  @Output() preview = new EventEmitter<void>();
  @Output() saveReport = new EventEmitter<void>();
  @Output() publish = new EventEmitter<void>();

  readonly Calendar = Calendar;
  readonly Eye = Eye;
  readonly Users = Users;
  readonly visibilities = VISIBILITIES;
  readonly schedules = SCHEDULES;
}
