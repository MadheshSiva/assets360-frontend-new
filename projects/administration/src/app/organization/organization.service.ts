import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { LocationType, OrgLocation, SummaryRow, SummaryStat, SummaryTab } from './organization.model';
import { seedLocations, seedSummaryTabs } from './organization.data';

/** A readable message for a failed location action. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** DEMO MODE: the location hierarchy and master data summaries live in memory, seeded from organization.data.ts. */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly locations = signal<OrgLocation[]>(seedLocations());
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Master data summary tabs (Asset, People, Vendor, ...)
  private readonly tabs: SummaryTab[] = seedSummaryTabs();

  load(): void {
    // the hierarchy is already in memory
  }

  all(): OrgLocation[] {
    return this.locations();
  }

  find(code: string | null): OrgLocation | undefined {
    return code ? this.locations().find((l) => l.code === code) : undefined;
  }

  ofType(type: LocationType): OrgLocation[] {
    return this.locations().filter((l) => l.type === type);
  }

  childrenOf(code: string | null): OrgLocation[] {
    return this.locations().filter((l) => l.parent === code);
  }

  /** Every code below the given node. */
  descendantsOf(code: string): string[] {
    const out: string[] = [];
    const walk = (c: string) => {
      for (const child of this.childrenOf(c)) {
        out.push(child.code);
        walk(child.code);
      }
    };
    walk(code);
    return out;
  }

  /** Ancestors from the top-level location down to the direct parent. */
  ancestorsOf(code: string): OrgLocation[] {
    const out: OrgLocation[] = [];
    let current = this.find(this.find(code)?.parent ?? null);
    while (current) {
      out.unshift(current);
      current = this.find(current.parent);
    }
    return out;
  }

  codeTaken(code: string, except: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.locations().some((l) => l.code.toUpperCase() === c && l.code !== except);
  }

  /** Two siblings can't share a name. */
  nameTaken(name: string, parent: string | null, except: string | null): boolean {
    const n = name.trim().toLowerCase();
    return this.locations().some((l) => l.parent === parent && l.name.toLowerCase() === n && l.code !== except);
  }

  nextCode(): string {
    const max = this.locations().reduce((m, l) => Math.max(m, Number(l.code.replace(/\D/g, '')) || 0), 0);
    return `LOC-${String(max + 1).padStart(3, '0')}`;
  }

  create(record: OrgLocation): Observable<OrgLocation> {
    const saved = { ...record };
    this.locations.update((list) => [...list, saved]);
    return of(saved);
  }

  /** Saves the record; children follow a changed code. */
  update(record: OrgLocation, originalCode: string): Observable<OrgLocation> {
    const saved = { ...record };
    this.locations.update((list) =>
      list.map((l) => {
        if (l.code === originalCode) return saved;
        if (l.parent === originalCode) return { ...l, parent: saved.code };
        return l;
      })
    );
    return of(saved);
  }

  remove(codes: string[]): Observable<void> {
    const gone = new Set(codes);
    this.locations.update((list) => list.filter((l) => !gone.has(l.code)));
    return of(undefined);
  }

  /* ===== Summary tabs ===== */

  tab(id: string): SummaryTab | undefined {
    return this.tabs.find((t) => t.id === id);
  }

  statValue(tab: SummaryTab, stat: SummaryStat): number {
    const rows: SummaryRow[] = tab.rows;
    const col = stat.column ?? '';
    switch (stat.kind) {
      case 'total':
        return rows.length;
      case 'match':
        return rows.filter((r) => (stat.values ?? []).includes(r[col])).length;
      case 'distinct':
        return new Set(rows.map((r) => r[col])).size;
      case 'sum':
        return rows.reduce((s, r) => s + (Number(r[col]) || 0), 0);
    }
  }
}
