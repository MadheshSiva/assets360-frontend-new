import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ArrowRight, Boxes, Building2, ChevronDown, FileText, History, LucideAngularModule, MapPin, Network, Pencil, Users } from 'lucide-angular';
import { formatDateTime } from '../../location/location.format';
import { OrganizationService } from '../../organization/organization.service';
import { DepartmentService } from '../../department/department.service';
import { SiteService } from '../../site/site.service';
import { MASTER_ICONS } from '../../../shared/master-icons';
import { BusinessUnitRecord } from '../business-unit.model';
import { BusinessUnitService } from '../business-unit.service';

type DetailTab = 'overview' | 'sites' | 'departments' | 'assets' | 'people' | 'costCenters' | 'documents' | 'activity';

interface HierarchyRow {
  key: string;
  label: string;
  level: number;
  current: boolean;
  kind: 'org' | 'unit' | 'site';
  code: string | null;
}

// Sites listed under the unit in the hierarchy card
const SITE_PREVIEW = 4;

/** Panel under the list showing the selected business unit. */
@Component({
  selector: 'app-bu-detail',
  imports: [DecimalPipe, LucideAngularModule],
  templateUrl: './bu-detail.html',
  styleUrls: ['../../../shared/styles/mdm-detail.css', '../../../shared/styles/mdm-detail-extras.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class BuDetail implements OnChanges {
  @Input({ required: true }) unit!: BusinessUnitRecord;
  @Output() edit = new EventEmitter<BusinessUnitRecord>();
  @Output() toggleStatus = new EventEmitter<BusinessUnitRecord>();
  @Output() remove = new EventEmitter<BusinessUnitRecord>();
  @Output() select = new EventEmitter<string>();
  @Output() addSubUnit = new EventEmitter<BusinessUnitRecord>();

  readonly service = inject(BusinessUnitService);
  readonly sites = inject(SiteService);
  readonly departmentService = inject(DepartmentService);
  readonly organizations = inject(OrganizationService);
  readonly logoIcons = MASTER_ICONS;
  readonly icons = { Pencil, ChevronDown, Network, MapPin, Boxes, Users, FileText, History, ArrowRight, Building2 };
  readonly formatDateTime = formatDateTime;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sites', label: 'Sites' },
    { id: 'departments', label: 'Departments' },
    { id: 'assets', label: 'Assets' },
    { id: 'people', label: 'People' },
    { id: 'costCenters', label: 'Cost Centers' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;
  hierarchy: HierarchyRow[] = [];

  ngOnChanges(): void {
    this.moreOpen = false;
    this.hierarchy = this.buildHierarchy();
  }

  get organizationName(): string {
    return this.organizations.find(this.unit.organizationCode)?.name ?? this.unit.organizationCode;
  }

  get parentUnit(): BusinessUnitRecord | undefined {
    return this.service.find(this.unit.parentCode);
  }

  get unitSites() {
    return this.sites.ofBusinessUnit(this.unit.name);
  }

  get assetTotal(): number {
    return this.unitSites.reduce((sum, s) => sum + s.assets, 0);
  }

  get peopleTotal(): number {
    return this.unitSites.reduce((sum, s) => sum + s.people, 0);
  }

  get unitDepartments() {
    return this.departmentService.ofBusinessUnit(this.unit.code);
  }

  // Rows owned by other modules (Assets, People, Finance, Documents, audit log); empty until those APIs are wired
  readonly assetRows: { tag: string; name: string; category: string; site: string }[] = [];
  readonly peopleRows: { name: string; role: string; site: string }[] = [];
  readonly documents: { name: string; kind: string; size: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  // The unit's own cost center from the record; budgets come from Finance
  get costCenterRows(): { code: string; name: string; budget: number | null }[] {
    return this.unit.costCenter ? [{ code: this.unit.costCenter, name: this.unit.name, budget: null }] : [];
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }

  /** Organization chain > parent units > this unit > its sub-units and sites. */
  private buildHierarchy(): HierarchyRow[] {
    const u = this.unit;
    const rows: HierarchyRow[] = this.organizations
      .ancestry(u.organizationCode)
      .map((o, i) => ({ key: `org:${o.code}`, label: o.name, level: i + 1, current: false, kind: 'org' as const, code: null }));
    const chain: BusinessUnitRecord[] = [];
    for (let p = this.service.find(u.parentCode); p && chain.length < 10; p = this.service.find(p.parentCode)) chain.unshift(p);
    [...chain, u].forEach((b) =>
      rows.push({ key: `bu:${b.code}`, label: b.name, level: rows.length + 1, current: b.code === u.code, kind: 'unit', code: b.code })
    );
    const level = rows.length + 1;
    this.service.children(u.code).forEach((c) => rows.push({ key: `bu:${c.code}`, label: c.name, level, current: false, kind: 'unit', code: c.code }));
    this.unitSites.slice(0, SITE_PREVIEW).forEach((s) => rows.push({ key: `site:${s.id}`, label: s.name, level, current: false, kind: 'site', code: null }));
    return rows;
  }
}
