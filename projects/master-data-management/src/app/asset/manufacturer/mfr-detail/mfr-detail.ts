import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Box, ChevronDown, Copy, LucideAngularModule, Monitor, Pencil, Search, Settings, TriangleAlert } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { formatDateTime } from '../../../organization/location/location.format';
import { AssetModelService } from '../../asset-model/asset-model.service';
import { badgeInk, badgeText, countryInfo } from '../manufacturer.data';
import { ManufacturerRecord } from '../manufacturer.model';
import { MfrFormTab } from '../mfr-form/mfr-form';

type DetailTab = 'overview' | 'contact' | 'support' | 'defaults' | 'models' | 'assets' | 'documents' | 'activity';

/** Panel under the list showing the selected manufacturer. */
@Component({
  selector: 'app-mfr-detail',
  imports: [DecimalPipe, RouterLink, LucideAngularModule],
  templateUrl: './mfr-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    '../../asset-type/type-detail/type-detail.css',
    './mfr-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class MfrDetail implements OnChanges {
  @Input({ required: true }) manufacturer!: ManufacturerRecord;
  @Output() edit = new EventEmitter<{ manufacturer: ManufacturerRecord; tab?: MfrFormTab }>();
  @Output() duplicate = new EventEmitter<ManufacturerRecord>();
  @Output() toggleStatus = new EventEmitter<ManufacturerRecord>();
  @Output() remove = new EventEmitter<ManufacturerRecord>();

  readonly models = inject(AssetModelService);
  readonly icons = { Pencil, Copy, Search, ChevronDown, Box, Monitor, Settings, TriangleAlert };
  readonly formatDateTime = formatDateTime;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;
  readonly modelPath = `${MASTER_DATA_BASE_PATH}/asset/asset-model`;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'contact', label: 'Contact & Address' },
    { id: 'support', label: 'Support & Warranty' },
    { id: 'defaults', label: 'Default Settings' },
    { id: 'models', label: 'Models' },
    { id: 'assets', label: 'Assets' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;

  ngOnChanges(): void {
    this.moreOpen = false;
  }

  flag(country: string): string {
    return countryInfo(country)?.flag ?? '';
  }

  // Asset models refer to their manufacturer by name
  get mine() {
    return this.models.ofManufacturer(this.manufacturer.name);
  }

  get assetCount(): number {
    return this.mine.reduce((sum, m) => sum + m.assetCount, 0);
  }

  // Asset status and warranty live in the Assets module; unknown until that API is wired
  readonly activeAssets: number | null = null;
  readonly underWarranty: number | null = null;

  /** Assets of this manufacturer per asset type, largest first. */
  get byType() {
    const totals = new Map<string, { models: number; assets: number }>();
    for (const m of this.mine) {
      const t = totals.get(m.assetType) ?? { models: 0, assets: 0 };
      t.models++;
      t.assets += m.assetCount;
      totals.set(m.assetType, t);
    }
    return [...totals.entries()].map(([type, t]) => ({ type, ...t })).sort((a, b) => b.assets - a.assets);
  }

  // Documents and the audit log are owned by other modules; empty until those APIs are wired
  readonly documentRows: { name: string; kind: string; size: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  editAt(tab: MfrFormTab): void {
    this.edit.emit({ manufacturer: this.manufacturer, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
