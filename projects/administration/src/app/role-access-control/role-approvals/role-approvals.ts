import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Info, LucideAngularModule, TriangleAlert } from 'lucide-angular';
import { APPROVAL_LEVELS, ApprovalRule, RoleRecord } from '../role-access.data';

/** "Approvals" tab: which approval requests the role can sign off, with per-type limits in AED. */
@Component({
  selector: 'app-role-approvals',
  imports: [FormsModule, LucideAngularModule, DecimalPipe],
  template: `
    <p class="note ra-note">
      <lucide-icon [img]="icons.Info" [size]="15"></lucide-icon>
      Role approval limit: <b>AED {{ role.approvalLimit | number }}</b>. Per-type limits can't go above it; requests over a limit escalate to the next level.
    </p>
    <div class="table-wrap ra-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Approval Type</th>
            <th>Module</th>
            <th class="center">Enabled</th>
            <th>Limit (AED)</th>
            <th>Approval Level</th>
          </tr>
        </thead>
        <tbody>
          @for (a of role.approvals; track a.type) {
            <tr [class.ra-off]="!a.enabled">
              <td><b>{{ a.type }}</b></td>
              <td class="muted">{{ a.module }}</td>
              <td class="center">
                <label class="switch" [attr.aria-label]="'Enable ' + a.type"><input type="checkbox" [(ngModel)]="a.enabled" (ngModelChange)="onToggle(a)" /><i></i></label>
              </td>
              <td>
                @if (a.monetary) {
                  <input class="ra-input" type="number" min="0" step="1000" [class.invalid]="overLimit(a) || missingLimit(a)" [disabled]="!a.enabled" [(ngModel)]="a.limit" (ngModelChange)="changed.emit()" [attr.aria-label]="a.type + ' limit'" />
                  @if (overLimit(a)) {
                    <small class="ra-err"><lucide-icon [img]="icons.TriangleAlert" [size]="12"></lucide-icon> Above role limit</small>
                  } @else if (missingLimit(a)) {
                    <small class="ra-err">Enter a limit</small>
                  }
                } @else {
                  <span class="muted">No limit (yes / no)</span>
                }
              </td>
              <td>
                <select class="select ra-select" [disabled]="!a.enabled" [(ngModel)]="a.level" (ngModelChange)="changed.emit()" [attr.aria-label]="a.type + ' level'">
                  <option value="" disabled>Select Level</option>
                  @for (l of levels; track l) {
                    <option [value]="l">{{ l }}</option>
                  }
                </select>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <p class="muted ra-foot">{{ enabledCount() }} of {{ role.approvals.length }} approval types enabled.</p>
  `,
  styleUrls: ['../../shared/admin-workspace.css'],
  styles: [
    `.ra-note { margin: 0 0 12px; }
     .ra-wrap { border: 1px solid var(--adm-border); border-radius: 10px; }
     .ra-off td { color: #94a3b8; }
     .ra-input { width: 130px; height: 32px; padding: 0 8px; border: 1px solid var(--adm-border); border-radius: 8px; font: inherit; }
     .ra-input.invalid { border-color: var(--adm-red); }
     .ra-input:disabled, .ra-select:disabled { background: #f8f9fc; }
     .ra-select { height: 32px; }
     .ra-err { display: flex; align-items: center; gap: 4px; margin-top: 3px; color: var(--adm-red); font-size: 11.5px; }
     .ra-foot { margin: 10px 0 0; font-size: 12.5px; }`
  ]
})
export class RoleApprovals {
  @Input({ required: true }) role!: RoleRecord;
  @Output() changed = new EventEmitter<void>();

  readonly icons = { Info, TriangleAlert };
  readonly levels = APPROVAL_LEVELS;

  onToggle(a: ApprovalRule): void {
    // Start a newly enabled monetary approval at the role limit
    if (a.enabled && a.monetary && !a.limit) a.limit = this.role.approvalLimit;
    this.changed.emit();
  }

  overLimit(a: ApprovalRule): boolean {
    return a.enabled && a.monetary && a.limit > this.role.approvalLimit;
  }

  missingLimit(a: ApprovalRule): boolean {
    return a.enabled && a.monetary && !(a.limit > 0);
  }

  enabledCount(): number {
    return this.role.approvals.filter((a) => a.enabled).length;
  }
}

/** First approvals problem for the role, or null (used by the page before saving). */
export function approvalsError(role: RoleRecord): string | null {
  const bad = role.approvals.find((a) => a.enabled && a.monetary && (!(a.limit > 0) || a.limit > role.approvalLimit));
  if (!bad) return null;
  return bad.limit > role.approvalLimit ? `${bad.type} limit is above the role approval limit.` : `Enter a limit for ${bad.type}.`;
}
