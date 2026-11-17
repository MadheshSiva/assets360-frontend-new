import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { EmployeeService } from '../../../people/employee/employee.service';
import { STORE_TYPES, blankStore } from '../../inventory.data';
import { StoreRecord } from '../../inventory.model';
import { StoreService, WarehouseService } from '../../inventory.service';

type Tab = 'basic' | 'settings';

/** Right-hand "Add / Edit Store" panel. */
@Component({
  selector: 'app-store-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './store-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class StoreForm extends MasterForm<StoreRecord, Tab> {
  protected readonly store = inject(StoreService);
  readonly warehouses = inject(WarehouseService);
  private readonly employees = inject(EmployeeService);
  readonly icons = { X };
  readonly storeTypes = STORE_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): StoreRecord {
    return blankStore();
  }

  get keepers() {
    return this.employees.all().filter((e) => e.status !== 'Inactive' || e.id === this.form.keeperId);
  }

  // Active warehouses, plus the current one whatever its status
  get warehouseOptions() {
    return this.warehouses.all().filter((w) => w.status === 'Active' || w.code === this.form.warehouseCode);
  }

  protected validate(f: StoreRecord) {
    const errors: Record<string, string> = {};
    if (!f.warehouseCode) errors['warehouseCode'] = 'Select a warehouse.';
    if (!f.status) errors['status'] = 'Select a status.';
    return { errors, tab: 'basic' as Tab };
  }

  protected override tidy(f: StoreRecord): StoreRecord {
    return { ...f, description: f.description.trim() };
  }
}
