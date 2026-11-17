import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Building2, Info, LucideAngularModule, MapPin, Tags } from 'lucide-angular';
import { ASSET_CATEGORIES, DATA_SCOPES, DataScope, RoleRecord } from '../role-access.data';
import scopeOptions from '../role-scope-options.json';

type ListKey = 'locations' | 'departments' | 'categories';

/** "Data Scope" tab: which locations, departments and asset categories the role can see. */
@Component({
  selector: 'app-role-scope',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <h3 class="rs-title">Visibility level</h3>
    <div class="rs-levels">
      @for (s of scopes; track s.id) {
        <label class="rs-level" [class.active]="role.dataScope === s.id">
          <input type="radio" name="rs-scope" [value]="s.id" [ngModel]="role.dataScope" (ngModelChange)="setScope($event)" />
          <span><b>{{ s.id }}</b><small>{{ s.hint }}</small></span>
        </label>
      }
    </div>

    <div class="rs-grid">
      <section class="sub-panel">
        <h3>
          <lucide-icon [img]="icons.MapPin" [size]="16"></lucide-icon> Locations
          <span class="muted rs-count">{{ role.locations.length }}/{{ locations.length }}</span>
          <button type="button" class="btn btn--link rs-all" [disabled]="locationsLocked()" (click)="toggleAll('locations', locations)">{{ allLabel('locations', locations) }}</button>
        </h3>
        <div class="rs-checks">
          @for (l of locations; track l) {
            <label><input type="checkbox" [disabled]="locationsLocked()" [checked]="has('locations', l)" (change)="toggle('locations', l)" /> {{ l }}</label>
          }
        </div>
        @if (role.dataScope === 'All Locations') {
          <p class="note rs-note"><lucide-icon [img]="icons.Info" [size]="15"></lucide-icon> All locations are included for this scope.</p>
        } @else if (role.dataScope === 'Assigned Locations' && !role.locations.length) {
          <p class="note note--warn rs-note"><lucide-icon [img]="icons.Info" [size]="15"></lucide-icon> Pick at least one location.</p>
        }
        <label class="switch rs-switch"><input type="checkbox" [(ngModel)]="role.includeChildLocations" (ngModelChange)="changed.emit()" /><i></i> Include buildings, floors &amp; zones under these locations</label>
      </section>

      <section class="sub-panel">
        <h3>
          <lucide-icon [img]="icons.Building2" [size]="16"></lucide-icon> Departments
          <span class="muted rs-count">{{ role.departments.length }}/{{ departments.length }}</span>
          <button type="button" class="btn btn--link rs-all" (click)="toggleAll('departments', departments)">{{ allLabel('departments', departments) }}</button>
        </h3>
        <div class="rs-checks">
          @for (d of departments; track d) {
            <label><input type="checkbox" [checked]="has('departments', d)" (change)="toggle('departments', d)" /> {{ d }}</label>
          }
        </div>
      </section>

      <section class="sub-panel">
        <h3>
          <lucide-icon [img]="icons.Tags" [size]="16"></lucide-icon> Asset Categories
          <span class="muted rs-count">{{ role.categories.length }}/{{ categories.length }}</span>
          <button type="button" class="btn btn--link rs-all" (click)="toggleAll('categories', categories)">{{ allLabel('categories', categories) }}</button>
        </h3>
        <div class="rs-checks">
          @for (c of categories; track c) {
            <label><input type="checkbox" [checked]="has('categories', c)" (change)="toggle('categories', c)" /> {{ c }}</label>
          }
        </div>
        @if (!role.categories.length) {
          <p class="muted rs-note">No category selected: the role sees no assets.</p>
        }
      </section>
    </div>
  `,
  styleUrls: ['../../shared/admin-workspace.css', './role-scope.css']
})
export class RoleScope {
  @Input({ required: true }) role!: RoleRecord;
  @Output() changed = new EventEmitter<void>();

  readonly icons = { MapPin, Building2, Tags, Info };
  readonly scopes = DATA_SCOPES;
  readonly locations: string[] = scopeOptions.locations;
  readonly departments: string[] = scopeOptions.departments;
  readonly categories = ASSET_CATEGORIES;

  setScope(scope: DataScope): void {
    this.role.dataScope = scope;
    if (scope === 'All Locations') this.role.locations = [...this.locations];
    this.changed.emit();
  }

  /** "All Locations" always covers every location */
  locationsLocked(): boolean {
    return this.role.dataScope === 'All Locations';
  }

  has(key: ListKey, v: string): boolean {
    return this.role[key].includes(v);
  }

  toggle(key: ListKey, v: string): void {
    const source = key === 'locations' ? this.locations : key === 'departments' ? this.departments : this.categories;
    this.role[key] = this.has(key, v) ? this.role[key].filter((x) => x !== v) : source.filter((x) => x === v || this.role[key].includes(x));
    this.changed.emit();
  }

  allLabel(key: ListKey, source: string[]): string {
    return this.role[key].length === source.length ? 'Clear' : 'Select all';
  }

  toggleAll(key: ListKey, source: string[]): void {
    this.role[key] = this.role[key].length === source.length ? [] : [...source];
    this.changed.emit();
  }
}
