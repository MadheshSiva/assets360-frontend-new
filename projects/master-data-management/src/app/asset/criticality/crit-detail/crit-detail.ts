import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Box, ChevronDown, Copy, LucideAngularModule, Monitor, Pencil, Search, Trash2, Wrench } from 'lucide-angular';
import { formatDateTime } from '../../../organization/location/location.format';
import { LEVEL_ICONS } from '../../level-icons';
import { SCALE } from '../criticality.data';
import { CriticalityRecord, Scale } from '../criticality.model';
import { CritFormTab } from '../crit-form/crit-form';

type DetailTab = 'overview' | 'risk' | 'maintenance' | 'assets' | 'documents' | 'activity' | 'settings';

// Risk matrix shading from the lowest (likelihood + impact = 0) to the highest score (8)
const MATRIX_SHADES = ['#c9f0d8', '#d9f2cf', '#f3f4c8', '#fdf0c2', '#fde4b0', '#fdd7b4', '#fcc9c4', '#f9b4b4', '#f59e9e'];

/** Panel under the list showing the selected criticality level. */
@Component({
  selector: 'app-crit-detail',
  imports: [NgTemplateOutlet, LucideAngularModule],
  templateUrl: './crit-detail.html',
  styleUrls: [
    '../../../shared/styles/mdm-detail.css',
    '../../../shared/styles/mdm-detail-extras.css',
    '../../asset-model/model-detail/model-detail.css',
    '../../asset-type/type-detail/type-detail.css',
    '../../level-detail.css',
    '../../../shared/styles/mdm-purple-theme.css'
  ]
})
export class CritDetail implements OnChanges {
  @Input({ required: true }) level!: CriticalityRecord;
  @Output() edit = new EventEmitter<{ level: CriticalityRecord; tab?: CritFormTab }>();
  @Output() duplicate = new EventEmitter<CriticalityRecord>();
  @Output() makeDefault = new EventEmitter<CriticalityRecord>();
  @Output() toggleStatus = new EventEmitter<CriticalityRecord>();
  @Output() remove = new EventEmitter<CriticalityRecord>();

  readonly levelIcons = LEVEL_ICONS;
  readonly icons = { Pencil, Copy, Search, ChevronDown, Box, Monitor, Wrench, Trash2 };
  readonly formatDateTime = formatDateTime;
  // Likelihood runs top (Very High) to bottom; impact runs left (Very Low) to right
  readonly likelihoodRows = [...SCALE].reverse();
  readonly impactCols = SCALE;
  readonly impactFields: { key: keyof CriticalityRecord['businessImpact']; label: string }[] = [
    { key: 'safety', label: 'Safety Impact' },
    { key: 'operational', label: 'Operational Impact' },
    { key: 'financial', label: 'Financial Impact' },
    { key: 'regulatory', label: 'Regulatory Impact' },
    { key: 'reputation', label: 'Reputation Impact' },
    { key: 'environmental', label: 'Environmental Impact' }
  ];
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'risk', label: 'Risk & Impact' },
    { id: 'maintenance', label: 'Maintenance & Lifecycle' },
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

  get activeAssets(): number {
    const a = this.level.assets;
    return a.total - a.underMaintenance - a.retired;
  }

  shade(likelihood: Scale, impact: Scale): string {
    return MATRIX_SHADES[SCALE.indexOf(likelihood) + SCALE.indexOf(impact)];
  }

  isMarked(likelihood: Scale, impact: Scale): boolean {
    return this.level.likelihood === likelihood && this.level.impact === impact;
  }

  // Asset rows, documents and the audit log are owned by other modules; empty until those APIs are wired
  readonly assets: { tag: string; model: string; manufacturer: string; type: string; state: string }[] = [];
  readonly documentRows: { name: string; kind: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  editAt(tab: CritFormTab): void {
    this.edit.emit({ level: this.level, tab });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
