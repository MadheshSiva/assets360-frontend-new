import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { MasterIcon } from '../../shared/master-icons';
import { MdmAudit } from '../../shared/mdm-api';
import { BusinessUnitService } from '../business-unit/business-unit.service';
import { StructureReference, toLocalStamp } from '../structure-api';
import { StructureStore } from '../structure-store';
import { blankDepartment } from './department.data';
import { DepartmentFilters, DepartmentRecord, DepartmentStatus, DepartmentType } from './department.model';

interface DepartmentDto extends MdmAudit {
  departmentName: string;
  code: string;
  businessUnit: StructureReference | null;
  departmentHead: StructureReference | null;
  employeeCount: number;
  assetCount: number;
  parentDepartment: StructureReference | null;
  icon: string | null;
  logoUrl: string | null;
  type: string | null;
  deputy: string | null;
  costCenter: string | null;
  description: string | null;
  email: string | null;
  phoneCountry: string | null;
  phone: string | null;
  annualBudget: number | null;
  currency: string | null;
  glCode: string | null;
  approvalLimit: number | null;
  allowAssetOwnership: boolean;
  requireAssignmentApproval: boolean;
  includeInCostAllocation: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/**
 * Departments from `/api/master-data/departments`, keyed by code. The business unit is kept as
 * its code, so business units load first. Employee and asset counts come from the API.
 */
@Injectable({ providedIn: 'root' })
export class DepartmentService extends StructureStore<DepartmentRecord, DepartmentDto> {
  protected readonly resource = 'departments';
  private readonly businessUnits = inject(BusinessUnitService);

  constructor() {
    super();
  }

  override load(query: Record<string, string | number | boolean | null | undefined> = {}): Observable<DepartmentRecord[]> {
    return this.businessUnits.ensureLoaded().pipe(switchMap(() => super.load(query)));
  }

  ofBusinessUnit(businessUnitCode: string): DepartmentRecord[] {
    return this.records.filter((r) => r.businessUnitCode === businessUnitCode);
  }

  /** Department names for a business unit (by its code), for pickers on other masters. */
  names(businessUnitCode = ''): string[] {
    return this.records.filter((r) => !businessUnitCode || r.businessUnitCode === businessUnitCode).map((r) => r.name);
  }

  children(code: string): DepartmentRecord[] {
    return this.records.filter((r) => r.parentCode === code);
  }

  ancestry(code: string | null): DepartmentRecord[] {
    const chain: DepartmentRecord[] = [];
    for (let r = this.find(code); r && chain.length < 20; r = this.find(r.parentCode)) chain.unshift(r);
    return chain;
  }

  /** `code` and every department under it, so none can become its own parent. */
  descendantCodes(code: string): Set<string> {
    const found = new Set([code]);
    for (let added = true; added; ) {
      added = false;
      for (const r of this.records) {
        if (r.parentCode && found.has(r.parentCode) && !found.has(r.code)) {
          found.add(r.code);
          added = true;
        }
      }
    }
    return found;
  }

  filter(f: DepartmentFilters, businessUnitName: (code: string) => string): DepartmentRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.businessUnitCode || r.businessUnitCode === f.businessUnitCode) &&
        (!f.status || r.status === f.status) &&
        (!term || [r.name, r.code, r.description, businessUnitName(r.businessUnitCode)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  /** Keeps departments attached when their business unit's code changes. */
  renameBusinessUnit(oldCode: string, newCode: string): void {
    if (oldCode === newCode) return;
    this.records = this.records.map((r) => (r.businessUnitCode === oldCode ? { ...r, businessUnitCode: newCode } : r));
  }

  protected toRecord(dto: DepartmentDto): DepartmentRecord {
    const blank = blankDepartment();
    const known = this.find(dto.code);
    return {
      code: dto.code,
      name: dto.departmentName,
      businessUnitCode: this.businessUnits.codeOf(dto.businessUnit?.id) ?? '',
      // Parent id for now; StructureStore swaps it for the code
      parentCode: dto.parentDepartment?.id ?? null,
      icon: (dto.icon ?? blank.icon) as MasterIcon,
      logo: dto.logoUrl,
      type: (dto.type ?? '') as DepartmentType,
      head: dto.departmentHead?.name ?? '',
      deputy: dto.deputy ?? '',
      costCenter: dto.costCenter ?? '',
      description: dto.description ?? '',
      status: (dto.status as DepartmentStatus) ?? 'Active',
      employees: dto.employeeCount ?? 0,
      assets: dto.assetCount ?? 0,
      // Work orders live in another module; not counted here
      openWorkOrders: known?.openWorkOrders ?? 0,
      email: dto.email ?? '',
      phoneCountry: dto.phoneCountry ?? 'United Arab Emirates',
      phone: dto.phone ?? '',
      annualBudget: dto.annualBudget ?? null,
      currency: dto.currency ?? '',
      glCode: dto.glCode ?? '',
      approvalLimit: dto.approvalLimit ?? null,
      allowAssetOwnership: dto.allowAssetOwnership,
      requireAssignmentApproval: dto.requireAssignmentApproval,
      includeInCostAllocation: dto.includeInCostAllocation,
      effectiveFrom: dto.effectiveFrom ?? '',
      effectiveTo: dto.effectiveTo ?? '',
      createdOn: toLocalStamp(dto.createdAt),
      updatedOn: toLocalStamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: DepartmentRecord): object {
    return {
      departmentName: r.name,
      code: r.code,
      businessUnit: this.businessUnits.refOf(r.businessUnitCode),
      // The head is picked from a name list, so it is stored by name
      departmentHead: r.head.trim() ? { id: null, name: r.head.trim() } : null,
      parentDepartment: this.refOf(r.parentCode),
      icon: r.icon,
      logoUrl: r.logo,
      type: r.type || null,
      deputy: r.deputy,
      costCenter: r.costCenter,
      description: r.description,
      email: r.email,
      phoneCountry: r.phoneCountry,
      phone: r.phone,
      annualBudget: r.annualBudget,
      currency: r.currency,
      glCode: r.glCode,
      approvalLimit: r.approvalLimit,
      allowAssetOwnership: r.allowAssetOwnership,
      requireAssignmentApproval: r.requireAssignmentApproval,
      includeInCostAllocation: r.includeInCostAllocation,
      effectiveFrom: r.effectiveFrom || null,
      effectiveTo: r.effectiveTo || null,
      status: r.status
    };
  }
}
