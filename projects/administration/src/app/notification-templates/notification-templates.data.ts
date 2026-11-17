import { Channel, NotificationTemplate, TemplateIcon, TemplateStatus, Tone, VariableGroup } from './notification-templates.model';

// DEMO MODE: seed notification templates until the notification service API exists

export const TEMPLATE_CATEGORIES = ['Maintenance', 'Compliance', 'Assets', 'Inventory', 'Inspection', 'Administration', 'Contracts', 'Financial', 'Tracking & IoT', 'Procurement'];

export const CATEGORY_PREFIX: Record<string, string> = {
  Maintenance: 'WO', Compliance: 'CMP', Assets: 'AST', Inventory: 'INV', Inspection: 'INS', Administration: 'ADM',
  Contracts: 'CON', Financial: 'FIN', 'Tracking & IoT': 'TRK', Procurement: 'PRC'
};

export const TRIGGER_EVENTS = [
  'Work Order Assigned', 'Work Order Overdue', 'Work Order Completed', 'Approval Requested', 'Approval Decision Made',
  'Asset Movement Completed', 'Asset Checked Out', 'Asset Checked In', 'Inspection Scheduled', 'Inspection Failed',
  'Certificate Expiring', 'Stock Below Reorder Level', 'User Invited', 'Password Reset Requested', 'Contract Expiring',
  'Warranty Expiring', 'Device Offline', 'Geofence Breach', 'Purchase Order Approved', 'Budget Threshold Reached'
];

export const LANGUAGES = ['English (Default)', 'Arabic', 'French', 'Hindi', 'Urdu'];
export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];
export const DELIVERY_TIMINGS = ['Send Immediately', 'Batch Hourly', 'Daily Digest (08:00)', 'Business Hours Only'];
export const RETRY_POLICIES = ['No retry', '1 retry (15 min)', '3 retries (1hr apart)', '5 retries (exponential)'];
export const SORT_OPTIONS = ['Last Updated', 'Name', 'Category', 'Status'];

export const VARIABLE_GROUPS: VariableGroup[] = [
  { name: 'Work Order', icon: 'wo', variables: ['work_order_number', 'work_order_type', 'priority', 'due_date', 'status'] },
  { name: 'Asset', icon: 'asset', variables: ['asset_name', 'asset_code', 'asset_category', 'location_name', 'serial_number'] },
  { name: 'User', icon: 'user', variables: ['assignee_name', 'requestor_name', 'supervisor_name', 'user_email', 'team_name'] },
  { name: 'Organization', icon: 'org', variables: ['organization_name', 'site_name', 'support_email', 'portal_url'] }
];

/** Values the Live Preview and Test Send substitute for each variable. */
export const SAMPLE_VALUES: Record<string, string> = {
  work_order_number: 'WO-10245',
  work_order_type: 'Corrective Maintenance',
  priority: 'High',
  due_date: '28 Apr 2025',
  status: 'Open',
  asset_name: 'Air Handling Unit AHU-01',
  asset_code: 'AST-HVAC-0001',
  asset_category: 'HVAC',
  location_name: 'Main Building - Level 2',
  serial_number: 'SN-AHU-77821',
  assignee_name: 'John Doe',
  requestor_name: 'Omar Hassan',
  supervisor_name: 'Sarah Ahmed',
  user_email: 'john.doe@purpleiq.com',
  team_name: 'HVAC Team A',
  organization_name: 'Purple IQ Group',
  site_name: 'Dubai HQ',
  support_email: 'support@asset360.com',
  portal_url: 'https://app.asset360.com'
};

const WORK_ORDER_BODY = `Hi {{assignee_name}},

A new work order has been assigned to you.

Work Order Number: {{work_order_number}}
Asset: {{asset_name}}
Priority: {{priority}}
Due Date: {{due_date}}
Location: {{location_name}}

You can view the full details and take action using the button below.

[button:Open Work Order]

If you have any questions, please contact your supervisor.

Regards,
The Asset360 Team`;

/** Body for the generated templates: greeting, one-line summary, detail block, call to action. */
function genericBody(name: string, category: string): string {
  const details =
    category === 'Inventory'
      ? 'Item: {{asset_name}}\nItem Code: {{asset_code}}\nLocation: {{location_name}}'
      : category === 'Administration'
        ? 'User: {{assignee_name}}\nEmail: {{user_email}}\nOrganization: {{organization_name}}'
        : category === 'Maintenance' || category === 'Inspection'
          ? 'Work Order Number: {{work_order_number}}\nAsset: {{asset_name}}\nPriority: {{priority}}\nDue Date: {{due_date}}'
          : 'Asset: {{asset_name}}\nAsset Code: {{asset_code}}\nLocation: {{location_name}}\nDue Date: {{due_date}}';
  return `Hi {{assignee_name}},

This is a notification about: ${name}.

${details}

[button:View in Asset360]

Regards,
The Asset360 Team`;
}

// name, category, owner, minutes ago, status, channels (e/s/i/p), trigger, icon, tone
type Row = [string, string, string, number, TemplateStatus, string, string, TemplateIcon, Tone];
const DAY = 1440;
const ROWS: Row[] = [
  ['Work Order Assigned', 'Maintenance', 'Sarah Ahmed', 2 * DAY, 'Active', 'esip', 'Work Order Assigned', 'mail', 'purple'],
  ['Approval Required', 'Compliance', 'James Tan', 7 * DAY, 'Active', 'esip', 'Approval Requested', 'file', 'orange'],
  ['Asset Movement Completed', 'Assets', 'Priya Sharma', 7 * DAY + 60, 'Active', 'esip', 'Asset Movement Completed', 'truck', 'blue'],
  ['Inspection Due', 'Compliance', 'Sarah Ahmed', 3 * DAY, 'Draft', 'esip', 'Inspection Scheduled', 'calendar', 'red'],
  ['Compliance Certificate Expiry', 'Compliance', 'Ahmed Khan', 8 * DAY, 'Active', 'esip', 'Certificate Expiring', 'shield', 'orange'],
  ['Inventory Reorder Alert', 'Inventory', 'Lisa Wong', 14 * DAY, 'Active', 'esip', 'Stock Below Reorder Level', 'box', 'purple'],
  ['User Invitation', 'Administration', 'Sarah Ahmed', 15 * DAY, 'Active', 'esip', 'User Invited', 'user', 'blue'],
  ['Work Order Overdue', 'Maintenance', 'Omar Hassan', 4 * DAY, 'Active', 'eip', 'Work Order Overdue', 'wrench', 'red'],
  ['Work Order Completed', 'Maintenance', 'Daniel Kim', 5 * DAY, 'Active', 'ei', 'Work Order Completed', 'wrench', 'green'],
  ['Approval Decision', 'Compliance', 'James Tan', 6 * DAY, 'Active', 'eip', 'Approval Decision Made', 'file', 'green'],
  ['Asset Checked Out', 'Assets', 'Priya Sharma', 9 * DAY, 'Active', 'ei', 'Asset Checked Out', 'truck', 'purple'],
  ['Asset Checked In', 'Assets', 'Priya Sharma', 9 * DAY + 120, 'Active', 'ei', 'Asset Checked In', 'truck', 'green'],
  ['Inspection Failed', 'Inspection', 'Aisha Rahman', 10 * DAY, 'Active', 'esip', 'Inspection Failed', 'alert', 'red'],
  ['Inspection Scheduled', 'Inspection', 'Aisha Rahman', 11 * DAY, 'Active', 'ei', 'Inspection Scheduled', 'calendar', 'blue'],
  ['Password Reset', 'Administration', 'Ahmed Khan', 12 * DAY, 'Active', 'es', 'Password Reset Requested', 'user', 'orange'],
  ['Contract Expiry Reminder', 'Contracts', 'Fatima Noor', 13 * DAY, 'Active', 'ei', 'Contract Expiring', 'file', 'pink'],
  ['Warranty Expiry Reminder', 'Contracts', 'John Mathew', 16 * DAY, 'Active', 'ei', 'Warranty Expiring', 'shield', 'pink'],
  ['Tracking Device Offline', 'Tracking & IoT', 'Rahul Mehta', 17 * DAY, 'Active', 'sip', 'Device Offline', 'bell', 'red'],
  ['Geofence Breach Alert', 'Tracking & IoT', 'Rahul Mehta', 18 * DAY, 'Active', 'esip', 'Geofence Breach', 'alert', 'red'],
  ['Purchase Order Approved', 'Procurement', 'Fatima Al Mansoori', 19 * DAY, 'Active', 'ei', 'Purchase Order Approved', 'file', 'green'],
  ['Budget Threshold Reached', 'Financial', 'Ahmed Al Marri', 20 * DAY, 'Active', 'ei', 'Budget Threshold Reached', 'alert', 'orange'],
  ['Preventive Maintenance Reminder', 'Maintenance', 'Daniel Tan', 21 * DAY, 'Active', 'eip', 'Work Order Assigned', 'wrench', 'blue'],
  ['Spare Part Issued', 'Inventory', 'Priya Nair', 22 * DAY, 'Active', 'i', 'Stock Below Reorder Level', 'box', 'green'],
  ['Stock Count Due', 'Inventory', 'Lisa Wong', 23 * DAY, 'Draft', 'ei', 'Stock Below Reorder Level', 'box', 'orange'],
  ['Audit Finding Raised', 'Compliance', 'Omar Khalid', 24 * DAY, 'Active', 'ei', 'Inspection Failed', 'shield', 'red'],
  ['Role Assignment Changed', 'Administration', 'Sarah Ahmed', 25 * DAY, 'Active', 'ei', 'User Invited', 'user', 'purple'],
  ['Asset Disposal Approved', 'Assets', 'Michael Chen', 26 * DAY, 'Active', 'ei', 'Approval Decision Made', 'truck', 'orange'],
  ['Calibration Due', 'Maintenance', 'James Wilson', 27 * DAY, 'Active', 'eip', 'Inspection Scheduled', 'calendar', 'orange'],
  ['Technician Shift Reminder', 'Maintenance', 'Mohammed Ali', 28 * DAY, 'Inactive', 'sp', 'Work Order Assigned', 'bell', 'blue'],
  ['Vendor Invoice Received', 'Financial', 'Ahmed Al Marri', 29 * DAY, 'Active', 'e', 'Purchase Order Approved', 'file', 'blue'],
  ['Depreciation Run Completed', 'Financial', 'Michael Chen', 30 * DAY, 'Active', 'e', 'Budget Threshold Reached', 'file', 'purple'],
  ['Safety Permit Expiring', 'Compliance', 'Omar Hassan', 31 * DAY, 'Active', 'esi', 'Certificate Expiring', 'shield', 'orange'],
  ['Asset Registered', 'Assets', 'Sarah Khan', 32 * DAY, 'Active', 'i', 'Asset Checked In', 'box', 'purple'],
  ['Lost Asset Reported', 'Assets', 'Fatima Ali', 33 * DAY, 'Active', 'esip', 'Geofence Breach', 'alert', 'red'],
  ['Goods Received', 'Procurement', 'Lisa Wong', 34 * DAY, 'Active', 'ei', 'Purchase Order Approved', 'box', 'green'],
  ['Account Locked', 'Administration', 'Ahmed Khan', 35 * DAY, 'Active', 'es', 'Password Reset Requested', 'user', 'red'],
  ['Lease Renewal Notice', 'Contracts', 'Daniel Kim', 36 * DAY, 'Draft', 'e', 'Contract Expiring', 'file', 'purple'],
  ['Battery Low Alert', 'Tracking & IoT', 'Rahul Mehta', 38 * DAY, 'Active', 'p', 'Device Offline', 'bell', 'orange'],
  ['Monthly Maintenance Digest', 'Maintenance', 'Sarah Ahmed', 40 * DAY, 'Active', 'e', 'Work Order Completed', 'mail', 'purple'],
  ['Inspection Report Ready', 'Inspection', 'Aisha Rahman', 42 * DAY, 'Active', 'ei', 'Inspection Scheduled', 'file', 'green'],
  ['Requisition Rejected', 'Procurement', 'Fatima Al Mansoori', 45 * DAY, 'Draft', 'ei', 'Approval Decision Made', 'alert', 'red'],
  ['Legacy SMS Alert', 'Administration', 'John Mathew', 60 * DAY, 'Inactive', 's', 'Work Order Assigned', 'bell', 'pink']
];

function channelsFrom(flags: string): Record<Channel, boolean> {
  return { email: flags.includes('e'), sms: flags.includes('s'), inApp: flags.includes('i'), push: flags.includes('p') };
}

export function seedTemplates(now: number): NotificationTemplate[] {
  const perPrefix: Record<string, number> = {};
  return ROWS.map(([name, category, owner, minutesAgo, status, flags, trigger, icon, tone], i) => {
    const prefix = CATEGORY_PREFIX[category] ?? 'GEN';
    perPrefix[prefix] = (perPrefix[prefix] ?? 0) + 1;
    const isWorkOrder = i === 0;
    const body = isWorkOrder ? WORK_ORDER_BODY : genericBody(name, category);
    return {
      id: `NT-${String(i + 1).padStart(4, '0')}`,
      name,
      code: `NT-${prefix}-${String(perPrefix[prefix]).padStart(3, '0')}`,
      category,
      owner,
      description: `${name} notification for ${category.toLowerCase()}.`,
      status,
      version: isWorkOrder ? 'v2.1' : status === 'Draft' ? 'v0.1' : `v${1 + (i % 3)}.${i % 4}`,
      updated: new Date(now - minutesAgo * 60000).toISOString(),
      triggerEvent: trigger,
      channels: channelsFrom(flags),
      language: 'English (Default)',
      priority: isWorkOrder ? 'Normal' : PRIORITIES[i % 3 === 0 ? 2 : 1],
      deliveryTiming: 'Send Immediately',
      retryPolicy: '3 retries (1hr apart)',
      email: {
        subject: isWorkOrder ? 'New work order assigned: {{work_order_number}}' : `${name}: {{asset_name}}`,
        fromName: 'Asset360 Notifications',
        replyTo: 'noreply@asset360.com',
        recipientType: 'Assignee',
        body
      },
      sms: { text: isWorkOrder ? 'Asset360: {{work_order_number}} assigned to you for {{asset_name}}. Priority {{priority}}, due {{due_date}}.' : `Asset360: ${name} - {{asset_name}}. Open the app for details.` },
      inApp: { title: isWorkOrder ? 'New work order {{work_order_number}}' : name, body: isWorkOrder ? '{{asset_name}} at {{location_name}} needs attention by {{due_date}}.' : `${name} for {{asset_name}}.`, link: '{{portal_url}}' },
      push: { title: isWorkOrder ? 'Work order assigned' : name, body: isWorkOrder ? '{{work_order_number}} · {{asset_name}} · {{priority}}' : '{{asset_name}} - tap to view.' },
      icon,
      tone
    };
  });
}

/** Starter content offered by "Template Library". */
export const LIBRARY: { name: string; category: string; trigger: string; subject: string; body: string; sms: string }[] = [
  {
    name: 'SLA Breach Warning', category: 'Maintenance', trigger: 'Work Order Overdue',
    subject: 'SLA at risk: {{work_order_number}}',
    body: 'Hi {{supervisor_name}},\n\nWork order {{work_order_number}} for {{asset_name}} is about to breach its SLA.\n\nPriority: {{priority}}\nDue Date: {{due_date}}\nAssignee: {{assignee_name}}\n\n[button:Open Work Order]\n\nRegards,\nThe Asset360 Team',
    sms: 'SLA at risk: {{work_order_number}} ({{priority}}) due {{due_date}}.'
  },
  {
    name: 'Asset Checked Out Receipt', category: 'Assets', trigger: 'Asset Checked Out',
    subject: 'You checked out {{asset_name}}',
    body: 'Hi {{assignee_name}},\n\nYou have checked out the following asset.\n\nAsset: {{asset_name}}\nAsset Code: {{asset_code}}\nLocation: {{location_name}}\n\n[button:View Asset]\n\nRegards,\nThe Asset360 Team',
    sms: 'You checked out {{asset_name}} ({{asset_code}}).'
  },
  {
    name: 'Welcome to Asset360', category: 'Administration', trigger: 'User Invited',
    subject: 'Welcome to Asset360, {{assignee_name}}',
    body: 'Hi {{assignee_name}},\n\n{{organization_name}} has invited you to Asset360.\n\nEmail: {{user_email}}\nSite: {{site_name}}\n\n[button:Accept Invitation]\n\nRegards,\nThe Asset360 Team',
    sms: 'You are invited to Asset360 by {{organization_name}}. Check your email.'
  },
  {
    name: 'Warranty Expiring Soon', category: 'Contracts', trigger: 'Warranty Expiring',
    subject: 'Warranty expiring for {{asset_name}}',
    body: 'Hi {{assignee_name}},\n\nThe warranty for {{asset_name}} expires on {{due_date}}.\n\nAsset Code: {{asset_code}}\nSerial Number: {{serial_number}}\n\n[button:Review Warranty]\n\nRegards,\nThe Asset360 Team',
    sms: 'Warranty for {{asset_name}} expires {{due_date}}.'
  }
];
