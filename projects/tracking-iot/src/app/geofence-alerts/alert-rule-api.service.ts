import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError } from '../shared/tracking-api';
import { actorName } from './geofence-api.service';
import { Rule, SEVERITIES, Severity, Trigger } from './geofence-data';
import { ALERT_RULES, GEOFENCES, syncRuleCounts } from './geofences.data';

/** An alert rule record. */
export interface AlertRuleDto {
  id: string;
  name: string;
  geofenceId: string;
  geofenceName: string;
  trigger: string;
  severity: string;
  assetGroup: string;
  condition: string;
  dwellMinutes: number | null;
  createAlert: boolean;
  notifyTeam: boolean;
  notifyTeamName: string | null;
  startWorkflow: boolean;
  workflowName: string | null;
  notificationChannels: string[];
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  clientId: string | null;
  tenantId: string | null;
}

/** POST / PUT /api/alert-rules body. */
export interface AlertRuleRequest {
  name: string;
  geofenceId: string;
  trigger: string;
  severity: string;
  assetGroup: string;
  condition: string;
  dwellMinutes: number | null;
  createAlert: boolean;
  notifyTeam: boolean;
  notifyTeamName: string | null;
  startWorkflow: boolean;
  workflowName: string | null;
  notificationChannels: string[];
  status: string;
  createdBy: string;
  clientId: string;
  tenantId: string;
}

/** Page trigger ↔ API trigger text (AlertRuleTrigger in the Tracking service). */
const TRIGGER_TO_API: Record<Trigger, string> = {
  'enter-exit': 'When asset enters or exits zone',
  enter: 'When asset enters zone',
  exit: 'When asset exits zone',
  dwell: 'When asset remains in zone',
};

function triggerFromApi(t: string): Trigger {
  const hit = (Object.keys(TRIGGER_TO_API) as Trigger[]).find((k) => TRIGGER_TO_API[k].toLowerCase() === (t ?? '').toLowerCase());
  return hit ?? 'enter-exit';
}

export function toRule(d: AlertRuleDto): Rule {
  const channels = (d.notificationChannels ?? []).map((c) => c.toLowerCase());
  return {
    id: d.id,
    name: d.name,
    zoneId: d.geofenceId,
    trigger: triggerFromApi(d.trigger),
    dwellMin: d.dwellMinutes ?? 0,
    severity: ((SEVERITIES as string[]).includes(d.severity) ? d.severity : 'Medium') as Severity,
    group: d.assetGroup,
    condition: d.condition,
    createAlert: d.createAlert,
    notify: d.notifyTeam,
    team: d.notifyTeamName ?? '',
    workflow: d.startWorkflow,
    workflowName: d.workflowName ?? '',
    inApp: channels.includes('in-app'),
    email: channels.includes('email'),
    push: channels.includes('push'),
    enabled: d.status !== 'Disabled',
  };
}

export function toAlertRuleRequest(r: Omit<Rule, 'id'>, createdBy: string): AlertRuleRequest {
  return {
    name: r.name,
    geofenceId: r.zoneId,
    trigger: TRIGGER_TO_API[r.trigger],
    severity: r.severity,
    assetGroup: r.group,
    condition: r.condition,
    dwellMinutes: r.trigger === 'dwell' ? Math.max(1, Math.round(r.dwellMin || 1)) : null,
    createAlert: r.createAlert,
    notifyTeam: r.notify,
    notifyTeamName: r.notify ? r.team.trim() || null : null,
    startWorkflow: r.workflow,
    workflowName: r.workflow ? r.workflowName.trim() || null : null,
    notificationChannels: [r.inApp ? 'In-app' : '', r.email ? 'Email' : '', r.push ? 'Push' : ''].filter(Boolean),
    status: r.enabled ? 'Active' : 'Disabled',
    createdBy,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
}

/** Alert Rule Builder (static demo): the in-memory rules of geofences.data.ts. */
@Injectable({ providedIn: 'root' })
export class AlertRuleApiService {
  private readonly auth = inject(AuthService);

  list(geofenceId?: string): Observable<Rule[]> {
    return demo(ALERT_RULES.filter((r) => !geofenceId || r.geofenceId === geofenceId).map(toRule));
  }

  create(r: Omit<Rule, 'id'>): Observable<Rule> {
    if (!GEOFENCES.some((g) => g.id === r.zoneId)) return demoError('Could not save the alert rule: choose an existing geofence.');
    const n = ALERT_RULES.reduce((m, x) => Math.max(m, Number(x.id.slice(3)) || 0), 0) + 1;
    const dto = this.toDto(`AR-${String(n).padStart(4, '0')}`, r, null);
    ALERT_RULES.push(dto);
    syncRuleCounts();
    return demo(toRule(dto));
  }

  update(r: Rule): Observable<Rule> {
    const i = ALERT_RULES.findIndex((x) => x.id === r.id);
    if (i < 0) return demoError('Could not update the alert rule: it no longer exists.');
    ALERT_RULES[i] = this.toDto(r.id, r, ALERT_RULES[i]);
    syncRuleCounts();
    return demo(toRule(ALERT_RULES[i]));
  }

  delete(id: string): Observable<void> {
    const i = ALERT_RULES.findIndex((x) => x.id === id);
    if (i >= 0) ALERT_RULES.splice(i, 1);
    syncRuleCounts();
    return demo(undefined as void);
  }

  private toDto(id: string, r: Omit<Rule, 'id'>, old: AlertRuleDto | null): AlertRuleDto {
    const req = toAlertRuleRequest(r, old?.createdBy ?? (actorName(this.auth) || DEMO_USER));
    return { ...req, id, geofenceName: GEOFENCES.find((g) => g.id === r.zoneId)?.name ?? '', createdAt: old?.createdAt ?? new Date().toISOString() };
  }
}
