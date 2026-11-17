import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Mail, X } from 'lucide-angular';
import { ADMIN_DEPARTMENTS, ADMIN_LOCATIONS } from '../../shared/admin-common';
import { USER_ROLES } from '../user-management.data';
import { UserAdminService } from '../user-management.service';

export interface InviteRequest {
  emails: string[];
  department: string;
  primaryRole: string;
  location: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const MAX_INVITES = 50;

/** "Invite Users" dialog: one or more email addresses that get a pending account and an invitation. */
@Component({
  standalone: true,
  selector: 'app-invite-dialog',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './invite-dialog.html',
  styleUrls: ['../../shared/admin-workspace.css', '../user-management.css']
})
export class InviteDialog {
  @Output() invited = new EventEmitter<InviteRequest>();
  @Output() closed = new EventEmitter<void>();

  private readonly service = inject(UserAdminService);
  readonly icons = { Mail, X };
  readonly departments = ADMIN_DEPARTMENTS;
  readonly locations = ADMIN_LOCATIONS;
  get roles() {
    return USER_ROLES.filter((r) => !r.secondaryOnly);
  }

  emails = '';
  department = '';
  primaryRole = '';
  location = '';
  errors: Record<string, string> = {};

  /** Addresses split on commas, semicolons, spaces or new lines. */
  private parsed(): string[] {
    return [...new Set(this.emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  }

  get count(): number {
    return this.parsed().length;
  }

  send(): void {
    const list = this.parsed();
    const e: Record<string, string> = {};
    const bad = list.filter((x) => !EMAIL.test(x));
    const taken = list.filter((x) => EMAIL.test(x) && this.service.emailTaken(x, null));
    if (!list.length) e['emails'] = 'Enter at least one email address.';
    else if (list.length > MAX_INVITES) e['emails'] = `Invite up to ${MAX_INVITES} people at a time.`;
    else if (bad.length) e['emails'] = `Not a valid email: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`;
    else if (taken.length) e['emails'] = `Already a user: ${taken.slice(0, 3).join(', ')}${taken.length > 3 ? '…' : ''}`;
    if (!this.department) e['department'] = 'Department is required.';
    if (!this.primaryRole) e['primaryRole'] = 'Primary role is required.';
    this.errors = e;
    if (Object.keys(e).length) return;
    this.invited.emit({ emails: list, department: this.department, primaryRole: this.primaryRole, location: this.location });
  }

  close(): void {
    this.closed.emit();
  }
}
