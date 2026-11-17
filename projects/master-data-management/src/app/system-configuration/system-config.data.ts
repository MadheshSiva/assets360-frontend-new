import { ChartTypeRecord, ConfigStatus, SyncStatusRecord, SystemSettings, UpdateSourceRecord } from './system-config.model';

/* Option lists, blank records and default settings for System Configuration. */

export const SYNC_COLORS = ['#15803d', '#1d4ed8', '#ef4444', '#f59e0b', '#94a3b8', '#7c3aed', '#c026d3', '#0ea5e9'];
export const CHART_CATEGORIES = ['Comparison', 'Trend', 'Distribution', 'KPI', 'Tabular', 'Relationship'];
export const SOURCE_TYPES = ['Manual', 'Device', 'External', 'File', 'API', 'System'];

export function blankSyncStatus(): SyncStatusRecord {
  return { code: '', name: '', description: '', color: SYNC_COLORS[0], isSuccess: false, status: '' as ConfigStatus, createdOn: '', updatedOn: '' };
}

export function blankChartType(): ChartTypeRecord {
  return { code: '', name: '', category: '', description: '', preview: 'column', image: null, status: '' as ConfigStatus, createdOn: '', updatedOn: '' };
}

export function blankUpdateSource(): UpdateSourceRecord {
  return { code: '', name: '', type: '', description: '', status: '' as ConfigStatus, createdOn: '', updatedOn: '' };
}

/* System Settings choices */
export const TIME_ZONES = ['(UTC+04:00) Dubai, Abu Dhabi', '(UTC+03:00) Riyadh, Kuwait', '(UTC+03:00) Doha', '(UTC+05:30) Mumbai, Chennai', '(UTC+00:00) London', '(UTC-05:00) New York'];
export const DATE_FORMATS = ['dd-MMM-yyyy (26-Oct-2026)', 'dd/MM/yyyy (26/10/2026)', 'MM/dd/yyyy (10/26/2026)', 'yyyy-MM-dd (2026-10-26)'];
export const TIME_FORMATS = ['24 Hour (14:30)', '12 Hour (2:30 PM)'];
/** Time zone ids the API stores for the TIME_ZONES choices. */
export const TIME_ZONE_IDS: Record<string, string> = {
  '(UTC+04:00) Dubai, Abu Dhabi': 'Asia/Dubai',
  '(UTC+03:00) Riyadh, Kuwait': 'Asia/Riyadh',
  '(UTC+03:00) Doha': 'Asia/Qatar',
  '(UTC+05:30) Mumbai, Chennai': 'Asia/Kolkata',
  '(UTC+00:00) London': 'Europe/London',
  '(UTC-05:00) New York': 'America/New_York'
};
export const LANGUAGES = ['English', 'Arabic', 'Hindi', 'French'];
/** Language codes the API stores for the LANGUAGES choices. */
export const LANGUAGE_CODES: Record<string, string> = { English: 'en', Arabic: 'ar', Hindi: 'hi', French: 'fr' };
export const RECORDS_PER_PAGE = [10, 20, 50, 100];
export const WEEK_START = ['Sunday', 'Monday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const FILE_TYPES = ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX', 'CSV', 'DWG', 'ZIP'];
export const NOTIFICATION_CHANNELS = ['Email', 'SMS', 'Push', 'In-app'];
export const DIGESTS = ['Off', 'Daily', 'Weekly'];
export const NUMBER_FORMATS = ['1,234.56', '1.234,56', '1 234.56'];
export const ERP_SYSTEMS = ['None', 'SAP S/4HANA', 'Oracle Fusion', 'Microsoft Dynamics 365', 'Odoo'];
export const BACKUP_FREQUENCIES = ['Hourly', 'Daily', 'Weekly'];

/** What the page shows for anything the API hasn't saved yet. */
export function defaultSettings(): SystemSettings {
  return {
    general: {
      systemName: 'Asset360',
      systemUrl: 'https://asset360.purpleiq.com',
      timeZone: TIME_ZONES[0],
      dateFormat: DATE_FORMATS[0],
      timeFormat: TIME_FORMATS[0],
      language: 'English',
      currency: 'AED - UAE Dirham',
      recordsPerPage: 10,
      auditLog: true,
      offlineMode: true,
      maintenanceMode: false
    },
    dateTime: { weekStartsOn: 'Monday', fiscalYearStart: 'January', workdayStart: '08:00', workdayEnd: '17:00' },
    branding: { logo: null, primaryColor: '#4f2bd8', loginMessage: 'Welcome to Asset360' },
    fileUpload: { maxSizeMb: 10, allowedTypes: ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX', 'CSV'], virusScan: true },
    session: { timeoutMinutes: 30, idleWarningMinutes: 5, rememberMeDays: 14, concurrentSessions: true },
    defaults: { criticality: 'Medium', condition: 'New', updateSource: '', chartType: '' },
    security: {
      minPasswordLength: 8,
      requireUppercase: true,
      requireNumber: true,
      requireSymbol: false,
      passwordExpiryDays: 90,
      lockoutAttempts: 5,
      mfaRequired: false,
      ipAllowlist: ''
    },
    email: { smtpHost: 'smtp.office365.com', smtpPort: 587, senderName: 'Asset360', senderEmail: 'noreply@purpleiq.com', useTls: true, channels: ['Email', 'In-app'], digest: 'Daily' },
    localization: { languages: ['English', 'Arabic'], rtl: true, numberFormat: NUMBER_FORMATS[0], units: 'Metric' },
    numbering: { prefix: 'AST', pattern: '{PREFIX}-{YY}-{0000}', startNumber: 1, digits: 4, resetYearly: true, includeSite: false },
    integration: { erp: 'None', apiEnabled: true, rateLimitPerMinute: 120, webhookUrl: '', syncIntervalMinutes: 60, sources: [], failedSyncStatus: '' },
    backup: { frequency: 'Daily', time: '02:00', retentionDays: 30, auditRetentionMonths: 24, deletedRetentionDays: 90 },
    other: { betaFeatures: false, helpdeskEmail: 'support@purpleiq.com', supportPhone: '', termsUrl: '' }
  };
}
