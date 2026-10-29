import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Check, Copy, LucideAngularModule, Users, X } from 'lucide-angular';
import { RA_PEOPLE } from '../../shared/analytics-common';
import { DASHBOARD_GROUPS, Dashboard, Sharing } from '../interactive-dashboards.data';

export interface ShareResult {
  sharing: Sharing;
  sharedWith: string[];
  groups: string[];
}

/** Share: people and group chips, organization-wide access and a copyable link. */
@Component({
  selector: 'app-idb-share-dialog',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="cancel.emit()">
      <div class="dialog" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Share dashboard">
        <h2>Share “{{ dashboard.name }}”</h2>
        <p>People you add can view this dashboard. Owner: {{ dashboard.owner }}.</p>

        <div class="field">
          <label for="sh-person">Add people</label>
          <div class="idb-share-add">
            <select id="sh-person" class="select" [(ngModel)]="person">
              <option value="">Select a person</option>
              @for (p of availablePeople; track p) { <option [value]="p">{{ p }}</option> }
            </select>
            <button type="button" class="btn" [disabled]="!person" (click)="addPerson()">Add</button>
          </div>
        </div>
        <div class="idb-chips" aria-label="Shared with people">
          @for (p of people; track p) {
            <span class="idb-chip">{{ p }}
              <button type="button" (click)="removePerson(p)" [attr.aria-label]="'Remove ' + p"><lucide-icon [img]="icons.X" [size]="12" /></button>
            </span>
          } @empty {
            <span class="muted">Not shared with anyone yet.</span>
          }
        </div>

        <div class="field">
          <label for="sh-group">Add groups</label>
          <div class="idb-share-add">
            <select id="sh-group" class="select" [(ngModel)]="group">
              <option value="">Select a group</option>
              @for (g of availableGroups; track g) { <option [value]="g">{{ g }}</option> }
            </select>
            <button type="button" class="btn" [disabled]="!group" (click)="addGroup()">Add</button>
          </div>
        </div>
        <div class="idb-chips" aria-label="Shared with groups">
          @for (g of groups; track g) {
            <span class="idb-chip idb-chip--group"><lucide-icon [img]="icons.Users" [size]="12" /> {{ g }}
              <button type="button" (click)="removeGroup(g)" [attr.aria-label]="'Remove ' + g"><lucide-icon [img]="icons.X" [size]="12" /></button>
            </span>
          }
        </div>

        <label class="switch idb-share-org">
          <input type="checkbox" [(ngModel)]="organization" />
          <i></i> Everyone in Purple IQ Group can view
        </label>

        <div class="field">
          <label for="sh-link">Dashboard link</label>
          <div class="idb-share-add">
            <input id="sh-link" [value]="link" readonly (focus)="selectAll($event)" />
            <button type="button" class="btn" (click)="copy()">
              <lucide-icon [img]="copied ? icons.Check : icons.Copy" [size]="15" /> {{ copied ? 'Copied' : 'Copy link' }}
            </button>
          </div>
        </div>

        <div class="dialog__actions">
          <button type="button" class="btn" (click)="cancel.emit()">Cancel</button>
          <button type="button" class="btn btn--primary" (click)="save()">Save sharing</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['../../shared/analytics-page.css'],
  styles: [
    `
      .idb-share-add { display: flex; gap: 8px; }
      .idb-share-add > :first-child { flex: 1; min-width: 0; }
      .idb-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 14px; }
      .idb-chip {
        display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px 4px 10px; border-radius: 999px;
        background: var(--ra-purple-soft); color: var(--ra-purple); font-size: 12px; font-weight: 600;
      }
      .idb-chip--group { background: var(--ra-blue-soft); color: var(--ra-blue); }
      .idb-chip button { display: inline-grid; place-items: center; padding: 2px; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
      .idb-chip button:hover { background: rgba(15, 23, 42, 0.08); }
      .idb-share-org { margin-bottom: 14px; font-size: 13px; }
    `
  ]
})
export class ShareDashboardDialog implements OnInit {
  @Input({ required: true }) dashboard!: Dashboard;
  @Input() link = '';
  @Output() saved = new EventEmitter<ShareResult>();
  @Output() cancel = new EventEmitter<void>();

  readonly icons = { Check, Copy, Users, X };
  people: string[] = [];
  groups: string[] = [];
  organization = false;
  person = '';
  group = '';
  copied = false;

  ngOnInit(): void {
    this.people = [...this.dashboard.sharedWith];
    this.groups = [...this.dashboard.groups];
    this.organization = this.dashboard.sharing === 'organization';
  }

  get availablePeople(): string[] {
    return RA_PEOPLE.filter((p) => p !== this.dashboard.owner && !this.people.includes(p));
  }

  get availableGroups(): string[] {
    return DASHBOARD_GROUPS.filter((g) => !this.groups.includes(g));
  }

  addPerson(): void {
    if (this.person) this.people.push(this.person);
    this.person = '';
  }

  removePerson(p: string): void {
    this.people = this.people.filter((x) => x !== p);
  }

  addGroup(): void {
    if (this.group) this.groups.push(this.group);
    this.group = '';
  }

  removeGroup(g: string): void {
    this.groups = this.groups.filter((x) => x !== g);
  }

  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link);
      this.copied = true;
    } catch {
      // Clipboard blocked: leave the link selected so it can be copied by hand
      this.copied = false;
    }
  }

  save(): void {
    const sharing: Sharing = this.organization ? 'organization' : this.people.length || this.groups.length ? 'people' : 'private';
    this.saved.emit({ sharing, sharedWith: this.people, groups: this.groups });
  }
}
