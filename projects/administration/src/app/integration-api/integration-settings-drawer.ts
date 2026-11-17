import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CircleCheck, CircleX, Eye, EyeOff, LucideAngularModule, Trash2, X } from 'lucide-angular';
import { AUTH_METHODS, ENVIRONMENTS, Environment, Integration, PROVIDERS, RETRY_POLICIES, SYNC_FREQUENCIES } from './integration-api.data';
import { IntegrationApiService, IntegrationForm, SECRET_MASK, apiErrorMessage } from './integration-api.service';
import { HTTPS_URL, relative } from './integration-format';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,29}$/i;
const ROTATION_DAYS = 90;

interface CheckItem {
  label: string;
  value: string;
  ok: boolean;
  tone: 'green' | 'orange' | 'red';
}

function emptyForm(): IntegrationForm {
  return {
    name: '',
    code: '',
    provider: '',
    environment: '' as Environment,
    baseUrl: 'https://',
    authMethod: '',
    clientId: '',
    syncFrequency: '',
    timeout: 300,
    retryPolicy: '',
    enabled: true
  };
}

/** Right drawer: create / edit an integration, with masked credentials and a security checklist. */
@Component({
  standalone: true,
  selector: 'app-integration-settings-drawer',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/admin-workspace.css', './integration-api.css'],
  template: `
    <aside class="drawer" aria-label="Integration settings">
      <div class="drawer__head">
        <h2>{{ creating ? 'Add Integration' : 'Integration Settings' }}</h2>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Close" (click)="closed.emit()">
          <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
        </button>
      </div>

      <form (ngSubmit)="save()" novalidate>
        <div class="grid2">
          <div class="field" [class.invalid]="show('name')">
            <label for="int-name">Integration Name <span class="req">*</span></label>
            <input id="int-name" name="name" maxlength="80" [(ngModel)]="form.name" />
            @if (show('name')) {
              <small>{{ errors()['name'] }}</small>
            }
          </div>
          <div class="field" [class.invalid]="show('code')">
            <label for="int-code">Integration Code <span class="req">*</span></label>
            <input id="int-code" name="code" maxlength="30" placeholder="INT-XXX-001" [(ngModel)]="form.code" />
            @if (show('code')) {
              <small>{{ errors()['code'] }}</small>
            }
          </div>
          <div class="field" [class.invalid]="show('provider')">
            <label for="int-provider">Provider <span class="req">*</span></label>
            <select id="int-provider" name="provider" [(ngModel)]="form.provider">
              <option value="" disabled>Select Provider</option>
              @for (p of providers; track p) {
                <option [value]="p">{{ p }}</option>
              }
            </select>
            @if (show('provider')) {
              <small>{{ errors()['provider'] }}</small>
            }
          </div>
          <div class="field" [class.invalid]="show('environment')">
            <label for="int-env">Environment <span class="req">*</span></label>
            <select id="int-env" name="environment" [(ngModel)]="form.environment">
              <option value="" disabled>Select Environment</option>
              @for (e of environments; track e) {
                <option [value]="e">{{ e }}</option>
              }
            </select>
            @if (show('environment')) {
              <small>{{ errors()['environment'] }}</small>
            }
          </div>
          <div class="field field--wide" [class.invalid]="show('baseUrl')">
            <label for="int-url">Base URL <span class="req">*</span></label>
            <input id="int-url" name="baseUrl" type="url" [(ngModel)]="form.baseUrl" />
            @if (show('baseUrl')) {
              <small>{{ errors()['baseUrl'] }}</small>
            }
          </div>
          <div class="field field--wide" [class.invalid]="show('authMethod')">
            <label for="int-auth">Authentication Method <span class="req">*</span></label>
            <select id="int-auth" name="authMethod" [(ngModel)]="form.authMethod">
              <option value="" disabled>Select Authentication Method</option>
              @for (a of authMethods; track a) {
                <option [value]="a">{{ a }}</option>
              }
            </select>
            @if (show('authMethod')) {
              <small>{{ errors()['authMethod'] }}</small>
            }
          </div>
          <div class="field field--wide" [class.invalid]="show('clientId')">
            <label for="int-client">Client ID <span class="req">*</span></label>
            <div class="int-secret">
              <input
                id="int-client"
                name="clientId"
                autocomplete="off"
                spellcheck="false"
                [type]="showClientId ? 'text' : 'password'"
                [(ngModel)]="form.clientId"
              />
              <button type="button" class="icon-btn icon-btn--bare" [attr.aria-label]="showClientId ? 'Hide client ID' : 'Show client ID'" (click)="showClientId = !showClientId">
                <lucide-icon [img]="showClientId ? icons.EyeOff : icons.Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            @if (show('clientId')) {
              <small>{{ errors()['clientId'] }}</small>
            }
          </div>
          <div class="field field--wide" [class.invalid]="show('secretKey')">
            <label for="int-secret">Secret Key <span class="req">*</span></label>
            <div class="int-secret">
              <input
                id="int-secret"
                name="secretKey"
                autocomplete="new-password"
                spellcheck="false"
                [type]="showSecret ? 'text' : 'password'"
                [placeholder]="secretPlaceholder()"
                [(ngModel)]="secretKey"
              />
              <button type="button" class="icon-btn icon-btn--bare" [attr.aria-label]="showSecret ? 'Hide secret key' : 'Show secret key'" (click)="showSecret = !showSecret">
                <lucide-icon [img]="showSecret ? icons.EyeOff : icons.Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <small>{{ show('secretKey') ? errors()['secretKey'] : secretHint() }}</small>
          </div>
          <div class="field" [class.invalid]="show('syncFrequency')">
            <label for="int-freq">Sync Frequency <span class="req">*</span></label>
            <select id="int-freq" name="syncFrequency" [(ngModel)]="form.syncFrequency">
              <option value="" disabled>Select Sync Frequency</option>
              @for (f of frequencies; track f) {
                <option [value]="f">{{ f }}</option>
              }
            </select>
            @if (show('syncFrequency')) {
              <small>{{ errors()['syncFrequency'] }}</small>
            }
          </div>
          <div class="field" [class.invalid]="show('timeout')">
            <label for="int-timeout">Timeout (seconds) <span class="req">*</span></label>
            <input id="int-timeout" name="timeout" type="number" min="5" max="600" [(ngModel)]="form.timeout" />
            @if (show('timeout')) {
              <small>{{ errors()['timeout'] }}</small>
            }
          </div>
          <div class="field field--wide" [class.invalid]="show('retryPolicy')">
            <label for="int-retry">Retry Policy <span class="req">*</span></label>
            <select id="int-retry" name="retryPolicy" [(ngModel)]="form.retryPolicy">
              <option value="" disabled>Select Retry Policy</option>
              @for (r of retryPolicies; track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
            @if (show('retryPolicy')) {
              <small>{{ errors()['retryPolicy'] }}</small>
            }
          </div>
          <div class="field field--wide int-status">
            <span>Status</span>
            <div>
              <label class="switch">
                <input type="checkbox" name="enabled" [(ngModel)]="form.enabled" />
                <i></i> {{ form.enabled ? 'Active' : 'Disabled' }}
              </label>
              <small class="int-block">{{ form.enabled ? 'Integration will sync as per configuration' : 'Scheduled syncs and webhooks are paused' }}</small>
            </div>
          </div>
        </div>

        <div class="int-checklist">
          <h3><lucide-icon [img]="icons.CircleCheck" [size]="16"></lucide-icon> Security Checklist</h3>
          @for (c of checklist(); track c.label) {
            <div class="int-check">
              <lucide-icon [img]="c.ok ? icons.CircleCheck : icons.CircleX" [size]="16" [class]="'int-tone-' + c.tone"></lucide-icon>
              <span>{{ c.label }}</span>
              <b [class]="'int-tone-' + c.tone">{{ c.value }}</b>
            </div>
          }
        </div>

        @if (!creating) {
          <button type="button" class="btn btn--link int-delete" (click)="confirmDelete = true">
            <lucide-icon [img]="icons.Trash2" [size]="14"></lucide-icon> Delete integration
          </button>
        }

        <div class="drawer__foot">
          <button type="button" class="btn" (click)="cancel()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="saving">{{ saving ? 'Saving…' : 'Save Integration' }}</button>
        </div>
      </form>
    </aside>

    @if (confirmDelete && integration) {
      <div class="overlay">
        <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="int-del-title">
          <h2 id="int-del-title">Delete {{ integration.name }}?</h2>
          <p>Its credentials, API keys, webhooks, mappings and logs will be removed. This cannot be undone.</p>
          <div class="confirm__actions">
            <button type="button" class="btn" (click)="confirmDelete = false">Cancel</button>
            <button type="button" class="btn btn--danger" (click)="remove()">Delete</button>
          </div>
        </div>
      </div>
    }
  `
})
export class IntegrationSettingsDrawer implements OnChanges {
  private readonly service = inject(IntegrationApiService);

  /** The integration being edited; ignored while `creating`. */
  @Input() integration: Integration | null = null;
  @Input() creating = false;

  @Output() saved = new EventEmitter<string>();
  @Output() deleted = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();
  @Output() notice = new EventEmitter<string>();

  readonly icons = { X, Eye, EyeOff, CircleCheck, CircleX, Trash2 };
  readonly providers = Object.keys(PROVIDERS);
  readonly environments = ENVIRONMENTS;
  readonly authMethods = AUTH_METHODS;
  readonly frequencies = SYNC_FREQUENCIES;
  readonly retryPolicies = RETRY_POLICIES;

  form: IntegrationForm = emptyForm();
  /** Only holds a newly typed secret; the stored one is never loaded into the form. */
  secretKey = '';
  showClientId = false;
  showSecret = false;
  submitted = false;
  saving = false;
  confirmDelete = false;

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes['integration']?.previousValue as Integration | null | undefined;
    const switched = changes['creating'] || !prev || prev.id !== this.integration?.id;
    if (switched) this.load();
    // Enabled / disabled from the header while the drawer is open
    else if (prev && this.integration && prev.status !== this.integration.status) this.form.enabled = this.integration.status !== 'Disabled';
  }

  private load(): void {
    const i = this.integration;
    this.form =
      this.creating || !i
        ? emptyForm()
        : {
            name: i.name,
            code: i.code,
            provider: i.provider,
            environment: i.environment,
            baseUrl: i.baseUrl,
            authMethod: i.authMethod,
            clientId: i.clientId,
            syncFrequency: i.syncFrequency,
            timeout: i.timeout,
            retryPolicy: i.retryPolicy,
            enabled: i.status !== 'Disabled'
          };
    this.secretKey = '';
    this.showClientId = false;
    this.showSecret = false;
    this.submitted = false;
    this.confirmDelete = false;
  }

  private needsSecret(): boolean {
    return this.creating || !this.integration?.secretLast4;
  }

  secretPlaceholder(): string {
    return this.needsSecret() ? 'Enter secret key' : '••••••••••••••••••••';
  }

  secretHint(): string {
    if (this.needsSecret()) return 'Stored encrypted; shown only while you type it.';
    const last4 = this.integration?.secretLast4;
    return last4 === SECRET_MASK ? 'Stored securely. Leave blank to keep it.' : `Stored securely (ends …${last4}). Leave blank to keep it.`;
  }

  errors(): Record<string, string> {
    const f = this.form;
    const e: Record<string, string> = {};
    if (!f.name.trim()) e['name'] = 'Integration name is required.';
    const code = f.code.trim();
    if (!code) e['code'] = 'Integration code is required.';
    else if (!CODE_PATTERN.test(code)) e['code'] = 'Use 3–30 letters, digits or hyphens.';
    else if (this.service.codeTaken(code, this.creating ? null : (this.integration?.id ?? null))) e['code'] = 'This code is already used.';
    const url = f.baseUrl.trim();
    if (!url || url === 'https://') e['baseUrl'] = 'Base URL is required.';
    else if (!HTTPS_URL.test(url)) e['baseUrl'] = 'Enter a valid https:// URL.';
    if (!f.provider) e['provider'] = 'Provider is required.';
    if (!f.environment) e['environment'] = 'Environment is required.';
    if (!f.authMethod) e['authMethod'] = 'Authentication method is required.';
    if (!f.syncFrequency) e['syncFrequency'] = 'Sync frequency is required.';
    if (!f.retryPolicy) e['retryPolicy'] = 'Retry policy is required.';
    if (!f.clientId.trim()) e['clientId'] = 'Client ID is required.';
    if (this.secretKey && this.secretKey.length < 16) e['secretKey'] = 'Secret key must be at least 16 characters.';
    else if (!this.secretKey && this.needsSecret()) e['secretKey'] = 'Secret key is required.';
    const t = Number(f.timeout);
    if (!Number.isInteger(t) || t < 5 || t > 600) e['timeout'] = 'Enter 5–600 seconds.';
    return e;
  }

  show(field: string): boolean {
    return this.submitted && !!this.errors()[field];
  }

  checklist(): CheckItem[] {
    const tls = this.form.baseUrl.trim().toLowerCase().startsWith('https://');
    const items: CheckItem[] = [{ label: 'TLS 1.2+ enabled', value: tls ? 'Enabled' : 'Disabled', ok: tls, tone: tls ? 'green' : 'red' }];
    const i = this.creating ? null : this.integration;
    if (i && i.secretLast4) {
      const due = Math.ceil((new Date(i.secretRotatedAt).getTime() + ROTATION_DAYS * 86400000 - Date.now()) / 86400000);
      items.push({
        label: 'Secret rotation',
        value: due < 0 ? `Overdue by ${-due} days` : `Due in ${due} days`,
        ok: due >= 0,
        tone: due < 0 ? 'red' : due <= 30 ? 'orange' : 'green'
      });
    } else {
      items.push({ label: 'Secret rotation', value: this.secretKey ? `Due in ${ROTATION_DAYS} days` : 'Secret not set', ok: !!this.secretKey, tone: this.secretKey ? 'green' : 'orange' });
    }
    const allow = i ? i.ipAllowlist : true;
    items.push({ label: 'IP allowlist', value: allow ? 'Enabled' : 'Disabled', ok: allow, tone: allow ? 'green' : 'orange' });
    if (i) {
      items.push({
        label: 'Last credential test',
        value: `${i.lastTestPassed ? 'Passed' : 'Failed'} (${relative(i.lastTestAt)})`,
        ok: i.lastTestPassed,
        tone: i.lastTestPassed ? 'green' : 'red'
      });
    } else {
      items.push({ label: 'Last credential test', value: 'Not tested yet', ok: false, tone: 'orange' });
    }
    return items;
  }

  cancel(): void {
    this.load();
    this.closed.emit();
  }

  save(): void {
    this.submitted = true;
    const errors = this.errors();
    const count = Object.keys(errors).length;
    if (count) {
      this.notice.emit(`Fix ${count} field${count > 1 ? 's' : ''} before saving.`);
      return;
    }
    if (this.saving) return;
    const form: IntegrationForm = { ...this.form, timeout: Number(this.form.timeout) };
    const creating = this.creating || !this.integration;
    const wasDraft = !creating && this.service.isDraft(this.integration!.id);
    const request = creating ? this.service.create(form, this.secretKey) : this.service.update(this.integration!.id, form, this.secretKey);
    this.saving = true;
    request.subscribe({
      next: (saved) => {
        this.saving = false;
        this.secretKey = '';
        this.showSecret = false;
        this.submitted = false;
        this.saved.emit(saved.id);
        this.notice.emit(creating || wasDraft ? `${saved.name} added. Run Test Connection to verify it.` : `${saved.name} saved.`);
      },
      error: (err) => {
        this.saving = false;
        this.notice.emit(apiErrorMessage(err, `Could not save ${form.name.trim()}.`));
      }
    });
  }

  remove(): void {
    if (!this.integration || this.saving) return;
    const { id, name } = this.integration;
    this.saving = true;
    this.service.remove(id).subscribe({
      next: () => {
        this.saving = false;
        this.confirmDelete = false;
        this.deleted.emit(id);
        this.notice.emit(`${name} deleted.`);
      },
      error: (err) => {
        this.saving = false;
        this.confirmDelete = false;
        this.notice.emit(apiErrorMessage(err, `Could not delete ${name}.`));
      }
    });
  }
}
