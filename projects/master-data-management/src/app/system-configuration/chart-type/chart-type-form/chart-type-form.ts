import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { readPhoto } from '../../../people/people.data';
import { CHART_CATEGORIES, blankChartType } from '../../system-config.data';
import { ChartTypeRecord } from '../../system-config.model';
import { ChartTypeService } from '../../system-config.service';
import { CHART_PREVIEWS, ChartPreviewIcon } from '../chart-preview';

type Tab = 'basic';

/** Right-hand "Add / Edit Chart Type" panel. */
@Component({
  selector: 'app-chart-type-form',
  imports: [FormsModule, LucideAngularModule, ChartPreviewIcon],
  templateUrl: './chart-type-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', './chart-type-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ChartTypeForm extends MasterForm<ChartTypeRecord, Tab> {
  protected readonly store = inject(ChartTypeService);
  readonly icons = { X };
  readonly categories = CHART_CATEGORIES;
  readonly previews = CHART_PREVIEWS;
  readonly tabs: { id: Tab; label: string }[] = [{ id: 'basic', label: 'Basic Information' }];

  protected blank(): ChartTypeRecord {
    return blankChartType();
  }

  onImagePicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.form.image = url;
        const { image, ...rest } = this.errors;
        this.errors = rest;
      },
      (message) => (this.errors = { ...this.errors, image: message })
    );
  }

  protected validate(f: ChartTypeRecord) {
    const errors: Record<string, string> = {};
    if (!f.category) errors['category'] = 'Select a category.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors };
  }

  protected override tidy(f: ChartTypeRecord): ChartTypeRecord {
    return { ...f, description: f.description.trim() };
  }
}
