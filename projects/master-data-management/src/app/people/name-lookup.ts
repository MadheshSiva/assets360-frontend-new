import { Injectable, inject } from '@angular/core';
import { MdmApi } from '../shared/mdm-api';
import { MdmRef } from './people.data';

/**
 * Id-by-name lookup of a master owned by another page (departments, asset types), used to link records
 * that pick it by name. Names not found are sent without an id and kept as typed by the API.
 */
class NameLookup {
  private byName = new Map<string, string>();
  private nameList: string[] = [];
  private loaded = false;

  constructor(
    private readonly api: MdmApi,
    private readonly resource: string,
    private readonly nameOf: (dto: Record<string, unknown>) => string
  ) {}

  ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.api.list<Record<string, unknown> & { id: string }>(this.resource).subscribe({
      next: (dtos) => {
        this.byName = new Map(dtos.map((d) => [this.nameOf(d).toLowerCase(), d.id]));
        this.nameList = dtos.map((d) => this.nameOf(d)).filter(Boolean).sort((a, b) => a.localeCompare(b));
      },
      error: () => (this.loaded = false)
    });
  }

  /** Names loaded from the API, for pick lists; empty until loaded. */
  get names(): string[] {
    return this.nameList;
  }

  ref(name: string | null | undefined): MdmRef | null {
    const text = (name ?? '').trim();
    return text ? { id: this.byName.get(text.toLowerCase()) ?? null, name: text } : null;
  }
}

@Injectable({ providedIn: 'root' })
export class MasterLookups {
  private readonly api = inject(MdmApi);
  readonly departments = new NameLookup(this.api, 'departments', (d) => String(d['departmentName'] ?? ''));
  readonly assetTypes = new NameLookup(this.api, 'asset-types', (d) => String(d['assetTypeName'] ?? ''));
}
