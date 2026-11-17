import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CircleX, LucideAngularModule, Mail, Network, Settings, Trash2, User, X, Zap } from 'lucide-angular';
import { ADMIN_PEOPLE } from '../../shared/admin-common';
import {
  ACTION_TARGETS, ACTION_TYPES, APPROVAL_TYPES, APPROVER_ROLES, APPROVER_SOURCES, CONDITION_FIELDS, NOTIFICATION_CHANNELS,
  NOTIFICATION_TEMPLATES, OPERATORS, OUTCOMES, RECIPIENTS, TRIGGER_EVENTS
} from '../workflow-builder.data';
import { NODE_LABELS, WfNode } from '../workflow-builder.model';

const SUBTITLES: Record<WfNode['type'], string> = {
  trigger: 'Choose the event that starts this workflow.',
  condition: 'Branch the flow on a field value (Yes / No).',
  approval: 'Configure approval settings and options.',
  action: 'Update records or call other systems.',
  notification: 'Send a message using a notification template.',
  end: 'Close the workflow with an outcome.'
};

/** Right drawer: edits a copy of the selected node; Save Node hands the copy back to the page. */
@Component({
  standalone: true,
  selector: 'app-node-config',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './node-config.html',
  styleUrls: ['../../shared/admin-workspace.css', './node-config.css']
})
export class NodeConfigPanel implements OnChanges {
  @Input({ required: true }) node!: WfNode;
  @Output() save = new EventEmitter<WfNode>();
  @Output() cancel = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  readonly icons = { X, Zap, Network, User, Settings, Mail, CircleX, Trash2 };
  readonly labels = NODE_LABELS;
  readonly triggerEvents = TRIGGER_EVENTS;
  readonly conditionFields = CONDITION_FIELDS;
  readonly operators = OPERATORS;
  readonly approvalTypes = APPROVAL_TYPES;
  readonly approverSources = APPROVER_SOURCES;
  readonly approverRoles = APPROVER_ROLES;
  readonly people = ADMIN_PEOPLE;
  readonly actionTypes = ACTION_TYPES;
  readonly actionTargets = ACTION_TARGETS;
  readonly templates = NOTIFICATION_TEMPLATES;
  readonly channels = NOTIFICATION_CHANNELS;
  readonly recipients = RECIPIENTS;
  readonly outcomes = OUTCOMES;
  readonly modules = ['Assets', 'Movement & Custody', 'Maintenance', 'Inspection', 'Inventory', 'Audit & Compliance', 'Contracts & Warranty', 'Financial', 'Administration'];

  draft!: WfNode;
  submitted = false;

  ngOnChanges(): void {
    this.draft = structuredClone(this.node);
    this.submitted = false;
  }

  get subtitle(): string {
    return SUBTITLES[this.draft.type];
  }

  get icon() {
    switch (this.draft.type) {
      case 'trigger': return this.icons.Zap;
      case 'condition': return this.icons.Network;
      case 'approval': return this.icons.User;
      case 'action': return this.icons.Settings;
      case 'notification': return this.icons.Mail;
      default: return this.icons.CircleX;
    }
  }

  /** Field-level errors, keyed by field name. */
  errors(): Record<string, string> {
    const d = this.draft;
    const c = d.config;
    const out: Record<string, string> = {};
    if (!d.name.trim()) out['name'] = 'Node name is required.';
    else if (d.name.trim().length > 60) out['name'] = 'Keep the name under 60 characters.';
    const need = (key: keyof typeof c, label: string) => {
      if (!c[key]) out[key] = `${label} is required.`;
    };
    if (d.type === 'trigger') { need('triggerEvent', 'Trigger event'); need('triggerModule', 'Source module'); }
    if (d.type === 'condition') { need('conditionField', 'Field'); need('operator', 'Operator'); }
    if (d.type === 'approval') { need('approvalType', 'Approval type'); need('approverSource', 'Approver source'); }
    if (d.type === 'action') { need('actionType', 'Action type'); need('actionTarget', 'Target'); }
    if (d.type === 'notification') { need('template', 'Notification template'); need('channel', 'Channel'); need('recipient', 'Recipient'); }
    if (d.type === 'end') need('outcome', 'Outcome');
    if (d.type === 'condition' && !c.conditionValue.trim()) out['conditionValue'] = 'Enter the value to compare with.';
    if (d.type === 'approval') {
      if (c.approverSource === 'Role Based' && !c.approverRole) out['approverRole'] = 'Approver role is required.';
      if (c.approverSource === 'Specific User' && !c.approverUser) out['approverUser'] = 'Pick the approver.';
      if (!c.slaHours || c.slaHours < 1) out['slaHours'] = 'SLA must be at least 1 hour.';
      if (c.escalationHours !== null && c.escalationHours !== undefined && c.slaHours && c.escalationHours < c.slaHours) {
        out['escalationHours'] = 'Escalate after the SLA, not before.';
      }
      if (!c.requiredApprovals || c.requiredApprovals < 1) out['requiredApprovals'] = 'At least 1 approval.';
      else if (c.approvalType === 'Single Approval' && c.requiredApprovals > 1) out['requiredApprovals'] = 'Single approval needs exactly 1.';
    }
    if (d.type === 'action' && c.actionType === 'Call Webhook' && !/^https:\/\/\S+$/.test(c.actionValue.trim())) {
      out['actionValue'] = 'Enter an https:// URL.';
    }
    return out;
  }

  err(field: string): string {
    return this.submitted ? this.errors()[field] ?? '' : '';
  }

  onSave(): void {
    this.submitted = true;
    if (Object.keys(this.errors()).length) return;
    this.draft.name = this.draft.name.trim();
    this.save.emit(structuredClone(this.draft));
  }
}
