import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { History, LucideAngularModule, X } from 'lucide-angular';
import { avatarTone, formatDate, initials } from '../shared/admin-common';
import { ConfigChange, ConfigSection, ConfigSetting, ConfigValue } from './system-configuration.data';
import { configIcon } from './config-icons';
import { describeType, describeValue, allowedValues, changeTone } from './config-format';

export const REASON_MAX = 500;

/** Right drawer: details of the selected setting, change reason and the latest changes. */
@Component({
  standalone: true,
  selector: 'app-config-detail-drawer',
  imports: [FormsModule, LucideAngularModule],
  styleUrls: ['../shared/admin-workspace.css', './system-configuration.css'],
  template: `
    <aside class="drawer cfg-drawer" aria-label="Configuration detail">
      <div class="drawer__head">
        <h2>Configuration Detail</h2>
        <button type="button" class="icon-btn icon-btn--bare" aria-label="Close" (click)="closed.emit()">
          <lucide-icon [img]="icons.X" [size]="18"></lucide-icon>
        </button>
      </div>

      @if (setting) {
        <div class="cfg-detail__title">
          <span class="cfg-card__icon cfg-card__icon--round"><lucide-icon [img]="sectionIcon()" [size]="18"></lucide-icon></span>
          <div>
            <h3>{{ setting.label }}</h3>
            <p class="muted">{{ setting.description }}</p>
          </div>
        </div>

        <dl class="kv">
          <dt>Field Type</dt>
          <dd>{{ type() }}</dd>
          <dt>Current Value</dt>
          <dd><b>{{ current() }}</b></dd>
          @if (isDirty()) {
            <dt>New Value</dt>
            <dd><span class="pill" data-tone="orange">{{ proposed() }}</span></dd>
          }
          <dt>Allowed Values</dt>
          <dd>{{ allowed() }}</dd>
          <dt>Scope</dt>
          <dd>{{ setting.scope }}</dd>
          <dt>Effective Date</dt>
          <dd>{{ date(setting.effectiveDate) }}</dd>
          <dt>Last Updated By</dt>
          <dd class="cfg-person">
            <span class="avatar" [style.background]="tone(setting.updatedBy).bg" [style.color]="tone(setting.updatedBy).ink">{{ initialsOf(setting.updatedBy) }}</span>
            <span>
              <b>{{ setting.updatedBy }}</b>
              <small class="muted">{{ dateTime(setting.updatedAt) }}</small>
            </span>
          </dd>
        </dl>

        @if (section?.requiresApproval) {
          <p class="note note--warn cfg-gap">Changes in {{ section?.title }} are sent for review before they apply.</p>
        }

        <div class="field cfg-gap" [class.invalid]="touched && !reason.trim()">
          <label for="cfg-reason">Change Reason <span class="req">*</span></label>
          <textarea
            id="cfg-reason"
            rows="3"
            [maxlength]="max"
            placeholder="Why is this setting changing?"
            [(ngModel)]="reason"
          ></textarea>
          <small class="cfg-counter">
            @if (touched && !reason.trim()) {
              <span>A change reason is required.</span>
            }
            <span>{{ reason.length }}/{{ max }}</span>
          </small>
        </div>
        <div class="cfg-drawer__actions">
          <button type="button" class="btn" (click)="cancel()">Cancel</button>
          <button type="button" class="btn btn--primary" (click)="submit()">Apply Change</button>
        </div>
      } @else {
        <p class="empty">Select a setting to see its details.</p>
      }

      <div class="cfg-recent">
        <div class="panel__head">
          <lucide-icon [img]="icons.History" [size]="18" class="cfg-purple"></lucide-icon>
          <h3>Recent Changes</h3>
          <button type="button" class="btn btn--link" (click)="viewAll.emit()">View all</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Updated By</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (c of changes; track c.id) {
                <tr class="clickable" (click)="openChange.emit(c.key)">
                  <td>{{ c.setting }}</td>
                  <td>{{ c.updatedBy }}</td>
                  <td>{{ date(c.date) }}</td>
                  <td><span class="pill" [attr.data-tone]="statusTone(c)">{{ c.status }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted center">No changes yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </aside>
  `
})
export class ConfigDetailDrawer implements OnChanges {
  @Input() setting: ConfigSetting | null = null;
  @Input() section: ConfigSection | null = null;
  /** The working (possibly unsaved) value of the setting. */
  @Input() draftValue: ConfigValue | null = null;
  @Input() changes: ConfigChange[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() apply = new EventEmitter<string>();
  @Output() revert = new EventEmitter<void>();
  @Output() viewAll = new EventEmitter<void>();
  @Output() openChange = new EventEmitter<string>();

  readonly icons = { X, History };
  readonly max = REASON_MAX;
  reason = '';
  touched = false;

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes['setting']?.previousValue as ConfigSetting | null | undefined;
    if (changes['setting'] && prev?.key !== this.setting?.key) {
      this.reason = '';
      this.touched = false;
    }
  }

  sectionIcon() {
    return configIcon(this.section?.icon ?? 'Settings');
  }

  isDirty(): boolean {
    return !!this.setting && this.draftValue !== null && this.draftValue !== this.setting.value;
  }

  type(): string {
    return this.setting ? describeType(this.setting) : '';
  }

  current(): string {
    return this.setting ? describeValue(this.setting, this.setting.value) : '';
  }

  proposed(): string {
    return this.setting && this.draftValue !== null ? describeValue(this.setting, this.draftValue) : '';
  }

  allowed(): string {
    return this.setting ? allowedValues(this.setting) : '';
  }

  statusTone(c: ConfigChange): string {
    return changeTone(c.status);
  }

  date(iso: string): string {
    return iso ? formatDate(iso) : '—';
  }

  dateTime(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${formatDate(iso)}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }

  tone(name: string) {
    return avatarTone(name);
  }

  initialsOf(name: string): string {
    return initials(name);
  }

  cancel(): void {
    this.reason = '';
    this.touched = false;
    this.revert.emit();
  }

  submit(): void {
    this.touched = true;
    if (!this.reason.trim()) return;
    this.apply.emit(this.reason.trim());
  }

  /** Called by the page once the change has been recorded. */
  reset(): void {
    this.reason = '';
    this.touched = false;
  }
}
