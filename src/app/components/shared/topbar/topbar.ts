import { Component, ElementRef, HostListener, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  Check,
  ChevronRight,
  CircleQuestionMark,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Landmark,
  Lock,
  LogOut,
  Settings,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-angular';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { filter } from 'rxjs';
import { AccessService, AuthService } from 'shared-ui';
import { environment } from '../../../../environments/environment';
import { NotificationService, AppNotification } from '../../services/notification.service';

type ProfileSection = '' | 'language' | 'site' | 'help';
type ProfileDialog = '' | 'profile' | 'preferences' | 'whatsNew' | 'docs' | 'password';

interface Profile {
  displayName: string;
  phone: string;
}

interface Preferences {
  landing: string;
  timeFormat: '12h' | '24h';
  notifySound: boolean;
}

const PROFILE_KEY = 'a360.profile';
const PREFS_KEY = 'a360.prefs';
const SITE_KEY = 'a360.site';
const WHATS_NEW_KEY = 'a360.whatsNewSeen';
/** Bump when the release notes below change; the red dot shows until the user opens them. */
const WHATS_NEW_VERSION = '2026.10';

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

function writeValue(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {}
}

interface BreadcrumbItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './topbar.html',
  styleUrls: ['./topbar.scss']
})
export class Topbar {
  @Output() toggleSidebar = new EventEmitter<void>();
  breadcrumbs: BreadcrumbItem[] = [];
  isDropdownOpen = false;
  flyoutPosition: { top: number; left: number } | null = null;

  readonly icons = { Check, ChevronRight, CircleQuestionMark, ExternalLink, Eye, EyeOff, FileText, Globe, Landmark, Lock, LogOut, Settings, Sparkles, User, Users, X };
  readonly sites = ['All Sites', 'Head Office', 'Dubai Plant', 'Abu Dhabi', 'Sharjah Warehouse', 'Al Ain Depot', 'Central Store'];
  readonly languages = [{ code: 'en', label: 'English', ready: true }, { code: 'ar', label: 'العربية (Arabic)', ready: false }];
  readonly landingPages = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/assets/list', label: 'Asset List' },
    { path: '/tracking-iot/analytics-insights', label: 'IoT Analytics & Insights' },
    { path: '/tracking-iot/tag-management', label: 'Tag Management' },
    { path: '/wip-operations/job-orders', label: 'WIP Job Orders' },
  ];
  readonly docs = [
    { title: 'Assets', text: 'Register assets, follow their location, maintenance, health and documents.', path: '/assets/list' },
    { title: 'Tracking & IoT', text: 'Analytics, tag identifiers and real-time location of tagged assets.', path: '/tracking-iot/analytics-insights' },
    { title: 'WIP / Operations', text: 'Job templates and orders, routing, resources, SLAs and output.', path: '/wip-operations/job-orders' },
    { title: 'Administration', text: 'Administration settings.', path: '/administration' },
  ];
  readonly whatsNew = [
    { date: 'Oct 2026', title: 'Tag IDs in Tracking & IoT', text: 'Register, assign, reassign and bulk-import barcode, QR, RFID and BLE identifiers.' },
    { date: 'Oct 2026', title: 'IoT Analytics & Insights', text: 'Connectivity, movement heatmap, telemetry trends, alerts and site summary with saved views.' },
    { date: 'Oct 2026', title: 'Asset maintenance workspace', text: 'Overview, preventive plans, service requests, history, spare parts and costs for each asset.' },
    { date: 'Oct 2026', title: 'New look', text: 'Purple gradient sidebar and header, glass dashboard tabs and cards that fade in as you scroll.' },
  ];

  section: ProfileSection = '';
  dialog: ProfileDialog = '';
  private readonly access = inject(AccessService);
  // Saved per signed-in user, so one person's display name never shows for the next person on this browser
  private readonly profileKey = `${PROFILE_KEY}:${(inject(AuthService).getUserEmail() ?? '').toLowerCase()}`;
  profile: Profile = readJson<Profile>(this.profileKey, { displayName: '', phone: '' });
  profileForm: Profile = { ...this.profile };
  prefs: Preferences = readJson<Preferences>(PREFS_KEY, { landing: '/dashboard', timeFormat: '12h', notifySound: true });
  prefsForm: Preferences = { ...this.prefs };
  site = this.readSite();
  whatsNewSeen = this.readSeen();
  pw = { current: '', next: '', confirm: '', show: false };
  pwError = '';
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;

  isNotificationsOpen = false;
  notificationsFlyoutPosition: { top: number; left: number } | null = null;

  constructor(
    private router: Router,
    private elementRef: ElementRef,
    private auth: AuthService,
    private notificationService: NotificationService
  ) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => this.updateBreadcrumbs());
  }

  get notifications(): AppNotification[] {
    return this.notificationService.getAll();
  }

  get unreadNotificationCount(): number {
    return this.notificationService.unreadCount();
  }

  toggleNotifications(triggerEl: EventTarget | null): void {
    this.isNotificationsOpen = !this.isNotificationsOpen;
    if (this.isNotificationsOpen && triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      this.notificationsFlyoutPosition = {
        top: rect.bottom + window.scrollY + 4,
        left: rect.right - 340 + window.scrollX
      };
    } else {
      this.notificationsFlyoutPosition = null;
    }
  }

  openNotification(notification: AppNotification): void {
    this.notificationService.markRead(notification.id);
    this.isNotificationsOpen = false;
    this.notificationsFlyoutPosition = null;
    this.router.navigateByUrl(notification.link);
  }

  markAllNotificationsRead(): void {
    this.notificationService.markAllRead();
  }

  /** Name shown in the header chip: the name you set in My Profile, else the name from User Management, else the login name. */
  get displayName(): string {
    const name = this.profile.displayName.trim() || this.access.access()?.displayName || this.auth.getUser()?.userName || '';
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : this.displayEmail;
  }

  get displayEmail(): string {
    return this.access.access()?.email || this.auth.getUserEmail() || environment.supportEmail;
  }

  /** The user's primary role from User Management, else the sign-in role. */
  get roleName(): string {
    return this.access.access()?.roleName || this.auth.getUser()?.roleName || 'User';
  }

  /** Two letters for the avatar, from the signed-in user's name. */
  get initials(): string {
    const name = this.profile.displayName.trim() || this.access.access()?.displayName || this.auth.getUser()?.userName || this.displayEmail.split('@')[0];
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
    return letters.toUpperCase() || 'AD';
  }

  toggleMenu(): void {
    this.toggleSidebar.emit();
  }

  toggleAdminDropdown(triggerEl: EventTarget | null): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    this.section = '';
    if (this.isDropdownOpen) this.closeNotifications();
    if (this.isDropdownOpen && triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      // right edge lines up with the profile chip
      const width = Math.min(300, window.innerWidth - 16);
      this.flyoutPosition = {
        top: rect.bottom + 8,
        left: Math.max(8, rect.right - width)
      };
    } else {
      this.flyoutPosition = null;
    }
  }

  private closeProfileMenu(): void {
    this.isDropdownOpen = false;
    this.flyoutPosition = null;
    this.section = '';
  }

  private closeNotifications(): void {
    this.isNotificationsOpen = false;
    this.notificationsFlyoutPosition = null;
  }

  toggleSection(s: ProfileSection): void {
    this.section = this.section === s ? '' : s;
  }

  open(d: ProfileDialog): void {
    this.closeProfileMenu();
    this.dialog = d;
    this.pwError = '';
    if (d === 'profile') this.profileForm = { ...this.profile };
    if (d === 'preferences') this.prefsForm = { ...this.prefs };
    if (d === 'password') this.pw = { current: '', next: '', confirm: '', show: false };
    if (d === 'whatsNew') {
      this.whatsNewSeen = true;
      writeValue(WHATS_NEW_KEY, WHATS_NEW_VERSION);
    }
  }

  closeDialog(): void {
    this.dialog = '';
  }

  saveProfile(): void {
    this.profile = { displayName: this.profileForm.displayName.trim(), phone: this.profileForm.phone.trim() };
    writeValue(this.profileKey, this.profile);
    this.dialog = '';
    this.showToast('Profile updated.');
  }

  savePrefs(): void {
    this.prefs = { ...this.prefsForm };
    writeValue(PREFS_KEY, this.prefs);
    this.dialog = '';
    this.showToast('Preferences saved.');
  }

  get landingLabel(): string {
    return this.landingPages.find((p) => p.path === this.prefs.landing)?.label ?? 'Dashboard';
  }

  setLanguage(code: string): void {
    const lang = this.languages.find((l) => l.code === code);
    if (!lang?.ready) return;
    this.section = '';
    this.showToast(`Language set to ${lang.label}.`);
  }

  setSite(site: string): void {
    this.site = site;
    writeValue(SITE_KEY, site);
    this.section = '';
    this.showToast(`Switched to ${site}.`);
  }

  private readSite(): string {
    try {
      return localStorage.getItem(SITE_KEY) || 'All Sites';
    } catch {
      return 'All Sites';
    }
  }

  private readSeen(): boolean {
    try {
      return localStorage.getItem(WHATS_NEW_KEY) === WHATS_NEW_VERSION;
    } catch {
      return false;
    }
  }

  goTo(path: string): void {
    this.closeProfileMenu();
    this.dialog = '';
    this.router.navigateByUrl(path);
  }

  get supportEmail(): string {
    return environment.supportEmail;
  }

  get supportMail(): string {
    return `mailto:${environment.supportEmail}?subject=${encodeURIComponent('Asset360 support request')}`;
  }

  get reportMail(): string {
    const body = `Page: ${this.router.url}\nUser: ${this.displayEmail}\n\nWhat happened:\n`;
    return `mailto:${environment.supportEmail}?subject=${encodeURIComponent('Asset360 problem report')}&body=${encodeURIComponent(body)}`;
  }

  get pwChecks(): { label: string; ok: boolean }[] {
    const v = this.pw.next;
    return [
      { label: 'At least 8 characters', ok: v.length >= 8 },
      { label: 'Upper and lower case letters', ok: /[a-z]/.test(v) && /[A-Z]/.test(v) },
      { label: 'A number or symbol', ok: /[\d\W_]/.test(v) },
    ];
  }

  savePassword(): void {
    if (!this.pw.current) return void (this.pwError = 'Enter your current password.');
    if (this.pwChecks.some((c) => !c.ok)) return void (this.pwError = 'The new password does not meet the rules below.');
    if (this.pw.next === this.pw.current) return void (this.pwError = 'Choose a password different from the current one.');
    if (this.pw.next !== this.pw.confirm) return void (this.pwError = 'The new passwords do not match.');
    // DEMO MODE: no identity backend; a real build calls the auth API here
    this.dialog = '';
    this.showToast('Password changed. Use it the next time you sign in.');
  }

  private showToast(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 3500);
  }

  logout(): void {
    this.closeProfileMenu();
    this.auth.logout();
  }

  private updateBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!event.target) {
      return;
    }
    const clickedInside = this.elementRef.nativeElement.contains(event.target);

    if (this.isDropdownOpen) {
      const clickedInsideFlyout = !!(event.target as HTMLElement).closest('.admin-flyout');
      if (!clickedInside && !clickedInsideFlyout) {
        this.isDropdownOpen = false;
        this.flyoutPosition = null;
      }
    }

    if (this.isNotificationsOpen) {
      const clickedInsideNotifications = !!(event.target as HTMLElement).closest('.notifications-flyout');
      if (!clickedInside && !clickedInsideNotifications) {
        this.isNotificationsOpen = false;
        this.notificationsFlyoutPosition = null;
      }
    }
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.flyoutPosition = null;
    }
    if (this.isNotificationsOpen) {
      this.isNotificationsOpen = false;
      this.notificationsFlyoutPosition = null;
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dialog) {
      this.dialog = '';
      return;
    }
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
      this.flyoutPosition = null;
    }
    if (this.isNotificationsOpen) {
      this.isNotificationsOpen = false;
      this.notificationsFlyoutPosition = null;
    }
  }
}
