import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import {
  DashFilters, Dashboard, DashboardDefaultFilters, DashboardRole, DashboardTemplate, MetricDef, ShareEntry, Sharing, WIDGET_TYPES,
  WidgetConfig, WidgetDataDto, WidgetType, WidgetTypeDef, byPosition, fromApiType, packLayout, toApiType
} from './interactive-dashboards.data';

// ===== DTOs (Report Analytics API, /api/interactive-dashboards) =====

interface WidgetDto {
  widgetId: string;
  widgetType: string;
  metric: string;
  title: string;
  position: { x: number; y: number; w: number; h: number } | null;
  settings: { limit: number | null; months: number | null; showComparison: boolean; orientation: string | null } | null;
}

interface ShareEntryDto {
  id: string;
  name: string | null;
  permission: string;
}

interface DashboardListItemDto {
  id: string;
  dashboardId: string;
  dashboardName: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  visibility: string;
  widgetCount: number;
  isFavorite: boolean;
  accessRole: string;
  updatedAt: string | null;
}

interface DashboardListDto {
  items: DashboardListItemDto[];
  totalCount: number;
  page: number;
  pageSize: number;
}

interface DashboardDto {
  id: string;
  dashboardId: string;
  dashboardName: string;
  description: string | null;
  audienceRole: string | null;
  ownerId: string | null;
  ownerName: string | null;
  visibility: string;
  sharedWith: { users: ShareEntryDto[]; groups: ShareEntryDto[] } | null;
  isFavorite: boolean;
  accessRole: string;
  canEdit: boolean;
  canShare: boolean;
  defaultFilters: DashboardDefaultFilters | null;
  widgets: WidgetDto[] | null;
  information: {
    lastUpdated: string | null;
    updatedBy: string | null;
    createdAt: string | null;
    createdBy: string | null;
    sharedSummary: string;
  } | null;
}

interface ShareResponseDto {
  dashboardId: string;
  visibility: string;
  sharedWith: { users: ShareEntryDto[]; groups: ShareEntryDto[] };
  sharedSummary: string;
}

interface OptionsDto {
  datePresets: string[];
  defaultDatePreset: string;
  widgetTypes: { key: string; label: string; description: string; defaultWidth: number; defaultHeight: number }[];
  metrics: { key: string; label: string; module: string; description: string; shape: string; widgetTypes: string[] }[];
  templates: DashboardTemplate[];
  maxWidgets: number;
}

interface FilterOptionDto {
  value: string;
  label: string;
}

interface FilterOptionsDto {
  organizations: FilterOptionDto[];
  locations: FilterOptionDto[];
  assetCategories: FilterOptionDto[];
}

interface DashboardDataDto {
  generatedAt: string;
  widgets: WidgetDataDto[];
}

interface WidgetRequest {
  widgetId?: string | null;
  widgetType: string;
  metric: string;
  title: string;
  position: { x: number | null; y: number | null; w: number; h: number | null } | null;
  settings: WidgetDto['settings'];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface DashboardData {
  generatedAt: Date;
  widgets: Record<string, WidgetDataDto>;
}

export interface NewWidgetRequest {
  type: WidgetType;
  metric: string;
  title: string;
  span: number;
}

const VISIBILITY_TO_SHARING: Record<string, Sharing> = { Private: 'private', Shared: 'people', Organization: 'organization' };
const SHARING_TO_VISIBILITY: Record<Sharing, string> = { private: 'Private', people: 'Shared', organization: 'Organization' };
const ROLES: DashboardRole[] = ['Owner', 'Editor', 'Viewer'];

/** "2026-10-28T10:32:00Z" → "28 Oct 2026, 10:32" (local time) */
function dateText(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toWidget(dto: WidgetDto): WidgetConfig | null {
  const type = fromApiType(dto.widgetType);
  if (!type) return null;
  const def = WIDGET_TYPES.find((t) => t.type === type)!;
  return {
    id: dto.widgetId,
    type,
    metric: dto.metric,
    title: dto.title,
    span: dto.position?.w ?? def.span,
    x: dto.position?.x ?? 0,
    y: dto.position?.y ?? 0,
    h: dto.position?.h ?? def.height,
    settings: {
      limit: dto.settings?.limit ?? null,
      months: dto.settings?.months ?? null,
      showComparison: dto.settings?.showComparison ?? true,
      orientation: dto.settings?.orientation ?? null
    }
  };
}

function toShareEntry(dto: ShareEntryDto): ShareEntry {
  return { id: dto.id, name: dto.name || dto.id, permission: dto.permission || 'View' };
}

function role(value: string): DashboardRole {
  return ROLES.includes(value as DashboardRole) ? (value as DashboardRole) : 'Viewer';
}

function fromListItem(dto: DashboardListItemDto): Dashboard {
  const r = role(dto.accessRole);
  return {
    id: dto.dashboardId,
    name: dto.dashboardName,
    description: dto.description ?? '',
    owner: dto.ownerName || (r === 'Owner' ? 'You' : 'Unknown'),
    sharing: VISIBILITY_TO_SHARING[dto.visibility] ?? 'private',
    sharedWith: [],
    groups: [],
    sharedUsers: [],
    sharedGroups: [],
    sharedSummary: '',
    role: r,
    canEdit: r !== 'Viewer',
    canShare: r === 'Owner',
    favorite: dto.isFavorite,
    updatedAt: dateText(dto.updatedAt),
    audienceRole: null,
    defaultFilters: null,
    widgetCount: dto.widgetCount,
    widgets: [],
    loaded: false
  };
}

function fromDetail(dto: DashboardDto): Dashboard {
  const widgets = (dto.widgets ?? []).map(toWidget).filter((w): w is WidgetConfig => !!w).sort(byPosition);
  const users = (dto.sharedWith?.users ?? []).map(toShareEntry);
  const groups = (dto.sharedWith?.groups ?? []).map(toShareEntry);
  const r = role(dto.accessRole);
  return {
    id: dto.dashboardId,
    name: dto.dashboardName,
    description: dto.description ?? '',
    owner: dto.ownerName || (r === 'Owner' ? 'You' : 'Unknown'),
    sharing: VISIBILITY_TO_SHARING[dto.visibility] ?? 'private',
    sharedWith: users.map((u) => u.name),
    groups: groups.map((g) => g.name),
    sharedUsers: users,
    sharedGroups: groups,
    sharedSummary: dto.information?.sharedSummary ?? '',
    role: r,
    canEdit: dto.canEdit,
    canShare: dto.canShare,
    favorite: dto.isFavorite,
    updatedAt: dateText(dto.information?.lastUpdated),
    audienceRole: dto.audienceRole,
    defaultFilters: dto.defaultFilters,
    widgetCount: widgets.length,
    widgets,
    loaded: true
  };
}

function toWidgetRequest(w: WidgetConfig, keepId: boolean): WidgetRequest {
  return {
    widgetId: keepId ? w.id : null,
    widgetType: toApiType(w.type),
    metric: w.metric,
    title: w.title,
    position: { x: w.x, y: w.y, w: w.span, h: w.h },
    settings: { ...w.settings }
  };
}

function errorMessage(err: HttpErrorResponse): string {
  const body = err.error;
  const errors = body && typeof body === 'object' ? (body.errors as Record<string, string[]> | undefined) : undefined;
  const first = errors ? Object.values(errors)[0]?.[0] : null;
  if (first) return first;
  if (err.status === 0) return 'The dashboard service could not be reached.';
  if (err.status === 401) return 'Sign in to do this.';
  if (err.status === 404) return 'This dashboard no longer exists.';
  return (body && typeof body === 'object' && (body.message || body.title)) || 'The dashboard service could not complete the request.';
}

function fail<T>(err: HttpErrorResponse): Observable<T> {
  return throwError(() => new Error(errorMessage(err)));
}

/** Interactive Dashboards: dashboards, layouts, sharing and widget data from the Report Analytics API. */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.reportAnalyticsApiUrl}api/interactive-dashboards`;

  /** Every dashboard the user can open (list items until opened). */
  private readonly list = signal<Dashboard[]>([]);
  readonly loading = signal(false);
  readonly metrics = signal<MetricDef[]>([]);
  readonly widgetTypes = signal<WidgetTypeDef[]>(WIDGET_TYPES);
  readonly templates = signal<DashboardTemplate[]>([]);
  readonly datePresets = signal<string[]>(['This month']);
  readonly defaultDatePreset = signal('This month');
  readonly organizations = signal<FilterOption[]>([]);
  readonly locations = signal<FilterOption[]>([]);
  readonly categories = signal<FilterOption[]>([]);

  get dashboards(): Dashboard[] {
    return this.list();
  }

  get(id: string): Dashboard | undefined {
    return this.list().find((d) => d.id === id);
  }

  nameTaken(name: string): boolean {
    const n = name.trim().toLowerCase();
    return this.list().some((d) => d.name.toLowerCase() === n);
  }

  /** The reports app has no auth interceptor; the API reads the bearer token to know the owner and favourites. */
  private get headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private url(...parts: string[]): string {
    return [this.apiUrl, ...parts.map(encodeURIComponent)].join('/');
  }

  private replace(d: Dashboard): void {
    this.list.update((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [...list, d]));
  }

  // ===== Page furniture =====

  /** GET /options: date presets, widget types, metric catalog and templates. */
  loadOptions(): Observable<void> {
    return this.http.get<OptionsDto>(`${this.apiUrl}/options`, { headers: this.headers }).pipe(
      map((o) => {
        const types = o.widgetTypes
          .map((t) => {
            const type = fromApiType(t.key);
            return type ? { type, label: t.label, span: t.defaultWidth, height: t.defaultHeight } : null;
          })
          .filter((t): t is WidgetTypeDef => !!t);
        if (types.length) this.widgetTypes.set(types);
        this.metrics.set(
          o.metrics.map((m) => ({
            key: m.key,
            label: m.label,
            description: m.description,
            module: m.module,
            types: m.widgetTypes.map(fromApiType).filter((t): t is WidgetType => !!t)
          }))
        );
        this.templates.set(o.templates.filter((t) => t.widgetCount > 0));
        // Custom needs a from/to picker the page does not have
        this.datePresets.set(o.datePresets.filter((p) => p !== 'Custom'));
        this.defaultDatePreset.set(o.defaultDatePreset);
      }),
      catchError(fail<void>)
    );
  }

  /** GET /filters: Organization, Location and Asset Category values. */
  loadFilters(): Observable<void> {
    const params = new HttpParams().set('tenantId', environment.tenantId).set('clientId', environment.clientId);
    return this.http.get<FilterOptionsDto>(`${this.apiUrl}/filters`, { params, headers: this.headers }).pipe(
      map((f) => {
        this.organizations.set(f.organizations ?? []);
        this.locations.set(f.locations ?? []);
        this.categories.set(f.assetCategories ?? []);
      }),
      catchError(fail<void>)
    );
  }

  // ===== Dashboards =====

  /** GET / (view=all): My Dashboards, Shared with me and Favorites are split from this list on the page. */
  load(): Observable<Dashboard[]> {
    this.loading.set(true);
    const params = new HttpParams()
      .set('view', 'all')
      .set('tenantId', environment.tenantId)
      .set('clientId', environment.clientId)
      .set('pageSize', 200);
    return this.http.get<DashboardListDto>(this.apiUrl, { params, headers: this.headers }).pipe(
      map((res) => {
        // Keep dashboards already opened (with widgets) when the list is refreshed
        const known = new Map(this.list().filter((d) => d.loaded).map((d) => [d.id, d]));
        const list = res.items.map((item) => {
          const next = fromListItem(item);
          const prev = known.get(next.id);
          return prev ? { ...prev, name: next.name, description: next.description, favorite: next.favorite, widgetCount: next.widgetCount } : next;
        });
        this.list.set(list);
        this.loading.set(false);
        return list;
      }),
      catchError((err: HttpErrorResponse) => {
        this.loading.set(false);
        return fail<Dashboard[]>(err);
      })
    );
  }

  /** GET /{id}: widgets, sharing and information. */
  open(id: string): Observable<Dashboard> {
    return this.http.get<DashboardDto>(this.url(id), { headers: this.headers }).pipe(
      map((dto) => {
        const d = fromDetail(dto);
        this.replace(d);
        return d;
      }),
      catchError(fail<Dashboard>)
    );
  }

  /** POST /: blank, from a template, or with a copy of another dashboard's widgets. */
  create(name: string, description: string, sharing: Sharing, start: { widgets?: WidgetConfig[]; templateKey?: string }): Observable<Dashboard> {
    const body = {
      dashboardName: name,
      description: description || null,
      visibility: SHARING_TO_VISIBILITY[sharing],
      templateKey: start.templateKey ?? null,
      widgets: start.widgets?.length ? start.widgets.map((w) => toWidgetRequest(w, false)) : null,
      tenantId: environment.tenantId,
      clientId: environment.clientId
    };
    return this.http.post<DashboardDto>(this.apiUrl, body, { headers: this.headers }).pipe(
      map((dto) => {
        const d = fromDetail(dto);
        this.replace(d);
        return d;
      }),
      catchError(fail<Dashboard>)
    );
  }

  /** POST /{id}/duplicate: a private copy owned by the user. */
  duplicate(d: Dashboard): Observable<Dashboard> {
    return this.http.post<DashboardDto>(this.url(d.id, 'duplicate'), {}, { headers: this.headers }).pipe(
      map((dto) => {
        const copy = fromDetail(dto);
        this.replace(copy);
        return copy;
      }),
      catchError(fail<Dashboard>)
    );
  }

  /** DELETE /{id} (owner only). */
  remove(d: Dashboard): Observable<void> {
    return this.http.delete<void>(this.url(d.id), { headers: this.headers }).pipe(
      map(() => this.list.update((list) => list.filter((x) => x.id !== d.id))),
      catchError(fail<void>)
    );
  }

  /** PUT /{id}/favorite (per user; needs a signed-in user). */
  setFavorite(d: Dashboard, isFavorite: boolean): Observable<Dashboard> {
    return this.http.put<{ isFavorite: boolean }>(this.url(d.id, 'favorite'), { isFavorite }, { headers: this.headers }).pipe(
      map((res) => {
        const next = { ...(this.get(d.id) ?? d), favorite: res?.isFavorite ?? isFavorite };
        this.replace(next);
        return next;
      }),
      catchError(fail<Dashboard>)
    );
  }

  /**
   * PUT /{id}/share. The dialog picks people and groups by name from client-side lists (no directory endpoint here),
   * so new entries use the name as id; existing entries keep their id and permission.
   */
  share(d: Dashboard, sharing: Sharing, people: string[], groups: string[]): Observable<Dashboard> {
    const entries = (names: string[], existing: ShareEntry[]) =>
      names.map((name) => {
        const known = existing.find((e) => e.name === name);
        return { id: known?.id ?? name, name, permission: known?.permission ?? 'View' };
      });
    const body = {
      visibility: SHARING_TO_VISIBILITY[sharing],
      users: entries(people, d.sharedUsers),
      groups: entries(groups, d.sharedGroups)
    };
    return this.http.put<ShareResponseDto>(this.url(d.id, 'share'), body, { headers: this.headers }).pipe(
      map((res) => {
        const users = res.sharedWith.users.map(toShareEntry);
        const grps = res.sharedWith.groups.map(toShareEntry);
        const next: Dashboard = {
          ...(this.get(d.id) ?? d),
          sharing: VISIBILITY_TO_SHARING[res.visibility] ?? 'private',
          sharedUsers: users,
          sharedGroups: grps,
          sharedWith: users.map((u) => u.name),
          groups: grps.map((g) => g.name),
          sharedSummary: res.sharedSummary,
          updatedAt: dateText(new Date().toISOString())
        };
        this.replace(next);
        return next;
      }),
      catchError(fail<Dashboard>)
    );
  }

  // ===== Widgets and layout =====

  /** PUT /{id}/layout with the grid position of every widget, packed in the given order. */
  saveLayout(d: Dashboard, widgets: WidgetConfig[]): Observable<Dashboard> {
    const packed = packLayout(widgets);
    const body = { widgets: packed.map((w) => ({ widgetId: w.id, x: w.x, y: w.y, w: w.span, h: w.h })) };
    return this.http.put<DashboardDto>(this.url(d.id, 'layout'), body, { headers: this.headers }).pipe(
      map((dto) => {
        const next = fromDetail(dto);
        this.replace(next);
        return next;
      }),
      catchError(fail<Dashboard>)
    );
  }

  /** POST /{id}/widgets; the API places it below the others at the chosen width. */
  addWidget(d: Dashboard, n: NewWidgetRequest): Observable<WidgetConfig> {
    const def = this.widgetTypes().find((t) => t.type === n.type);
    const body: WidgetRequest = {
      widgetType: toApiType(n.type),
      metric: n.metric,
      title: n.title,
      position: { x: null, y: null, w: n.span, h: def?.height ?? null },
      settings: null
    };
    return this.http.post<WidgetDto>(this.url(d.id, 'widgets'), body, { headers: this.headers }).pipe(
      map((dto) => {
        const w = toWidget(dto);
        if (!w) throw new Error('The dashboard service returned an unknown widget type.');
        return w;
      }),
      catchError((err) => (err instanceof HttpErrorResponse ? fail<WidgetConfig>(err) : throwError(() => err)))
    );
  }

  /** DELETE /{id}/widgets/{widgetId}. */
  removeWidget(d: Dashboard, widgetId: string): Observable<void> {
    return this.http.delete<void>(this.url(d.id, 'widgets', widgetId), { headers: this.headers }).pipe(
      map(() => undefined),
      catchError(fail<void>)
    );
  }

  /** PUT /{id}: replaces the widget list (used by "Discard changes" to restore the layout from before editing). */
  replaceWidgets(d: Dashboard, widgets: WidgetConfig[]): Observable<Dashboard> {
    const f = d.defaultFilters;
    const body = {
      dashboardName: d.name,
      description: d.description || null,
      audienceRole: d.audienceRole,
      defaultFilters: f
        ? { organization: f.organization, location: f.location, assetCategory: f.assetCategory, datePreset: f.datePreset, dateFrom: f.dateFrom, dateTo: f.dateTo, timeZone: f.timeZone }
        : null,
      widgets: widgets.map((w) => toWidgetRequest(w, true))
    };
    return this.http.put<DashboardDto>(this.url(d.id), body, { headers: this.headers }).pipe(
      map((dto) => {
        const next = fromDetail(dto);
        this.replace(next);
        return next;
      }),
      catchError(fail<Dashboard>)
    );
  }

  // ===== Data =====

  private filterParams(f: DashFilters): HttpParams {
    // "all" clears a filter the dashboard saved as a default
    return new HttpParams()
      .set('organization', f.organization || 'all')
      .set('location', f.location || 'all')
      .set('assetCategory', f.category || 'all')
      .set('datePreset', f.period);
  }

  private toData(dto: DashboardDataDto): DashboardData {
    return { generatedAt: new Date(dto.generatedAt), widgets: Object.fromEntries(dto.widgets.map((w) => [w.widgetId, w])) };
  }

  /** GET /{id}/data: every widget's values for the filter bar. */
  loadData(d: Dashboard, f: DashFilters): Observable<DashboardData> {
    return this.http.get<DashboardDataDto>(this.url(d.id, 'data'), { params: this.filterParams(f), headers: this.headers }).pipe(
      map((dto) => this.toData(dto)),
      catchError(fail<DashboardData>)
    );
  }

  /** GET /{id}/widgets/{widgetId}/data: one widget, e.g. right after it was added. */
  loadWidgetData(d: Dashboard, widgetId: string, f: DashFilters): Observable<DashboardData> {
    return this.http.get<DashboardDataDto>(this.url(d.id, 'widgets', widgetId, 'data'), { params: this.filterParams(f), headers: this.headers }).pipe(
      map((dto) => this.toData(dto)),
      catchError(fail<DashboardData>)
    );
  }

  /** GET /{id}/export: Excel workbook (filters sheet + one sheet per widget). */
  export(d: Dashboard, f: DashFilters): Observable<{ blob: Blob; fileName: string }> {
    const params = this.filterParams(f).set('format', 'xlsx');
    return this.http.get(this.url(d.id, 'export'), { params, headers: this.headers, responseType: 'blob', observe: 'response' }).pipe(
      map((res: HttpResponse<Blob>) => {
        const disposition = res.headers.get('Content-Disposition') ?? '';
        const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
        return { blob: res.body ?? new Blob(), fileName: match ? decodeURIComponent(match[1]) : `${d.id.toLowerCase()}.xlsx` };
      }),
      catchError(async (err: HttpErrorResponse) => {
        // Blob responses carry a JSON problem body as a Blob
        if (err.error instanceof Blob) {
          try {
            const parsed = JSON.parse(await err.error.text());
            throw new Error(errorMessage(new HttpErrorResponse({ error: parsed, status: err.status })));
          } catch (e) {
            if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
          }
        }
        throw new Error(errorMessage(err));
      })
    );
  }
}
