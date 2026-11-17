import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API_SCOPES, Integration } from './integration-api.data';

export interface ApiKeyRequest {
  integrationId: string;
  name: string;
  scopes: string[];
  days: number;
}

/** "Create API Key" form: integration, key name, scopes and expiry. */
@Component({
  standalone: true,
  selector: 'app-api-key-dialog',
  imports: [FormsModule],
  styleUrls: ['../shared/admin-workspace.css', './integration-api.css'],
  template: `
    <div class="overlay">
      <form class="confirm int-dialog" role="dialog" aria-modal="true" aria-labelledby="int-key-title" (ngSubmit)="submit()" novalidate>
        <h2 id="int-key-title">Create API Key</h2>
        <div class="field" [class.invalid]="submitted && !integrationId">
          <label for="int-key-int">Integration <span class="req">*</span></label>
          <select id="int-key-int" name="integration" [(ngModel)]="integrationId">
            <option value="" disabled>Select Integration</option>
            @for (i of integrations; track i.id) {
              <option [value]="i.id">{{ i.name }} ({{ i.code }})</option>
            }
          </select>
          @if (submitted && !integrationId) {
            <small>Integration is required.</small>
          }
        </div>
        <div class="field" [class.invalid]="submitted && !!nameError()">
          <label for="int-key-name">Key Name <span class="req">*</span></label>
          <input id="int-key-name" name="name" maxlength="60" placeholder="e.g. Nightly asset export" [(ngModel)]="name" />
          @if (submitted && nameError()) {
            <small>{{ nameError() }}</small>
          }
        </div>
        <div class="field" [class.invalid]="submitted && !scopes.length">
          <span>Scopes <span class="req">*</span></span>
          <div class="checks">
            @for (s of allScopes; track s) {
              <label><input type="checkbox" [checked]="scopes.includes(s)" (change)="toggle(s)" /> {{ s }}</label>
            }
          </div>
          @if (submitted && !scopes.length) {
            <small>Pick at least one scope.</small>
          }
        </div>
        <div class="field" [class.invalid]="submitted && !days">
          <label for="int-key-exp">Expires In <span class="req">*</span></label>
          <select id="int-key-exp" name="days" [(ngModel)]="days">
            <option [ngValue]="null" disabled>Select Expires In</option>
            <option [ngValue]="30">30 days</option>
            <option [ngValue]="90">90 days</option>
            <option [ngValue]="180">180 days</option>
            <option [ngValue]="365">1 year</option>
          </select>
          @if (submitted && !days) {
            <small>Expiry is required.</small>
          }
        </div>
        <div class="confirm__actions">
          <button type="button" class="btn" (click)="cancelled.emit()">Cancel</button>
          <button type="submit" class="btn btn--primary">Create Key</button>
        </div>
      </form>
    </div>
  `
})
export class ApiKeyDialog implements OnInit {
  @Input({ required: true }) integrations: Integration[] = [];
  @Input() initialId: string | null = null;
  @Output() created = new EventEmitter<ApiKeyRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly allScopes = API_SCOPES;
  integrationId = '';
  name = '';
  scopes: string[] = ['assets:read'];
  days: number | null = null;
  submitted = false;

  ngOnInit(): void {
    this.integrationId = this.initialId ?? '';
  }

  toggle(s: string): void {
    this.scopes = this.scopes.includes(s) ? this.scopes.filter((x) => x !== s) : [...this.scopes, s];
  }

  nameError(): string {
    const n = this.name.trim();
    if (!n) return 'Key name is required.';
    const i = this.integrations.find((x) => x.id === this.integrationId);
    if (i?.apiKeys.some((k) => k.status === 'Active' && k.name.toLowerCase() === n.toLowerCase())) return 'An active key with this name exists.';
    return '';
  }

  submit(): void {
    this.submitted = true;
    if (this.nameError() || !this.scopes.length || !this.integrationId || !this.days) return;
    this.created.emit({ integrationId: this.integrationId, name: this.name.trim(), scopes: this.scopes, days: Number(this.days) });
  }
}
