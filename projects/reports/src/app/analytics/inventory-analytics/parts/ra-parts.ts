import { LucideIconData } from 'lucide-angular';

// Building blocks shared by Inventory, Financial and WIP / Production Analytics:
// number / date formatting, table sorting and the card / dialog models.

// ===== Numbers =====

export function sumOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

/** 2026-11-02 → "02 Nov 2026" */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

// ===== Sorting =====

export interface SortState {
  key: string;
  dir: 1 | -1;
}

export function toggleSort(state: SortState, key: string): SortState {
  return state.key === key ? { key, dir: state.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

export function sortBy<T>(rows: T[], state: SortState): T[] {
  const k = state.key as keyof T;
  return [...rows].sort((a, b) => {
    const x = a[k];
    const y = b[k];
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return c * state.dir;
  });
}

// ===== Card / dialog models =====

export type Tone = 'red' | 'orange' | 'blue' | 'green' | 'purple' | 'pink';

export interface KpiCardData {
  id: string;
  label: string;
  value: string;
  /** Change vs the previous period, in % */
  delta: number;
  /** Whether an increase is good (green) or bad (red) */
  goodWhenUp: boolean;
  previous: string;
  tone: Tone;
  icon: LucideIconData;
}

export interface InsightAction {
  id: string;
  label: string;
  primary?: boolean;
}

export interface InsightCard {
  id: string;
  tone: Tone;
  icon: LucideIconData;
  title: string;
  text: string;
  actions: InsightAction[];
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  value: string | number;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface FormDialogData {
  title: string;
  intro?: string;
  submitLabel: string;
  fields: FormField[];
}

export interface ListDialogData {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  /** Column indexes that hold numbers (right aligned) */
  numeric?: number[];
  fileName: string;
}

export interface DetailsDialogData {
  title: string;
  subtitle?: string;
  items: { label: string; value: string }[];
}
