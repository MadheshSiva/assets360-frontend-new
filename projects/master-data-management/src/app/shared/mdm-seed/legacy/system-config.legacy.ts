import { ChartPreview, ChartTypeRecord, SyncStatusRecord, SystemSettings, UpdateSourceRecord } from '../../../system-configuration/system-config.model';

/* DEMO MODE: system configuration from the approved designs until the API is wired up. */

export const SYNC_COLORS = ['#15803d', '#1d4ed8', '#ef4444', '#f59e0b', '#94a3b8', '#7c3aed', '#c026d3', '#0ea5e9'];
export const CHART_CATEGORIES = ['Comparison', 'Trend', 'Distribution', 'KPI', 'Tabular', 'Relationship'];
export const SOURCE_TYPES = ['Manual', 'Device', 'External', 'File', 'API', 'System'];

const stamp = (day: number) => new Date(Date.UTC(2024, 1, 1) + day * 86400000).toISOString().slice(0, 16);

// [code, name, description, colour, success]
const SYNC: [string, string, string, string, boolean][] = [
  ['SYNC-001', 'Success', 'Data synchronized successfully', '#15803d', true],
  ['SYNC-002', 'In Progress', 'Synchronization is in progress', '#1d4ed8', false],
  ['SYNC-003', 'Failed', 'Synchronization failed', '#ef4444', false],
  ['SYNC-004', 'Partial Success', 'Partially synchronized with errors', '#f59e0b', false],
  ['SYNC-005', 'Pending', 'Synchronization pending', '#94a3b8', false],
  ['SYNC-006', 'Not Started', 'Sync not yet initiated', '#94a3b8', false],
  ['SYNC-007', 'Skipped', 'Skipped (not applicable)', '#c026d3', false],
  ['SYNC-008', 'Manual', 'Manually updated', '#0ea5e9', true]
];

export function initialSyncStatuses(): SyncStatusRecord[] {
  return SYNC.map(([code, name, description, color, isSuccess], i) => ({
    code,
    name,
    description,
    color,
    isSuccess,
    status: 'Active',
    createdOn: stamp(i),
    updatedOn: stamp(300 + i * 5)
  }));
}

// [code, name, category, description, preview]
const CHARTS: [string, string, string, string, ChartPreview][] = [
  ['CHT-001', 'Column Chart', 'Comparison', 'Vertical bars to compare data', 'column'],
  ['CHT-002', 'Bar Chart', 'Comparison', 'Horizontal bars to compare data', 'bar'],
  ['CHT-003', 'Line Chart', 'Trend', 'Shows trends over time', 'line'],
  ['CHT-004', 'Pie Chart', 'Distribution', 'Shows proportion of data', 'pie'],
  ['CHT-005', 'Doughnut Chart', 'Distribution', 'Alternative to pie chart', 'doughnut'],
  ['CHT-006', 'Area Chart', 'Trend', 'Trend with filled area', 'area'],
  ['CHT-007', 'Gauge Chart', 'KPI', 'Shows KPI values', 'gauge'],
  ['CHT-008', 'Table Chart', 'Tabular', 'Displays data in table format', 'table']
];

export function initialChartTypes(): ChartTypeRecord[] {
  return CHARTS.map(([code, name, category, description, preview], i) => ({
    code,
    name,
    category,
    description,
    preview,
    image: null,
    status: 'Active',
    createdOn: stamp(i + 20),
    updatedOn: stamp(320 + i * 4)
  }));
}

// [code, name, type, description]
const SOURCES: [string, string, string, string][] = [
  ['SRC-001', 'Manual Entry', 'Manual', 'Entered directly in system'],
  ['SRC-002', 'Barcode Scanner', 'Device', 'Updated via barcode scanning'],
  ['SRC-003', 'Mobile App', 'Device', 'Updated from mobile application'],
  ['SRC-004', 'IoT Device', 'Device', 'Updated from IoT sensors'],
  ['SRC-005', 'Third Party System', 'External', 'Updated from integrated system'],
  ['SRC-006', 'File Import', 'File', 'Updated via bulk import (CSV/Excel)'],
  ['SRC-007', 'API Integration', 'API', 'Updated via API'],
  ['SRC-008', 'Scheduled Sync', 'System', 'Updated via scheduled job']
];

export function initialUpdateSources(): UpdateSourceRecord[] {
  return SOURCES.map(([code, name, type, description], i) => ({
    code,
    name,
    type,
    description,
    status: 'Active',
    createdOn: stamp(i + 40),
    updatedOn: stamp(340 + i * 3)
  }));
}

export function blankSyncStatus(): SyncStatusRecord {
  return { code: '', name: '', description: '', color: SYNC_COLORS[0], isSuccess: false, status: 'Active', createdOn: '', updatedOn: '' };
}

export function blankChartType(): ChartTypeRecord {
  return { code: '', name: '', category: '', description: '', preview: 'column', image: null, status: 'Active', createdOn: '', updatedOn: '' };
}

export function blankUpdateSource(): UpdateSourceRecord {
  return { code: '', name: '', type: '', description: '', status: 'Active', createdOn: '', updatedOn: '' };
}

/* System Settings choices */
export const TIME_ZONES = ['(UTC+04:00) Dubai, Abu Dhabi', '(UTC+03:00) Riyadh, Kuwait', '(UTC+03:00) Doha', '(UTC+05:30) Mumbai, Chennai', '(UTC+00:00) London', '(UTC-05:00) New York'];
export const DATE_FORMATS = ['dd-MMM-yyyy (26-Oct-2026)', 'dd/MM/yyyy (26/10/2026)', 'MM/dd/yyyy (10/26/2026)', 'yyyy-MM-dd (2026-10-26)'];
export const TIME_FORMATS = ['24 Hour (14:30)', '12 Hour (2:30 PM)'];
export const LANGUAGES = ['English', 'Arabic', 'Hindi', 'French'];
export const RECORDS_PER_PAGE = [10, 20, 50, 100];
export const WEEK_START = ['Sunday', 'Monday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const FILE_TYPES = ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX', 'CSV', 'DWG', 'ZIP'];
export const NOTIFICATION_CHANNELS = ['Email', 'SMS', 'Push', 'In-app'];
export const DIGESTS = ['Off', 'Daily', 'Weekly'];
export const NUMBER_FORMATS = ['1,234.56', '1.234,56', '1 234.56'];
export const ERP_SYSTEMS = ['None', 'SAP S/4HANA', 'Oracle Fusion', 'Microsoft Dynamics 365', 'Odoo'];
export const BACKUP_FREQUENCIES = ['Hourly', 'Daily', 'Weekly'];

export function initialSettings(): SystemSettings {
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
    defaults: { criticality: 'Medium', condition: 'New', updateSource: 'SRC-001', chartType: 'CHT-001' },
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
    integration: { erp: 'None', apiEnabled: true, rateLimitPerMinute: 120, webhookUrl: '', syncIntervalMinutes: 60, sources: ['SRC-005', 'SRC-007', 'SRC-008'], failedSyncStatus: 'SYNC-003' },
    backup: { frequency: 'Daily', time: '02:00', retentionDays: 30, auditRetentionMonths: 24, deletedRetentionDays: 90 },
    other: { betaFeatures: false, helpdeskEmail: 'support@purpleiq.com', supportPhone: '+971 4 000 0000', termsUrl: '' }
  };
}
