import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { EmployeeService } from '../../../people/employee/employee.service';
import { EMAIL } from '../../../people/people.data';
import { VENDOR_COUNTRIES } from '../../../vendor/vendor.data';
import { blankWarehouse } from '../../inventory.data';
import { WarehouseRecord } from '../../inventory.model';
import { WarehouseService } from '../../inventory.service';

type Tab = 'basic' | 'address' | 'contact' | 'settings';

/** Right-hand "Add / Edit Warehouse" panel. */
@Component({
  selector: 'app-warehouse-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './warehouse-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class WarehouseForm extends MasterForm<WarehouseRecord, Tab> {
  protected readonly store = inject(WarehouseService);
  private readonly employees = inject(EmployeeService);
  readonly icons = { X };
  readonly countries = VENDOR_COUNTRIES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'address', label: 'Address' },
    { id: 'contact', label: 'Contact' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): WarehouseRecord {
    return blankWarehouse();
  }

  // Active employees, plus the current manager whatever their status
  get managers() {
    return this.employees.all().filter((e) => e.status !== 'Inactive' || e.id === this.form.managerId);
  }

  protected validate(f: WarehouseRecord) {
    const errors: Record<string, string> = {};
    if (!f.status) errors['status'] = 'Select a status.';
    if (f.email.trim() && !EMAIL.test(f.email.trim())) errors['email'] = 'Enter a valid email address.';
    if (f.areaSqm !== null && !(f.areaSqm > 0)) errors['areaSqm'] = 'Enter an area greater than 0.';
    return { errors, tab: (errors['status'] ? 'basic' : errors['email'] ? 'contact' : 'settings') as Tab };
  }

  protected override tidy(f: WarehouseRecord): WarehouseRecord {
    return { ...f, location: f.location.trim(), description: f.description.trim(), email: f.email.trim().toLowerCase() };
  }
}
