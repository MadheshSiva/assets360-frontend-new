import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { SYNC_COLORS, blankSyncStatus } from '../../system-config.data';
import { SyncStatusRecord } from '../../system-config.model';
import { SyncStatusService } from '../../system-config.service';

type Tab = 'basic';

/** Right-hand "Add / Edit Sync Status" panel. */
@Component({
  selector: 'app-sync-status-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './sync-status-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../maintenance/maintenance-form.css', '../../../asset/level-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class SyncStatusForm extends MasterForm<SyncStatusRecord, Tab> {
  protected readonly store = inject(SyncStatusService);
  readonly icons = { X };
  readonly colors = SYNC_COLORS;
  readonly tabs: { id: Tab; label: string }[] = [{ id: 'basic', label: 'Basic Information' }];

  protected blank(): SyncStatusRecord {
    return blankSyncStatus();
  }

  protected validate(f: SyncStatusRecord) {
    const errors: Record<string, string> = {};
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors };
  }

  protected override tidy(f: SyncStatusRecord): SyncStatusRecord {
    return { ...f, description: f.description.trim() };
  }
}
