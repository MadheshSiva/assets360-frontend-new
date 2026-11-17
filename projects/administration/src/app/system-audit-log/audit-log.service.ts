import { Injectable } from '@angular/core';
import { AuditCategory, AuditEvent, AuditFilters, SavedAuditFilter } from './audit-log.model';
import { AUDIT_DAY, CATEGORY_COUNTS, seedAuditEvents } from './audit-log.data';

// DEMO MODE: audit events are generated in memory (static demo data); the log is read-only and append-only

export function emptyFilters(): AuditFilters {
  return { from: AUDIT_DAY, to: AUDIT_DAY, eventType: '', module: '', user: '', severity: '', ip: '', outcome: '' };
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  /** Frozen: logs are immutable, nothing in the UI can change them. */
  private readonly events: readonly AuditEvent[] = Object.freeze(seedAuditEvents().map((e) => Object.freeze(e)));
  private readonly saved: SavedAuditFilter[] = [];

  readonly categories: AuditCategory[] = CATEGORY_COUNTS.map(([c]) => c);
  readonly eventTypes = [...new Set(this.events.map((e) => e.event))].sort();
  readonly modules = [...new Set(this.events.map((e) => e.module))].sort();
  readonly users = [...new Set(this.events.map((e) => e.user))].sort();

  // Header stats for the audit day
  readonly eventsToday = this.events.filter((e) => e.timestamp.startsWith(AUDIT_DAY)).length;
  readonly criticalEvents = this.events.filter((e) => e.severity === 'Critical').length;
  readonly configurationChanges = this.events.filter((e) => e.category === 'Configuration' && !!e.after).length;
  readonly failedActions = this.events.filter((e) => e.outcome === 'Failed').length;

  all(): readonly AuditEvent[] {
    return this.events;
  }

  /** Everything except the category chip. */
  filter(f: AuditFilters): AuditEvent[] {
    const ip = f.ip.trim();
    return this.events.filter((e) => {
      const day = e.timestamp.slice(0, 10);
      return (
        (!f.from || day >= f.from) &&
        (!f.to || day <= f.to) &&
        (!f.eventType || e.event === f.eventType) &&
        (!f.module || e.module === f.module) &&
        (!f.user || e.user === f.user) &&
        (!f.severity || e.severity === f.severity) &&
        (!f.outcome || e.outcome === f.outcome) &&
        (!ip || e.ip.startsWith(ip))
      );
    });
  }

  savedFilters(): readonly SavedAuditFilter[] {
    return this.saved;
  }

  saveFilter(filter: SavedAuditFilter): void {
    const i = this.saved.findIndex((s) => s.name.toLowerCase() === filter.name.toLowerCase());
    if (i >= 0) this.saved[i] = filter;
    else this.saved.push(filter);
  }
}
