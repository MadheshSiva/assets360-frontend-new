import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import { AssetModelRecord } from '../../../asset/asset-model/asset-model.model';
import { AssetModelService } from '../../../asset/asset-model/asset-model.service';
import { CURRENCIES } from '../../../organization/organization/organization.data';
import { nowStamp } from '../../../people/people.data';
import { BASE_TAB_OF, VendorAddressFields, VendorBasic, VendorDocuments, VendorErrors, cleanVendorBase, validateVendorBase } from '../../vendor-fields/vendor-fields';
import { AMC_ASSET_TYPES, BILLING_CYCLES, CONTRACT_TYPES, MODEL_TYPES_FOR, blankAmcVendor } from '../amc-vendor.data';
import { AmcVendorRecord } from '../amc-vendor.model';
import { AmcVendorService } from '../amc-vendor.service';

type FormTab = 'basic' | 'contract' | 'coverage' | 'sla' | 'address' | 'documents' | 'settings';

const TAB_OF: Record<string, FormTab> = {
  ...BASE_TAB_OF,
  assetType: 'basic',
  contractType: 'basic',
  startDate: 'basic',
  endDate: 'basic',
  contractValue: 'contract',
  renewalNoticeDays: 'contract',
  visitsPerYear: 'contract',
  responseHours: 'sla',
  resolutionHours: 'sla',
  uptimePercent: 'sla',
  penaltyPerHour: 'sla'
};

/** Right-hand "Add / Edit AMC Vendor" panel. Emits the finished record; the page saves it. */
@Component({
  selector: 'app-amc-vendor-form',
  imports: [FormsModule, DecimalPipe, LucideAngularModule, VendorBasic, VendorAddressFields, VendorDocuments],
  templateUrl: './amc-vendor-form.html',
  styleUrls: ['../../../shared/styles/mdm-drawer.css', '../../../shared/styles/mdm-drawer-extras.css', '../../../people/people-form.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class AmcVendorForm implements OnChanges {
  @Input() mode: 'add' | 'edit' = 'add';
  @Input() vendor: AmcVendorRecord | null = null;
  @Output() saved = new EventEmitter<{ record: AmcVendorRecord; originalCode: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  readonly service = inject(AmcVendorService);
  readonly models = inject(AssetModelService);
  readonly icons = { X };
  readonly assetTypes = AMC_ASSET_TYPES;
  readonly contractTypes = CONTRACT_TYPES;
  readonly billingCycles = BILLING_CYCLES;
  readonly currencies = CURRENCIES;
  readonly tabs: { id: FormTab; label: string }[] = [
    { id: 'basic', label: 'Basic Information' },
    { id: 'contract', label: 'Contract Details' },
    { id: 'coverage', label: 'Asset Coverage' },
    { id: 'sla', label: 'Service Level (SLA)' },
    { id: 'address', label: 'Address & Contact' },
    { id: 'documents', label: 'Documents' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: FormTab = 'basic';
  form: AmcVendorRecord = blankAmcVendor();
  modelSearch = '';
  showAllTypes = false;
  errors: VendorErrors = {};
  private original: AmcVendorRecord | null = null;

  ngOnChanges(): void {
    this.original = this.mode === 'edit' ? this.vendor : null;
    this.form = this.vendor ? structuredClone(this.vendor) : blankAmcVendor();
    this.modelSearch = '';
    this.showAllTypes = false;
    this.errors = {};
    this.tab = 'basic';
  }

  get isEdit(): boolean {
    return this.original !== null;
  }

  get termMonths(): number | null {
    if (!this.form.startDate || !this.form.endDate || this.form.endDate <= this.form.startDate) return null;
    return Math.round((new Date(this.form.endDate).getTime() - new Date(this.form.startDate).getTime()) / (30.44 * 86400000));
  }

  /** Asset models that fit the contract's asset type (or all, when asked), plus those already covered. */
  get modelOptions(): AssetModelRecord[] {
    const types = MODEL_TYPES_FOR[this.form.assetType] ?? [];
    const term = this.modelSearch.trim().toLowerCase();
    return this.models
      .all()
      .filter((m) => this.form.coveredModels.includes(m.code) || this.showAllTypes || !types.length || types.includes(m.assetType))
      .filter((m) => !term || `${m.name} ${m.code} ${m.manufacturer} ${m.assetType}`.toLowerCase().includes(term))
      .slice(0, 150);
  }

  get coveredAssets(): number {
    return this.service.coveredAssets(this.form);
  }

  isCovered(code: string): boolean {
    return this.form.coveredModels.includes(code);
  }

  toggleModel(code: string): void {
    this.form.coveredModels = this.isCovered(code) ? this.form.coveredModels.filter((c) => c !== code) : [...this.form.coveredModels, code];
  }

  // Quick pick: every listed model from a manufacturer with the vendor's name
  coverOwnModels(): void {
    const own = this.modelOptions.filter((m) => m.manufacturer.toLowerCase() === this.form.name.trim().toLowerCase()).map((m) => m.code);
    this.form.coveredModels = [...new Set([...this.form.coveredModels, ...own])];
  }

  /** True on the final tab, where the primary button saves instead of advancing. */
  get isLastTab(): boolean {
    return this.tab === this.tabs[this.tabs.length - 1].id;
  }

  /** Move to the next tab. */
  next(): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab);
    if (i < this.tabs.length - 1) this.tab = this.tabs[i + 1].id;
  }

  submit(): void {
    // Enter key / primary button on earlier tabs just advances
    if (!this.isLastTab) {
      this.next();
      return;
    }
    const f = this.form;
    const code = this.original?.code ?? null;
    const errors = validateVendorBase(f, { code: this.service.isCodeTaken(f.code, code), name: this.service.isNameTaken(f.name, code) }, 'AMC Vendor');
    if (!f.assetType) errors['assetType'] = 'Select an asset type.';
    if (!f.contractType) errors['contractType'] = 'Select a contract type.';
    if (!f.startDate) errors['startDate'] = 'Enter a start date.';
    if (!f.endDate) errors['endDate'] = 'Enter an end date.';
    else if (f.startDate && f.endDate <= f.startDate) errors['endDate'] = 'End date must be after the start date.';
    if (f.contractValue !== null && !(f.contractValue >= 0)) errors['contractValue'] = 'Enter 0 or more.';
    if (!Number.isInteger(f.renewalNoticeDays) || f.renewalNoticeDays < 0 || f.renewalNoticeDays > 365) errors['renewalNoticeDays'] = 'Enter 0 to 365 days.';
    if (!Number.isInteger(f.visitsPerYear) || f.visitsPerYear < 0 || f.visitsPerYear > 365) errors['visitsPerYear'] = 'Enter 0 to 365.';
    if (!Number.isInteger(f.responseHours) || f.responseHours < 1) errors['responseHours'] = 'Enter 1 or more hours.';
    if (!Number.isInteger(f.resolutionHours) || f.resolutionHours < 1) errors['resolutionHours'] = 'Enter 1 or more hours.';
    else if (f.resolutionHours < f.responseHours) errors['resolutionHours'] = 'Resolution can’t be faster than the response.';
    if (!(f.uptimePercent >= 0 && f.uptimePercent <= 100)) errors['uptimePercent'] = 'Enter 0 to 100.';
    if (f.penaltyPerHour !== null && !(f.penaltyPerHour >= 0)) errors['penaltyPerHour'] = 'Enter 0 or more.';
    this.errors = errors;

    const keys = Object.keys(errors);
    if (keys.length) {
      this.tab = this.tabs.find((t) => keys.some((k) => TAB_OF[k] === t.id))?.id ?? 'basic';
      return;
    }

    const stamp = nowStamp();
    this.saved.emit({
      record: {
        ...cleanVendorBase(f),
        contractNo: f.contractNo.trim(),
        createdOn: this.original?.createdOn ?? stamp,
        updatedOn: stamp
      },
      originalCode: code
    });
  }
}
