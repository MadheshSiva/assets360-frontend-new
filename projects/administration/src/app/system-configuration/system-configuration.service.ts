import { Injectable, computed, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CURRENT_USER } from '../shared/admin-common';
import { ConfigChange, ConfigSection, ConfigSetting, ConfigValue, SEED_CHANGES, buildSections } from './system-configuration.data';

export type ConfigValues = Record<string, ConfigValue>;

// DEMO MODE: settings, the review queue and the change history are held in memory (static demo data)
@Injectable({ providedIn: 'root' })
export class SystemConfigurationService {
  readonly sections = signal<ConfigSection[]>(buildSections());
  readonly changes = signal<ConfigChange[]>(SEED_CHANGES.map((c) => ({ ...c })));
  readonly loading = signal(false);

  readonly pending = computed(() => this.changes().filter((c) => c.status === 'Pending'));

  /** Changes newest first. */
  readonly history = computed(() => [...this.changes()].sort((a, b) => b.date.localeCompare(a.date)));

  private nextChange = 108;

  allSettings(): ConfigSetting[] {
    return this.sections().flatMap((s) => s.groups.flatMap((g) => g.settings));
  }

  setting(key: string): ConfigSetting | undefined {
    return this.allSettings().find((s) => s.key === key);
  }

  sectionOf(key: string): ConfigSection | undefined {
    return this.sections().find((s) => s.groups.some((g) => g.settings.some((x) => x.key === key)));
  }

  /** Saved value of every setting, keyed by setting key. */
  values(): ConfigValues {
    const out: ConfigValues = {};
    for (const s of this.allSettings()) out[s.key] = s.value;
    return out;
  }

  /** Security & audit settings currently switched on / configured. */
  activePolicies(): number {
    return this.sections()
      .filter((s) => s.requiresApproval)
      .flatMap((s) => s.groups.flatMap((g) => g.settings))
      .filter((s) => isActiveValue(s.value)).length;
  }

  /** The settings are already in memory; kept as an Observable so the page can wait on it. */
  load(): Observable<void> {
    return of(undefined);
  }

  /**
   * Saves changed settings. Settings in a section that requires approval are queued as "Pending";
   * everything else is applied straight away.
   */
  submit(entries: { key: string; value: ConfigValue }[], reason: string): Observable<ConfigChange[]> {
    const user = CURRENT_USER.name;
    const changes: ConfigChange[] = [];
    for (const { key, value } of entries) {
      const s = this.setting(key);
      const section = this.sectionOf(key);
      if (!s || !section || s.value === value) continue;
      changes.push({
        id: `CHG-${String(this.nextChange++).padStart(4, '0')}`,
        key,
        setting: s.label,
        section: section.title,
        oldValue: s.value,
        newValue: value,
        updatedBy: user,
        date: new Date().toISOString(),
        reason,
        status: section.requiresApproval ? 'Pending' : 'Applied'
      });
    }
    for (const c of changes) if (c.status === 'Applied') this.apply(c.key, c.newValue, user);
    this.changes.update((list) => [...changes, ...list]);
    return of(changes);
  }

  approve(id: string): void {
    const change = this.changes().find((c) => c.id === id);
    if (!change || change.status !== 'Pending') return;
    this.apply(change.key, change.newValue, change.updatedBy);
    this.setStatus(id, 'Applied');
  }

  reject(id: string): void {
    this.setStatus(id, 'Rejected');
  }

  private setStatus(id: string, status: ConfigChange['status']): void {
    this.changes.update((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));
  }

  private apply(key: string, value: ConfigValue, by: string): void {
    const now = new Date().toISOString();
    this.sections.update((sections) =>
      sections.map((sec) => ({
        ...sec,
        groups: sec.groups.map((g) => ({
          ...g,
          settings: g.settings.map((s) =>
            s.key === key ? { ...s, value, updatedBy: by, updatedAt: now, effectiveDate: now.slice(0, 10) } : s
          )
        }))
      }))
    );
  }
}

export function isActiveValue(v: ConfigValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return v !== '' && v !== 'None' && v !== 'Optional';
}
