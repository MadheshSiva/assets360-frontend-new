import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Building2,
  ChevronDown,
  Download,
  Eye,
  History,
  LucideAngularModule,
  Maximize,
  Maximize2,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  Upload
} from 'lucide-angular';
import { STATUS_TONE, fmtDate, fmtTime } from '../maps.data';
import { MapsStore } from '../maps.store';

/**
 * Panel around a map: title with status, View / Edit / Actions, the tab's own tools (projected `[tools]`),
 * undo / redo / fit / zoom, then the canvas (projected) and an optional footer (projected `[foot]`).
 * The projected canvas reads `zoom` through a template reference.
 */
@Component({
  standalone: true,
  selector: 'app-map-viewer',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <section class="panel viewer" aria-label="Map">
      <header class="map-head">
        <span class="map-head__icon"><lucide-icon [img]="icons.Building2" [size]="20"></lucide-icon></span>
        <div class="map-head__text">
          <h2>
            {{ store.floorTitle() }}
            @if (plan; as p) {
              <span class="pill" [attr.data-tone]="statusTone">{{ p.status }} {{ p.version }}</span>
            }
          </h2>
          @if (plan; as p) {
            <p>Type: {{ p.type }} | Format: {{ p.format }} | Size: {{ p.sizeMb }} MB | Updated: {{ date(p.updated) }}{{ time(p.updated) ? ', ' + time(p.updated) : '' }}{{ p.updatedBy ? ' by ' + p.updatedBy : '' }}</p>
          } @else if (store.plansLoading || store.treeLoading) {
            <p>Loading floor plans…</p>
          } @else {
            <p>No floor plan uploaded for this location yet.</p>
          }
        </div>
        <div class="map-head__actions">
          <button type="button" class="btn btn--sm" [class.btn--outline]="!store.editing" (click)="store.editing = false">
            <lucide-icon [img]="icons.Eye" [size]="15"></lucide-icon> View
          </button>
          <button type="button" class="btn btn--sm" [class.btn--primary]="store.editing" (click)="store.editing = true">
            <lucide-icon [img]="icons.Pencil" [size]="14"></lucide-icon> Edit
          </button>
          <div class="dd dd--right">
            <button type="button" class="btn btn--sm" aria-haspopup="menu" [attr.aria-expanded]="actionsOpen" (click)="toggleActions($event)">
              Actions <lucide-icon [img]="icons.ChevronDown" [size]="14"></lucide-icon>
            </button>
            @if (actionsOpen) {
              <div class="menu" role="menu">
                <button type="button" role="menuitem" (click)="action('download')"><lucide-icon [img]="icons.Download" [size]="14"></lucide-icon> Download map</button>
                <button type="button" role="menuitem" (click)="action('replace')"><lucide-icon [img]="icons.Upload" [size]="14"></lucide-icon> Replace floor plan</button>
                <button type="button" role="menuitem" (click)="action('versions')"><lucide-icon [img]="icons.History" [size]="14"></lucide-icon> Version history</button>
                <button type="button" role="menuitem" class="danger" [disabled]="!store.editing || store.working" (click)="action('clear')"><lucide-icon [img]="icons.Trash2" [size]="14"></lucide-icon> Clear all plots</button>
              </div>
            }
          </div>
          <button type="button" class="icon-btn" aria-label="Full screen" (click)="fullscreen()">
            <lucide-icon [img]="icons.Maximize" [size]="15"></lucide-icon>
          </button>
        </div>
      </header>

      <div class="map-tools">
        <ng-content select="[tools]"></ng-content>
        <span class="map-tools__spacer"></span>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Undo" [disabled]="!store.canUndo || !store.editing" (click)="store.undo()">
          <lucide-icon [img]="icons.Undo2" [size]="16"></lucide-icon>
        </button>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Redo" [disabled]="!store.canRedo || !store.editing" (click)="store.redo()">
          <lucide-icon [img]="icons.Redo2" [size]="16"></lucide-icon>
        </button>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Fit to view" (click)="zoom = 100">
          <lucide-icon [img]="icons.Maximize2" [size]="15"></lucide-icon>
        </button>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Zoom out" (click)="step(-25)">
          <lucide-icon [img]="icons.Minus" [size]="16"></lucide-icon>
        </button>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Zoom in" (click)="step(25)">
          <lucide-icon [img]="icons.Plus" [size]="16"></lucide-icon>
        </button>
        <select class="zoom-select" aria-label="Zoom" [(ngModel)]="zoom">
          <option [ngValue]="null" disabled>Select Zoom</option>
          @for (z of zoomLevels; track z) { <option [ngValue]="z">{{ z }}%</option> }
        </select>
      </div>

      <ng-content></ng-content>
      <ng-content select="[foot]"></ng-content>
    </section>
  `,
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `
    :host { display: flex; flex-direction: column; min-width: 0; }
    .viewer { flex: 1; display: flex; flex-direction: column; }
    .viewer:fullscreen { overflow: auto; border-radius: 0; }
    .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .menu button { display: flex; align-items: center; gap: 8px; }
  `
})
export class MapViewer {
  readonly store = inject(MapsStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly icons = {
    Building2, ChevronDown, Download, Eye, History, Maximize, Maximize2, Minus, Pencil, Plus, Redo2, Trash2, Undo2, Upload
  };
  readonly zoomLevels = [50, 75, 100, 125, 150, 200];

  @Input() zoom = 100;
  @Output() versions = new EventEmitter<void>();

  actionsOpen = false;

  get plan() {
    return this.store.currentPlan;
  }

  get statusTone() {
    return this.plan ? STATUS_TONE[this.plan.status] : 'grey';
  }

  date = fmtDate;
  time = fmtTime;

  step(by: number): void {
    this.zoom = Math.min(200, Math.max(50, this.zoom + by));
  }

  toggleActions(event: MouseEvent): void {
    event.stopPropagation();
    this.actionsOpen = !this.actionsOpen;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.actionsOpen = false;
  }

  action(kind: 'download' | 'replace' | 'versions' | 'clear'): void {
    this.actionsOpen = false;
    const plan = this.plan;
    if (kind === 'download') {
      if (plan) this.store.download(plan.fileUrl, plan.fileName);
      else this.store.notify('No floor plan to download', 'error');
    }
    // A replacement is a new version of the plan
    if (kind === 'replace' || kind === 'versions') this.versions.emit();
    if (kind === 'clear') {
      const ids = this.store.plotted.map((i) => i.id);
      if (!ids.length) {
        this.store.notify('Nothing is plotted on this floor plan');
        return;
      }
      if (!confirm(`Remove all ${ids.length} plotted items from this floor plan?`)) return;
      this.store.unplotMany(ids, 'All plots cleared - use Undo to bring them back');
    }
  }

  fullscreen(): void {
    const panel = (this.host.nativeElement as HTMLElement).querySelector('.viewer');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panel?.requestFullscreen?.();
  }
}
