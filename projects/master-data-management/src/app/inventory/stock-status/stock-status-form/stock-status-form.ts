import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { STATUS_COLORS, STOCK_STATUS_TYPES, blankStockStatus } from '../../inventory.data';
import { StockStatusRecord } from '../../inventory.model';
import { StockStatusService } from '../../inventory.service';

type Tab = 'basic' | 'rules' | 'settings';

/** Right-hand "Add / Edit Stock Status" panel. */
@Component({
  selector: 'app-stock-status-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './stock-status-form.html',
  styleUrls: [
    '../../../shared/styles/mdm-drawer.css',
    '../../../shared/styles/mdm-drawer-extras.css',
    '../../../people/people-form.css',
    '../../../asset/level-form.css',
    '../../../people/shift/shift-form/shift-form.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class StockStatusForm extends MasterForm<StockStatusRecord, Tab> {
  protected readonly store = inject(StockStatusService);
  readonly icons = { X };
  readonly types = STOCK_STATUS_TYPES;
  readonly colors = STATUS_COLORS;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'rules', label: 'Usage & Rules' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): StockStatusRecord {
    return blankStockStatus();
  }

  // Sensible rules for each type until changed by hand
  onTypeChange(): void {
    const t = this.form.type;
    this.form.countsAsAvailable = t === 'Available' || t === 'Warning';
    this.form.canIssue = t === 'Available' || t === 'Warning';
    this.form.canReserve = t === 'Available' || t === 'Warning' || t === 'In Transit';
    this.form.triggersReorder = t === 'Warning' || t === 'Unavailable';
  }

  protected validate(f: StockStatusRecord) {
    const errors: Record<string, string> = {};
    if (!f.type) errors['type'] = 'Select a type.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (this.original?.isDefault && !f.isDefault) errors['isDefault'] = 'Make another status the system default instead.';
    else if (f.isDefault && f.status !== 'Active') errors['isDefault'] = 'The system default must be active.';
    if (f.canIssue && !f.countsAsAvailable) errors['canIssue'] = 'Stock that can be issued must count as available.';
    return { errors, tab: (errors['type'] || errors['status'] || errors['isDefault'] ? 'basic' : 'rules') as Tab };
  }

  protected override tidy(f: StockStatusRecord): StockStatusRecord {
    return { ...f, description: f.description.trim(), usage: f.usage.trim() };
  }
}
