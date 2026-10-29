import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bookmark, GitCompareArrows, House, LucideAngularModule, RefreshCw, Upload } from 'lucide-angular';

/** Breadcrumb, title and the Updated / Compare Periods / Export / Save View actions. */
@Component({
  selector: 'ra-c-page-head',
  imports: [RouterLink, LucideAngularModule],
  template: `
    <nav class="crumbs" aria-label="Breadcrumb">
      <lucide-icon [img]="icons.House" [size]="14"></lucide-icon>
      <a routerLink="/dashboard">Asset360</a>
      <span>/</span>
      <a [routerLink]="basePath">Reports &amp; Analytics</a>
      <span>/</span>
      <strong>{{ title }}</strong>
    </nav>
    <header class="ra-head">
      <div class="ra-head__text">
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
      <div class="ra-head__actions">
        <span class="updated">
          <button type="button" (click)="refresh.emit()" [disabled]="refreshing" aria-label="Refresh data" title="Refresh">
            <lucide-icon [img]="icons.RefreshCw" [size]="16" [class.rac-spin]="refreshing"></lucide-icon>
          </button>
          {{ refreshing ? 'Refreshing…' : updatedText }}
        </span>
        <button type="button" class="btn" [class.btn--outline]="compare" [attr.aria-pressed]="compare" (click)="compareChange.emit(!compare)">
          <lucide-icon [img]="icons.GitCompareArrows" [size]="16"></lucide-icon>
          {{ compare ? 'Comparing Periods' : 'Compare Periods' }}
        </button>
        <button type="button" class="btn" (click)="exportCsv.emit()">
          <lucide-icon [img]="icons.Upload" [size]="16"></lucide-icon> Export
        </button>
        <button type="button" class="btn btn--primary" (click)="saveView.emit()">
          <lucide-icon [img]="icons.Bookmark" [size]="16"></lucide-icon> Save View
        </button>
      </div>
    </header>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaPageHead {
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Input() basePath = '';
  @Input() updatedText = '';
  @Input() refreshing = false;
  @Input() compare = false;
  @Output() refresh = new EventEmitter<void>();
  @Output() compareChange = new EventEmitter<boolean>();
  @Output() exportCsv = new EventEmitter<void>();
  @Output() saveView = new EventEmitter<void>();

  readonly icons = { House, RefreshCw, GitCompareArrows, Upload, Bookmark };
}
