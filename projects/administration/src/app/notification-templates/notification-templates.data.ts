import { VariableGroup } from './notification-templates.model';

// Static option lists and lookup values for the Notification Templates page

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

/** Placeholder values the Live Preview and Test Send substitute for each variable (illustrative, not tenant data). */
export const SAMPLE_VALUES: Record<string, string> = {
  work_order_number: 'WO-10245',
  work_order_type: 'Corrective Maintenance',
  priority: 'High',
  due_date: '28 Apr 2025',
  status: 'Open',
  asset_name: 'Air Handling Unit AHU-01',
  asset_code: 'AST-HVAC-0001',
  asset_category: 'HVAC',
  location_name: '[Location Name]',
  serial_number: 'SN-AHU-77821',
  assignee_name: '[Assignee Name]',
  requestor_name: '[Requestor Name]',
  supervisor_name: '[Supervisor Name]',
  user_email: '[User Email]',
  team_name: '[Team Name]',
  organization_name: '[Organization Name]',
  site_name: '[Site Name]',
  support_email: '[Support Email]',
  portal_url: '[Portal URL]'
};

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
