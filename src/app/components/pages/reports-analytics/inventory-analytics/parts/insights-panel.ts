import { Component, EventEmitter, Input, Output } from '@angular/core';
import { GripVertical, LucideAngularModule } from 'lucide-angular';
import { InsightAction, InsightCard } from './ra-parts';

export interface InsightPick {
  insight: InsightCard;
  action: InsightAction;
}

/** Right-hand insights column: tinted cards with one or two action buttons each. */
@Component({
  selector: 'ra-c-insights',
  imports: [LucideAngularModule],
  template: `
    <aside class="insights" [attr.aria-label]="title">
      <header class="widget__head">
        <lucide-icon class="widget__grip" [img]="icons.GripVertical" [size]="16"></lucide-icon>
        <h2>{{ title }}</h2>
      </header>
      @for (i of insights; track i.id) {
        <article class="insight" [attr.data-tone]="i.tone">
          <div class="insight__head">
            <lucide-icon class="insight__icon" [img]="i.icon" [size]="26"></lucide-icon>
            <div>
              <h3>{{ i.title }}</h3>
              <p>{{ i.text }}</p>
            </div>
          </div>
          <div class="insight__actions">
            @for (a of i.actions; track a.id) {
              <button type="button" class="btn btn--sm" [class.btn--primary]="a.primary" [class.btn--outline]="!a.primary" (click)="pick(i, a)">{{ a.label }}</button>
            }
          </div>
        </article>
      } @empty {
        <p class="empty">No insights for the current filters.</p>
      }
    </aside>
  `,
  styleUrls: ['../../shared/analytics-page.css', './parts.css']
})
export class RaInsightsPanel {
  @Input() title = 'Insights';
  @Input({ required: true }) insights: InsightCard[] = [];
  @Output() action = new EventEmitter<InsightPick>();

  readonly icons = { GripVertical };

  pick(insight: InsightCard, action: InsightAction): void {
    this.action.emit({ insight, action });
  }
}
