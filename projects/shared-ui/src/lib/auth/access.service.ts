import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AuthService } from './auth.service';

/** A module the signed-in user may open, with the actions their roles allow (view, create, edit, delete, approve, export). */
export interface ModuleAccess {
  module: string;
  actions: string[];
}

/** Who is signed in and what they may see. */
export interface MyAccess {
  displayName: string;
  email: string;
  roleName: string;
  roles: string[];
  /** Sign-in administrators see every module */
  fullAccess: boolean;
  modules: ModuleAccess[];
}

/**
 * Sidebar / route sections whose permission-matrix module has another name. Every other section uses its own name
 * (Dashboard, Assets, Tracking & IoT, ... as in Administration â€º Role & Access Control).
 */
const MATRIX_MODULE: Record<string, string> = { 'Audit & Compliance': 'Compliance' };

/** First path of each section, in sidebar order: where a user is sent when a page is off limits. */
export const SECTION_HOME: { module: string; path: string }[] = [
  { module: 'Dashboard', path: '/dashboard' },
  { module: 'Assets', path: '/assets' },
  { module: 'Tracking & IoT', path: '/tracking-iot' },
  { module: 'Movement & Custody', path: '/movement-custody' },
  { module: 'Maintenance', path: '/maintenance' },
  { module: 'Inspection', path: '/inspection' },
  { module: 'Inventory', path: '/inventory' },
  { module: 'WIP / Operations', path: '/wip-operations' },
  { module: 'Audit & Compliance', path: '/audit-compliance' },
  { module: 'Contracts & Warranty', path: '/contracts-warranty' },
  { module: 'Financial', path: '/financial' },
  { module: 'Reports & Analytics', path: '/reports-analytics' },
  { module: 'Administration', path: '/administration' },
  { module: 'Master Data Management', path: '/master-data-management' }
];

const CACHE_KEY = 'myAccess';

/** Path segments of pages whose only purpose is creating a record (e.g. /assets/registration, /inspection/new). */
const CREATE_SEGMENT = /^(new|create|add|registration|new-.+)$/i;

/** True for a create page; these need the Create permission on their section, not just View. */
export function isCreatePath(url: string): boolean {
  return url
    .split(/[?#]/)[0]
    .split('/')
    .some((segment) => CREATE_SEGMENT.test(segment));
}

/** DEMO MODE: every signed-in user gets the Administrator profile with access to every module. */
function demoAccess(email: string): MyAccess {
  const user = email.split('@')[0] || 'Demo User';
  return { displayName: user, email, roleName: 'Administrator', roles: ['Administrator'], fullAccess: true, modules: [] };
}

/**
 * The signed-in user's profile and module access. In this static demo it is built locally (no Administration API)
 * and kept in sessionStorage so a page reload shows the menu straight away.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly auth = inject(AuthService);

  private readonly state = signal<MyAccess | null>(this.readCache());

  /** The loaded access, or null before the first load for this sign-in. */
  readonly access = this.state.asReadonly();
  readonly loaded = computed(() => this.state() !== null);

  /** Loads the access unless it is already loaded for the signed-in user. */
  ensureLoaded(): Observable<MyAccess> {
    const current = this.state();
    if (current && (current.email ?? '').toLowerCase() === (this.auth.getUserEmail() ?? '').toLowerCase()) return of(current);
    return this.load();
  }

  /** Builds the demo access for the signed-in user. */
  load(): Observable<MyAccess> {
    const a = demoAccess(this.auth.getUserEmail() ?? '');
    this.state.set(a);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(a));
    } catch {
      // storage unavailable: keep it in memory only
    }
    return of(a);
  }

  /** Forgets the access (sign-out). */
  clear(): void {
    this.state.set(null);
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch {
      // nothing stored
    }
  }

  /** True when the user may open the section (sidebar label or permission-matrix module name). */
  canView(section: string, access: MyAccess | null = this.state()): boolean {
    if (!access) return false;
    if (access.fullAccess) return true;
    const module = (MATRIX_MODULE[section] ?? section).toLowerCase();
    return access.modules.some((m) => m.module.toLowerCase() === module && m.actions.includes('view'));
  }

  /** True when the user may do the action (view, create, edit, delete, approve, export) in the section. */
  can(section: string, action: string): boolean {
    const access = this.state();
    if (!access) return false;
    if (access.fullAccess) return true;
    const module = (MATRIX_MODULE[section] ?? section).toLowerCase();
    return access.modules.some((m) => m.module.toLowerCase() === module && m.actions.includes(action));
  }

  /** First page the user may open, for redirects; null when there is none. */
  homePath(access: MyAccess | null = this.state()): string | null {
    return SECTION_HOME.find((s) => this.canView(s.module, access))?.path ?? null;
  }

  private readCache(): MyAccess | null {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      const cached = raw ? (JSON.parse(raw) as MyAccess) : null;
      // Only for the user signed in now
      return cached && cached.email?.toLowerCase() === (this.auth.getUserEmail() ?? '').toLowerCase() ? cached : null;
    } catch {
      return null;
    }
  }
}
