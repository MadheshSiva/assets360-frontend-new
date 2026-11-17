import { Injectable, inject } from '@angular/core';
import { AssetTypeService } from '../asset-type/asset-type.service';
import { FALLBACK_PARENT_TYPES, SEED_SUB_TYPES } from './asset-sub-type.data';
import { AssetSubTypeFilters, AssetSubTypeRecord } from './asset-sub-type.model';

/**
 * Asset sub types, kept in memory from hardcoded seed data until the master data API has the resource.
 * Parent asset types come from the Asset Type master, with a hardcoded list when it has none.
 */
@Injectable({ providedIn: 'root' })
export class AssetSubTypeService {
  private readonly types = inject(AssetTypeService);
  private records: AssetSubTypeRecord[] = structuredClone(SEED_SUB_TYPES);

  all(): AssetSubTypeRecord[] {
    return this.records;
  }

  find(code: string | null | undefined): AssetSubTypeRecord | undefined {
    return code ? this.records.find((r) => r.code === code) : undefined;
  }

  isCodeTaken(code: string, exceptCode: string | null): boolean {
    const c = code.trim().toLowerCase();
    return this.records.some((r) => r.code.toLowerCase() === c && r.code !== exceptCode);
  }

  /** Names only need to be unique under the same parent type. */
  isNameTaken(name: string, assetType: string, exceptCode: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.records.some((r) => r.assetType === assetType && r.name.toLowerCase() === n && r.code !== exceptCode);
  }

  /** Parent asset type names: the Asset Type master's active types, plus the fallback list and any already used. */
  parentTypes(): string[] {
    const live = this.types.active().map((t) => t.name);
    return [...new Set([...live, ...FALLBACK_PARENT_TYPES.map((t) => t.name), ...this.records.map((r) => r.assetType)])].sort();
  }

  categoryOf(typeName: string): string {
    return this.types.findByName(typeName)?.category ?? FALLBACK_PARENT_TYPES.find((t) => t.name === typeName)?.category ?? '';
  }

  subcategoriesOf(typeName: string): string[] {
    const live = this.types.findByName(typeName)?.subcategories;
    return live?.length ? live : (FALLBACK_PARENT_TYPES.find((t) => t.name === typeName)?.subcategories ?? []);
  }

  filter(f: AssetSubTypeFilters): AssetSubTypeRecord[] {
    const term = f.search.trim().toLowerCase();
    return this.records.filter(
      (r) =>
        (!f.status || r.status === f.status) &&
        (!f.assetType || r.assetType === f.assetType) &&
        (!term || [r.name, r.code, r.assetType, r.category, r.description].some((v) => v.toLowerCase().includes(term)))
    );
  }

  save(record: AssetSubTypeRecord, originalCode: string | null): AssetSubTypeRecord {
    const i = originalCode ? this.records.findIndex((r) => r.code === originalCode) : -1;
    this.records = i >= 0 ? this.records.map((r, j) => (j === i ? record : r)) : [record, ...this.records];
    return record;
  }

  setStatus(record: AssetSubTypeRecord, status: AssetSubTypeRecord['status']): AssetSubTypeRecord {
    return this.save({ ...record, status }, record.code);
  }

  delete(codes: string[]): void {
    this.records = this.records.filter((r) => !codes.includes(r.code));
  }
}
