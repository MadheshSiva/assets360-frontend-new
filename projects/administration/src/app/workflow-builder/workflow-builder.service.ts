import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { defaultConfig } from './workflow-builder.data';
import { Tone, WfEdge, WfGraph, Workflow, WorkflowIcon, WorkflowStatus, WorkflowVersion } from './workflow-builder.model';

/** Raw graph as stored by the Workflows API (same shape as the UI graph, but config values may be null). */
interface WorkflowGraphDto {
  nodes: { id: string; type: string; name: string; x: number; y: number; config: Record<string, unknown> | null }[];
  edges: { id: string; from: string; to: string; label: string | null }[];
}

interface WorkflowVersionDto {
  version: string;
  publishedOn: string | null;
  graph: WorkflowGraphDto | null;
}

/** Raw shape returned by /api/workflow-builders. */
interface WorkflowBuilderDto {
  id: string;
  workflowName: string;
  workflowCode: string | null;
  description: string | null;
  module: string | null;
  owner: string | null;
  triggerEvent: string | null;
  version: string | null;
  startFromTemplate: boolean;
  icon: string | null;
  tone: string | null;
  graph: WorkflowGraphDto | null;
  versions: WorkflowVersionDto[] | null;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
  isDeleted: boolean;
}

/** Body of POST / PUT /api/workflow-builders (PUT ignores the create-only fields). */
interface WorkflowBuilderRequest {
  workflowName: string;
  workflowCode: string;
  description: string;
  module: string;
  owner: string;
  triggerEvent: string | null;
  version: string;
  startFromTemplate: boolean;
  icon: string;
  tone: string;
  graph: WfGraph;
  versions: WorkflowVersion[];
  status: WorkflowStatus;
  createdBy?: string | null;
  updatedBy?: string | null;
  clientId?: string;
  tenantId?: string;
}

const ICONS: WorkflowIcon[] = ['zap', 'circle', 'cart', 'shield', 'package', 'user', 'wrench', 'file', 'truck', 'clipboard'];
const TONES: Tone[] = ['purple', 'blue', 'green', 'pink', 'orange', 'red'];
const STATUSES: WorkflowStatus[] = ['Active', 'Draft', 'Inactive'];
const EDGE_LABELS: WfEdge['label'][] = ['', 'Yes', 'No', 'Rejected'];

function toGraph(dto: WorkflowGraphDto | null | undefined): WfGraph {
  if (!dto) return { nodes: [], edges: [] };
  return {
    // Fill gaps with the defaults so the config drawer always has every field
    nodes: (dto.nodes ?? []).map((n) => {
      const config = defaultConfig();
      for (const [k, v] of Object.entries(n.config ?? {})) {
        if (v !== null && v !== undefined && k in config) (config as unknown as Record<string, unknown>)[k] = v;
      }
      return { id: n.id, type: n.type as WfGraph['nodes'][number]['type'], name: n.name, x: n.x, y: n.y, config };
    }),
    edges: (dto.edges ?? []).map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      label: EDGE_LABELS.includes(e.label as WfEdge['label']) ? (e.label as WfEdge['label']) : ''
    }))
  };
}

function toWorkflow(dto: WorkflowBuilderDto): Workflow {
  return {
    id: dto.id,
    code: dto.workflowCode ?? '',
    name: dto.workflowName,
    category: dto.module ?? '',
    owner: dto.owner ?? dto.createdBy ?? '',
    description: dto.description ?? '',
    status: STATUSES.includes(dto.status as WorkflowStatus) ? (dto.status as WorkflowStatus) : 'Draft',
    updated: (dto.updatedAt ?? dto.createdAt ?? new Date().toISOString()).slice(0, 10),
    version: dto.version ?? 'v0.1',
    versions: (dto.versions ?? []).map((v) => ({ version: v.version, publishedOn: v.publishedOn ?? '', graph: toGraph(v.graph) })),
    graph: toGraph(dto.graph),
    // Run-time counts belong to the workflow engine; the builder API does not report them
    runningInstances: 0,
    pendingApprovals: 0,
    icon: ICONS.includes(dto.icon as WorkflowIcon) ? (dto.icon as WorkflowIcon) : 'zap',
    tone: TONES.includes(dto.tone as Tone) ? (dto.tone as Tone) : 'purple'
  };
}

function errorMessage(err: HttpErrorResponse): string {
  const errors = err.error?.errors as Record<string, string[]> | undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (err.status === 404) return 'This workflow no longer exists.';
  return err.error?.message || err.error?.title || 'The workflow service could not be reached.';
}

/** Workflow definitions, stored by the Workflows API (/api/workflow-builders). */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.workflowsApiUrl}api/workflow-builders`;

  /** Loaded workflows, newest first. */
  private readonly workflows = signal<Workflow[]>([]);
  readonly loading = signal(false);

  all(): Workflow[] {
    return this.workflows();
  }

  get(id: string): Workflow | undefined {
    return this.workflows().find((w) => w.id === id);
  }

  codeTaken(code: string, exceptId: string | null): boolean {
    const c = code.trim().toUpperCase();
    return this.workflows().some((w) => w.code.toUpperCase() === c && w.id !== exceptId);
  }

  /** GET /api/workflow-builders, keeping this tenant's workflows. */
  load(): Observable<Workflow[]> {
    this.loading.set(true);
    return this.http.get<WorkflowBuilderDto[]>(this.apiUrl).pipe(
      map((rows) => {
        const list = rows
          .filter((r) => !r.isDeleted && (!r.tenantId || r.tenantId === environment.tenantId))
          .map(toWorkflow)
          .sort((a, b) => b.updated.localeCompare(a.updated));
        this.workflows.set(list);
        this.loading.set(false);
        return list;
      }),
      catchError((err: HttpErrorResponse) => {
        this.loading.set(false);
        return throwError(() => new Error(errorMessage(err)));
      })
    );
  }

  /** POST /api/workflow-builders. The API assigns the id; the new workflow goes to the top of the list. */
  create(wf: Workflow, fromTemplate = false): Observable<Workflow> {
    const body: WorkflowBuilderRequest = {
      ...this.toRequest(wf, fromTemplate),
      createdBy: this.auth.getUserEmail(),
      clientId: environment.clientId,
      tenantId: environment.tenantId
    };
    return this.http.post<WorkflowBuilderDto>(this.apiUrl, body).pipe(
      map((dto) => {
        const saved = toWorkflow(dto);
        this.workflows.update((list) => [saved, ...list]);
        return saved;
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  /** PUT /api/workflow-builders/{id} with the whole workflow (details, graph and versions). */
  update(wf: Workflow): Observable<Workflow> {
    const body: WorkflowBuilderRequest = { ...this.toRequest(wf, false), updatedBy: this.auth.getUserEmail() };
    return this.http.put<WorkflowBuilderDto>(`${this.apiUrl}/${encodeURIComponent(wf.id)}`, body).pipe(
      map((dto) => {
        const saved = toWorkflow(dto);
        this.workflows.update((list) => list.map((w) => (w.id === saved.id ? saved : w)));
        return saved;
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  /** DELETE /api/workflow-builders/{id}. */
  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(id)}`).pipe(
      map(() => {
        this.workflows.update((list) => list.filter((w) => w.id !== id));
      }),
      catchError((err: HttpErrorResponse) => throwError(() => new Error(errorMessage(err))))
    );
  }

  private toRequest(wf: Workflow, fromTemplate: boolean): WorkflowBuilderRequest {
    const trigger = wf.graph.nodes.find((n) => n.type === 'trigger');
    return {
      workflowName: wf.name.trim(),
      workflowCode: wf.code.trim(),
      description: wf.description,
      module: wf.category,
      owner: wf.owner,
      triggerEvent: trigger?.config.triggerEvent ?? null,
      version: wf.version,
      startFromTemplate: fromTemplate,
      icon: wf.icon,
      tone: wf.tone,
      graph: wf.graph,
      versions: wf.versions,
      status: wf.status
    };
  }
}
