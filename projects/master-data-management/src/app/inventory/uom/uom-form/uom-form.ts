import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { MasterForm } from '../../../maintenance/form-base';
import { UOM_TYPES, blankUom } from '../../inventory.data';
import { UomRecord } from '../../inventory.model';
import { UomService } from '../../inventory.service';

type Tab = 'basic' | 'conversion' | 'settings';

/** Right-hand "Add / Edit UOM" panel. */
@Component({
  selector: 'app-uom-form',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './uom-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class UomForm extends MasterForm<UomRecord, Tab> {
  protected readonly store = inject(UomService);
  readonly icons = { X };
  readonly types = UOM_TYPES;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'conversion', label: 'Conversion' },
    { id: 'settings', label: 'Settings' }
  ];

  protected blank(): UomRecord {
    return blankUom();
  }

  /** Base units of the same type: other units that aren't themselves based on this one. */
  get baseOptions(): UomRecord[] {
    return this.store.all().filter((u) => u.type === this.form.type && u.code !== this.original?.code && !u.baseUom);
  }

  get baseSymbol(): string {
    return this.store.find(this.form.baseUom)?.symbol ?? '';
  }

  // Changing the type drops a base unit of the old type
  onTypeChange(): void {
    if (this.form.baseUom && this.store.find(this.form.baseUom)?.type !== this.form.type) {
      this.form.baseUom = '';
      this.form.conversionFactor = 1;
    }
  }

  protected validate(f: UomRecord) {
    const errors: Record<string, string> = {};
    if (!f.type) errors['type'] = 'Select a type.';
    if (!f.symbol.trim()) errors['symbol'] = 'Enter a symbol.';
    if (!f.status) errors['status'] = 'Select a status.';
    if (!(f.conversionFactor > 0)) errors['conversionFactor'] = 'Enter a factor greater than 0.';
    if (!f.baseUom && f.conversionFactor !== 1) errors['conversionFactor'] = 'A unit without a base unit has a factor of 1.';
    if (this.original && f.baseUom && this.store.derived(this.original.code).length) {
      errors['baseUom'] = 'Other units are based on this one, so it must stay a base unit.';
    }
    if (f.allowDecimals && !(Number.isInteger(f.decimalPlaces) && f.decimalPlaces >= 1 && f.decimalPlaces <= 6)) errors['decimalPlaces'] = 'Enter 1 to 6.';
    const tab: Tab = errors['type'] || errors['symbol'] || errors['status'] ? 'basic' : errors['decimalPlaces'] && Object.keys(errors).length === 1 ? 'settings' : 'conversion';
    return { errors, tab };
  }

  protected override tidy(f: UomRecord): UomRecord {
    return { ...f, symbol: f.symbol.trim(), description: f.description.trim(), decimalPlaces: f.allowDecimals ? f.decimalPlaces : 0 };
  }
}
