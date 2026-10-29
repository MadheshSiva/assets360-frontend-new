import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Check, ChevronLeft, ChevronRight, LucideAngularModule } from 'lucide-angular';
import { ReportPreview } from '../report-preview/report-preview';
import { fieldOf, filterError, sourceOf } from '../custom-reports.engine';
import { CustomReport } from '../custom-reports.model';
import { FieldsStep } from './fields-step';
import { FiltersStep } from './filters-step';
import { GroupSortStep } from './group-sort-step';
import { SelectedFields } from './selected-fields';
import { SourceStep } from './source-step';
import { VisualizeStep } from './visualize-step';

export const BUILDER_STEPS = ['Data Source', 'Select Fields', 'Filters', 'Group & Sort', 'Visualize', 'Preview'];

/** Report Builder: 6-step stepper with the selected fields and a live preview beside the steps. */
@Component({
  selector: 'cr-report-builder',
  imports: [LucideAngularModule, SourceStep, FieldsStep, SelectedFields, FiltersStep, GroupSortStep, VisualizeStep, ReportPreview],
  templateUrl: './report-builder.html',
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class ReportBuilder {
  @Input({ required: true }) report!: CustomReport;
  @Output() notice = new EventEmitter<string>();

  readonly steps = BUILDER_STEPS;
  readonly Check = Check;
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  step = 0;

  goTo(i: number): void {
    this.step = Math.max(0, Math.min(this.steps.length - 1, i));
  }

  next(): void {
    const problem = this.stepProblem(this.step);
    if (problem) {
      this.notice.emit(problem);
      return;
    }
    this.goTo(this.step + 1);
  }

  back(): void {
    this.goTo(this.step - 1);
  }

  isDone(i: number): boolean {
    return i < this.step && !this.stepProblem(i);
  }

  /** Why a step can't be left yet, or '' */
  stepProblem(i: number): string {
    if (i === 1 && !this.report.fields.length) return 'Select at least one field.';
    if (i === 2) {
      const bad = this.report.filters.findIndex((f) => filterError(this.report, f));
      if (bad >= 0) return `Filter ${bad + 1}: ${filterError(this.report, this.report.filters[bad])}`;
    }
    return '';
  }

  /** First problem across all steps (used before saving a report) */
  get firstProblem(): string {
    for (let i = 0; i < this.steps.length; i++) {
      const p = this.stepProblem(i);
      if (p) return p;
    }
    return '';
  }

  get sourceLabel(): string {
    return sourceOf(this.report.sourceKey).label;
  }

  get filterSummary(): string {
    const valid = this.report.filters.filter((f) => !filterError(this.report, f));
    if (!valid.length) return 'None';
    return valid.map((f) => `${fieldOf(this.report, f.field)?.label} ${f.op} ${f.value}`).join(' · ');
  }

  get groupSummary(): string {
    const g = this.report.groupBy ? fieldOf(this.report, this.report.groupBy)?.label : '';
    const s = this.report.sortBy ? (fieldOf(this.report, this.report.sortBy)?.label ?? '') : '';
    const parts = [g ? `Grouped by ${g} (${this.report.aggregate.toLowerCase()})` : 'Not grouped'];
    if (s) parts.push(`sorted by ${s} ${this.report.sortDir === 'asc' ? '↑' : '↓'}`);
    parts.push(`max ${this.report.rowLimit} rows`);
    return parts.join(', ');
  }

  relay(message: string): void {
    this.notice.emit(message);
  }
}
