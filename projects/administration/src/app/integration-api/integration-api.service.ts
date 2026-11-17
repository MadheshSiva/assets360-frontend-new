import { Injectable, computed, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { CURRENT_USER } from '../shared/admin-common';
import {
  ApiKey,
  Environment,
  FieldMapping,
  Integration,
  LogEntry,
  LogLevel,
  PROVIDERS,
  SyncRun,
  buildIntegrations,
  inDays
} from './integration-api.data';

/** Editable fields of an integration (the Integration Settings drawer). */
export interface IntegrationForm {
  name: string;
  code: string;
  provider: string;
  environment: Environment;
  baseUrl: string;
  authMethod: string;
  clientId: string;
  syncFrequency: string;
  timeout: number;
  retryPolicy: string;
  enabled: boolean;
}

/** Stands in for `secretLast4` when a secret is stored but its characters are unknown. */
export const SECRET_MASK = '••••';

/** Readable message for a failed action. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const DAY = 86400000;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random demo secret. Never logged or stored: callers keep only the last 4 characters. */
function randomSecret(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += BASE62[b % BASE62.length];
  return out;
}

/**
 * DEMO MODE: integrations, credentials and sync activity live in memory (static demo data); connections are simulated.
 * Imported integrations stay drafts until a secret key is entered.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationApiService {
  readonly integrations = signal<Integration[]>(buildIntegrations());
  readonly requestsToday = signal(24680);

  readonly activeCount = computed(() => this.integrations().filter((i) => i.status === 'Connected' || i.status === 'Active').length);
  readonly activeWebhooks = computed(() => this.integrations().reduce((n, i) => n + i.webhooks.filter((w) => w.active).length, 0));
  readonly failedSyncs = computed(() => {
    const since = Date.now() - DAY;
    return this.integrations().reduce(
      (n, i) => n + i.runs.filter((r) => r.status === 'Failed' && new Date(r.startedAt).getTime() >= since).length,
      0
    );
  });

  private seq = 5000;
  /** Imported integrations not yet saved (saving requires a secret key, which imports never carry). */
  private readonly drafts = new Set<string>();

  private id(prefix: string): string {
    return `${prefix}-${this.seq++}`;
  }

  byId(id: string | null): Integration | undefined {
    return id ? this.integrations().find((i) => i.id === id) : undefined;
  }

  isDraft(id: string): boolean {
    return this.drafts.has(id);
  }

  codeTaken(code: string, exceptId: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.integrations().some((i) => i.id !== exceptId && i.code.toUpperCase() === c);
  }

  private patch(id: string, fn: (i: Integration) => Integration): void {
    this.integrations.update((list) => list.map((i) => (i.id === id ? fn(i) : i)));
  }

  private log(level: LogLevel, event: string, message: string, actor = CURRENT_USER.name): LogEntry {
    return { id: this.id('LOG'), at: new Date().toISOString(), level, event, message, actor };
  }

  // ----- Load / create / update / delete -----

  /** The integrations are already in memory; kept as an Observable so the page can wait on it. */
  load(): Observable<Integration[]> {
    return of(this.integrations());
  }

  /** Adds a new integration to the list. The secret is not kept, only its last 4 characters. */
  create(form: IntegrationForm, secret: string): Observable<Integration> {
    const created = this.build(form, secret);
    this.integrations.update((list) => [...list, created]);
    return of(created);
  }

  private build(form: IntegrationForm, secret: string): Integration {
    const p = PROVIDERS[form.provider] ?? PROVIDERS['Custom REST'];
    const now = new Date().toISOString();
    return {
      id: this.id('INT'),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      provider: form.provider,
      type: p.type,
      version: 'v1.0',
      logo: p.logo,
      status: form.enabled ? 'Active' : 'Disabled',
      environment: form.environment,
      baseUrl: form.baseUrl.trim(),
      authMethod: form.authMethod,
      clientId: form.clientId.trim(),
      secretLast4: secret.slice(-4),
      secretRotatedAt: now,
      syncFrequency: form.syncFrequency,
      timeout: form.timeout,
      retryPolicy: form.retryPolicy,
      ipAllowlist: true,
      lastTestAt: now,
      lastTestPassed: false,
      lastSync: null,
      recordsSynced: 0,
      syncDirection: p.direction,
      dataObjects: [...p.objects],
      mappings: [],
      runs: [],
      apiKeys: [],
      webhooks: [],
      logs: [this.log('Info', 'Integration created', `${form.name.trim()} added in ${form.environment}`)]
    };
  }

  /**
   * Adds an imported integration to the list without saving it. It is saved (POST) the first time
   * it is edited with a secret key.
   */
  addDraft(form: IntegrationForm): Integration {
    const p = PROVIDERS[form.provider] ?? PROVIDERS['Custom REST'];
    const now = new Date().toISOString();
    const draft: Integration = {
      id: this.id('INT'),
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      provider: form.provider,
      type: p.type,
      version: 'v1.0',
      logo: p.logo,
      status: form.enabled ? 'Active' : 'Disabled',
      environment: form.environment,
      baseUrl: form.baseUrl.trim(),
      authMethod: form.authMethod,
      clientId: form.clientId.trim(),
      secretLast4: '',
      secretRotatedAt: now,
      syncFrequency: form.syncFrequency,
      timeout: form.timeout,
      retryPolicy: form.retryPolicy,
      ipAllowlist: true,
      lastTestAt: now,
      lastTestPassed: false,
      lastSync: null,
      recordsSynced: 0,
      syncDirection: p.direction,
      dataObjects: [...p.objects],
      mappings: [],
      runs: [],
      apiKeys: [],
      webhooks: [],
      logs: [this.log('Info', 'Integration imported', `${form.name.trim()} imported (not saved until credentials are added)`)]
    };
    this.drafts.add(draft.id);
    this.integrations.update((list) => [...list, draft]);
    return draft;
  }

  /** `secret` is only passed when the user typed a new secret key. Saving a draft with a secret makes it a saved integration. */
  update(id: string, form: IntegrationForm, secret: string): Observable<Integration> {
    const current = this.byId(id);
    if (!current) return throwError(() => new Error('Integration not found.'));
    this.drafts.delete(id);
    const p = PROVIDERS[form.provider] ?? PROVIDERS['Custom REST'];
    const logs = [this.log('Info', 'Configuration updated', 'Integration settings saved')];
    if (secret) logs.unshift(this.log('Info', 'Secret rotated', 'Secret key replaced'));
    const updated: Integration = {
      ...current,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      provider: form.provider,
      type: p.type,
      logo: p.logo,
      environment: form.environment,
      baseUrl: form.baseUrl.trim(),
      authMethod: form.authMethod,
      clientId: form.clientId.trim(),
      secretLast4: secret ? secret.slice(-4) : current.secretLast4,
      secretRotatedAt: secret ? new Date().toISOString() : current.secretRotatedAt,
      syncFrequency: form.syncFrequency,
      timeout: form.timeout,
      retryPolicy: form.retryPolicy,
      status: form.enabled ? (current.status === 'Disabled' ? 'Active' : current.status) : 'Disabled',
      logs: [...logs, ...current.logs]
    };
    this.patch(id, () => updated);
    return of(updated);
  }

  remove(id: string): Observable<void> {
    this.drafts.delete(id);
    this.integrations.update((list) => list.filter((i) => i.id !== id));
    return of(undefined);
  }

  setEnabled(id: string, enabled: boolean): Observable<Integration> {
    if (!this.byId(id)) return throwError(() => new Error('Integration not found.'));
    this.patch(id, (x) => ({
      ...x,
      status: enabled ? (x.status === 'Disabled' ? 'Active' : x.status) : 'Disabled',
      logs: [this.log(enabled ? 'Info' : 'Warning', enabled ? 'Integration enabled' : 'Integration disabled', `${x.name} ${enabled ? 'enabled' : 'disabled'}`), ...x.logs]
    }));
    return of(this.byId(id)!);
  }

  // ----- Simulated connection / sync -----

  /** Simulated credential test: passes for enabled integrations with an https endpoint. */
  testConnection(id: string): { ok: boolean; message: string } {
    const i = this.byId(id);
    if (!i) return { ok: false, message: 'Integration not found.' };
    const ms = 80 + ([...i.code].reduce((n, c) => n + c.charCodeAt(0), 0) % 120);
    const ok = i.status !== 'Disabled' && i.baseUrl.startsWith('https://');
    const message = ok ? `Connection succeeded in ${ms} ms (TLS 1.3).` : i.status === 'Disabled' ? 'Integration is disabled.' : 'Endpoint must use HTTPS.';
    this.patch(id, (x) => ({
      ...x,
      lastTestAt: new Date().toISOString(),
      lastTestPassed: ok,
      logs: [this.log(ok ? 'Info' : 'Error', 'Connection test', ok ? `Credential test passed (${ms} ms)` : message), ...x.logs]
    }));
    this.requestsToday.update((n) => n + 1);
    return { ok, message };
  }

  /** Simulated sync of up to three data objects; returns the new runs, or null when disabled. */
  syncNow(id: string): SyncRun[] | null {
    const i = this.byId(id);
    if (!i || i.status === 'Disabled') return null;
    const now = Date.now();
    const created: SyncRun[] = i.dataObjects.slice(0, 3).map((object, idx) => {
      const records = ((i.runs.length + 1) * 53 + idx * 17) % 400 + 5;
      const direction = i.syncDirection === 'Outbound' ? 'out' : i.syncDirection === 'Inbound' ? 'in' : idx % 2 ? 'out' : 'in';
      return {
        id: this.id('RUN'),
        object,
        direction,
        records,
        startedAt: new Date(now - idx * 1000).toISOString(),
        durationSec: Math.round(records / 20) + 4,
        status: 'Success',
        message: 'Completed (manual sync)'
      };
    });
    const total = created.reduce((n, r) => n + r.records, 0);
    this.patch(id, (x) => ({
      ...x,
      status: x.status === 'Active' ? 'Active' : 'Connected',
      lastSync: new Date(now).toISOString(),
      recordsSynced: x.recordsSynced + total,
      runs: [...created, ...x.runs],
      logs: [
        ...created.map((r) =>
          this.log('Info', 'Sync completed', `${r.object}: ${r.records} records ${r.direction === 'in' ? 'received' : 'sent'} — manual sync`)
        ),
        ...x.logs
      ]
    }));
    this.requestsToday.update((n) => n + created.length * 4 + Math.round(total / 10));
    return created;
  }

  retryRun(id: string, runId: string): SyncRun | null {
    const i = this.byId(id);
    const run = i?.runs.find((r) => r.id === runId);
    if (!i || !run || i.status === 'Disabled') return null;
    const retry: SyncRun = {
      ...run,
      id: this.id('RUN'),
      startedAt: new Date().toISOString(),
      records: run.records || 42,
      status: 'Success',
      message: 'Completed (retry)'
    };
    this.patch(id, (x) => ({
      ...x,
      lastSync: retry.startedAt,
      recordsSynced: x.recordsSynced + retry.records,
      runs: [retry, ...x.runs],
      logs: [this.log('Info', 'Sync retried', `${run.object}: retry succeeded with ${retry.records} records`), ...x.logs]
    }));
    this.requestsToday.update((n) => n + 3);
    return retry;
  }

  saveMappings(id: string, mappings: FieldMapping[]): void {
    this.patch(id, (x) => ({
      ...x,
      mappings: mappings.map((m) => ({ ...m, source: m.source.trim(), target: m.target.trim() })),
      logs: [this.log('Info', 'Mapping updated', `${mappings.length} field mappings saved`), ...x.logs]
    }));
  }

  newMappingId(): string {
    return this.id('MAP');
  }

  // ----- API keys -----

  /** Creates a key and returns its full value. Only the prefix and last 4 characters are kept. */
  createApiKey(id: string, name: string, scopes: string[], days: number): string {
    const i = this.byId(id);
    const prefix = i?.environment === 'Production' ? 'a360_live_' : 'a360_test_';
    const secret = prefix + randomSecret(32);
    const now = new Date().toISOString();
    const apiKey: ApiKey = {
      id: this.id('KEY'),
      name: name.trim(),
      prefix,
      last4: secret.slice(-4),
      createdAt: now,
      expiresAt: inDays(days),
      scopes: [...scopes],
      status: 'Active',
      lastUsed: null
    };
    this.patch(id, (x) => ({
      ...x,
      apiKeys: [apiKey, ...x.apiKeys],
      logs: [this.log('Info', 'API key created', `Key "${apiKey.name}" created (…${apiKey.last4})`), ...x.logs]
    }));
    return secret;
  }

  /** Issues a replacement value for a key, keeping its name, scopes and expiry. */
  rotateApiKey(id: string, keyId: string): string {
    const k = this.byId(id)?.apiKeys.find((a) => a.id === keyId);
    const prefix = k?.prefix ?? 'a360_live_';
    const secret = prefix + randomSecret(32);
    this.patch(id, (x) => ({
      ...x,
      apiKeys: x.apiKeys.map((a) => (a.id === keyId ? { ...a, last4: secret.slice(-4), createdAt: new Date().toISOString() } : a)),
      logs: [this.log('Info', 'API key rotated', `Key "${k?.name ?? keyId}" rotated (…${secret.slice(-4)})`), ...x.logs]
    }));
    return secret;
  }

  revokeApiKey(id: string, keyId: string): void {
    this.patch(id, (x) => ({
      ...x,
      apiKeys: x.apiKeys.map((a) => (a.id === keyId ? { ...a, status: 'Revoked' } : a)),
      logs: [this.log('Warning', 'API key revoked', `Key …${x.apiKeys.find((a) => a.id === keyId)?.last4 ?? ''} revoked`), ...x.logs]
    }));
  }

  // ----- Webhooks -----

  /** Adds an endpoint and returns its signing secret (shown once). */
  addWebhook(id: string, url: string, events: string[]): string {
    const secret = 'whsec_' + randomSecret(32);
    this.patch(id, (x) => ({
      ...x,
      webhooks: [
        { id: this.id('WH'), url: url.trim(), events: [...events], active: true, secretLast4: secret.slice(-4), lastDelivery: null, lastStatus: 'Never' },
        ...x.webhooks
      ],
      logs: [this.log('Info', 'Webhook added', url.trim()), ...x.logs]
    }));
    return secret;
  }

  setWebhookActive(id: string, hookId: string, active: boolean): void {
    this.patch(id, (x) => ({
      ...x,
      webhooks: x.webhooks.map((w) => (w.id === hookId ? { ...w, active } : w)),
      logs: [this.log('Info', active ? 'Webhook enabled' : 'Webhook disabled', x.webhooks.find((w) => w.id === hookId)?.url ?? ''), ...x.logs]
    }));
  }

  deleteWebhook(id: string, hookId: string): void {
    this.patch(id, (x) => ({
      ...x,
      webhooks: x.webhooks.filter((w) => w.id !== hookId),
      logs: [this.log('Warning', 'Webhook deleted', x.webhooks.find((w) => w.id === hookId)?.url ?? ''), ...x.logs]
    }));
  }

  /** Simulated test delivery to an endpoint. */
  pingWebhook(id: string, hookId: string): boolean {
    const w = this.byId(id)?.webhooks.find((h) => h.id === hookId);
    if (!w || !w.active) return false;
    this.patch(id, (x) => ({
      ...x,
      webhooks: x.webhooks.map((h) => (h.id === hookId ? { ...h, lastDelivery: new Date().toISOString(), lastStatus: 'Delivered' } : h)),
      logs: [this.log('Info', 'Webhook test', `Test event delivered to ${w.url}`), ...x.logs]
    }));
    return true;
  }

  // ----- Import / export (never includes secrets) -----

  exportData(): object[] {
    return this.integrations().map((i) => ({
      code: i.code,
      name: i.name,
      provider: i.provider,
      environment: i.environment,
      baseUrl: i.baseUrl,
      authMethod: i.authMethod,
      syncFrequency: i.syncFrequency,
      timeout: i.timeout,
      retryPolicy: i.retryPolicy,
      status: i.status,
      dataObjects: i.dataObjects,
      webhooks: i.webhooks.map((w) => ({ url: w.url, events: w.events, active: w.active }))
    }));
  }
}
