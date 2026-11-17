import { Injectable } from '@angular/core';

/** Where the demo keeps each module's saved widget list (moduleName → widget ids). */
const STORAGE_KEY = 'piq.dashboard.serverWidgets';

/**
 * STATIC DEMO: keeps the dashboard's widget selection per module (moduleName + widgetList) in memory,
 * mirrored to localStorage so it survives a reload. Same API as the former dashboard-service client.
 */
@Injectable({ providedIn: 'root' })
export class DashboardWidgetsApi {
  private lists?: Map<string, string[]>;

  /** Saved widget lists by module name. */
  load(): Promise<Map<string, string[]>> {
    return Promise.resolve(new Map(this.records()));
  }

  /** Saves one module's widget list; an empty list removes the module's record. */
  save(moduleName: string, widgetList: string[]): Promise<void> {
    const lists = this.records();
    if (widgetList.length) lists.set(moduleName, [...widgetList]);
    else lists.delete(moduleName);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(lists)));
    } catch {
      // storage unavailable: the selection lasts for this session only
    }
    return Promise.resolve();
  }

  private records(): Map<string, string[]> {
    if (!this.lists) {
      this.lists = new Map();
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
        for (const [module, ids] of Object.entries(raw)) {
          if (Array.isArray(ids)) this.lists.set(module, ids.filter((id): id is string => typeof id === 'string'));
        }
      } catch {
        // nothing saved yet
      }
    }
    return this.lists;
  }
}
