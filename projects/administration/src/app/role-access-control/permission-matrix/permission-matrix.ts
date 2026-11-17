import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  ArrowLeftRight, Box, ChartColumn, Check, ClipboardCheck, FileText, House, Coins, LayoutDashboard, Lock, LucideAngularModule, LucideIconData,
  Minus, Settings, ShieldCheck, Wifi, Wrench, Database, Factory, Layers
} from 'lucide-angular';
import { CellState, PERM_ACTIONS, PermAction, ROLE_MODULES, RoleRecord } from '../role-access.data';

type Tri = 'all' | 'some' | 'none';

const MODULE_ICONS: Record<string, LucideIconData> = {
  Dashboard: House,
  Assets: Database,
  'Tracking & IoT': Wifi,
  'Movement & Custody': ArrowLeftRight,
  Maintenance: Wrench,
  Inspection: ClipboardCheck,
  Inventory: Box,
  Compliance: ShieldCheck,
  'Contracts & Warranty': FileText,
  Financial: Coins,
  'Reports & Analytics': ChartColumn,
  Administration: Settings,
  'WIP / Operations': Factory,
  'Master Data Management': Layers
};

/**
 * Module × action checkbox matrix for a role. Cells cycle none/partial → full → none;
 * cells inherited from the role template are locked. Edits go straight into the given draft.
 */
@Component({
  selector: 'app-permission-matrix',
  imports: [LucideAngularModule],
  templateUrl: './permission-matrix.html',
  styleUrls: ['../../shared/admin-workspace.css', './permission-matrix.css']
})
export class PermissionMatrix {
  @Input({ required: true }) role!: RoleRecord;
  /** Optional module name filter from the page search */
  @Input() filter = '';
  @Output() changed = new EventEmitter<void>();
  @Output() notice = new EventEmitter<string>();

  readonly actions = PERM_ACTIONS;
  readonly icons = { Check, Minus, Lock, LayoutDashboard };

  get modules(): string[] {
    const t = this.filter.trim().toLowerCase();
    return ROLE_MODULES.map((m) => m.name).filter((m) => !t || m.toLowerCase().includes(t));
  }

  moduleIcon(m: string): LucideIconData {
    return MODULE_ICONS[m] ?? LayoutDashboard;
  }

  state(m: string, a: PermAction): CellState {
    return this.role.permissions[m]?.[a] ?? 'na';
  }

  isLocked(m: string, a: PermAction): boolean {
    return this.role.locked.includes(`${m}|${a}`);
  }

  ariaChecked(m: string, a: PermAction): string {
    const s = this.state(m, a);
    return s === 'full' ? 'true' : s === 'partial' ? 'mixed' : 'false';
  }

  cellTitle(m: string, a: PermAction): string {
    const s = this.state(m, a);
    const label = `${m} – ${a}`;
    if (this.isLocked(m, a)) return `${label}: inherited from ${this.role.template || 'template'} (locked)`;
    return `${label}: ${s === 'full' ? 'Full access' : s === 'partial' ? 'Partial access (own / assigned records)' : 'No access'}`;
  }

  toggleCell(m: string, a: PermAction): void {
    const s = this.state(m, a);
    if (s === 'na') return;
    if (this.isLocked(m, a)) {
      this.notice.emit(`${m} ${a} is inherited from the ${this.role.template || 'role'} template and can't be changed here.`);
      return;
    }
    this.set(m, a, s === 'full' ? 'none' : 'full');
    this.changed.emit();
  }

  /** Editable cells for a row, a column or the whole matrix */
  private cells(m: string | null, a: PermAction | null): [string, PermAction][] {
    const out: [string, PermAction][] = [];
    for (const mod of m ? [m] : this.modules) {
      for (const act of a ? [a] : this.actions.map((x) => x.id)) {
        if (this.state(mod, act) !== 'na' && !this.isLocked(mod, act)) out.push([mod, act]);
      }
    }
    return out;
  }

  private tri(cells: [string, PermAction][]): Tri {
    const full = cells.filter(([m, a]) => this.state(m, a) === 'full').length;
    return cells.length && full === cells.length ? 'all' : cells.some(([m, a]) => this.state(m, a) !== 'none') ? 'some' : 'none';
  }

  private setAll(cells: [string, PermAction][]): void {
    if (!cells.length) return;
    const value: CellState = this.tri(cells) === 'all' ? 'none' : 'full';
    for (const [m, a] of cells) this.set(m, a, value);
    this.changed.emit();
  }

  private set(m: string, a: PermAction, value: CellState): void {
    this.role.permissions[m] = { ...this.role.permissions[m], [a]: value };
  }

  rowState(m: string): Tri {
    return this.tri(this.cells(m, null));
  }

  toggleRow(m: string): void {
    this.setAll(this.cells(m, null));
  }

  colState(a: PermAction): Tri {
    return this.tri(this.cells(null, a));
  }

  toggleCol(a: PermAction): void {
    this.setAll(this.cells(null, a));
  }

  allState(): Tri {
    return this.tri(this.cells(null, null));
  }

  toggleAll(): void {
    this.setAll(this.cells(null, null));
  }
}
