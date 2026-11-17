import { Directive, OnDestroy } from '@angular/core';

// Organizations, people, locations and departments come from the Administration APIs (not wired yet).

export const ORGANIZATIONS: string[] = [];

/** The signed-in administrator shown as owner / "updated by" on new records. */
export const CURRENT_USER = { id: '', name: '', role: '', email: '' };

/** Shared people pool so owners, approvers and audit actors line up across the Administration pages. */
export const ADMIN_PEOPLE: string[] = [];

export const ADMIN_LOCATIONS: string[] = [];

export const ADMIN_DEPARTMENTS: string[] = [];

/** The Asset360 modules, used by access policies, roles and numbering. */
export const ASSET360_MODULES = [
  'Dashboard', 'Assets', 'Tracking & IoT', 'Movement & Custody', 'Maintenance', 'Inspection', 'Inventory',
  'Audit & Compliance', 'Contracts & Warranty', 'Financial', 'Reports & Analytics', 'Administration', 'Master Data Management'
];

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

const AVATAR_TONES = ['#ede7fb', '#e6effe', '#fde8f2', '#e4f7ef', '#fef1dc'];
const AVATAR_INKS = ['#5b2aa8', '#2563eb', '#db2777', '#059669', '#d97706'];

/** Stable soft background / ink pair for an avatar, picked from the name. */
export function avatarTone(name: string): { bg: string; ink: string } {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_TONES.length;
  return { bg: AVATAR_TONES[i], ink: AVATAR_INKS[i] };
}

/** "12 Mar 2026" for an ISO date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Base for the Administration pages: organization picker + toast. */
@Directive()
export abstract class AdminPage implements OnDestroy {
  readonly organizations = ORGANIZATIONS;
  organization = ORGANIZATIONS[0] ?? '';
  toast: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  notify(message: string): void {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), 3200);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }
}
