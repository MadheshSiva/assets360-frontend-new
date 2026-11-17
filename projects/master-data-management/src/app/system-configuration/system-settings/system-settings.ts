import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Archive,
  Calendar,
  Clock,
  Globe,
  Hash,
  Info,
  KeyRound,
  ListChecks,
  LucideAngularModule,
  Mail,
  Palette,
  Plug,
  Save,
  Settings,
  Shield,
  SlidersHorizontal,
  Timer,
  Upload
} from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { ConditionService } from '../../asset/condition/condition.service';
import { CriticalityService } from '../../asset/criticality/criticality.service';
import { HEX_COLOR } from '../../asset/level-icons';
import { CURRENCIES } from '../../organization/organization/organization.data';
import { EMAIL, readPhoto } from '../../people/people.data';
import { apiErrorMessage } from '../../shared/mdm-api';
import {
  BACKUP_FREQUENCIES,
  DATE_FORMATS,
  DIGESTS,
  ERP_SYSTEMS,
  FILE_TYPES,
  LANGUAGES,
  MONTHS,
  NOTIFICATION_CHANNELS,
  NUMBER_FORMATS,
  RECORDS_PER_PAGE,
  TIME_FORMATS,
  TIME_ZONES,
  WEEK_START
} from '../system-config.data';
import { SystemSettings } from '../system-config.model';
import { ChartTypeService, SyncStatusService, SystemSettingsService, UpdateSourceService } from '../system-config.service';

type TabId = 'general' | 'security' | 'email' | 'localization' | 'numbering' | 'integration' | 'backup' | 'other';
type SectionId =
  | 'general'
  | 'dateTime'
  | 'branding'
  | 'fileUpload'
  | 'session'
  | 'defaults'
  | 'password'
  | 'access'
  | 'smtp'
  | 'notifications'
  | 'languages'
  | 'formats'
  | 'numbering'
  | 'erp'
  | 'sync'
  | 'backup'
  | 'retention'
  | 'support'
  | 'features';

const WEB_URL = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
// IPv4 address with an optional /bits mask
const IPV4 = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/;

/** Master Data Management > System Configuration > System Settings */
@Component({
  selector: 'app-mdm-system-configuration-system-settings',
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './system-settings.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../../shared/styles/mdm-drawer.css', '../../people/people-form.css', '../../asset/level-form.css', './system-settings.css', '../../shared/styles/mdm-purple-theme.css']
})
export class SystemSettingsPage {
  private readonly service = inject(SystemSettingsService);
  readonly criticalities = inject(CriticalityService);
  readonly conditions = inject(ConditionService);
  readonly sources = inject(UpdateSourceService);
  readonly charts = inject(ChartTypeService);
  readonly syncStatuses = inject(SyncStatusService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly icons = { Settings, Save, Info };

  readonly options = {
    timeZones: TIME_ZONES,
    dateFormats: DATE_FORMATS,
    timeFormats: TIME_FORMATS,
    languages: LANGUAGES,
    currencies: CURRENCIES,
    recordsPerPage: RECORDS_PER_PAGE,
    weekStart: WEEK_START,
    months: MONTHS,
    fileTypes: FILE_TYPES,
    channels: NOTIFICATION_CHANNELS,
    digests: DIGESTS,
    numberFormats: NUMBER_FORMATS,
    erp: ERP_SYSTEMS,
    backupFrequencies: BACKUP_FREQUENCIES
  };

  readonly tabs: { id: TabId; label: string; sections: { id: SectionId; label: string; icon: typeof Settings }[] }[] = [
    {
      id: 'general',
      label: 'General',
      sections: [
        { id: 'general', label: 'General Settings', icon: Settings },
        { id: 'dateTime', label: 'Date & Time', icon: Clock },
        { id: 'branding', label: 'Application Branding', icon: Palette },
        { id: 'fileUpload', label: 'File Upload', icon: Upload },
        { id: 'session', label: 'Session & Timeout', icon: Timer },
        { id: 'defaults', label: 'Default Values', icon: SlidersHorizontal }
      ]
    },
    {
      id: 'security',
      label: 'Security',
      sections: [
        { id: 'password', label: 'Password Policy', icon: KeyRound },
        { id: 'access', label: 'Sign-in & Access', icon: Shield }
      ]
    },
    {
      id: 'email',
      label: 'Email & Notifications',
      sections: [
        { id: 'smtp', label: 'Email Server', icon: Mail },
        { id: 'notifications', label: 'Notifications', icon: ListChecks }
      ]
    },
    {
      id: 'localization',
      label: 'Localization',
      sections: [
        { id: 'languages', label: 'Languages', icon: Globe },
        { id: 'formats', label: 'Number & Units', icon: Hash }
      ]
    },
    { id: 'numbering', label: 'Asset Numbering', sections: [{ id: 'numbering', label: 'Asset Tag Format', icon: Hash }] },
    {
      id: 'integration',
      label: 'Integration',
      sections: [
        { id: 'erp', label: 'ERP & API', icon: Plug },
        { id: 'sync', label: 'Data Sync', icon: Calendar }
      ]
    },
    {
      id: 'backup',
      label: 'Backup & Retention',
      sections: [
        { id: 'backup', label: 'Backup', icon: Archive },
        { id: 'retention', label: 'Data Retention', icon: Clock }
      ]
    },
    {
      id: 'other',
      label: 'Other',
      sections: [
        { id: 'support', label: 'Support', icon: Info },
        { id: 'features', label: 'Features', icon: SlidersHorizontal }
      ]
    }
  ];

  tab: TabId = 'general';
  section: SectionId = 'general';
  form: SystemSettings = this.service.draft();
  errors: Partial<Record<string, string>> = {};
  toast = '';
  saving = false;
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.service.load().subscribe({
      next: () => (this.form = this.service.draft()),
      error: (err) => this.notify(`Settings could not be loaded: ${apiErrorMessage(err)}`)
    });
    // Choices for Default Values and Integration
    this.sources.load().subscribe({ error: () => undefined });
    this.charts.load().subscribe({ error: () => undefined });
    this.syncStatuses.load().subscribe({ error: () => undefined });
  }

  get currentTab() {
    return this.tabs.find((t) => t.id === this.tab)!;
  }

  get dirty(): boolean {
    return JSON.stringify(this.form) !== JSON.stringify(this.service.current());
  }

  get lastSaved(): string {
    return this.service.lastSaved();
  }

  /** The tag the next asset would get, e.g. AST-26-0001. */
  get tagPreview(): string {
    const n = this.form.numbering;
    const number = String(Math.max(1, Number(n.startNumber) || 1)).padStart(Math.max(1, Number(n.digits) || 1), '0');
    return n.pattern
      .replace(/\{PREFIX\}/g, n.prefix || 'AST')
      .replace(/\{YY\}/g, String(new Date().getFullYear()).slice(-2))
      .replace(/\{SITE\}/g, n.includeSite ? 'DXB' : '')
      .replace(/\{0+\}/g, number)
      .replace(/--+/g, '-');
  }

  get failedStatuses() {
    return this.syncStatuses.all().filter((s) => !s.isSuccess && (s.status === 'Active' || s.code === this.form.integration.failedSyncStatus));
  }

  // Warn before leaving the browser tab with unsaved changes
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty) event.preventDefault();
  }

  openTab(id: TabId): void {
    this.tab = id;
    this.section = this.currentTab.sections[0].id;
  }

  toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  onLogoPicked(event: Event): void {
    readPhoto(
      event,
      (url) => {
        this.form.branding.logo = url;
        delete this.errors['branding.logo'];
      },
      (message) => (this.errors = { ...this.errors, 'branding.logo': message })
    );
  }

  discard(): void {
    this.form = this.service.draft();
    this.errors = {};
    this.notify('Changes discarded.');
  }

  save(): void {
    const errors = this.validate(this.form);
    this.errors = errors;
    const first = Object.keys(errors)[0];
    if (first) {
      // Open the section with the first problem
      const section = first.split('.')[0] as SectionId;
      const owner = this.tabs.find((t) => t.sections.some((s) => s.id === section));
      if (owner) {
        this.tab = owner.id;
        this.section = section;
      }
      this.notify('Some settings need fixing before they can be saved.');
      return;
    }
    if (this.saving) return;
    this.saving = true;
    this.service.save(this.form).subscribe({
      next: () => {
        this.saving = false;
        this.form = this.service.draft();
        this.notify('Settings saved.');
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  private validate(f: SystemSettings): Record<string, string> {
    const e: Record<string, string> = {};
    const between = (key: string, value: number, min: number, max: number, unit = '') => {
      if (!Number.isInteger(value) || value < min || value > max) e[key] = `Enter ${min} to ${max}${unit}.`;
    };
    if (!f.general.systemName.trim()) e['general.systemName'] = 'Enter the system name.';
    if (!WEB_URL.test(f.general.systemUrl.trim())) e['general.systemUrl'] = 'Enter a full URL, e.g. https://asset360.example.com';
    if (f.dateTime.workdayEnd <= f.dateTime.workdayStart) e['dateTime.workdayEnd'] = 'Must be after the start time.';
    if (!HEX_COLOR.test(f.branding.primaryColor)) e['branding.primaryColor'] = 'Enter a colour like #4F2BD8.';
    between('fileUpload.maxSizeMb', f.fileUpload.maxSizeMb, 1, 100, ' MB');
    if (!f.fileUpload.allowedTypes.length) e['fileUpload.allowedTypes'] = 'Allow at least one file type.';
    between('session.timeoutMinutes', f.session.timeoutMinutes, 5, 480, ' minutes');
    if (!e['session.timeoutMinutes'] && !(f.session.idleWarningMinutes >= 1 && f.session.idleWarningMinutes < f.session.timeoutMinutes)) {
      e['session.idleWarningMinutes'] = 'Must be at least 1 and less than the timeout.';
    }
    between('session.rememberMeDays', f.session.rememberMeDays, 0, 90, ' days');
    between('password.minPasswordLength', f.security.minPasswordLength, 6, 64);
    between('password.passwordExpiryDays', f.security.passwordExpiryDays, 0, 365, ' days (0 = never)');
    between('access.lockoutAttempts', f.security.lockoutAttempts, 3, 10);
    const badIp = f.security.ipAllowlist
      .split(/\n|,/)
      .map((s) => s.trim())
      .find((s) => s && !IPV4.test(s));
    if (badIp) e['access.ipAllowlist'] = `${badIp} isn't an IPv4 address or range (e.g. 10.0.0.0/24).`;
    if (f.email.channels.includes('Email') && !f.email.smtpHost.trim()) e['smtp.smtpHost'] = 'Enter the mail server, or turn off email notifications.';
    between('smtp.smtpPort', f.email.smtpPort, 1, 65535);
    if (!EMAIL.test(f.email.senderEmail.trim())) e['smtp.senderEmail'] = 'Enter a valid email address.';
    if (!f.localization.languages.includes(f.general.language)) e['languages.languages'] = `${f.general.language} is the default language, so it must stay enabled.`;
    if (!/^[A-Z0-9]{1,6}$/i.test(f.numbering.prefix)) e['numbering.prefix'] = 'Use 1 to 6 letters or digits.';
    if (!/\{0+\}/.test(f.numbering.pattern)) e['numbering.pattern'] = 'Include a running number, e.g. {0000}.';
    between('numbering.digits', f.numbering.digits, 3, 8);
    between('numbering.startNumber', f.numbering.startNumber, 1, 99999999);
    if (f.integration.webhookUrl.trim() && !/^https:\/\//i.test(f.integration.webhookUrl.trim())) e['erp.webhookUrl'] = 'Webhooks must use https://.';
    between('erp.rateLimitPerMinute', f.integration.rateLimitPerMinute, 10, 10000);
    between('sync.syncIntervalMinutes', f.integration.syncIntervalMinutes, 5, 1440, ' minutes');
    between('retention.retentionDays', f.backup.retentionDays, 7, 365, ' days');
    between('retention.auditRetentionMonths', f.backup.auditRetentionMonths, 6, 120, ' months');
    between('retention.deletedRetentionDays', f.backup.deletedRetentionDays, 0, 365, ' days');
    if (f.other.helpdeskEmail.trim() && !EMAIL.test(f.other.helpdeskEmail.trim())) e['support.helpdeskEmail'] = 'Enter a valid email address.';
    if (f.other.termsUrl.trim() && !WEB_URL.test(f.other.termsUrl.trim())) e['support.termsUrl'] = 'Enter a full URL.';
    return e;
  }

  notify(message: string): void {
    this.toast = message;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = ''), 4000);
  }
}
