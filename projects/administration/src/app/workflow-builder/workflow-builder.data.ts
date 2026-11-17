import { ADMIN_PEOPLE } from '../shared/admin-common';
import { NodeConfig, NodeType, Tone, WfEdge, WfGraph, WfNode, Workflow, WorkflowIcon, WorkflowStatus } from './workflow-builder.model';

// DEMO MODE: option lists, default node settings, starting templates and the seeded sample workflows

export const WORKFLOW_CATEGORIES = [
  'Asset Management', 'Maintenance', 'Inventory', 'Compliance', 'Administration', 'Procurement',
  'Contracts & Warranty', 'Inspection', 'Financial', 'Tracking & IoT'
];

export const TRIGGER_EVENTS = [
  'Movement Request Created', 'Work Order Created', 'Purchase Requisition Submitted', 'Certificate Expiring (30 days)',
  'Stock Below Reorder Level', 'Access Request Submitted', 'Asset Registered', 'Inspection Failed',
  'Scheduled (Daily)', 'Scheduled (Monthly)', 'Field Value Changed', 'Device Alert Raised'
];

export const CONDITION_FIELDS = ['Asset Criticality', 'Asset Value (AED)', 'Work Order Priority', 'Request Amount (AED)', 'Department', 'Location', 'Asset Category', 'Days to Expiry'];
export const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'contains'];
export const APPROVAL_TYPES = ['Single Approval', 'Sequential Approval', 'Parallel - All Must Approve', 'Parallel - Any One Approves'];
export const APPROVER_SOURCES = ['Role Based', 'Specific User', 'Reporting Manager', 'Dynamic (Field Value)'];
export const APPROVER_ROLES = [
  'Line Manager', 'Department Head', 'Finance Manager', 'Asset Manager', 'Maintenance Supervisor',
  'Procurement Officer', 'Compliance Officer', 'IT Administrator', 'Inventory Controller'
];
export const ACTION_TYPES = ['Update Field', 'Create Record', 'Assign Task', 'Call Webhook', 'Generate Document'];
export const ACTION_TARGETS = [
  'Asset Custody', 'Asset Status', 'Asset Location', 'Work Order', 'Purchase Order', 'Stock Level',
  'Compliance Certificate', 'User Account', 'Technician Assignment'
];
export const NOTIFICATION_TEMPLATES = [
  'Send Confirmation', 'Approval Required', 'Request Rejected', 'Work Order Assigned', 'Asset Movement Completed',
  'Compliance Certificate Expiry', 'Inventory Reorder Alert', 'User Invitation'
];
export const NOTIFICATION_CHANNELS = ['Email', 'SMS', 'In-App', 'Push', 'Email + In-App'];
export const RECIPIENTS = ['Requestor', 'Approver', 'Asset Custodian', 'Assigned Technician', 'Department Head', 'Owner'];
export const OUTCOMES = ['Rejected', 'Completed', 'Cancelled'];

export const NODE_TYPES: NodeType[] = ['trigger', 'condition', 'approval', 'action', 'notification', 'end'];

/** Settings a fresh node starts with. */
export function defaultConfig(): NodeConfig {
  return {
    triggerEvent: TRIGGER_EVENTS[0],
    triggerModule: 'Movement & Custody',
    conditionField: CONDITION_FIELDS[0],
    operator: '=',
    conditionValue: '',
    approvalType: APPROVAL_TYPES[0],
    approverSource: APPROVER_SOURCES[0],
    approverRole: APPROVER_ROLES[0],
    approverUser: ADMIN_PEOPLE[0] ?? '',
    slaHours: 24,
    escalationHours: 48,
    requiredApprovals: 1,
    allowDelegation: true,
    commentsRequired: true,
    actionType: ACTION_TYPES[0],
    actionTarget: ACTION_TARGETS[0],
    actionValue: '',
    template: NOTIFICATION_TEMPLATES[0],
    channel: 'Email',
    recipient: 'Requestor',
    outcome: 'Completed',
    notifyRequestor: true
  };
}

/** Settings a node added in the builder starts with: every dropdown unselected (templates keep defaultConfig). */
export function blankConfig(): NodeConfig {
  return {
    ...defaultConfig(),
    triggerEvent: '',
    triggerModule: '',
    conditionField: '',
    operator: '',
    approvalType: '',
    approverSource: '',
    approverRole: '',
    approverUser: '',
    actionType: '',
    actionTarget: '',
    template: '',
    channel: '',
    recipient: '',
    outcome: ''
  };
}

// Main row sits at y=110 (cards) / y=104 (diamonds); end paths drop to y=270
const ROW = 110;
const DIAMOND_ROW = 104;
const END_ROW = 270;

function n(id: string, type: NodeType, name: string, x: number, cfg: Partial<NodeConfig> = {}): WfNode {
  const y = type === 'condition' ? DIAMOND_ROW : type === 'end' ? END_ROW : ROW;
  return { id, type, name, x, y, config: { ...defaultConfig(), ...cfg } };
}

function e(from: string, to: string, label: WfEdge['label'] = ''): WfEdge {
  return { id: `${from}-${to}`, from, to, label };
}

/** The flow drawn in the design: Asset Movement Approval v3.2. */
function assetMovementGraph(): WfGraph {
  return {
    nodes: [
      n('n1', 'trigger', 'Movement Request Created', 20, { triggerEvent: 'Movement Request Created', triggerModule: 'Movement & Custody' }),
      n('n2', 'condition', 'Asset Criticality = High?', 130, { conditionField: 'Asset Criticality', operator: '=', conditionValue: 'High' }),
      n('n3', 'approval', 'Line Manager Approval', 260, { approverRole: 'Line Manager' }),
      n('n4', 'condition', 'Value > AED 50,000?', 370, { conditionField: 'Asset Value (AED)', operator: '>', conditionValue: '50000' }),
      n('n5', 'approval', 'Finance Approval', 500, { approverRole: 'Finance Manager', slaHours: 48, escalationHours: 72 }),
      n('n6', 'action', 'Update Asset Custody', 610, { actionType: 'Update Field', actionTarget: 'Asset Custody', actionValue: 'New custodian' }),
      n('n7', 'notification', 'Send Confirmation', 720, { template: 'Send Confirmation', channel: 'Email + In-App', recipient: 'Requestor' }),
      n('n8', 'end', 'Return to Requestor (Rejected)', 300, { outcome: 'Rejected' })
    ],
    edges: [e('n1', 'n2'), e('n2', 'n3', 'Yes'), e('n3', 'n4'), e('n4', 'n5', 'Yes'), e('n5', 'n6'), e('n6', 'n7'), e('n2', 'n8', 'No'), e('n5', 'n8', 'Rejected')]
  };
}

function workOrderGraph(): WfGraph {
  return {
    nodes: [
      n('n1', 'trigger', 'Work Order Created', 20, { triggerEvent: 'Work Order Created', triggerModule: 'Maintenance' }),
      n('n2', 'condition', 'Priority = Critical?', 140, { conditionField: 'Work Order Priority', operator: '=', conditionValue: 'Critical' }),
      n('n3', 'approval', 'Supervisor Approval', 280, { approverRole: 'Maintenance Supervisor', slaHours: 4, escalationHours: 8 }),
      n('n4', 'action', 'Assign Technician', 400, { actionType: 'Assign Task', actionTarget: 'Technician Assignment' }),
      n('n5', 'notification', 'Work Order Assigned', 520, { template: 'Work Order Assigned', channel: 'Push', recipient: 'Assigned Technician' }),
      n('n6', 'end', 'Auto-Approve (Standard)', 330, { outcome: 'Completed' })
    ],
    edges: [e('n1', 'n2'), e('n2', 'n3', 'Yes'), e('n3', 'n4'), e('n4', 'n5'), e('n2', 'n6', 'No'), e('n3', 'n6', 'Rejected')]
  };
}

function purchaseGraph(): WfGraph {
  return {
    nodes: [
      n('n1', 'trigger', 'Requisition Submitted', 20, { triggerEvent: 'Purchase Requisition Submitted', triggerModule: 'Inventory' }),
      n('n2', 'approval', 'Department Head Approval', 140, { approverRole: 'Department Head' }),
      n('n3', 'condition', 'Amount > AED 10,000?', 260, { conditionField: 'Request Amount (AED)', operator: '>', conditionValue: '10000' }),
      n('n4', 'approval', 'Procurement Approval', 400, { approverRole: 'Procurement Officer', approvalType: 'Parallel - All Must Approve', requiredApprovals: 2 }),
      n('n5', 'action', 'Create Purchase Order', 520, { actionType: 'Create Record', actionTarget: 'Purchase Order' }),
      n('n6', 'notification', 'Notify Requestor', 640, { template: 'Send Confirmation', recipient: 'Requestor' }),
      n('n7', 'end', 'Requisition Rejected', 220, { outcome: 'Rejected' })
    ],
    edges: [e('n1', 'n2'), e('n2', 'n3'), e('n3', 'n4', 'Yes'), e('n4', 'n5'), e('n5', 'n6'), e('n2', 'n7', 'Rejected'), e('n3', 'n7', 'No')]
  };
}

function complianceGraph(): WfGraph {
  return {
    nodes: [
      n('n1', 'trigger', 'Certificate Expiring', 20, { triggerEvent: 'Certificate Expiring (30 days)', triggerModule: 'Audit & Compliance' }),
      n('n2', 'notification', 'Remind Owner', 140, { template: 'Compliance Certificate Expiry', channel: 'Email', recipient: 'Owner' }),
      n('n3', 'approval', 'Compliance Officer Review', 270, { approverRole: 'Compliance Officer', slaHours: 72, escalationHours: 120, commentsRequired: true }),
      n('n4', 'action', 'Renew Certificate', 390, { actionType: 'Update Field', actionTarget: 'Compliance Certificate', actionValue: 'Renewed' }),
      n('n5', 'notification', 'Renewal Confirmed', 510, { template: 'Send Confirmation', channel: 'Email + In-App', recipient: 'Owner' }),
      n('n6', 'end', 'Escalate to Audit (Rejected)', 280, { outcome: 'Rejected' })
    ],
    edges: [e('n1', 'n2'), e('n2', 'n3'), e('n3', 'n4'), e('n4', 'n5'), e('n3', 'n6', 'Rejected')]
  };
}

/** Plain four-step flow for the workflows without a hand-drawn graph. */
function linearGraph(name: string, category: string, index: number): WfGraph {
  const role = APPROVER_ROLES[index % APPROVER_ROLES.length];
  const trigger = TRIGGER_EVENTS[index % TRIGGER_EVENTS.length];
  const target = ACTION_TARGETS[index % ACTION_TARGETS.length];
  return {
    nodes: [
      n('n1', 'trigger', trigger, 20, { triggerEvent: trigger, triggerModule: category }),
      n('n2', 'approval', `${role} Approval`, 150, { approverRole: role, slaHours: 24 + (index % 3) * 24, escalationHours: 48 + (index % 3) * 24 }),
      n('n3', 'action', `Update ${target}`, 280, { actionTarget: target }),
      n('n4', 'notification', `${name} Notice`, 410, { template: 'Send Confirmation', recipient: 'Requestor' })
    ],
    edges: [e('n1', 'n2'), e('n2', 'n3'), e('n3', 'n4')]
  };
}

// name, category, owner, updated, status, running instances, pending approvals, icon, tone
type Row = [string, string, string, string, WorkflowStatus, number, number, WorkflowIcon, Tone];
const ROWS: Row[] = [
  ['Asset Movement Approval', 'Asset Management', 'Sarah Ahmed', '2026-03-12', 'Active', 18, 3, 'zap', 'purple'],
  ['Work Order Approval', 'Maintenance', 'James Wilson', '2026-03-10', 'Draft', 0, 0, 'circle', 'blue'],
  ['Purchase Requisition', 'Inventory', 'Fatima Al Mansoori', '2026-03-08', 'Active', 14, 2, 'cart', 'green'],
  ['Compliance Renewal', 'Compliance', 'Omar Hassan', '2026-03-05', 'Active', 9, 1, 'shield', 'pink'],
  ['Inventory Reorder', 'Inventory', 'Priya Sharma', '2026-02-28', 'Inactive', 0, 0, 'package', 'orange'],
  ['User Access Request', 'Administration', 'Ahmed Khan', '2026-02-25', 'Active', 11, 2, 'user', 'blue'],
  ['Asset Disposal Approval', 'Asset Management', 'Michael Chen', '2026-02-22', 'Active', 4, 1, 'file', 'red'],
  ['Preventive Maintenance Schedule', 'Maintenance', 'Daniel Kim', '2026-02-20', 'Active', 12, 0, 'wrench', 'blue'],
  ['Asset Check-out Request', 'Asset Management', 'Lisa Wong', '2026-02-18', 'Active', 8, 1, 'truck', 'purple'],
  ['Vendor Onboarding', 'Procurement', 'Rahul Mehta', '2026-02-15', 'Draft', 0, 0, 'clipboard', 'orange'],
  ['Warranty Claim', 'Contracts & Warranty', 'John Mathew', '2026-02-13', 'Active', 3, 1, 'shield', 'green'],
  ['Inspection Failure Escalation', 'Inspection', 'Aisha Rahman', '2026-02-11', 'Active', 5, 0, 'clipboard', 'red'],
  ['Stock Transfer Approval', 'Inventory', 'Priya Nair', '2026-02-09', 'Active', 7, 1, 'package', 'green'],
  ['Contract Renewal', 'Contracts & Warranty', 'Fatima Noor', '2026-02-06', 'Active', 2, 1, 'file', 'purple'],
  ['Audit Finding Remediation', 'Compliance', 'Omar Khalid', '2026-02-04', 'Active', 6, 1, 'shield', 'pink'],
  ['Asset Transfer Between Sites', 'Asset Management', 'Mohammed Ali', '2026-02-01', 'Draft', 0, 0, 'truck', 'blue'],
  ['Spare Parts Request', 'Inventory', 'Daniel Tan', '2026-01-29', 'Active', 9, 1, 'cart', 'orange'],
  ['Breakdown Work Order', 'Maintenance', 'James Tan', '2026-01-27', 'Active', 7, 0, 'wrench', 'red'],
  ['Capex Request', 'Financial', 'Ahmed Al Marri', '2026-01-24', 'Active', 3, 1, 'file', 'green'],
  ['Asset Registration', 'Asset Management', 'Sarah Khan', '2026-01-21', 'Active', 5, 0, 'zap', 'purple'],
  ['Calibration Due Reminder', 'Maintenance', 'Priya Sharma', '2026-01-18', 'Active', 4, 0, 'wrench', 'orange'],
  ['Role Change Approval', 'Administration', 'Sarah Ahmed', '2026-01-15', 'Draft', 0, 0, 'user', 'purple'],
  ['Lost Asset Report', 'Asset Management', 'Fatima Ali', '2026-01-12', 'Active', 2, 1, 'circle', 'red'],
  ['Insurance Claim', 'Financial', 'John Mathew', '2026-01-09', 'Active', 1, 0, 'shield', 'blue'],
  ['Safety Permit to Work', 'Compliance', 'Omar Hassan', '2026-01-06', 'Active', 3, 1, 'clipboard', 'pink'],
  ['Asset Revaluation', 'Financial', 'Michael Chen', '2026-01-03', 'Draft', 0, 0, 'file', 'orange'],
  ['Goods Receipt Inspection', 'Inventory', 'Lisa Wong', '2025-12-30', 'Active', 2, 0, 'package', 'green'],
  ['Tracking Device Alert', 'Tracking & IoT', 'Rahul Mehta', '2025-12-27', 'Active', 1, 0, 'zap', 'blue'],
  ['Lease Termination', 'Contracts & Warranty', 'Daniel Kim', '2025-12-22', 'Active', 1, 0, 'file', 'pink'],
  ['Data Import Approval', 'Administration', 'Ahmed Khan', '2025-12-18', 'Active', 0, 0, 'user', 'green']
];

const SEEDED_GRAPHS: Record<number, () => WfGraph> = { 0: assetMovementGraph, 1: workOrderGraph, 2: purchaseGraph, 3: complianceGraph };

function codeFor(name: string, index: number): string {
  const letters = name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 3);
  return `WF-${letters}-${String(index + 1).padStart(3, '0')}`;
}

export function seedWorkflows(): Workflow[] {
  return ROWS.map(([name, category, owner, updated, status, running, pending, icon, tone], i) => {
    const graph = SEEDED_GRAPHS[i] ? SEEDED_GRAPHS[i]() : linearGraph(name, category, i);
    const major = i === 0 ? 3 : 1 + (i % 3);
    const minor = i === 0 ? 2 : i % 4;
    const version = status === 'Draft' && i !== 1 ? 'v0.1' : `v${major}.${minor}`;
    const versions = [];
    // Older published versions keep a copy of the same graph so the selector has something to show
    for (let m = minor; m >= 0 && versions.length < 3; m--) {
      versions.push({ version: `v${major}.${m}`, publishedOn: updated, graph: structuredClone(graph) });
    }
    return {
      id: `WF-${String(i + 1).padStart(4, '0')}`,
      code: codeFor(name, i),
      name,
      category,
      owner,
      description: `${name} workflow for ${category.toLowerCase()} requests.`,
      status,
      updated,
      version,
      versions: version === 'v0.1' ? [] : versions,
      graph,
      runningInstances: running,
      pendingApprovals: pending,
      icon,
      tone
    };
  });
}

/** Starting graphs offered by the "Templates" button. */
export const WORKFLOW_TEMPLATES: { name: string; category: string; description: string; build: () => WfGraph }[] = [
  { name: 'Two-level Approval with Value Check', category: 'Asset Management', description: 'Trigger, criticality check, manager and finance approvals, custody update.', build: assetMovementGraph },
  { name: 'Critical Work Order Escalation', category: 'Maintenance', description: 'Priority check, supervisor approval, technician assignment.', build: workOrderGraph },
  { name: 'Purchase Approval Chain', category: 'Procurement', description: 'Department head and procurement approvals with amount threshold.', build: purchaseGraph },
  { name: 'Expiry Reminder & Renewal', category: 'Compliance', description: 'Reminder notification, review and renewal of certificates.', build: complianceGraph },
  { name: 'Simple Approval', category: 'Administration', description: 'Trigger, one approval, update and confirmation.', build: () => linearGraph('Approval', 'Administration', 0) }
];
