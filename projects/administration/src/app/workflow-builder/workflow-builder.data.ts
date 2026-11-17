import { ADMIN_PEOPLE } from '../shared/admin-common';
import { NodeConfig, NodeType, WfEdge, WfGraph, WfNode } from './workflow-builder.model';

// Option lists, default node settings and starting templates for the Workflow Builder; workflows come from the workflow engine API

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

/** Starting graphs offered by the "Templates" button. */
export const WORKFLOW_TEMPLATES: { name: string; category: string; description: string; build: () => WfGraph }[] = [
  { name: 'Two-level Approval with Value Check', category: 'Asset Management', description: 'Trigger, criticality check, manager and finance approvals, custody update.', build: assetMovementGraph },
  { name: 'Critical Work Order Escalation', category: 'Maintenance', description: 'Priority check, supervisor approval, technician assignment.', build: workOrderGraph },
  { name: 'Purchase Approval Chain', category: 'Procurement', description: 'Department head and procurement approvals with amount threshold.', build: purchaseGraph },
  { name: 'Expiry Reminder & Renewal', category: 'Compliance', description: 'Reminder notification, review and renewal of certificates.', build: complianceGraph },
  { name: 'Simple Approval', category: 'Administration', description: 'Trigger, one approval, update and confirmation.', build: () => linearGraph('Approval', 'Administration', 0) }
];
