import { Injectable } from '@angular/core';
import { MdmAudit } from '../../shared/mdm-api';
import { OrganizationFilters, OrganizationRecord, OrganizationStatus, OrganizationType } from './organization.model';
import { StructureAddressDto, StructureContactDto, StructureReference, fromApiAddress, toLocalStamp } from '../structure-api';
import { StructureStore } from '../structure-store';

interface OrganizationDto extends MdmAudit {
  organizationName: string;
  code: string;
  logoUrl: string | null;
  type: string | null;
  parentOrganization: StructureReference | null;
  registrationNumber: string | null;
  website: string | null;
  description: string | null;
  address: StructureAddressDto | null;
  contact: StructureContactDto | null;
  settings: OrganizationRecord['settings'] | null;
}

/** Organizations from `/api/master-data/organizations`, keyed by code; the parent is kept as a code too. */
@Injectable({ providedIn: 'root' })
export class OrganizationService extends StructureStore<OrganizationRecord, OrganizationDto> {
  protected readonly resource = 'organizations';

  constructor() {
    super();
  }

  /** Business unit and site counts come from those masters. */
  applyCounts(businessUnits: (code: string) => number, sites: (code: string) => number): void {
    this.records = this.records.map((r) => ({ ...r, businessUnits: businessUnits(r.code), sites: sites(r.code) }));
  }

  children(code: string): OrganizationRecord[] {
    return this.records.filter((r) => r.parentCode === code);
  }

  /** Top-level organization first, ending with `code` itself. */
  ancestry(code: string | null): OrganizationRecord[] {
    const chain: OrganizationRecord[] = [];
    for (let r = this.find(code); r && chain.length < 20; r = this.find(r.parentCode)) {
      chain.unshift(r);
    }
    return chain;
  }

  /** `code` and everything below it, so it can't be chosen as its own parent. */
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

  filter(f: OrganizationFilters): OrganizationRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.status || r.status === f.status) &&
        (!f.type || r.type === f.type) &&
        (!term ||
          [r.name, r.code, r.type, this.find(r.parentCode)?.name ?? ''].some((v) => v.toLowerCase().includes(term)))
    );
  }

  stats() {
    const active = this.records.filter((r) => r.status === 'Active').length;
    return {
      total: this.records.length,
      active,
      inactive: this.records.length - active,
      topLevel: this.records.filter((r) => !r.parentCode).length,
      businessUnits: this.records.reduce((sum, r) => sum + r.businessUnits, 0),
      sites: this.records.reduce((sum, r) => sum + r.sites, 0)
    };
  }

  protected toRecord(dto: OrganizationDto): OrganizationRecord {
    const c = dto.contact;
    const s = dto.settings;
    const known = this.find(dto.code);
    return {
      code: dto.code,
      name: dto.organizationName,
      type: (dto.type ?? '') as OrganizationType,
      // Parent id for now; StructureStore swaps it for the code
      parentCode: dto.parentOrganization?.id ?? null,
      logo: dto.logoUrl,
      registrationNumber: dto.registrationNumber ?? '',
      website: dto.website ?? '',
      description: dto.description ?? '',
      businessUnits: known?.businessUnits ?? 0,
      sites: known?.sites ?? 0,
      status: (dto.status as OrganizationStatus) ?? 'Active',
      address: fromApiAddress(dto.address),
      contact: {
        person: c?.name ?? '',
        designation: c?.designation ?? '',
        email: c?.email ?? '',
        phoneCountry: c?.phoneCountry ?? 'United Arab Emirates',
        phone: c?.phone ?? ''
      },
      settings: {
        currency: s?.currency ?? '',
        timeZone: s?.timeZone ?? '',
        language: s?.language ?? '',
        dateFormat: s?.dateFormat ?? '',
        effectiveFrom: s?.effectiveFrom ?? '',
        effectiveTo: s?.effectiveTo ?? '',
        allowSubOrganizations: s?.allowSubOrganizations ?? false,
        allowMultipleLocations: s?.allowMultipleLocations ?? false,
        useForAssetNumbering: s?.useForAssetNumbering ?? false,
        enableFinancialTracking: s?.enableFinancialTracking ?? false
      },
      createdOn: toLocalStamp(dto.createdAt),
      updatedOn: toLocalStamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  protected toRequest(r: OrganizationRecord): object {
    return {
      organizationName: r.name,
      code: r.code,
      logoUrl: r.logo,
      type: r.type || null,
      parentOrganization: this.refOf(r.parentCode),
      registrationNumber: r.registrationNumber,
      website: r.website,
      description: r.description,
      address: r.address,
      contact: { name: r.contact.person, designation: r.contact.designation, email: r.contact.email, phoneCountry: r.contact.phoneCountry, phone: r.contact.phone },
      settings: { ...r.settings, effectiveFrom: r.settings.effectiveFrom || null, effectiveTo: r.settings.effectiveTo || null },
      status: r.status
    };
  }
}
