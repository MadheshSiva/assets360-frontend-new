import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap, throwError } from 'rxjs';
import { AssetServiceApi, MdmAudit, inSequence } from '../../shared/mdm-api';
import { AssetModelIcon } from '../asset-model/asset-model.icons';
import { AssetCondition, DepreciationMethod, TrackingMethod } from '../asset-model/asset-model.model';
import { CustomField, CustomFieldType } from '../asset-type/asset-type.model';
import { AssetStore, activeStatus, localStamp } from '../asset-store';
import { blankCategory } from './category.data';
import { CategoryFilters, CategoryRecord, SubcategoryRecord } from './category.model';

/** Master Data's settings for a category, stored by the Asset service as `details`. */
interface CategoryDetailsDto {
  assetType: string | null;
  icon: string | null;
  color: string | null;
  subcategories: { code: string; name: string; icon: string | null; color: string | null; status: string | null }[] | null;
  depreciationMethod: string | null;
  usefulLifeYears: number | null;
  costCenter: string | null;
  tagPrefix: string | null;
  trackingMethod: string | null;
  defaultCondition: string | null;
  subcategoryRequired: boolean;
  showInMobile: boolean;
  includeInReports: boolean;
  approvalForNewAssets: boolean;
}

/** A custom field as the Asset service lists it (fields inherited from parent categories included). */
interface CategoryFieldDto {
  id: string;
  fieldName: string;
  type: string;
  required: boolean;
  inherited: boolean;
}

/**
 * Asset category as the Asset service's `/api/asset-categories` returns it: the one list shared by the Assets pages,
 * Asset Registration and this page. Master Data's own settings come back in `details`.
 */
interface CategoryDto extends MdmAudit {
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  name: string;
  code: string;
  description: string | null;
  imageUrl: string | null;
  customFields: CategoryFieldDto[] | null;
  details: CategoryDetailsDto | null;
}

/** Master Data's custom field types ↔ the Asset service's ('Yes / No' is a 'Checkbox' there). */
const toAssetFieldType = (type: CustomFieldType): string => (type === 'Yes / No' ? 'Checkbox' : type);
const fromAssetFieldType = (type: string): CustomFieldType => (type === 'Checkbox' ? 'Yes / No' : ((type as CustomFieldType) || 'Text'));

/**
 * Asset categories and their subcategories, kept by the Asset service (`/api/asset-categories`) so every page uses the
 * same list. A category's parent is stored by id on the server and shown by code here; subcategories are saved by
 * saving their category; custom fields are saved through the category's custom-field endpoints.
 */
@Injectable({ providedIn: 'root' })
export class CategoryService extends AssetStore<CategoryRecord, CategoryDto> {
  protected readonly resource = 'asset-categories';
  protected override readonly api = inject(AssetServiceApi);
  /** The category's own custom fields on the server (by code, then lower-case field name → field). */
  private ownFields = new Map<string, Map<string, CategoryFieldDto>>();

  constructor() {
    super();
  }

  /** Saves the category, then adds / removes its custom fields to match the form. */
  override persist(record: CategoryRecord, originalCode: string | null): Observable<CategoryRecord> {
    return super.persist(record, originalCode).pipe(switchMap((saved) => this.syncCustomFields(record, saved)));
  }

  /** The Asset service has no status endpoint: a status change is an ordinary update. */
  override setStatus(record: CategoryRecord & { status: string }, status: string): Observable<CategoryRecord> {
    return this.persist({ ...record, status: activeStatus(status) }, record.code);
  }

  private syncCustomFields(wanted: CategoryRecord, saved: CategoryRecord): Observable<CategoryRecord> {
    const id = this.idOf(saved.code);
    if (!id) return of(saved);
    const current = this.ownFields.get(saved.code) ?? new Map<string, CategoryFieldDto>();
    const desired = new Map(wanted.customFields.filter((f) => f.name.trim()).map((f) => [f.name.trim().toLowerCase(), f]));
    const calls: Observable<unknown>[] = [];
    // Fields are added and removed (the API has no edit): a changed type or required flag is a remove + add
    for (const [key, field] of current) {
      const want = desired.get(key);
      if (!want || toAssetFieldType(want.type) !== field.type || want.required !== field.required) {
        calls.push(this.api.remove(`${this.resource}/${id}/custom-fields`, field.id));
      }
    }
    for (const [key, field] of desired) {
      const have = current.get(key);
      if (!have || toAssetFieldType(field.type) !== have.type || field.required !== have.required) {
        calls.push(this.api.create(`${this.resource}/${id}/custom-fields`, { fieldName: field.name.trim(), type: toAssetFieldType(field.type), required: field.required }));
      }
    }
    if (!calls.length) return of(saved);
    return inSequence(calls).pipe(
      switchMap(() => this.api.get<CategoryDto>(this.resource, id)),
      map((dto) => {
        const fresh = this.toRecord(dto);
        this.save(fresh, saved.code);
        return fresh;
      })
    );
  }

  /** Fills the list; parents are resolved from ids to codes once every category is known. */
  override load(query: Record<string, string | number | boolean | null | undefined> = {}): Observable<CategoryRecord[]> {
    return super.load(query).pipe(
      map(() => {
        this.records = this.records.map((r) => (r.parentCode && !this.find(r.parentCode) ? { ...r, parentCode: this.codeOfId(r.parentCode) } : r));
        return this.records;
      })
    );
  }

  /** A category's assets are the sum of its subcategories (counts owned by the Assets module). */
  assetsOf(category: CategoryRecord): number {
    return category.subcategories.reduce((sum, s) => sum + s.assets, 0);
  }

  children(code: string): CategoryRecord[] {
    return this.records.filter((r) => r.parentCode === code);
  }

  /** Parents from the top down, not including `code` itself. */
  ancestry(code: string | null): CategoryRecord[] {
    const chain: CategoryRecord[] = [];
    for (let c = this.find(code); c && chain.length < 20; c = this.find(c.parentCode)) chain.unshift(c);
    return chain;
  }

  /** `code` and every category under it, so none can become its own parent. */
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

  assetTypesInUse(): string[] {
    return [...new Set(this.records.map((r) => r.assetType))];
  }

  filter(f: CategoryFilters): CategoryRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.status || r.status === f.status) &&
        (!f.assetType || r.assetType === f.assetType) &&
        (!term || [r.name, r.code, r.description, ...r.subcategories.map((s) => s.name)].some((v) => v.toLowerCase().includes(term)))
    );
  }

  // Subcategory codes are unique across all categories
  isSubCodeTaken(code: string, exceptCode: string | null): boolean {
    const wanted = code.trim().toLowerCase();
    return this.records.some((r) => r.subcategories.some((s) => s.code.toLowerCase() === wanted && s.code !== exceptCode));
  }

  allSubCodes(): Set<string> {
    return new Set(this.records.flatMap((r) => r.subcategories.map((s) => s.code)));
  }

  /** Stores a saved category locally; child categories follow a code change. */
  override save(record: CategoryRecord, originalCode: string | null): void {
    super.save(record, originalCode);
    if (originalCode && originalCode !== record.code) {
      this.records = this.records.map((r) => (r.parentCode === originalCode ? { ...r, parentCode: record.code } : r));
    }
  }

  /** Deletes categories, children before their parents (the server refuses a parent that still has children). */
  deleteCategories(codes: string[]): Observable<unknown> {
    const depth = (code: string) => this.ancestry(code).length;
    const ordered = [...codes].sort((a, b) => depth(b) - depth(a));
    return inSequence(ordered.map((code) => this.delete([code])));
  }

  /** Adds or replaces a subcategory by saving its category. */
  saveSubcategory(categoryCode: string, sub: SubcategoryRecord, originalCode: string | null): Observable<CategoryRecord> {
    const category = this.find(categoryCode);
    if (!category) return throwError(() => new Error(`Category ${categoryCode} not found.`));
    const index = originalCode ? category.subcategories.findIndex((s) => s.code === originalCode) : -1;
    const subcategories = index >= 0 ? category.subcategories.map((s, i) => (i === index ? sub : s)) : [...category.subcategories, sub];
    return this.persist({ ...category, subcategories }, categoryCode);
  }

  removeSubcategories(categoryCode: string, codes: string[]): Observable<CategoryRecord> {
    const category = this.find(categoryCode);
    if (!category) return throwError(() => new Error(`Category ${categoryCode} not found.`));
    return this.persist({ ...category, subcategories: category.subcategories.filter((s) => !codes.includes(s.code)) }, categoryCode);
  }

  private codeOfId(id: string | null | undefined): string | null {
    return (id && this.records.find((r) => this.idOf(r.code) === id)?.code) || null;
  }

  protected toRecord(dto: CategoryDto): CategoryRecord {
    const blank = blankCategory();
    const d = dto.details;
    const parentId = dto.parentCategoryId ?? null;
    // Only the category's own fields are edited here; fields inherited from a parent belong to that parent
    const own = (dto.customFields ?? []).filter((f) => !f.inherited);
    this.ownFields.set(dto.code, new Map(own.map((f) => [f.fieldName.trim().toLowerCase(), f])));
    return {
      ...blank,
      code: dto.code,
      name: dto.name,
      assetType: d?.assetType ?? '',
      icon: (d?.icon as AssetModelIcon) ?? blank.icon,
      color: d?.color ?? blank.color,
      image: dto.imageUrl,
      description: dto.description ?? '',
      // Until every category is loaded the parent may still be its id; load() resolves it
      parentCode: this.codeOfId(parentId) ?? parentId,
      status: activeStatus(dto.status),
      subcategories: (d?.subcategories ?? []).map((s) => ({
        code: s.code,
        name: s.name,
        icon: (s.icon as AssetModelIcon) ?? blank.icon,
        color: s.color ?? blank.color,
        status: activeStatus(s.status),
        assets: 0
      })),
      depreciationMethod: (d?.depreciationMethod as DepreciationMethod) ?? blank.depreciationMethod,
      usefulLifeYears: d?.usefulLifeYears ?? blank.usefulLifeYears,
      costCenter: d?.costCenter ?? '',
      tagPrefix: d?.tagPrefix ?? '',
      trackingMethod: (d?.trackingMethod as TrackingMethod) ?? blank.trackingMethod,
      defaultCondition: (d?.defaultCondition as AssetCondition) ?? blank.defaultCondition,
      customFields: own.map((f): CustomField => ({ name: f.fieldName, type: fromAssetFieldType(f.type), required: f.required })),
      subcategoryRequired: d?.subcategoryRequired ?? blank.subcategoryRequired,
      showInMobile: d?.showInMobile ?? blank.showInMobile,
      includeInReports: d?.includeInReports ?? blank.includeInReports,
      approvalForNewAssets: d?.approvalForNewAssets ?? blank.approvalForNewAssets,
      createdOn: localStamp(dto.createdAt),
      createdBy: dto.createdBy ?? '',
      updatedOn: localStamp(dto.updatedAt ?? dto.createdAt)
    };
  }

  /** Body for POST / PUT `/api/asset-categories`; custom fields are saved separately (see persist). */
  protected toRequest(r: CategoryRecord): object {
    const parent = this.find(r.parentCode);
    const details: CategoryDetailsDto = {
      assetType: r.assetType || null,
      icon: r.icon,
      color: r.color,
      subcategories: r.subcategories.map(({ code, name, icon, color, status }) => ({ code, name, icon, color, status })),
      depreciationMethod: r.depreciationMethod,
      usefulLifeYears: r.usefulLifeYears,
      costCenter: r.costCenter,
      tagPrefix: r.tagPrefix,
      trackingMethod: r.trackingMethod,
      defaultCondition: r.defaultCondition,
      subcategoryRequired: r.subcategoryRequired,
      showInMobile: r.showInMobile,
      includeInReports: r.includeInReports,
      approvalForNewAssets: r.approvalForNewAssets
    };
    return {
      parentCategoryId: parent ? (this.idOf(parent.code) ?? null) : null,
      name: r.name,
      code: r.code,
      description: r.description,
      status: r.status,
      imageUrl: r.image,
      details
    };
  }
}
