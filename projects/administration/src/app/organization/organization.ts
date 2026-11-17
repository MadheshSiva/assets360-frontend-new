import { Component, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, concatMap, finalize, from, tap } from 'rxjs';
import {
  ArrowUpDown,
  Box,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Ellipsis,
  Grid3x3,
  Layers,
  ListFilter,
  LucideAngularModule,
  LucideIconData,
  MapPin,
  Network,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  Users,
  Wrench
} from 'lucide-angular';
import { AdminPage } from '../shared/admin-common';
import { CHILD_TYPE, LOCATION_TYPES, PARENT_TYPE, TYPE_TONES } from './organization.data';
import { downloadCsv, parseCsv } from './organization-csv';
import { LocationType, OrgLocation, OrgTabId, RecordStatus } from './organization.model';
import { OrganizationService, apiErrorMessage } from './organization.service';
import { LocationForm } from './location-form/location-form';
import { LocationTree } from './location-tree/location-tree';
import { SummaryTabView } from './summary-tab/summary-tab';

type SortKey = 'code' | 'name' | 'type' | 'parent' | 'contact' | 'status';

const EXPORT_HEADER = ['Location Code', 'Location Name', 'Type', 'Parent Code', 'Address', 'Country', 'City', 'Time Zone', 'Manager', 'Status'];

/** Administration > Organization: location hierarchy plus a summary of each master for the organization. */
@Component({
  standalone: true,
  selector: 'app-admin-organization',
  imports: [FormsModule, RouterLink, LucideAngularModule, LocationTree, LocationForm, SummaryTabView],
  templateUrl: './organization.html',
  styleUrls: ['../shared/admin-workspace.css', './organization.css']
})
export class OrganizationPage extends AdminPage {
  @ViewChild(LocationTree) tree?: LocationTree;
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  readonly service = inject(OrganizationService);
  readonly icons = {
    ArrowUpDown, Building2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Ellipsis, Grid3x3, Layers,
    ListFilter, MapPin, Network, Pencil, Plus, Search, Trash2, Upload
  };
  readonly tabs: { id: OrgTabId; label: string; icon: LucideIconData }[] = [
    { id: 'location', label: 'Location', icon: MapPin },
    { id: 'asset', label: 'Asset', icon: Box },
    { id: 'people', label: 'People', icon: Users },
    { id: 'vendor', label: 'Vendor', icon: Truck },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'compliance', label: 'Compliance', icon: ShieldCheck }
  ];
  readonly types = LOCATION_TYPES;
  readonly typeTones = TYPE_TONES;
  readonly pageSizes = [10, 20, 50];
  readonly typeCards: { type: LocationType; label: string; icon: LucideIconData; tone: string }[] = [
    { type: 'Location', label: 'Locations', icon: MapPin, tone: 'purple' },
    { type: 'Building', label: 'Buildings', icon: Building2, tone: 'blue' },
    { type: 'Floor', label: 'Floors', icon: Layers, tone: 'pink' },
    { type: 'Zone', label: 'Zones', icon: Grid3x3, tone: 'green' }
  ];

  activeTab: OrgTabId = 'location';

  selectedNode: string | null = null;
  search = '';
  filterOpen = false;
  typeFilter: '' | LocationType = '';
  statusFilter: '' | RecordStatus = '';
  sortKey: SortKey | null = null;
  sortDir: 1 | -1 = 1;
  page = 0;
  pageSize = 10;
  listCollapsed = false;
  checked = new Set<string>();
  menuFor: string | null = null;

  formRecord: OrgLocation | null = null;
  formMode: 'add' | 'edit' = 'edit';
  pendingDelete: OrgLocation[] = [];

  constructor() {
    super();
    // Load failures from the Administration API show up as a toast
    effect(() => {
      const error = this.service.error();
      if (error) this.notify(error);
    });
  }

  /* ===== Tabs ===== */

  setTab(id: OrgTabId): void {
    this.activeTab = id;
    this.menuFor = null;
  }

  get summaryTab() {
    return this.service.tab(this.activeTab);
  }

  /* ===== Stats ===== */

  countOf(type: LocationType): number {
    return this.service.ofType(type).length;
  }

  // A stat card narrows the table to its type across the whole organization
  showType(type: LocationType): void {
    this.selectedNode = null;
    this.typeFilter = this.typeFilter === type ? '' : type;
    this.filterOpen = this.filterOpen || !!this.typeFilter;
    this.page = 0;
  }

  /* ===== Hierarchy ===== */

  get selectedLocation(): OrgLocation | undefined {
    return this.service.find(this.selectedNode);
  }

  selectNode(code: string | null): void {
    this.menuFor = null;
    this.selectedNode = code;
    this.page = 0;
    this.checked.clear();
  }

  /** The selected node with the branch above it and everything below it. */
  private scope(): OrgLocation[] {
    const node = this.selectedLocation;
    if (!node) return this.service.all();
    const codes = new Set([...this.service.ancestorsOf(node.code).map((a) => a.code), node.code, ...this.service.descendantsOf(node.code)]);
    return this.service.all().filter((l) => codes.has(l.code));
  }

  /* ===== Table ===== */

  get rows(): OrgLocation[] {
    const term = this.search.trim().toLowerCase();
    const rows = this.scope().filter(
      (l) =>
        (!this.typeFilter || l.type === this.typeFilter) &&
        (!this.statusFilter || l.status === this.statusFilter) &&
        (!term || [l.code, l.name, l.type, this.parentName(l), l.contact, l.city].some((v) => v.toLowerCase().includes(term)))
    );
    const key = this.sortKey;
    if (!key) return rows;
    return [...rows].sort((a, b) => this.sortDir * this.sortValue(a, key).localeCompare(this.sortValue(b, key), undefined, { numeric: true }));
  }

  private sortValue(l: OrgLocation, key: SortKey): string {
    if (key === 'parent') return this.parentName(l);
    if (key === 'type') return String(LOCATION_TYPES.indexOf(l.type));
    return l[key];
  }

  get pageRows(): OrgLocation[] {
    return this.rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.rows.length / this.pageSize));
  }

  /** Up to five page buttons around the current page. */
  get pageNumbers(): number[] {
    const count = this.pageCount;
    const start = Math.max(0, Math.min(this.page - 2, count - 5));
    return Array.from({ length: Math.min(5, count) }, (_, i) => start + i);
  }

  get showingFrom(): number {
    return this.rows.length ? this.page * this.pageSize + 1 : 0;
  }

  get showingTo(): number {
    return Math.min((this.page + 1) * this.pageSize, this.rows.length);
  }

  goTo(page: number): void {
    this.page = Math.min(Math.max(0, page), this.pageCount - 1);
  }

  onFilterChange(): void {
    this.page = 0;
  }

  clearFilters(): void {
    this.search = '';
    this.typeFilter = '';
    this.statusFilter = '';
    this.page = 0;
  }

  get filterCount(): number {
    return (this.typeFilter ? 1 : 0) + (this.statusFilter ? 1 : 0);
  }

  sortBy(key: SortKey): void {
    if (this.sortKey === key) this.sortDir = this.sortDir === 1 ? -1 : 1;
    else {
      this.sortKey = key;
      this.sortDir = 1;
    }
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 1 ? 'ascending' : 'descending';
  }

  parentName(l: OrgLocation): string {
    return this.service.find(l.parent)?.name ?? '';
  }

  isChecked(l: OrgLocation): boolean {
    return this.checked.has(l.code);
  }

  toggleCheck(l: OrgLocation): void {
    if (this.checked.has(l.code)) this.checked.delete(l.code);
    else this.checked.add(l.code);
  }

  get allChecked(): boolean {
    return this.pageRows.length > 0 && this.pageRows.every((l) => this.checked.has(l.code));
  }

  toggleAll(): void {
    const all = this.allChecked;
    for (const l of this.pageRows) {
      if (all) this.checked.delete(l.code);
      else this.checked.add(l.code);
    }
  }

  toggleList(): void {
    this.listCollapsed = !this.listCollapsed;
  }

  toggleFilters(): void {
    this.filterOpen = !this.filterOpen;
  }

  isEditing(l: OrgLocation): boolean {
    return this.formMode === 'edit' && this.formRecord?.code === l.code;
  }

  /* ===== Row menu ===== */

  toggleMenu(l: OrgLocation, event: Event): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === l.code ? null : l.code;
  }

  toggleToolbarMenu(event: Event): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === '__toolbar' ? null : '__toolbar';
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuFor = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuFor = null;
    this.pendingDelete = [];
  }

  /* ===== Drawer ===== */

  edit(l: OrgLocation): void {
    this.menuFor = null;
    this.formMode = 'edit';
    this.formRecord = l;
  }

  /** New location under the selected node (or a top-level location when the organization is selected). */
  addLocation(): void {
    const node = this.selectedLocation;
    // A zone can't hold children, so a new sibling goes under the zone's floor
    const parent = node && node.type === 'Zone' ? this.service.find(node.parent) : node;
    this.openAdd(parent ? CHILD_TYPE[parent.type] ?? 'Zone' : 'Location', parent);
  }

  addChild(l: OrgLocation): void {
    this.menuFor = null;
    const type = CHILD_TYPE[l.type];
    if (type) this.openAdd(type, l);
  }

  private openAdd(type: LocationType, parent: OrgLocation | undefined): void {
    this.formMode = 'add';
    this.formRecord = {
      code: this.service.nextCode(),
      name: '',
      type,
      parent: parent && PARENT_TYPE[type] === parent.type ? parent.code : null,
      address: parent ? parent.address : '',
      // Children inherit the parent's country / city / time zone; otherwise the dropdowns start unselected
      country: parent?.country ?? '',
      city: parent?.city ?? '',
      timeZone: parent?.timeZone ?? '',
      contact: '',
      status: '' as OrgLocation['status']
    };
  }

  duplicate(l: OrgLocation): void {
    this.menuFor = null;
    this.formMode = 'add';
    const { id, ...copy } = l;
    this.formRecord = { ...copy, code: this.service.nextCode(), name: `${l.name} (Copy)` };
  }

  closeForm(): void {
    this.formRecord = null;
  }

  onSaved(event: { record: OrgLocation; originalCode: string | null }): void {
    const { record, originalCode } = event;
    if (originalCode === null) {
      this.service.create(record).subscribe({
        next: (saved) => this.afterSave(saved, `${saved.name} (${saved.code}) added.`),
        error: (err) => this.notify(apiErrorMessage(err, `${record.name} could not be added.`))
      });
      return;
    }
    this.service.update(record, originalCode).subscribe({
      next: (saved) => {
        if (this.selectedNode === originalCode) this.selectedNode = saved.code;
        if (this.checked.delete(originalCode)) this.checked.add(saved.code);
        this.afterSave(saved, `${saved.name} updated.`);
      },
      error: (err) => this.notify(apiErrorMessage(err, `${record.name} could not be updated.`))
    });
  }

  private afterSave(record: OrgLocation, message: string): void {
    this.tree?.reveal(record.code);
    this.notify(message);
    this.formMode = 'edit';
    this.formRecord = this.service.find(record.code) ?? null;
  }

  toggleStatus(l: OrgLocation): void {
    this.menuFor = null;
    const status: RecordStatus = l.status === 'Active' ? 'Inactive' : 'Active';
    this.service.update({ ...l, status }, l.code).subscribe({
      next: (saved) => {
        if (this.formRecord?.code === l.code && this.formMode === 'edit') this.formRecord = this.service.find(saved.code) ?? null;
        this.notify(`${saved.name} is now ${status.toLowerCase()}.`);
      },
      error: (err) => this.notify(apiErrorMessage(err, `${l.name} could not be updated.`))
    });
  }

  /* ===== Delete ===== */

  askDelete(l: OrgLocation): void {
    this.menuFor = null;
    this.confirmDelete([l]);
  }

  deleteChecked(): void {
    this.confirmDelete(this.service.all().filter((l) => this.checked.has(l.code)));
  }

  /** Nodes that still have children outside the selection can't go. */
  private confirmDelete(list: OrgLocation[]): void {
    const codes = new Set(list.map((l) => l.code));
    const blocked = list.find((l) => this.service.childrenOf(l.code).some((c) => !codes.has(c.code)));
    if (blocked) {
      this.notify(`${blocked.name} still has child locations. Move or delete them first.`);
      return;
    }
    this.pendingDelete = list;
  }

  get deleteMessage(): string {
    const list = this.pendingDelete;
    return list.length === 1
      ? `${list[0].name} (${list[0].code}) will be removed from the hierarchy. This can't be undone.`
      : `${list.length} locations will be removed from the hierarchy. This can't be undone.`;
  }

  cancelDelete(): void {
    this.pendingDelete = [];
  }

  doDelete(): void {
    const codes = this.pendingDelete.map((l) => l.code);
    const label = codes.length === 1 ? this.pendingDelete[0].name : `${codes.length} locations`;
    this.pendingDelete = [];
    // Clears whatever the server already removed, also when a later delete in the batch fails
    const tidy = () => {
      for (const c of codes) {
        if (this.service.find(c)) continue;
        this.checked.delete(c);
        if (this.selectedNode === c) this.selectedNode = null;
        if (this.formRecord && this.formMode === 'edit' && this.formRecord.code === c) this.formRecord = null;
      }
      this.goTo(this.page);
    };
    this.service.remove(codes).subscribe({
      next: () => {
        tidy();
        this.notify(`${label} deleted.`);
      },
      error: (err) => {
        tidy();
        this.notify(apiErrorMessage(err, `${label} could not be deleted.`));
      }
    });
  }

  /* ===== Import / Export ===== */

  export(): void {
    const rows = this.rows;
    downloadCsv(
      'locations.csv',
      EXPORT_HEADER,
      rows.map((l) => [l.code, l.name, l.type, l.parent ?? '', l.address, l.country, l.city, l.timeZone, l.contact, l.status])
    );
    this.notify(`Exported ${rows.length} locations.`);
  }

  pickImport(): void {
    this.importInput?.nativeElement.click();
  }

  /** Reads a CSV in the export layout; rows with a new code and a valid parent are added. */
  onImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) {
      this.notify('Choose a CSV file under 1 MB (use Export for the layout).');
      return;
    }
    file.text().then((text) => this.importRows(parseCsv(text)));
  }

  /** Valid rows are created one by one so a parent earlier in the file exists before its children. */
  private importRows([header, ...lines]: string[][]): void {
    const idx = EXPORT_HEADER.map((name) => (header ?? []).findIndex((h) => h.toLowerCase() === name.toLowerCase()));
    if (idx[0] < 0 || idx[1] < 0 || idx[2] < 0) {
      this.notify('The file needs Location Code, Location Name and Type columns.');
      return;
    }
    const records: OrgLocation[] = [];
    const inFile = (code: string | null) => records.find((r) => r.code === code);
    let added = 0;
    let skipped = 0;
    for (const cells of lines) {
      const get = (i: number) => (idx[i] >= 0 ? cells[idx[i]] ?? '' : '');
      const code = get(0).toUpperCase();
      const name = get(1);
      const type = LOCATION_TYPES.find((t) => t.toLowerCase() === get(2).toLowerCase());
      // Parents may come earlier in the same file
      const parentCode = get(3).toUpperCase() || null;
      const parent = this.service.find(parentCode) ?? inFile(parentCode);
      const parentOk = !!type && (PARENT_TYPE[type] ? parent?.type === PARENT_TYPE[type] : !parent);
      const nameClash = (n: string, p: string | null) =>
        this.service.nameTaken(n, p, null) || records.some((r) => r.parent === p && r.name.toLowerCase() === n.trim().toLowerCase());
      const contact = get(8) || parent?.contact || '';
      if (!code || !name || !type || !parentOk || !contact || this.service.codeTaken(code, null) || inFile(code) || nameClash(name, parent?.code ?? null)) {
        skipped++;
        continue;
      }
      records.push({
        code,
        name,
        type,
        parent: parent?.code ?? null,
        address: get(4),
        country: get(5) || parent?.country || '',
        city: get(6) || parent?.city || '',
        timeZone: get(7) || parent?.timeZone || '',
        contact,
        status: get(9) === 'Inactive' ? 'Inactive' : 'Active'
      });
    }
    from(records)
      .pipe(
        concatMap((r) =>
          this.service.create(r).pipe(
            tap(() => added++),
            catchError(() => {
              skipped++;
              return EMPTY;
            })
          )
        ),
        finalize(() =>
          this.notify(`Imported ${added} location${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} (duplicate code, missing fields, wrong parent or rejected by the server)` : ''}.`)
        )
      )
      .subscribe();
  }
}
