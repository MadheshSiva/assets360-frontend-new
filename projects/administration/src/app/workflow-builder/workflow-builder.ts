import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ArrowDown, ArrowUp, ChevronDown, Circle, Clock, ClipboardCheck, Download, Ellipsis, EllipsisVertical, FileText, Funnel,
  LayoutTemplate, LucideAngularModule, Package, Play, Plus, Save, Search, Send, Share2, ShieldCheck, ShoppingCart, Truck, Upload,
  User, Workflow as WorkflowIcon, Wrench, X, Zap
} from 'lucide-angular';
import { ADMIN_PEOPLE, AdminPage, CURRENT_USER, formatDate, todayIso } from '../shared/admin-common';
import { NodeConfigPanel } from './node-config/node-config';
import { WorkflowCanvas } from './workflow-canvas/workflow-canvas';
import { blankConfig, defaultConfig, NODE_TYPES, WORKFLOW_CATEGORIES, WORKFLOW_TEMPLATES } from './workflow-builder.data';
import { NODE_LABELS, NODE_SIZE, NodeType, WfGraph, WfNode, Workflow, WorkflowStatus } from './workflow-builder.model';
import { WorkflowService } from './workflow-builder.service';

interface DetailsForm {
  id: string | null;
  name: string;
  code: string;
  category: string;
  owner: string;
  description: string;
  template: number | null;
}

type ConfirmKind = 'deleteNode' | 'deleteWorkflow' | 'discard';

/** Administration > Workflow Builder */
@Component({
  standalone: true,
  selector: 'app-admin-workflow-builder',
  imports: [FormsModule, RouterLink, LucideAngularModule, WorkflowCanvas, NodeConfigPanel],
  templateUrl: './workflow-builder.html',
  styleUrls: ['../shared/admin-workspace.css', './workflow-builder.css']
})
export class WorkflowBuilderPage extends AdminPage {
  private readonly service = inject(WorkflowService);

  readonly icons = {
    WorkflowIcon, Share2, FileText, Play, Clock, Plus, LayoutTemplate, Upload, Download, Search, Funnel, ChevronDown, Ellipsis,
    EllipsisVertical, Save, Send, X, ArrowUp, ArrowDown
  };
  readonly listIcons = { zap: Zap, circle: Circle, cart: ShoppingCart, shield: ShieldCheck, package: Package, user: User, wrench: Wrench, file: FileText, truck: Truck, clipboard: ClipboardCheck };
  readonly categories = WORKFLOW_CATEGORIES;
  readonly statuses: WorkflowStatus[] = ['Active', 'Draft', 'Inactive'];
  readonly people = ADMIN_PEOPLE;
  readonly templates = WORKFLOW_TEMPLATES;
  readonly nodeTypes = NODE_TYPES;
  readonly nodeLabels = NODE_LABELS;
  readonly formatDate = formatDate;

  // Stat sparklines (last 8 weeks, illustrative)
  readonly sparks = {
    active: [30, 42, 38, 55, 48, 66, 74, 92],
    draft: [40, 28, 52, 36, 60, 44, 70, 84],
    running: [36, 50, 44, 62, 58, 70, 82, 90],
    pending: [80, 70, 74, 58, 64, 50, 46, 40]
  };

  // List filters
  search = '';
  statusFilter: '' | WorkflowStatus = '';
  categoryFilter = '';
  sortBy: 'updated' | 'name' = 'updated';
  filtersOpen = false;
  listMenuOpen = false;

  // Selected workflow (working copy) and node
  wf: Workflow | null = null;
  dirty = false;
  viewVersion = '';
  selectedNodeId: string | null = null;
  headMenuOpen = false;

  // Dialogs
  details: DetailsForm | null = null;
  detailsSubmitted = false;
  templatesOpen = false;
  confirm: { kind: ConfirmKind; title: string; message: string; payload: string } | null = null;

  constructor() {
    super();
    const first = this.service.all()[0];
    if (first) this.load(first.id);
  }

  // ===== Stats =====

  count(status: WorkflowStatus): number {
    return this.service.all().filter((w) => w.status === status).length;
  }

  get totalCount(): number {
    return this.service.all().length;
  }

  get runningInstances(): number {
    return this.service.all().reduce((sum, w) => sum + (w.status === 'Active' ? w.runningInstances : 0), 0);
  }

  get pendingApprovals(): number {
    return this.service.all().reduce((sum, w) => sum + (w.status === 'Active' ? w.pendingApprovals : 0), 0);
  }

  // ===== List =====

  visible(): Workflow[] {
    const term = this.search.trim().toLowerCase();
    const rows = this.service.all().filter(
      (w) =>
        (!this.statusFilter || w.status === this.statusFilter) &&
        (!this.categoryFilter || w.category === this.categoryFilter) &&
        (!term || [w.name, w.code, w.category, w.owner].some((v) => v.toLowerCase().includes(term)))
    );
    return this.sortBy === 'name' ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : [...rows].sort((a, b) => b.updated.localeCompare(a.updated));
  }

  get activeFilterCount(): number {
    return (this.statusFilter ? 1 : 0) + (this.categoryFilter ? 1 : 0);
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.categoryFilter = '';
    this.filtersOpen = false;
  }

  setSort(sort: 'updated' | 'name'): void {
    this.sortBy = sort;
    this.listMenuOpen = false;
  }

  statusTone(status: WorkflowStatus): string {
    return status === 'Active' ? 'green' : status === 'Draft' ? 'blue' : 'grey';
  }

  /** Clicking another workflow asks first when the current one has unsaved edits. */
  pick(id: string): void {
    if (this.wf?.id === id) return;
    if (this.dirty) {
      this.confirm = { kind: 'discard', title: 'Discard unsaved changes?', message: `Your changes to ${this.wf?.name} have not been saved.`, payload: id };
      return;
    }
    this.load(id);
  }

  private load(id: string): void {
    const found = this.service.get(id);
    this.wf = found ? structuredClone(found) : null;
    this.viewVersion = this.wf?.version ?? '';
    this.selectedNodeId = null;
    this.dirty = false;
    this.headMenuOpen = false;
  }

  // ===== Versions =====

  versionOptions(): string[] {
    if (!this.wf) return [];
    const list = this.wf.versions.map((v) => v.version);
    return list.includes(this.wf.version) ? list : [this.wf.version, ...list];
  }

  /** Picking an older version loads its graph into the editor; publishing it makes a new version. */
  onVersionChange(version: string): void {
    if (!this.wf) return;
    const snap = this.wf.versions.find((v) => v.version === version);
    if (!snap) return;
    this.wf.graph = structuredClone(snap.graph);
    this.selectedNodeId = null;
    this.dirty = version !== this.wf.version;
    this.notify(version === this.wf.version ? `Showing ${version} (current).` : `Loaded ${version}. Publish to restore it as a new version.`);
  }

  private nextVersion(version: string): string {
    const m = /^v(\d+)\.(\d+)$/.exec(version);
    if (!m || m[1] === '0') return 'v1.0';
    return `v${m[1]}.${Number(m[2]) + 1}`;
  }

  // ===== Graph editing =====

  get selectedNode(): WfNode | null {
    return this.wf?.graph.nodes.find((n) => n.id === this.selectedNodeId) ?? null;
  }

  selectNode(id: string | null): void {
    this.selectedNodeId = id;
  }

  markDirty(): void {
    this.dirty = true;
  }

  private nextNodeId(graph: WfGraph): string {
    const max = graph.nodes.reduce((m, n) => Math.max(m, Number(n.id.replace(/\D/g, '')) || 0), 0);
    return `n${max + 1}`;
  }

  /**
   * Adds a node after the selected node (or after the last step). On the main row the new node is
   * spliced into the existing connector and the nodes to its right shift over to make room.
   */
  addNode(type: NodeType): void {
    if (!this.wf) return;
    const g = this.wf.graph;
    if (type === 'trigger' && g.nodes.some((n) => n.type === 'trigger')) {
      this.notify('A workflow has one trigger. Edit the existing trigger instead.');
      return;
    }
    const mainRow = g.nodes.filter((n) => n.type !== 'end');
    const sel = this.selectedNode;
    const from = sel && sel.type !== 'end' ? sel : mainRow.reduce<WfNode | null>((best, n) => (!best || n.x > best.x ? n : best), null);
    const id = this.nextNodeId(g);
    const node: WfNode = { id, type, name: `New ${NODE_LABELS[type]}`, x: 20, y: 110, config: blankConfig() };
    if (type === 'condition') {
      node.name = 'New Condition?';
      node.config.conditionValue = 'High';
    }

    if (type === 'end') {
      node.x = from ? from.x : 20;
      node.y = 270;
      while (g.nodes.some((n) => n.type === 'end' && Math.abs(n.x - node.x) < 150 && Math.abs(n.y - node.y) < 60)) node.y += 70;
      g.nodes.push(node);
      if (from) g.edges.push({ id: `${from.id}-${id}`, from: from.id, to: id, label: from.type === 'condition' ? 'No' : from.type === 'approval' ? 'Rejected' : '' });
    } else {
      const gap = 36;
      node.y = type === 'condition' ? 104 : 110;
      node.x = from ? from.x + NODE_SIZE[from.type].w + gap : 20;
      // Edge we splice into: the main-row continuation of `from`
      const next = from ? g.edges.find((e) => e.from === from.id && (e.label === '' || e.label === 'Yes') && g.nodes.find((n) => n.id === e.to)?.type !== 'end') : undefined;
      const shift = NODE_SIZE[type].w + gap;
      for (const n of g.nodes) {
        if (n !== from && n.x >= node.x && n.type !== 'end') n.x += shift;
      }
      g.nodes.push(node);
      if (from && next) {
        const target = next.to;
        next.to = id;
        next.id = `${from.id}-${id}`;
        g.edges.push({ id: `${id}-${target}`, from: id, to: target, label: type === 'condition' ? 'Yes' : '' });
      } else if (from) {
        g.edges.push({ id: `${from.id}-${id}`, from: from.id, to: id, label: from.type === 'condition' ? 'Yes' : '' });
      }
    }
    this.selectedNodeId = id;
    this.dirty = true;
    this.notify(`${NODE_LABELS[type]} node added. Configure it on the right.`);
  }

  askDeleteNode(): void {
    const node = this.selectedNode;
    if (!node) return;
    if (node.type === 'trigger') {
      this.notify('The trigger starts the workflow and cannot be deleted.');
      return;
    }
    this.confirm = { kind: 'deleteNode', title: 'Delete node?', message: `"${node.name}" and its connectors will be removed from the flow.`, payload: node.id };
  }

  /** Removing a node with one way out reconnects its incoming connectors to that next step. */
  private deleteNode(id: string): void {
    if (!this.wf) return;
    const g = this.wf.graph;
    const incoming = g.edges.filter((e) => e.to === id);
    const outgoing = g.edges.filter((e) => e.from === id);
    g.edges = g.edges.filter((e) => e.to !== id && e.from !== id);
    if (outgoing.length === 1) {
      const target = outgoing[0].to;
      for (const e of incoming) {
        if (e.from !== target && !g.edges.some((x) => x.from === e.from && x.to === target)) {
          g.edges.push({ id: `${e.from}-${target}`, from: e.from, to: target, label: e.label });
        }
      }
    }
    g.nodes = g.nodes.filter((n) => n.id !== id);
    this.selectedNodeId = null;
    this.dirty = true;
  }

  saveNode(updated: WfNode): void {
    if (!this.wf) return;
    const g = this.wf.graph;
    const i = g.nodes.findIndex((n) => n.id === updated.id);
    if (i < 0) return;
    // Keep the live position in case the node was dragged while the drawer was open
    g.nodes[i] = { ...updated, x: g.nodes[i].x, y: g.nodes[i].y };
    this.dirty = true;
    this.notify(`Node "${updated.name}" updated. Save the workflow to keep it.`);
  }

  // ===== Validation, save, test, publish =====

  private graphProblems(): string[] {
    if (!this.wf) return [];
    const g = this.wf.graph;
    const problems: string[] = [];
    const triggers = g.nodes.filter((n) => n.type === 'trigger');
    if (triggers.length !== 1) problems.push('The workflow needs exactly one trigger.');
    if (g.nodes.some((n) => !n.name.trim())) problems.push('Every node needs a name.');
    if (triggers.length === 1) {
      const reached = new Set([triggers[0].id]);
      const queue = [triggers[0].id];
      while (queue.length) {
        const cur = queue.shift() as string;
        for (const e of g.edges) {
          if (e.from === cur && !reached.has(e.to)) {
            reached.add(e.to);
            queue.push(e.to);
          }
        }
      }
      const orphans = g.nodes.filter((n) => !reached.has(n.id));
      if (orphans.length) problems.push(`Not connected to the trigger: ${orphans.map((n) => n.name).join(', ')}.`);
    }
    for (const n of g.nodes.filter((x) => x.type === 'condition')) {
      if (!g.edges.some((e) => e.from === n.id)) problems.push(`Condition "${n.name}" has no outgoing branch.`);
    }
    return problems;
  }

  /** Save keeps the status; only structural errors block it (Publish checks the full flow). */
  save(): void {
    if (!this.wf) return;
    const problems = this.graphProblems().filter((p) => p.startsWith('Every') || p.startsWith('The workflow'));
    if (problems.length) {
      this.notify(problems[0]);
      return;
    }
    this.wf.updated = todayIso();
    this.service.save(this.wf);
    this.dirty = false;
    this.notify(`${this.wf.name} saved (${this.wf.status}, ${this.wf.version}).`);
  }

  /** DEMO MODE: walks the graph from the trigger taking the "Yes" / approved path. */
  test(): void {
    if (!this.wf) return;
    const problems = this.graphProblems();
    if (problems.length) {
      this.notify(`DEMO MODE test failed: ${problems[0]}`);
      return;
    }
    const g = this.wf.graph;
    const steps: string[] = [];
    let cur = g.nodes.find((n) => n.type === 'trigger');
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      steps.push(cur.name);
      const id = cur.id;
      const out = g.edges.filter((e) => e.from === id);
      const next = out.find((e) => e.label === 'Yes' || e.label === '') ?? out[0];
      cur = next ? g.nodes.find((n) => n.id === next.to) : undefined;
    }
    this.notify(`DEMO MODE: test run passed ${steps.length} steps: ${steps.join(' → ')}.`);
  }

  publish(): void {
    if (!this.wf) return;
    const problems = this.graphProblems();
    if (problems.length) {
      this.notify(`Cannot publish: ${problems[0]}`);
      return;
    }
    const version = this.nextVersion(this.wf.version);
    this.wf.version = version;
    this.wf.status = 'Active';
    this.wf.updated = todayIso();
    this.wf.versions = [{ version, publishedOn: todayIso(), graph: structuredClone(this.wf.graph) }, ...this.wf.versions].slice(0, 6);
    this.service.save(this.wf);
    this.viewVersion = version;
    this.dirty = false;
    this.notify(`${this.wf.name} published as ${version} and is now Active.`);
  }

  // ===== Header menu =====

  toggleStatus(): void {
    if (!this.wf) return;
    this.headMenuOpen = false;
    const saved = this.service.get(this.wf.id);
    if (!saved) return;
    if (this.wf.status === 'Draft') {
      this.notify('Publish the draft to activate it.');
      return;
    }
    const status: WorkflowStatus = this.wf.status === 'Active' ? 'Inactive' : 'Active';
    saved.status = status;
    saved.updated = todayIso();
    this.wf.status = status;
    this.wf.updated = saved.updated;
    this.notify(`${this.wf.name} is now ${status}.`);
  }

  duplicate(): void {
    if (!this.wf) return;
    this.headMenuOpen = false;
    const copy: Workflow = structuredClone(this.wf);
    copy.id = this.service.newId();
    copy.name = `${this.wf.name} (Copy)`;
    copy.code = this.uniqueCode(`${this.wf.code}-C`);
    copy.status = 'Draft';
    copy.version = 'v0.1';
    copy.versions = [];
    copy.owner = CURRENT_USER.name;
    copy.updated = todayIso();
    copy.runningInstances = 0;
    copy.pendingApprovals = 0;
    this.service.save(copy);
    this.load(copy.id);
    this.notify(`Created ${copy.name} as a draft.`);
  }

  askDeleteWorkflow(): void {
    if (!this.wf) return;
    this.headMenuOpen = false;
    const saved = this.service.get(this.wf.id);
    if (saved && saved.status === 'Active' && saved.runningInstances > 0) {
      this.notify(`${saved.name} has ${saved.runningInstances} running instances. Deactivate it before deleting.`);
      return;
    }
    this.confirm = { kind: 'deleteWorkflow', title: 'Delete workflow?', message: `${this.wf.name} (${this.wf.code}) and all its versions will be deleted.`, payload: this.wf.id };
  }

  // ===== Confirm dialog =====

  confirmYes(): void {
    const c = this.confirm;
    this.confirm = null;
    if (!c) return;
    if (c.kind === 'deleteNode') {
      this.deleteNode(c.payload);
      this.notify('Node deleted.');
    } else if (c.kind === 'discard') {
      this.load(c.payload);
    } else {
      const name = this.wf?.name ?? 'Workflow';
      this.service.remove(c.payload);
      const first = this.visible()[0] ?? this.service.all()[0];
      if (first) this.load(first.id);
      else this.wf = null;
      this.notify(`${name} deleted.`);
    }
  }

  // ===== Create / edit details =====

  private uniqueCode(base: string): string {
    let code = base.toUpperCase();
    let i = 2;
    while (this.service.codeTaken(code, null)) code = `${base.toUpperCase()}${i++}`;
    return code;
  }

  openCreate(template: number | null = null): void {
    const tpl = template === null ? undefined : this.templates[template];
    this.templatesOpen = false;
    this.detailsSubmitted = false;
    this.details = {
      id: null,
      name: tpl ? tpl.name : '',
      code: this.uniqueCode(`WF-NEW-${String(this.service.all().length + 1).padStart(3, '0')}`),
      category: tpl ? tpl.category : '',
      owner: '',
      description: tpl ? tpl.description : '',
      template
    };
  }

  openEditDetails(): void {
    if (!this.wf) return;
    this.headMenuOpen = false;
    this.detailsSubmitted = false;
    this.details = { id: this.wf.id, name: this.wf.name, code: this.wf.code, category: this.wf.category, owner: this.wf.owner, description: this.wf.description, template: -1 };
  }

  detailErrors(): Record<string, string> {
    const d = this.details;
    const out: Record<string, string> = {};
    if (!d) return out;
    if (!d.name.trim()) out['name'] = 'Workflow name is required.';
    else if (this.service.all().some((w) => w.id !== d.id && w.name.toLowerCase() === d.name.trim().toLowerCase())) out['name'] = 'Another workflow already uses this name.';
    if (!d.code.trim()) out['code'] = 'Code is required.';
    else if (!/^[A-Z0-9-]{3,20}$/.test(d.code.trim())) out['code'] = 'Use 3-20 capital letters, digits or hyphens.';
    else if (this.service.codeTaken(d.code, d.id)) out['code'] = 'This code is already in use.';
    if (!d.category) out['category'] = 'Pick a category.';
    if (!d.owner) out['owner'] = 'Pick an owner.';
    if (!d.id && d.template === null) out['template'] = 'Pick what to start from.';
    return out;
  }

  detailErr(field: string): string {
    return this.detailsSubmitted ? this.detailErrors()[field] ?? '' : '';
  }

  upperCode(): void {
    if (this.details) this.details.code = this.details.code.toUpperCase();
  }

  saveDetails(): void {
    const d = this.details;
    if (!d) return;
    this.detailsSubmitted = true;
    if (Object.keys(this.detailErrors()).length) return;

    if (d.id && this.wf && this.wf.id === d.id) {
      // Edit: update the working copy and the stored record's details
      Object.assign(this.wf, { name: d.name.trim(), code: d.code.trim(), category: d.category, owner: d.owner, description: d.description.trim(), updated: todayIso() });
      const saved = this.service.get(d.id);
      if (saved) Object.assign(saved, { name: this.wf.name, code: this.wf.code, category: d.category, owner: d.owner, description: this.wf.description, updated: this.wf.updated });
      this.details = null;
      this.notify('Workflow details updated.');
      return;
    }

    const tpl = d.template === null ? undefined : this.templates[d.template];
    const graph: WfGraph = tpl
      ? tpl.build()
      : { nodes: [{ id: 'n1', type: 'trigger', name: 'New Trigger', x: 20, y: 110, config: blankConfig() }], edges: [] };
    const wf: Workflow = {
      id: this.service.newId(),
      code: d.code.trim(),
      name: d.name.trim(),
      category: d.category,
      owner: d.owner,
      description: d.description.trim(),
      status: 'Draft',
      updated: todayIso(),
      version: 'v0.1',
      versions: [],
      graph,
      runningInstances: 0,
      pendingApprovals: 0,
      icon: 'zap',
      tone: 'purple'
    };
    this.service.save(wf);
    this.details = null;
    this.clearFilters();
    this.search = '';
    this.load(wf.id);
    this.notify(`${wf.name} created as a draft.`);
  }

  // ===== Import / export =====

  exportWorkflows(): void {
    const rows = this.visible();
    this.download(`workflows-${todayIso()}.json`, rows);
    this.notify(`Exported ${rows.length} workflow${rows.length === 1 ? '' : 's'} to JSON.`);
  }

  exportCurrent(): void {
    if (!this.wf) return;
    this.headMenuOpen = false;
    this.download(`${this.wf.code}.json`, [this.wf]);
    this.notify(`Exported ${this.wf.name}.`);
  }

  private download(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Imports a JSON file exported by this page (one workflow or a list); each arrives as a draft. */
  importFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.notify('Import failed: the file is not valid JSON.');
        return;
      }
      const items = (Array.isArray(parsed) ? parsed : [parsed]) as Partial<Workflow>[];
      let added = 0;
      let lastId = '';
      for (const item of items) {
        if (!item || typeof item.name !== 'string' || !item.graph || !Array.isArray(item.graph.nodes) || !Array.isArray(item.graph.edges)) continue;
        const wf: Workflow = {
          id: this.service.newId(),
          code: this.uniqueCode(typeof item.code === 'string' && item.code ? item.code : 'WF-IMP'),
          name: item.name,
          category: typeof item.category === 'string' ? item.category : this.categories[0],
          owner: CURRENT_USER.name,
          description: typeof item.description === 'string' ? item.description : '',
          status: 'Draft',
          updated: todayIso(),
          version: 'v0.1',
          versions: [],
          graph: { nodes: item.graph.nodes.map((n) => ({ ...n, config: { ...defaultConfig(), ...n.config } })), edges: item.graph.edges },
          runningInstances: 0,
          pendingApprovals: 0,
          icon: 'file',
          tone: 'blue'
        };
        this.service.save(wf);
        lastId = wf.id;
        added++;
      }
      if (!added) {
        this.notify('Import failed: no workflows with a name and graph were found.');
        return;
      }
      this.load(lastId);
      this.notify(`Imported ${added} workflow${added === 1 ? '' : 's'} as draft.`);
    });
  }
}
