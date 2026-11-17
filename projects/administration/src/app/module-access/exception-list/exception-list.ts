import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { ADMIN_PEOPLE, ASSET360_MODULES, CURRENT_USER, avatarTone, formatDate, initials, todayIso } from '../../shared/admin-common';
import { AccessException, EXCEPTION_ACCESS, ExceptionAccess, PolicyRecord } from '../module-access.data';

interface Draft {
  user: string;
  module: string;
  access: ExceptionAccess;
  reason: string;
  expires: string;
}

/** "Exceptions" tab: per-user overrides of the policy for a single module, optionally time-boxed. */
@Component({
  selector: 'app-exception-list',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './exception-list.html',
  styleUrls: ['../../shared/admin-workspace.css', './exception-list.css']
})
export class ExceptionList {
  @Input({ required: true }) policy!: PolicyRecord;
  @Output() notice = new EventEmitter<string>();

  readonly icons = { Plus, Trash2 };
  readonly people = ADMIN_PEOPLE;
  readonly modules = ASSET360_MODULES;
  readonly accessTypes = EXCEPTION_ACCESS;
  readonly today = todayIso();

  adding = false;
  submitted = false;
  draft: Draft = this.blank();
  removing: AccessException | null = null;

  private blank(): Draft {
    return { user: '', module: '', access: '' as ExceptionAccess, reason: '', expires: '' };
  }

  startAdd(): void {
    this.adding = true;
    this.submitted = false;
    this.draft = this.blank();
  }

  cancelAdd(): void {
    this.adding = false;
  }

  get errors(): Partial<Record<keyof Draft, string>> {
    const e: Partial<Record<keyof Draft, string>> = {};
    if (!this.draft.user) e.user = 'Pick a user.';
    if (!this.draft.module) e.module = 'Pick a module.';
    if (!this.draft.access) e.access = 'Pick an access level.';
    if (this.draft.reason.trim().length < 5) e.reason = 'Give a reason (5+ characters).';
    if (this.draft.expires && this.draft.expires < this.today) e.expires = 'Expiry must be today or later.';
    if (!e.user && !e.module && this.policy.exceptions.some((x) => x.user === this.draft.user && x.module === this.draft.module)) {
      e.module = `${this.draft.user} already has an exception for this module.`;
    }
    return e;
  }

  add(): void {
    this.submitted = true;
    if (Object.keys(this.errors).length) return;
    const n = this.policy.exceptions.length + 1;
    const ex: AccessException = {
      id: `EXC-NEW-${Date.now().toString(36)}-${n}`,
      user: this.draft.user,
      module: this.draft.module,
      access: this.draft.access,
      reason: this.draft.reason.trim(),
      expires: this.draft.expires,
      addedBy: CURRENT_USER.name,
      addedOn: this.today
    };
    this.policy.exceptions = [ex, ...this.policy.exceptions];
    this.adding = false;
    this.notice.emit(`Exception added for ${ex.user}. Save the policy to apply it.`);
  }

  confirmRemove(): void {
    const ex = this.removing;
    if (!ex) return;
    this.policy.exceptions = this.policy.exceptions.filter((x) => x.id !== ex.id);
    this.removing = null;
    this.notice.emit(`Exception for ${ex.user} removed. Save the policy to apply it.`);
  }

  status(ex: AccessException): { label: string; tone: string } {
    if (!ex.expires) return { label: 'Permanent', tone: 'blue' };
    return ex.expires < this.today ? { label: 'Expired', tone: 'grey' } : { label: 'Active', tone: 'green' };
  }

  accessTone(a: ExceptionAccess): string {
    return a === 'Full Access' ? 'green' : a === 'Read Only' ? 'purple' : 'pink';
  }

  date(iso: string): string {
    return iso ? formatDate(iso) : 'No expiry';
  }

  tone(name: string): { bg: string; ink: string } {
    return avatarTone(name);
  }

  initialsOf(name: string): string {
    return initials(name);
  }
}
