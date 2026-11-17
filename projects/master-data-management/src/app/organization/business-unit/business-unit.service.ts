import { Injectable, inject } from '@angular/core';
import { Observable, switchMap } from 'rxjs';
import { MdmAudit } from '../../shared/mdm-api';
import { OrganizationService } from '../organization/organization.service';
import { StructureAddressDto, StructureReference, fromApiAddress, toLocalStamp } from '../structure-api';
import { StructureStore } from '../structure-store';
import { blankBusinessUnit } from './business-unit.data';
import { BusinessUnitFilters, BusinessUnitIcon, BusinessUnitRecord, BusinessUnitStatus } from './business-unit.model';

interface BusinessUnitDto extends MdmAudit {
  businessUnitName: string;
  code: string;
  logoUrl: string | null;
  parentOrganization: StructureReference | null;
  parentBusinessUnit: StructureReference | null;
  icon: string | null;
  description: string | null;
  head: string | null;
  costCenter: string | null;
  currency: string | null;
  address: StructureAddressDto | null;
  contactEmail: string | null;
  phoneCountry: string | null;
  phone: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  allowSites: boolean;
  budgetTracking: boolean;
  assetNumbering: boolean;
  approvals: boolean;
}

/**
 * Business units from `/api/master-data/business-units`, keyed by code. The organization is kept
 * as its code, so organizations load first. Departments and sites point at units themselves.
 */
@Injectable({ providedIn: 'root' })
export class BusinessUnitService extends StructureStore<BusinessUnitRecord, BusinessUnitDto> {
  protected readonly resource = 'business-units';
  private readonly organizations = inject(OrganizationService);

  constructor() {
    super();
  }

  override load(query: Record<string, string | number | boolean | null | undefined> = {}): Observable<BusinessUnitRecord[]> {
    return this.organizations.ensureLoaded().pipe(switchMap(() => super.load(query)));
  }

  names(): string[] {
    return this.records.map((r) => r.name);
  }

  children(code: string): BusinessUnitRecord[] {
    return this.records.filter((r) => r.parentCode === code);
  }

  /** `code` and every unit under it, so none can become its own parent. */
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

  filter(f: BusinessUnitFilters): BusinessUnitRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.status || r.status === f.status) &&
        (!f.organizationCode || r.organizationCode === f.organizationCode) &&
        (!term || [r.name, r.code, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected toRecord(dto: BusinessUnitDto): BusinessUnitRecord {
    const blank = blankBusinessUnit();
    const org = dto.parentOrganization;
    return {
      code: dto.code,
      name: dto.businessUnitName,
      organizationCode: this.organizations.codeOf(org?.id) ?? '',
      // Parent id for now; StructureStore swaps it for the code
      parentCode: dto.parentBusinessUnit?.id ?? null,
      icon: (dto.icon ?? blank.icon) as BusinessUnitIcon,
      logo: dto.logoUrl,
      description: dto.description ?? '',
      head: dto.head ?? '',
      costCenter: dto.costCenter ?? '',
      currency: dto.currency ?? '',
      status: (dto.status as BusinessUnitStatus) ?? 'Active',
      address: fromApiAddress(dto.address),
      contactEmail: dto.contactEmail ?? '',
      phoneCountry: dto.phoneCountry ?? 'United Arab Emirates',
      phone: dto.phone ?? '',
      effectiveFrom: dto.effectiveFrom ?? '',
      effectiveTo: dto.effectiveTo ?? '',
      allowSites: dto.allowSites,
      budgetTracking: dto.budgetTracking,
      assetNumbering: dto.assetNumbering,
      approvals: dto.approvals,
      createdOn: toLocalStamp(dto.createdAt),
      updatedOn: toLocalStamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: BusinessUnitRecord): object {
    return {
      businessUnitName: r.name,
      code: r.code,
      logoUrl: r.logo,
      parentOrganization: this.organizations.refOf(r.organizationCode),
      parentBusinessUnit: this.refOf(r.parentCode),
      icon: r.icon,
      description: r.description,
      head: r.head,
      costCenter: r.costCenter,
      currency: r.currency,
      address: r.address,
      contactEmail: r.contactEmail,
      phoneCountry: r.phoneCountry,
      phone: r.phone,
      effectiveFrom: r.effectiveFrom || null,
      effectiveTo: r.effectiveTo || null,
      allowSites: r.allowSites,
      budgetTracking: r.budgetTracking,
      assetNumbering: r.assetNumbering,
      approvals: r.approvals,
      status: r.status
    };
  }
}
