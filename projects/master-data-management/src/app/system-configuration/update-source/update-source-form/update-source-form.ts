import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { SOURCE_TYPES, blankUpdateSource } from '../../system-config.data';
import { UpdateSourceRecord } from '../../system-config.model';
import { UpdateSourceService } from '../../system-config.service';

type Tab = 'basic';

/** Right-hand "Add / Edit Update Source" panel. */
@Component({
  selector: 'app-update-source-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './update-source-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class UpdateSourceForm extends MasterForm<UpdateSourceRecord, Tab> {
  protected readonly store = inject(UpdateSourceService);
  readonly icons = { X };
  readonly types = SOURCE_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [{ id: 'basic', label: 'Basic Information' }];

  protected blank(): UpdateSourceRecord {
    return blankUpdateSource();
  }

  protected validate(f: UpdateSourceRecord) {
    const errors: Record<string, string> = {};
    if (!f.type) errors['type'] = 'Select a type.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors };
  }

  protected override tidy(f: UpdateSourceRecord): UpdateSourceRecord {
    return { ...f, description: f.description.trim() };
  }
}
