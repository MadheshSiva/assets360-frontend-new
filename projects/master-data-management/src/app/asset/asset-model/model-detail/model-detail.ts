import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChevronDown, Copy, LucideAngularModule, Pencil, Search } from 'lucide-angular';
import { formatDateTime } from '../../../organization/location/location.format';
import { AssetTypeService } from '../../asset-type/asset-type.service';
import { sampleTag } from '../asset-model.data';
import { MODEL_ICONS } from '../asset-model.icons';
import { AssetModelRecord } from '../asset-model.model';
import { ModelFormTab } from '../model-form/model-form';

type DetailTab = 'overview' | 'specs' | 'lifecycle' | 'financial' | 'defaults';

interface DepreciationRow {
  year: number;
  opening: number;
  charge: number;
  closing: number;
}

/** Panel under the list showing the selected asset model. */
@Component({
  selector: 'app-model-detail',
  imports: [DecimalPipe, RouterLink, LucideAngularModule],
  templateUrl: './model-detail.html',
  styleUrls: ['../../../shared/styles/mdm-detail.css', '../../../shared/styles/mdm-detail-extras.css', './model-detail.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class ModelDetail implements OnChanges {
  @Input({ required: true }) model!: AssetModelRecord;
  @Output() edit = new EventEmitter<{ model: AssetModelRecord; tab?: ModelFormTab }>();
  @Output() duplicate = new EventEmitter<AssetModelRecord>();
  @Output() toggleStatus = new EventEmitter<AssetModelRecord>();
  @Output() remove = new EventEmitter<AssetModelRecord>();

  readonly types = inject(AssetTypeService);
  readonly icons = { Pencil, Copy, Search, ChevronDown };
  readonly formatDateTime = formatDateTime;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'specs', label: 'Specifications' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'financial', label: 'Financial' },
    { id: 'defaults', label: 'Defaults' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;

  ngOnChanges(): void {
    this.moreOpen = false;
  }

  get icon() {
    return MODEL_ICONS[this.types.iconFor(this.model.assetType)];
  }

  // "Latitude 7440" reads as "Dell Latitude 7440"; names that already start with the maker stay as they are
  get title(): string {
    const { name, manufacturer } = this.model;
    return name.toLowerCase().startsWith(manufacturer.toLowerCase()) ? name : `${manufacturer} ${name}`;
  }

  get currencyCode(): string {
    return this.model.currency.slice(0, 3);
  }

  get sample(): string {
    return sampleTag(this.model.taggingFormat);
  }

  // Only the first few rows fit on the overview card
  get keySpecs() {
    return this.model.specs.slice(0, 8);
  }

  /** Book value per year of the model's lifecycle at the default purchase price. */
  get depreciation(): DepreciationRow[] {
    const m = this.model;
    if (!m.includeInDepreciation || !m.purchasePrice || m.lifecycleYears < 1) return [];
    const salvage = (m.purchasePrice * m.salvagePercent) / 100;
    const straight = (m.purchasePrice - salvage) / m.lifecycleYears;
    // Declining balance rate that reaches the salvage value at the end of the lifecycle
    const rate = salvage > 0 ? 1 - Math.pow(salvage / m.purchasePrice, 1 / m.lifecycleYears) : 2 / m.lifecycleYears;
    const rows: DepreciationRow[] = [];
    let opening = m.purchasePrice;
    for (let year = 1; year <= m.lifecycleYears; year++) {
      const charge = Math.min(opening - salvage, m.depreciationMethod === 'Straight Line' ? straight : opening * rate);
      rows.push({ year, opening, charge, closing: opening - charge });
      opening -= charge;
    }
    return rows;
  }

  editAt(tab: ModelFormTab): void {
    this.edit.emit({ model: this.model, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
