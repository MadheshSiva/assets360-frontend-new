import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Ellipsis, LoaderCircle, LucideAngularModule } from 'lucide-angular';
import { ApiConnection } from './data-export-api.model';
import { CONNECTION_TONES } from './dx-format';

/** API Connections side panel: status, uptime, Test and a row menu. */
@Component({
  standalone: true,
  selector: 'dx-connections-panel',
  imports: [RouterLink, LucideAngularModule],
  styleUrls: ['../shared/analytics-page.css', './data-export-api.css'],
  template: `
    <section class="widget">
      <div class="widget__head">
        <h2>API Connections <span class="muted">({{ connections.length }})</span></h2>
        <button type="button" class="btn btn--link" (click)="viewAll.emit()">View all</button>
      </div>
      <ul class="dx-cons">
        @for (c of connections; track c.id) {
          <li>
            <span class="dx-con-logo" [attr.data-tone]="logoTone(c)">{{ initials(c.name) }}</span>
            <span class="dx-con-text">
              <button type="button" class="link" (click)="open.emit(c)">{{ c.name }}</button>
              <small>{{ c.type }} · {{ host(c.baseUrl) }}</small>
            </span>
            <span class="dx-con-status">
              <span class="pill" [attr.data-tone]="tone(c)">
                @if (c.status === 'Testing') {
                  <lucide-icon class="dx-spin" [img]="icons.LoaderCircle" [size]="11"></lucide-icon>
                } @else {
                  <i></i>
                }
                {{ c.status }}
              </span>
              <small>{{ c.uptime }}% uptime</small>
            </span>
            <button type="button" class="btn btn--sm" [disabled]="c.status === 'Testing'" (click)="test.emit(c)">Test</button>
            <span class="row-menu">
              <button type="button" class="icon-btn" (click)="toggleMenu(c, $event)" [attr.aria-label]="'More actions for ' + c.name">
                <lucide-icon [img]="icons.Ellipsis" [size]="15"></lucide-icon>
              </button>
              @if (menuId === c.id) {
                <div class="menu" role="menu">
                  <button type="button" role="menuitem" (click)="pickOpen(c)">Open connection</button>
                  <button type="button" role="menuitem" routerLink="/administration/integration-api">Manage credentials</button>
                  <button type="button" role="menuitem" class="danger" (click)="pickRemove(c)">Remove</button>
                </div>
              }
            </span>
          </li>
        } @empty {
          <li class="empty">No API connections yet.</li>
        }
      </ul>
    </section>
  `
})
export class ConnectionsPanel {
  @Input({ required: true }) connections: ApiConnection[] = [];
  @Output() test = new EventEmitter<ApiConnection>();
  @Output() open = new EventEmitter<ApiConnection>();
  @Output() remove = new EventEmitter<ApiConnection>();
  @Output() viewAll = new EventEmitter<void>();

  readonly icons = { Ellipsis, LoaderCircle };
  menuId = '';

  tone(c: ApiConnection): string {
    return CONNECTION_TONES[c.status];
  }

  logoTone(c: ApiConnection): string {
    return c.type === 'JDBC' ? 'blue' : c.type === 'OData' ? 'green' : 'purple';
  }

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }

  host(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  toggleMenu(c: ApiConnection, event: Event): void {
    event.stopPropagation();
    this.menuId = this.menuId === c.id ? '' : c.id;
  }

  pickOpen(c: ApiConnection): void {
    this.menuId = '';
    this.open.emit(c);
  }

  pickRemove(c: ApiConnection): void {
    this.menuId = '';
    this.remove.emit(c);
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuId = '';
  }
}
