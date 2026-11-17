import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Boxes, ChevronDown, Copy, FileText, LucideAngularModule, Pencil, Search, Shapes, Wrench } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { formatDateTime } from '../../../organization/location/location.format';
import { sampleTag } from '../../asset-model/asset-model.data';
import { MODEL_ICONS } from '../../asset-model/asset-model.icons';
import { AssetModelService } from '../../asset-model/asset-model.service';
import { AssetTypeRecord } from '../asset-type.model';
import { TypeFormTab } from '../type-form/type-form';

type DetailTab = 'overview' | 'subcategories' | 'assets' | 'fields' | 'defaults' | 'documents' | 'activity' | 'lifecycle' | 'financial' | 'settings';

/** Panel under the list showing the selected asset type. */
@Component({
  selector: 'app-type-detail',
  imports: [DecimalPipe, RouterLink, LucideAngularModule],
  templateUrl: './type-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    './type-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class TypeDetail implements OnChanges {
  @Input({ required: true }) type!: AssetTypeRecord;
  @Output() edit = new EventEmitter<{ type: AssetTypeRecord; tab?: TypeFormTab }>();
  @Output() duplicate = new EventEmitter<AssetTypeRecord>();
  @Output() toggleStatus = new EventEmitter<AssetTypeRecord>();
  @Output() remove = new EventEmitter<AssetTypeRecord>();

  readonly models = inject(AssetModelService);
  readonly typeIcons = MODEL_ICONS;
  readonly icons = { Pencil, Copy, Search, ChevronDown, Shapes, Boxes, Wrench, FileText };
  readonly formatDateTime = formatDateTime;
  readonly modelPath = `${MASTER_DATA_BASE_PATH}/asset/asset-model`;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'subcategories', label: 'Subcategories' },
    { id: 'assets', label: 'Assets' },
    { id: 'fields', label: 'Custom Fields' },
    { id: 'defaults', label: 'Default Values' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'financial', label: 'Financial' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;

  ngOnChanges(): void {
    this.moreOpen = false;
  }

  get icon() {
    return this.typeIcons[this.type.icon];
  }

  get sample(): string {
    return sampleTag(this.type.taggingFormat);
  }

  get currencyCode(): string {
    return this.type.currency.slice(0, 3);
  }

  // Asset models refer to their type by name
  get typeModels() {
    return this.models.ofType(this.type.name);
  }

  get assetCount(): number {
    return this.typeModels.reduce((sum, m) => sum + m.assetCount, 0);
  }

  /** How many of this type's models are filed under each subcategory. */
  get subcategoryRows() {
    const models = this.typeModels;
    return this.type.subcategories.map((name) => ({
      name,
      models: models.filter((m) => m.subcategories.some((s) => s.toLowerCase() === name.toLowerCase())).length
    }));
  }

  // Documents and the audit log are owned by other modules; empty until those APIs are wired
  readonly documentRows: { name: string; kind: string; size: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  editAt(tab: TypeFormTab): void {
    this.edit.emit({ type: this.type, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
