import { ADMIN_LOCATIONS } from '../shared/admin-common';

/*
 * Setting catalogue for Administration > System Configuration. The General Settings that the
 * Administration API stores (see API_SETTING_KEYS in the service) are loaded from and saved to
 * the API; the defaults and the remaining settings here are still client-side only.
 */

export type ConfigFieldType = 'text' | 'number' | 'select' | 'toggle' | 'email' | 'url' | 'logo';
export type ConfigValue = string | number | boolean;

export interface ConfigSetting {
  key: string;
  label: string;
  type: ConfigFieldType;
  value: ConfigValue;
  defaultValue: ConfigValue;
  /** Short help under the control. */
  hint: string;
  /** Hint per selected value, e.g. the date format example or currency name. */
  hintByValue?: Record<string, string>;
  description: string;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  required?: boolean;
  /** Overrides the generated "Allowed Values" text in the detail drawer. */
  allowed?: string;
  scope: string;
  effectiveDate: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ConfigGroup {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Tabs of the section this group shows on (sections without tabs ignore it). */
  tabs?: string[];
  settings: ConfigSetting[];
}

export interface ConfigSection {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  /** Changes in this section go to review instead of being applied straight away. */
  requiresApproval?: boolean;
  tabs?: { id: string; label: string }[];
  groups: ConfigGroup[];
}

export type ChangeStatus = 'Applied' | 'Pending' | 'Rejected';

export interface ConfigChange {
  id: string;
  key: string;
  setting: string;
  section: string;
  oldValue: ConfigValue;
  newValue: ConfigValue;
  updatedBy: string;
  date: string;
  reason: string;
  status: ChangeStatus;
}

/** Connected systems, mirrors the Integration & API page (0 until the integrations API feeds it). */
export const ACTIVE_INTEGRATIONS = 0;

function setting(key: string, label: string, type: ConfigFieldType, value: ConfigValue, extra: Partial<ConfigSetting> = {}): ConfigSetting {
  return {
    key,
    label,
    type,
    value,
    defaultValue: value,
    hint: '',
    description: `Configure the ${label.toLowerCase()} for your organization.`,
    scope: 'Organization-wide',
    // Filled from the API's updatedBy / updatedAt once a setting has been saved
    effectiveDate: '',
    updatedBy: '',
    updatedAt: '',
    ...extra
  };
}

const COUNTRIES = ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'United Kingdom', 'Singapore', 'India'];
const TIME_ZONES = [
  '(GMT+04:00) Dubai',
  '(GMT+03:00) Riyadh',
  '(GMT+03:00) Doha',
  '(GMT+00:00) London',
  '(GMT+08:00) Singapore',
  '(GMT+05:30) Kolkata',
  '(GMT+00:00) UTC'
];
// Formats accepted by the Administration API
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD.MM.YYYY'];
const CURRENCIES = ['AED (د.إ)', 'SAR (﷼)', 'QAR (ر.ق)', 'USD ($)', 'GBP (£)', 'EUR (€)'];
const LANGUAGES = ['English', 'Arabic', 'French', 'Hindi'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SYNC_FREQUENCIES = ['Real-time', 'Every 15 minutes', 'Hourly', 'Daily', 'Manual'];

export function buildSections(): ConfigSection[] {
  return [
    {
      id: 'general',
      title: 'General Settings',
      subtitle: 'Platform identity and defaults',
      description: 'Configure the basic platform settings and default behavior for your organization.',
      icon: 'Settings',
      tabs: [
        { id: 'general', label: 'General' },
        { id: 'regional', label: 'Regional' },
        { id: 'security', label: 'Security' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'integrations', label: 'Integrations' }
      ],
      groups: [
        {
          id: 'platform-identity',
          title: 'Platform Identity',
          subtitle: 'Basic information about your platform and organization.',
          icon: 'Settings',
          tabs: ['general'],
          settings: [
            setting('platformName', 'Platform Name', 'text', 'Asset360', {
              required: true,
              hint: 'Name displayed across the platform.',
              description: 'The product name shown in the header, browser tab and outgoing emails.'
            }),
            setting('organizationName', 'Organization Name', 'text', '', {
              required: true,
              hint: "Your organization's legal name.",
              description: 'Legal name of the organization, used on reports, exports and documents.'
            }),
            setting('logo', 'Logo', 'logo', '', {
              hint: 'PNG, JPG up to 2MB. Recommended 200 × 200px',
              description: 'Logo shown in the side navigation, login page and PDF reports.'
            }),
            setting('defaultLandingPage', 'Default Landing Page', 'select', 'Dashboard', {
              options: ['Dashboard', 'Assets', 'Maintenance', 'Inventory', 'Reports & Analytics'],
              hint: 'Page users see after login.',
              description: 'The page users land on after they sign in.'
            })
          ]
        },
        {
          id: 'regional-defaults',
          title: 'Regional Defaults',
          subtitle: 'Set the default regional preferences for your organization.',
          icon: 'Globe',
          tabs: ['general', 'regional'],
          settings: [
            setting('country', 'Country', 'select', 'United Arab Emirates', {
              options: COUNTRIES,
              description: 'Country used for public holidays, tax defaults and address formats.'
            }),
            setting('timeZone', 'Time Zone', 'select', '(GMT+04:00) Dubai', {
              options: TIME_ZONES,
              hint: 'Applies to all users.',
              allowed: 'All time zones (IANA)',
              description: 'Configure the default time zone for your organization.'
            }),
            setting('dateFormat', 'Date Format', 'select', 'DD/MM/YYYY', {
              options: DATE_FORMATS,
              hintByValue: {
                'DD/MM/YYYY': 'Example: 31/12/2024',
                'MM/DD/YYYY': 'Example: 12/31/2024',
                'YYYY-MM-DD': 'Example: 2024-12-31',
                'DD-MM-YYYY': 'Example: 31-12-2024',
                'DD.MM.YYYY': 'Example: 31.12.2024'
              },
              description: 'How dates are displayed in lists, forms and reports.'
            }),
            setting('currency', 'Currency', 'select', 'AED (د.إ)', {
              options: CURRENCIES,
              hintByValue: {
                'AED (د.إ)': 'UAE Dirham',
                'SAR (﷼)': 'Saudi Riyal',
                'QAR (ر.ق)': 'Qatari Riyal',
                'USD ($)': 'US Dollar',
                'GBP (£)': 'Pound Sterling',
                'EUR (€)': 'Euro'
              },
              description: 'Default currency for asset values, costs and financial reports.'
            }),
            setting('language', 'Language', 'select', 'English', {
              options: LANGUAGES,
              hint: 'Default platform language.',
              description: 'Language used for new users until they pick their own.'
            })
          ]
        },
        {
          id: 'formats',
          title: 'Formats & Calendar',
          subtitle: 'Time, number and calendar conventions.',
          icon: 'Calendar',
          tabs: ['regional'],
          settings: [
            setting('timeFormat', 'Time Format', 'select', '24-hour', { options: ['24-hour', '12-hour'], hint: 'Example: 14:30 or 2:30 PM' }),
            setting('weekStart', 'Week Starts On', 'select', 'Sunday', { options: ['Sunday', 'Monday', 'Saturday'] }),
            setting('numberFormat', 'Number Format', 'select', '1,234.56', { options: ['1,234.56', '1.234,56', '1 234,56'] }),
            setting('fiscalYearStart', 'Fiscal Year Start', 'select', 'January', { options: MONTHS, hint: 'Used by financial reports.' })
          ]
        },
        {
          id: 'user-experience',
          title: 'User Experience',
          subtitle: 'Customize the look and feel and default user interface behavior.',
          icon: 'User',
          tabs: ['general'],
          settings: [
            setting('theme', 'Theme', 'select', 'Light', {
              options: ['Light', 'Dark', 'System'],
              hint: 'Applies to all users by default.',
              description: 'Default colour theme. Users can override it in their profile.'
            }),
            setting('compactMode', 'Compact Mode', 'toggle', false, {
              hint: 'Reduce spacing in tables and lists.',
              description: 'Tighter row height in tables and lists to show more records per screen.'
            }),
            setting('rowsPerPage', 'Default Rows per Page', 'select', '25', {
              options: ['10', '25', '50', '100'],
              hint: 'Number of records per page.',
              description: 'How many records list pages show before paging.'
            }),
            setting('enableTooltips', 'Enable Tooltips', 'toggle', true, {
              hint: 'Show helpful hints across the platform.',
              description: 'Show contextual help tooltips next to fields and actions.'
            })
          ]
        },
        {
          id: 'data-records',
          title: 'Data & Records',
          subtitle: 'Configure default behavior for data management and records.',
          icon: 'Database',
          tabs: ['general'],
          settings: [
            setting('defaultStatus', 'Default Status', 'select', 'Active', {
              options: ['Active', 'Draft', 'Inactive'],
              hint: 'Default status for new records.',
              description: 'Status given to new master records when none is chosen.'
            }),
            setting('autoSaveInterval', 'Auto-save Interval', 'select', '30 seconds', {
              options: ['Off', '15 seconds', '30 seconds', '1 minute', '5 minutes'],
              defaultValue: '1 minute',
              hint: 'Automatically save changes.',
              description: 'How often draft forms are saved automatically.'
            }),
            setting('confirmBeforeDelete', 'Require confirmation before delete', 'toggle', true, {
              hint: 'Show a confirmation dialog before deleting records.',
              description: 'Ask users to confirm before any record is deleted.'
            })
          ]
        },
        {
          id: 'session-access',
          title: 'Session & Access',
          subtitle: 'Quick access to the most used security defaults.',
          icon: 'Shield',
          tabs: ['security'],
          settings: [
            setting('idleTimeout', 'Idle Timeout', 'number', 30, { min: 5, max: 480, unit: 'minutes', hint: 'Sign users out after inactivity.' }),
            setting('rememberDevice', 'Remember Trusted Devices', 'toggle', true, { hint: 'Skip MFA on trusted devices for 30 days.' }),
            setting('concurrentSessions', 'Concurrent Sessions', 'number', 3, { min: 1, max: 10, unit: 'sessions', hint: 'Per user.' }),
            setting('showLastLogin', 'Show Last Login', 'toggle', true, { hint: 'Display the last sign-in time on login.' })
          ]
        },
        {
          id: 'platform-alerts',
          title: 'Platform Alerts',
          subtitle: 'System-wide announcements and administrator alerts.',
          icon: 'Bell',
          tabs: ['notifications'],
          settings: [
            setting('systemAnnouncements', 'System Announcements', 'toggle', true, { hint: 'Show banner announcements to all users.' }),
            setting('adminAlertEmail', 'Admin Alert Email', 'email', '', { required: true, hint: 'Receives critical platform alerts.' }),
            setting('alertDigest', 'Alert Digest', 'select', 'Daily', { options: ['Immediately', 'Hourly', 'Daily', 'Weekly'] }),
            setting('maintenanceNotice', 'Maintenance Notice', 'number', 48, { min: 1, max: 336, unit: 'hours', hint: 'Advance notice before downtime.' })
          ]
        },
        {
          id: 'integration-defaults',
          title: 'Integration Defaults',
          subtitle: 'Defaults applied to new integrations.',
          icon: 'Link',
          tabs: ['integrations'],
          settings: [
            setting('defaultSyncFrequency', 'Default Sync Frequency', 'select', 'Every 15 minutes', { options: SYNC_FREQUENCIES }),
            setting('defaultTimeout', 'Request Timeout', 'number', 300, { min: 10, max: 900, unit: 'seconds' }),
            setting('notifyOnSyncFailure', 'Notify on Sync Failure', 'toggle', true, { hint: 'Email admins when a sync fails.' }),
            setting('defaultEnvironment', 'Default Environment', 'select', 'Production', { options: ['Development', 'Staging', 'Production'] })
          ]
        }
      ]
    },
    {
      id: 'organization',
      title: 'Organization Profile',
      subtitle: 'Company details and branding',
      description: 'Legal, contact and registration details printed on documents and reports.',
      icon: 'Building2',
      groups: [
        {
          id: 'org-details',
          title: 'Company Details',
          subtitle: 'Legal and registration information.',
          icon: 'Building2',
          settings: [
            setting('legalName', 'Legal Name', 'text', '', { required: true }),
            setting('tradeLicense', 'Trade License No.', 'text', '', { required: true }),
            setting('taxNumber', 'Tax Registration (TRN)', 'text', ''),
            setting('headquarters', 'Headquarters', 'select', ADMIN_LOCATIONS[0] ?? '', { options: ADMIN_LOCATIONS })
          ]
        },
        {
          id: 'org-contact',
          title: 'Contact & Branding',
          subtitle: 'How people reach your organization.',
          icon: 'Mail',
          settings: [
            setting('contactEmail', 'Contact Email', 'email', '', { required: true }),
            setting('contactPhone', 'Contact Phone', 'text', ''),
            setting('website', 'Website', 'url', ''),
            setting('brandColor', 'Brand Colour', 'select', 'Purple #5B2AA8', {
              options: ['Purple #5B2AA8', 'Blue #2563EB', 'Pink #EC4899', 'Green #10B981']
            })
          ]
        }
      ]
    },
    {
      id: 'regional',
      title: 'Regional & Localization',
      subtitle: 'Country, language and formats',
      description: 'Languages, units and right-to-left support for every user of the platform.',
      icon: 'Globe',
      groups: [
        {
          id: 'localization',
          title: 'Localization',
          subtitle: 'Languages and units of measure.',
          icon: 'Globe',
          settings: [
            setting('supportedLanguages', 'Supported Languages', 'select', 'English + Arabic', {
              options: ['English only', 'English + Arabic', 'English + Arabic + French']
            }),
            setting('rtlSupport', 'Right-to-left Support', 'toggle', true, { hint: 'Mirror the layout for Arabic.' }),
            setting('measurementUnit', 'Measurement Units', 'select', 'Metric', { options: ['Metric', 'Imperial'] }),
            setting('decimalPlaces', 'Decimal Places', 'number', 2, { min: 0, max: 6, unit: 'digits' }),
            setting('holidayCalendar', 'Holiday Calendar', 'select', 'UAE Public Holidays', {
              options: ['UAE Public Holidays', 'KSA Public Holidays', 'Qatar Public Holidays', 'None']
            }),
            setting('workingDays', 'Working Days', 'select', 'Monday – Friday', { options: ['Monday – Friday', 'Sunday – Thursday', 'Monday – Saturday'] })
          ]
        }
      ]
    },
    {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Email and in-app notifications',
      description: 'Channels, sender details and reminder timing for platform notifications.',
      icon: 'Bell',
      groups: [
        {
          id: 'channels',
          title: 'Channels',
          subtitle: 'How users are notified.',
          icon: 'Bell',
          settings: [
            setting('emailNotifications', 'Email Notifications', 'toggle', true),
            setting('inAppNotifications', 'In-app Notifications', 'toggle', true),
            setting('smsNotifications', 'SMS Notifications', 'toggle', false, { hint: 'Requires an SMS gateway integration.' }),
            setting('digestFrequency', 'Digest Frequency', 'select', 'Daily', { options: ['Off', 'Daily', 'Weekly'] })
          ]
        },
        {
          id: 'sender',
          title: 'Sender & Reminders',
          subtitle: 'Outgoing email identity and reminder rules.',
          icon: 'Mail',
          settings: [
            setting('senderName', 'Sender Name', 'text', 'Asset360 Notifications', { required: true }),
            setting('senderEmail', 'Sender Email', 'email', '', { required: true }),
            setting('quietHours', 'Quiet Hours (22:00 – 07:00)', 'toggle', true, { hint: 'Hold non-urgent notifications overnight.' }),
            setting('reminderLead', 'Reminder Lead Time', 'number', 24, { min: 1, max: 168, unit: 'hours' })
          ]
        }
      ]
    },
    {
      id: 'workflow',
      title: 'Workflow Defaults',
      subtitle: 'Default values and behavior',
      description: 'Default approval and escalation rules used when a workflow does not override them.',
      icon: 'Workflow',
      groups: [
        {
          id: 'approvals',
          title: 'Approvals & Escalation',
          subtitle: 'Applied to every new workflow.',
          icon: 'Workflow',
          settings: [
            setting('approvalLevels', 'Default Approval Levels', 'number', 2, { min: 1, max: 5, unit: 'levels' }),
            setting('approvalSla', 'Approval SLA', 'number', 48, { min: 1, max: 720, unit: 'hours' }),
            setting('autoEscalate', 'Auto-escalate Overdue Approvals', 'toggle', true),
            setting('escalateAfter', 'Escalate After', 'number', 24, { min: 1, max: 336, unit: 'hours' }),
            setting('allowDelegation', 'Allow Delegation', 'toggle', true, { hint: 'Approvers can delegate while away.' }),
            setting('rejectionReason', 'Require Rejection Reason', 'toggle', true),
            setting('defaultPriority', 'Default Priority', 'select', 'Medium', { options: ['Low', 'Medium', 'High', 'Critical'] })
          ]
        }
      ]
    },
    {
      id: 'numbering',
      title: 'Numbering & Master Data',
      subtitle: 'Asset, work order and inventory',
      description: 'Prefixes and sequence rules for the codes generated across Asset360.',
      icon: 'Hash',
      groups: [
        {
          id: 'prefixes',
          title: 'Code Prefixes & Sequences',
          subtitle: 'Used when new records are created.',
          icon: 'Hash',
          settings: [
            setting('assetPrefix', 'Asset Prefix', 'text', 'AST-', { required: true, hint: 'e.g. AST-000124' }),
            setting('workOrderPrefix', 'Work Order Prefix', 'text', 'WO-', { required: true }),
            setting('inventoryPrefix', 'Inventory Prefix', 'text', 'INV-', { required: true }),
            setting('sequenceDigits', 'Sequence Digits', 'number', 6, { min: 3, max: 10, unit: 'digits' }),
            setting('sequenceReset', 'Reset Sequence', 'select', 'Never', { options: ['Never', 'Yearly', 'Monthly'] }),
            setting('includeYear', 'Include Year in Codes', 'toggle', false, { hint: 'e.g. AST-2026-000124' }),
            setting('uniqueAcrossOrgs', 'Unique Across Organizations', 'toggle', true)
          ]
        }
      ]
    },
    {
      id: 'security',
      title: 'Security & Authentication',
      subtitle: 'Access control and session settings',
      description: 'Password, MFA, session and sign-in policies. Changes here are reviewed before they apply.',
      icon: 'Shield',
      requiresApproval: true,
      groups: [
        {
          id: 'password-policy',
          title: 'Password Policy',
          subtitle: 'Rules for local account passwords.',
          icon: 'KeyRound',
          settings: [
            setting('passwordMinLength', 'Minimum Length', 'number', 12, { min: 8, max: 64, unit: 'characters' }),
            setting('passwordSpecialChars', 'Require Special Characters', 'toggle', true),
            setting('passwordExpiry', 'Password Expiry', 'number', 90, { min: 0, max: 365, unit: 'days', hint: '0 = never expires.' }),
            setting('passwordHistory', 'Password History', 'number', 5, { min: 0, max: 24, unit: 'passwords' })
          ]
        },
        {
          id: 'sign-in',
          title: 'Sign-in & Sessions',
          subtitle: 'Authentication and lockout rules.',
          icon: 'Lock',
          settings: [
            setting('mfaPolicy', 'Multi-factor Authentication', 'select', 'Required for admins', {
              options: ['Required for all users', 'Required for admins', 'Optional']
            }),
            setting('sessionTimeout', 'Session Timeout', 'number', 30, { min: 5, max: 480, unit: 'minutes' }),
            setting('maxFailedLogins', 'Max Failed Logins', 'number', 5, { min: 3, max: 10, unit: 'attempts' }),
            setting('lockoutDuration', 'Lockout Duration', 'number', 15, { min: 1, max: 1440, unit: 'minutes' }),
            setting('ssoProvider', 'Single Sign-On', 'select', 'Microsoft Entra ID', {
              options: ['Microsoft Entra ID', 'Okta', 'Google Workspace', 'None']
            }),
            setting('ipRestriction', 'IP Allowlist', 'toggle', false, { hint: 'Only allow sign-in from approved networks.' })
          ]
        }
      ]
    },
    {
      id: 'storage',
      title: 'File & Document Storage',
      subtitle: 'Document storage and file settings',
      description: 'Where attachments are stored and which files users may upload.',
      icon: 'FolderOpen',
      groups: [
        {
          id: 'storage-settings',
          title: 'Storage',
          subtitle: 'Provider, limits and file handling.',
          icon: 'FolderOpen',
          settings: [
            setting('storageProvider', 'Storage Provider', 'select', 'Azure Blob Storage', { options: ['Azure Blob Storage', 'Amazon S3', 'On-premise'] }),
            setting('maxUploadSize', 'Max Upload Size', 'number', 25, { min: 1, max: 500, unit: 'MB' }),
            setting('allowedFileTypes', 'Allowed File Types', 'text', 'pdf, jpg, png, docx, xlsx', { required: true }),
            setting('virusScan', 'Virus Scan Uploads', 'toggle', true),
            setting('fileVersioning', 'Keep File Versions', 'toggle', true),
            setting('storageQuota', 'Storage Quota', 'number', 500, { min: 10, max: 10000, unit: 'GB' }),
            setting('imageCompression', 'Compress Images', 'toggle', true, { hint: 'Resize photos larger than 2048px.' })
          ]
        }
      ]
    },
    {
      id: 'audit',
      title: 'Audit & Compliance',
      subtitle: 'Audit logs and compliance settings',
      description: 'What is written to the audit trail and for how long. Changes here are reviewed before they apply.',
      icon: 'ClipboardCheck',
      requiresApproval: true,
      groups: [
        {
          id: 'audit-trail',
          title: 'Audit Trail',
          subtitle: 'Events captured for compliance.',
          icon: 'ClipboardCheck',
          settings: [
            setting('auditLogging', 'Audit Logging', 'toggle', true),
            setting('auditRetention', 'Audit Log Retention', 'number', 365, { min: 90, max: 3650, unit: 'days' }),
            setting('logLoginEvents', 'Log Sign-in Events', 'toggle', true),
            setting('logDataExports', 'Log Data Exports', 'toggle', false),
            setting('complianceFramework', 'Compliance Framework', 'select', 'ISO 55001', { options: ['ISO 55001', 'ISO 27001', 'SOC 2', 'None'] }),
            setting('tamperProofLogs', 'Tamper-proof Logs', 'toggle', false, { hint: 'Hash-chain audit entries.' }),
            setting('auditReview', 'Audit Review Frequency', 'select', 'Quarterly', { options: ['Monthly', 'Quarterly', 'Yearly'] })
          ]
        }
      ]
    },
    {
      id: 'integration',
      title: 'Integration & API',
      subtitle: 'External systems and API settings',
      description: 'Platform-wide API limits and webhook behavior. Individual connectors live under Integration & API.',
      icon: 'Link',
      groups: [
        {
          id: 'api',
          title: 'API & Webhooks',
          subtitle: 'Limits and delivery rules.',
          icon: 'Link',
          settings: [
            setting('apiAccess', 'Public API Access', 'toggle', true),
            setting('apiRateLimit', 'API Rate Limit', 'number', 1000, { min: 60, max: 10000, unit: 'requests/min' }),
            setting('apiVersion', 'Default API Version', 'select', 'v2', { options: ['v1', 'v2'] }),
            setting('webhookRetries', 'Webhook Retries', 'number', 3, { min: 0, max: 10, unit: 'retries' }),
            setting('webhookTimeout', 'Webhook Timeout', 'number', 30, { min: 5, max: 120, unit: 'seconds' }),
            setting('apiDocsUrl', 'API Documentation URL', 'url', '')
          ]
        }
      ]
    },
    {
      id: 'retention',
      title: 'Data Retention',
      subtitle: 'Data lifecycle and archival',
      description: 'When records are archived, purged and backed up.',
      icon: 'Database',
      groups: [
        {
          id: 'lifecycle',
          title: 'Lifecycle & Backup',
          subtitle: 'Archival, purge and backup schedule.',
          icon: 'Archive',
          settings: [
            setting('archiveAfter', 'Archive Closed Records After', 'number', 24, { min: 1, max: 120, unit: 'months' }),
            setting('purgeArchivedAfter', 'Purge Archived Records After', 'number', 84, { min: 12, max: 240, unit: 'months' }),
            setting('softDelete', 'Soft Delete', 'toggle', true, { hint: 'Deleted records can be restored for 30 days.' }),
            setting('purgeSchedule', 'Purge Schedule', 'select', 'Monthly', { options: ['Weekly', 'Monthly', 'Quarterly'] }),
            setting('legalHold', 'Honour Legal Hold', 'toggle', true),
            setting('backupFrequency', 'Backup Frequency', 'select', 'Daily', { options: ['Hourly', 'Daily', 'Weekly'] }),
            setting('backupRetention', 'Backup Retention', 'number', 30, { min: 7, max: 365, unit: 'days' })
          ]
        }
      ]
    },
    {
      id: 'advanced',
      title: 'Advanced Settings',
      subtitle: 'Technical and advanced options',
      description: 'Technical switches for administrators. Change with care.',
      icon: 'SlidersHorizontal',
      groups: [
        {
          id: 'technical',
          title: 'Technical Options',
          subtitle: 'Caching, exports and diagnostics.',
          icon: 'SlidersHorizontal',
          settings: [
            setting('maintenanceMode', 'Maintenance Mode', 'toggle', false, { hint: 'Only administrators can sign in.' }),
            setting('debugLogging', 'Debug Logging', 'toggle', false),
            setting('featurePreview', 'Feature Previews', 'toggle', true, { hint: 'Show beta features to admins.' }),
            setting('cacheTtl', 'Cache TTL', 'number', 300, { min: 0, max: 86400, unit: 'seconds' }),
            setting('maxExportRows', 'Max Export Rows', 'number', 50000, { min: 1000, max: 1000000, unit: 'rows' }),
            setting('supportUrl', 'Support Portal URL', 'url', '')
          ]
        }
      ]
    }
  ];
}
