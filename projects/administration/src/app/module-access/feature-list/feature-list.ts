import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Lock, LucideAngularModule, LucideIconData, Search } from 'lucide-angular';
import { ASSET360_MODULES } from '../../shared/admin-common';
import { FEATURES, FeatureDef, ModuleGrant, PolicyRecord, featuresOf } from '../module-access.data';
import { moduleIcon } from '../module-table/module-table';

interface Group {
  grant: ModuleGrant;
  features: FeatureDef[];
}

/** "Features" tab: per-module feature switches for the policy. Features of disabled modules stay off. */
@Component({
  selector: 'app-feature-list',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="fl-bar">
      <label class="search fl-search">
        <lucide-icon [img]="icons.Search" [size]="15"></lucide-icon>
        <input type="search" placeholder="Search features..." aria-label="Search features" [(ngModel)]="term" />
      </label>
      <select class="select" aria-label="Module" [(ngModel)]="module">
        <option value="">Select Module</option>
        @for (m of modules; track m) {
          <option [value]="m">{{ m }}</option>
        }
      </select>
      <select class="select" aria-label="Sensitivity" [(ngModel)]="sensitivity">
        <option value="">Select Sensitivity</option>
        <option value="restricted">Restricted only</option>
        <option value="standard">Standard only</option>
      </select>
      <span class="muted fl-count">{{ enabledCount() }} of {{ total }} features enabled · {{ restrictedEnabled() }} restricted granted</span>
    </div>

    @for (g of groups; track g.grant.module) {
      <section class="fl-group" [class.fl-off]="!g.grant.enabled">
        <header>
          <lucide-icon [img]="icon(g.grant.module)" [size]="16"></lucide-icon>
          <b>{{ g.grant.module }}</b>
          <span class="muted">{{ groupOn(g) }}/{{ g.features.length }}</span>
          @if (!g.grant.enabled) {
            <span class="pill" data-tone="pink">Module disabled</span>
          } @else {
            <button type="button" class="btn btn--link fl-all" (click)="toggleGroup(g)">{{ groupOn(g) === g.features.length ? 'Turn all off' : 'Turn all on' }}</button>
          }
        </header>
        <div class="fl-rows">
          @for (f of g.features; track f.id) {
            <div class="fl-row">
              <span class="fl-name">
                {{ f.name }}
                @if (f.restricted) {
                  <span class="pill" data-tone="pink"><lucide-icon [img]="icons.Lock" [size]="10"></lucide-icon> Restricted</span>
                }
              </span>
              <label class="switch fl-switch" [attr.aria-label]="'Enable ' + f.name">
                <input type="checkbox" [checked]="isOn(f)" [disabled]="!g.grant.enabled" (change)="toggle(f)" /><i></i>
              </label>
            </div>
          }
        </div>
      </section>
    } @empty {
      <p class="empty">No features match.</p>
    }
  `,
  styleUrls: ['../../shared/admin-workspace.css', './feature-list.css']
})
export class FeatureList {
  @Input({ required: true }) policy!: PolicyRecord;
  @Output() notice = new EventEmitter<string>();

  readonly icons = { Search, Lock };
  readonly modules = ASSET360_MODULES;
  readonly total = FEATURES.length;
  term = '';
  module = '';
  sensitivity: '' | 'restricted' | 'standard' = '';

  get groups(): Group[] {
    const t = this.term.trim().toLowerCase();
    return this.policy.grants
      .filter((g) => !this.module || g.module === this.module)
      .map((grant) => ({
        grant,
        features: featuresOf(grant.module).filter(
          (f) =>
            (!this.sensitivity || (this.sensitivity === 'restricted') === f.restricted) &&
            (!t || f.name.toLowerCase().includes(t) || grant.module.toLowerCase().includes(t))
        )
      }))
      .filter((g) => g.features.length);
  }

  icon(m: string): LucideIconData {
    return moduleIcon(m);
  }

  isOn(f: FeatureDef): boolean {
    return this.policy.features.includes(f.id);
  }

  groupOn(g: Group): number {
    return g.features.filter((f) => this.isOn(f)).length;
  }

  toggle(f: FeatureDef): void {
    this.policy.features = this.isOn(f) ? this.policy.features.filter((id) => id !== f.id) : [...this.policy.features, f.id];
  }

  toggleGroup(g: Group): void {
    const ids = g.features.map((f) => f.id);
    const allOn = this.groupOn(g) === ids.length;
    this.policy.features = allOn ? this.policy.features.filter((id) => !ids.includes(id)) : [...this.policy.features.filter((id) => !ids.includes(id)), ...ids];
    this.notice.emit(`${g.grant.module}: ${allOn ? 'features turned off' : 'all features turned on'}.`);
  }

  enabledCount(): number {
    return this.policy.features.length;
  }

  restrictedEnabled(): number {
    return FEATURES.filter((f) => f.restricted && this.policy.features.includes(f.id)).length;
  }
}
