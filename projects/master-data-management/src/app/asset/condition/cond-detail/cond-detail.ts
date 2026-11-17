import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Box, ChevronDown, Copy, LucideAngularModule, Pencil, Search, ShieldCheck, TriangleAlert, Wrench } from 'lucide-angular';
import { formatDateTime } from '../../../organization/location/location.format';
import { LEVEL_ICONS } from '../../level-icons';
import { ConditionRecord } from '../condition.model';
import { ConditionService } from '../condition.service';
import { CondFormTab } from '../cond-form/cond-form';

type DetailTab = 'overview' | 'health' | 'usage' | 'assets' | 'documents' | 'activity' | 'settings';

/** Panel under the list showing the selected condition. */
@Component({
  selector: 'app-cond-detail',
  imports: [DecimalPipe, LucideAngularModule],
  templateUrl: './cond-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    '../../asset-type/type-detail/type-detail.css',
    '../../level-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class CondDetail implements OnChanges {
  @Input({ required: true }) condition!: ConditionRecord;
  @Output() edit = new EventEmitter<{ condition: ConditionRecord; tab?: CondFormTab }>();
  @Output() duplicate = new EventEmitter<ConditionRecord>();
  @Output() makeDefault = new EventEmitter<ConditionRecord>();
  @Output() toggleStatus = new EventEmitter<ConditionRecord>();
  @Output() remove = new EventEmitter<ConditionRecord>();

  readonly service = inject(ConditionService);
  readonly levelIcons = LEVEL_ICONS;
  readonly icons = { Pencil, Copy, Search, ChevronDown, Box, Wrench, TriangleAlert, ShieldCheck };
  readonly formatDateTime = formatDateTime;
  readonly characteristicFields: { key: keyof ConditionRecord['characteristics']; label: string }[] = [
    { key: 'physicalState', label: 'Physical State' },
    { key: 'functionality', label: 'Functionality' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'maintenanceNeed', label: 'Maintenance Need' },
    { key: 'expectedRemainingLife', label: 'Expected Remaining Life' }
  ];
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'health', label: 'Health & Visual' },
    { id: 'usage', label: 'Usage & Rules' },
    { id: 'assets', label: 'Assets' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' },
    { id: 'settings', label: 'Settings' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;

  ngOnChanges(): void {
    this.moreOpen = false;
  }

  names(codes: string[]): string {
    return codes.map((c) => this.service.nameOf(c)).join(', ') || 'None';
  }

  // Asset rows, documents and the audit log are owned by other modules; empty until those APIs are wired
  readonly assets: { tag: string; model: string; manufacturer: string; type: string }[] = [];
  readonly documentRows: { name: string; kind: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  editAt(tab: CondFormTab): void {
    this.edit.emit({ condition: this.condition, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
