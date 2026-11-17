import { Component, EventEmitter, HostListener, Input, OnChanges, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Boxes, ChevronDown, Copy, Cpu, ListChecks, LucideAngularModule, Pencil, Wrench } from 'lucide-angular';
import { formatDateTime } from '../../../organization/location/location.format';
import { sampleTag } from '../../asset-model/asset-model.data';
import { MODEL_ICONS } from '../../asset-model/asset-model.icons';
import { AssetSubTypeRecord } from '../asset-sub-type.model';
import { SubTypeFormTab } from '../sub-type-form/sub-type-form';

type DetailTab = 'overview' | 'specifications' | 'fields' | 'lifecycle' | 'defaults' | 'activity';

/** Panel under the list showing the selected asset sub type. */
@Component({
  selector: 'app-sub-type-detail',
  imports: [DecimalPipe, LucideAngularModule],
  templateUrl: './sub-type-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    '../../asset-type/type-detail/type-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class SubTypeDetail implements OnChanges {
  @Input({ required: true }) subType!: AssetSubTypeRecord;
  @Output() edit = new EventEmitter<{ subType: AssetSubTypeRecord; tab?: SubTypeFormTab }>();
  @Output() duplicate = new EventEmitter<AssetSubTypeRecord>();
  @Output() toggleStatus = new EventEmitter<AssetSubTypeRecord>();
  @Output() remove = new EventEmitter<AssetSubTypeRecord>();

  readonly typeIcons = MODEL_ICONS;
  readonly icons = { Pencil, Copy, ChevronDown, Cpu, Boxes, Wrench, ListChecks };
  readonly formatDateTime = formatDateTime;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'fields', label: 'Custom Fields' },
    { id: 'lifecycle', label: 'Lifecycle & Maintenance' },
    { id: 'defaults', label: 'Default Values' },
    { id: 'activity', label: 'Activity Log' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;

  ngOnChanges(): void {
    this.moreOpen = false;
  }

  get icon() {
    return this.typeIcons[this.subType.icon];
  }

  get sample(): string {
    return sampleTag(this.subType.taggingFormat);
  }

  /** Hardcoded activity built from the record's own stamps until the audit API is wired. */
  get activity(): { when: string; who: string; text: string }[] {
    const s = this.subType;
    const rows = [];
    if (s.updatedOn && s.updatedOn !== s.createdOn) rows.push({ when: s.updatedOn, who: s.createdBy || 'admin', text: 'updated this sub type' });
    if (s.createdOn) rows.push({ when: s.createdOn, who: s.createdBy || 'admin', text: `created this sub type under ${s.assetType}` });
    return rows;
  }

  editAt(tab: SubTypeFormTab): void {
    this.edit.emit({ subType: this.subType, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
