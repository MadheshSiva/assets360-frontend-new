import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Lock, LucideAngularModule } from 'lucide-angular';
import { ConnectionType } from './data-export-api.model';
import { ConnectionForm, DataExportService } from './data-export-api.service';

export const AUTH_METHODS = ['OAuth 2.0 (client credentials)', 'API key', 'Basic', 'Key pair', 'Service principal', 'Personal access token'];

/**
 * Add API Connection. The secret field is write-only: it is validated for presence, handed to the service,
 * which keeps only "a secret is stored", and the form is cleared on close.
 */
@Component({
  standalone: true,
  selector: 'dx-connection-dialog',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <div class="overlay" (click)="cancel()">
      <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="dx-con-title" (click)="$event.stopPropagation()" (ngSubmit)="save()" autocomplete="off">
        <h2 id="dx-con-title">Add API Connection</h2>
        <p class="muted">Connect a reporting or analytics system that receives Asset360 data feeds.</p>
        <div class="dx-form-grid">
          <div class="field" [class.invalid]="submitted && nameError">
            <label for="dx-con-name">Connection name <span class="req">*</span></label>
            <input id="dx-con-name" name="name" [(ngModel)]="form.name" maxlength="60" />
            @if (submitted && nameError) {
              <small>{{ nameError }}</small>
            }
          </div>
          <div class="field">
            <label for="dx-con-type">Type</label>
            <select id="dx-con-type" name="type" [(ngModel)]="form.type">
              @for (t of types; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
        </div>
        <div class="field" [class.invalid]="submitted && urlError">
          <label for="dx-con-url">Base URL <span class="req">*</span></label>
          <input id="dx-con-url" name="baseUrl" [(ngModel)]="form.baseUrl" placeholder="https://api.example.com/v1" inputmode="url" />
          <small>{{ submitted && urlError ? urlError : 'Must use HTTPS. Do not put keys or tokens in the URL.' }}</small>
        </div>
        <div class="dx-form-grid">
          <div class="field">
            <label for="dx-con-auth">Authentication</label>
            <select id="dx-con-auth" name="auth" [(ngModel)]="form.auth">
              @for (a of authMethods; track a) {
                <option [value]="a">{{ a }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="dx-con-client">Client ID / user <span class="muted">(optional)</span></label>
            <input id="dx-con-client" name="clientId" [(ngModel)]="form.clientId" maxlength="120" />
          </div>
        </div>
        <div class="field" [class.invalid]="submitted && secretError">
          <label for="dx-con-secret">{{ secretLabel }} <span class="req">*</span></label>
          <input id="dx-con-secret" name="secret" type="password" [(ngModel)]="form.secret" autocomplete="new-password" />
          <small>
            <lucide-icon [img]="icons.Lock" [size]="11"></lucide-icon>
            {{ submitted && secretError ? secretError : 'Stored in the secrets vault and never shown again.' }}
          </small>
        </div>
        <p class="muted dx-small">DEMO MODE: the connection is simulated and the secret is discarded after saving.</p>
        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel()">Cancel</button>
          <button type="submit" class="btn btn--primary">Add connection</button>
        </div>
      </form>
    </div>
  `
})
export class ConnectionDialog {
  private readonly service = inject(DataExportService);
  @Output() saved = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  readonly icons = { Lock };
  readonly types: ConnectionType[] = ['REST', 'OData', 'JDBC'];
  readonly authMethods = AUTH_METHODS;
  form: ConnectionForm = { name: '', type: 'REST', baseUrl: 'https://', auth: AUTH_METHODS[0], clientId: '', secret: '' };
  submitted = false;

  get secretLabel(): string {
    if (this.form.auth === 'Basic') return 'Password';
    if (this.form.auth === 'Key pair') return 'Private key';
    if (this.form.auth === 'API key' || this.form.auth === 'Personal access token') return 'Token';
    return 'Client secret';
  }

  get nameError(): string {
    const n = this.form.name.trim();
    if (!n) return 'Enter a connection name.';
    if (this.service.connectionNameTaken(n)) return 'A connection with this name already exists.';
    return '';
  }

  get urlError(): string {
    const raw = this.form.baseUrl.trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return 'Enter a valid URL.';
    }
    if (url.protocol !== 'https:') return 'Only https:// endpoints are allowed.';
    if (!url.hostname.includes('.')) return 'Enter a full host name.';
    if (url.username || url.password || url.search) return 'Remove credentials and query parameters from the URL.';
    return '';
  }

  get secretError(): string {
    return this.form.secret.length < 8 ? 'Enter the secret (at least 8 characters).' : '';
  }

  save(): void {
    this.submitted = true;
    if (this.nameError || this.urlError || this.secretError) return;
    const con = this.service.addConnection(this.form);
    this.form.secret = '';
    this.saved.emit(con.name);
  }

  cancel(): void {
    this.form.secret = '';
    this.closed.emit();
  }
}
