import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { todayIso } from '../shared/admin-common';
import { seedWorkflows } from './workflow-builder.data';
import { Workflow } from './workflow-builder.model';

/** DEMO MODE: workflow definitions live in memory, seeded with sample workflows from workflow-builder.data.ts. */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  /** Workflows, newest first. */
  private readonly workflows = signal<Workflow[]>(seedWorkflows().sort((a, b) => b.updated.localeCompare(a.updated)));
  /** Kept for the page's loading state; nothing is fetched, so it stays false. */
  readonly loading = signal(false);
  private nextId = this.workflows().length + 1;

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

  /** The stored workflows. */
  load(): Observable<Workflow[]> {
    return of(this.workflows());
  }

  /** Adds a workflow with a new id to the top of the list. */
  create(wf: Workflow, _fromTemplate = false): Observable<Workflow> {
    const saved: Workflow = { ...structuredClone(wf), id: `WF-${String(this.nextId++).padStart(4, '0')}`, name: wf.name.trim(), code: wf.code.trim(), updated: todayIso() };
    this.workflows.update((list) => [saved, ...list]);
    return of(saved);
  }

  /** Replaces a stored workflow (details, graph and versions). */
  update(wf: Workflow): Observable<Workflow> {
    const saved: Workflow = { ...structuredClone(wf), name: wf.name.trim(), code: wf.code.trim(), updated: todayIso() };
    this.workflows.update((list) => list.map((w) => (w.id === saved.id ? saved : w)));
    return of(saved);
  }

  remove(id: string): Observable<void> {
    this.workflows.update((list) => list.filter((w) => w.id !== id));
    return of(undefined);
  }
}
