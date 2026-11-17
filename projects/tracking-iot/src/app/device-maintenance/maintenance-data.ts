/**
 * Types, option lists and in-memory collections for Device Maintenance.
 * Jobs come from the Tracking API (/api/device-maintenance); each job is shown both as a scheduled task and as a
 * service request. Plans and checklists have no endpoint and stay in memory for the session.
 */
import type { MaintenanceJobDto } from './maintenance-api.service';

export type DeviceKind = 'gateway' | 'vibration' | 'temp' | 'beacon' | 'tracker' | 'meter' | 'other';
/** One of GET /api/device-maintenance/maintenance-types. */
export type MaintType = string;
export type Stage = 'planned' | 'in-progress' | 'completed';
export type TaskStatus = 'Scheduled' | 'In Progress' | 'Due Soon' | 'Overdue' | 'Completed';
/** One of GET /api/device-maintenance/priorities. */
export type Priority = string;
export type ReqStatus = 'Open' | 'Assigned' | 'In Progress' | 'On Hold' | 'Completed' | 'Cancelled';
export type Health = 'Healthy' | 'Degraded' | 'Critical';

/** Filled from GET /api/device-maintenance/options. */
export const MAINT_TYPES: MaintType[] = [];
/** Filled from GET /api/device-maintenance/options. */
export const PRIORITIES: Priority[] = [];
/** Sites (empty until loaded). */
export const SITES: string[] = [];
export const KIND_LABELS: Record<DeviceKind, string> = {
  gateway: 'Gateway', vibration: 'Vibration Sensor', temp: 'Temperature Sensor', beacon: 'BLE Beacon', tracker: 'GPS Tracker', meter: 'Energy Meter', other: 'Other Device',
};

/** Device family from the IoT device type / name, e.g. "LoRaWAN Gateway" → gateway. */
export function kindOf(text: string): DeviceKind {
  const t = text.toLowerCase();
  if (t.includes('gateway')) return 'gateway';
  if (t.includes('vibration')) return 'vibration';
  if (t.includes('temp')) return 'temp';
  if (t.includes('beacon') || t.includes('ble')) return 'beacon';
  if (t.includes('gps') || t.includes('tracker')) return 'tracker';
  if (t.includes('meter') || t.includes('energy')) return 'meter';
  return 'other';
}
/** Area / facility description per site (empty until loaded). */
export const SITE_AREAS: Record<string, string> = {};

const DAY = 86_400_000;

export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local date `n` days from today (negative = past). */
export function rel(n: number): string {
  const t = new Date();
  return toIso(new Date(t.getFullYear(), t.getMonth(), t.getDate() + n));
}

export function daysFromToday(iso: string): number {
  const t = new Date();
  const base = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - base) / DAY);
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  model: string;
  asset: { id: string; name: string } | null;
  /** Infrastructure record shown in the panel when the device has no linked asset. */
  infra: string;
  site: string;
  siteId: string;
  /** Not provided by the maintenance API (shown as —). */
  health: Health | null;
  uptime: number | null;
  firmware: string;
  warranty: string;
}

export interface Task {
  id: string;
  deviceId: string;
  type: MaintType;
  due: string;
  assignee: string;
  /** A work slot has been confirmed with the technician/vendor. */
  booked: boolean;
  stage: Stage;
  checklist: boolean[];
  completedOn?: string;
  /** The API record this task shows. */
  job: MaintenanceJobDto;
}

export interface ServiceRequest {
  id: string;
  deviceId: string;
  type: MaintType;
  priority: Priority;
  status: ReqStatus;
  created: string;
  due: string;
  assignee: string;
  description: string;
  /** The API record this request shows. */
  job: MaintenanceJobDto;
}

export interface HistoryEntry {
  id: string;
  deviceId: string;
  date: string;
  by: string;
  title: string;
  note: string;
}

export interface Plan {
  id: string;
  name: string;
  kind: DeviceKind;
  interval: number;
  type: MaintType;
  checklist: string[];
}

export interface Vendor {
  id: string;
  name: string;
  internal: boolean;
  services: string[];
  /** Not provided by Master Data (shown as —). */
  sla: string;
  contact: string;
  phone: string;
  email: string;
  rating: number | null;
}

/** Assignable technicians / vendors (Master Data plus names already on jobs); "Unassigned" is the blank option. */
export const TECHNICIANS: string[] = ['Unassigned'];

export const DEVICES: Device[] = [];

/** Maintenance plans per device kind (empty until loaded). */
export const PLANS: Plan[] = [];

export const TASKS: Task[] = [];

export const REQUESTS: ServiceRequest[] = [];

export function titleOf(t: MaintType): string {
  return t === 'Preventive' ? 'Preventive Maintenance' : t === 'Corrective repair' ? 'Corrective Repair' : t === 'Battery replacement' ? 'Battery Replacement' : t === 'Firmware update' ? 'Firmware Update' : t;
}

export const HISTORY: HistoryEntry[] = [];

export const VENDORS: Vendor[] = [];

/** 30-day uptime % and RSSI dBm series for a device, as reported. Empty until telemetry is loaded from the API. */
export function telemetry(_id: string, _uptime: number): { uptime: number[]; rssi: number[] } {
  return { uptime: [], rssi: [] };
}
