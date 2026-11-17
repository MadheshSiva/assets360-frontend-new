import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_USER, demo, demoError, newRecordId, nextSequenceId } from '../shared/tracking-api';
import { IOT_DEVICES } from '../device-management/iot-devices.data';
import { AMC_VENDORS, MAINTENANCE_JOBS, MAINTENANCE_OPTIONS, TECHNICIANS } from './maintenance-jobs.data';

/** A maintenance job (addressed by maintenanceId, e.g. DM000001). */
export interface MaintenanceJobDto {
  id: string;
  maintenanceId: string;
  deviceId: string;
  deviceName: string | null;
  model: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string;
  maintenanceType: string;
  dueDate: string;
  assignedTo: string | null;
  assignedToId: string | null;
  assignedToType: string | null;
  priority: string;
  description: string | null;
  status: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

/** Body of POST /api/device-maintenance and PUT /api/device-maintenance/{maintenanceId}. */
export interface MaintenanceJobRequest {
  deviceId: string;
  deviceName: string | null;
  model: string | null;
  assetRegistrationId: string | null;
  assetName: string | null;
  siteId: string | null;
  siteName: string | null;
  maintenanceType: string;
  /** yyyy-MM-dd; only the date is kept. */
  dueDate: string;
  assignedTo: string | null;
  assignedToId: string | null;
  assignedToType: string | null;
  priority: string | null;
  description: string | null;
  status: string | null;
}

/** GET /api/device-maintenance/options. */
export interface MaintenanceOptionsDto {
  maintenanceTypes: string[];
  priorities: string[];
  assigneeTypes: string[];
  statuses: string[];
  defaultMaintenanceType: string;
  defaultPriority: string;
}

/** GET /api/device-maintenance/devices: Create Service Request → Device dropdown. */
export interface MaintenanceDeviceDto {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  assetRegistrationId: string | null;
  assetName: string | null;
  /** From the device's latest job; null when it has never been serviced. */
  siteId: string | null;
  siteName: string | null;
  label: string;
}

/** A technician or AMC vendor (Master Data) that can be assigned to a job. */
export interface Assignee {
  id: string;
  name: string;
  type: 'Technician' | 'Vendor';
  skill: string;
  contact: string;
  phone: string;
  email: string;
}

export interface TechnicianDto { technicianId: string; technicianName: string; primarySkill: string | null; email: string | null; phoneNumber: string | null; isDeleted?: boolean }
export interface AmcVendorDto { code: string; amcVendorName: string; primaryContact: string | null; email: string | null; phone: string | null; assetType: { name?: string } | null; isDeleted?: boolean }

/** Device Maintenance (static demo, maintenance-jobs.data.ts). */
@Injectable({ providedIn: 'root' })
export class MaintenanceApiService {
  private readonly auth = inject(AuthService);

  list(): Observable<MaintenanceJobDto[]> {
    return demo(MAINTENANCE_JOBS);
  }

  get(maintenanceId: string): Observable<MaintenanceJobDto> {
    const j = MAINTENANCE_JOBS.find((x) => x.maintenanceId === maintenanceId);
    return j ? demo(j) : demoError(`Job ${maintenanceId} was not found.`);
  }

  create(body: MaintenanceJobRequest): Observable<MaintenanceJobDto> {
    const now = new Date().toISOString();
    const dto: MaintenanceJobDto = {
      ...this.fields(body),
      id: newRecordId(),
      maintenanceId: nextSequenceId('DM', MAINTENANCE_JOBS.map((j) => j.maintenanceId)),
      createdBy: this.userName(), createdAt: now, updatedBy: null, updatedAt: null,
    };
    MAINTENANCE_JOBS.unshift(dto);
    return demo(dto);
  }

  update(maintenanceId: string, body: MaintenanceJobRequest): Observable<MaintenanceJobDto> {
    const i = MAINTENANCE_JOBS.findIndex((x) => x.maintenanceId === maintenanceId);
    if (i < 0) return demoError(`Could not update ${maintenanceId}: it no longer exists.`);
    const old = MAINTENANCE_JOBS[i];
    MAINTENANCE_JOBS[i] = { ...old, ...this.fields(body), updatedBy: this.userName(), updatedAt: new Date().toISOString() };
    return demo(MAINTENANCE_JOBS[i]);
  }

  remove(maintenanceId: string): Observable<void> {
    const i = MAINTENANCE_JOBS.findIndex((x) => x.maintenanceId === maintenanceId);
    if (i >= 0) MAINTENANCE_JOBS.splice(i, 1);
    return demo(undefined as void);
  }

  options(): Observable<MaintenanceOptionsDto> {
    return demo(MAINTENANCE_OPTIONS);
  }

  devices(search = '', limit = 100): Observable<MaintenanceDeviceDto[]> {
    const q = search.trim().toLowerCase();
    return demo(
      IOT_DEVICES.filter((d) => !q || [d.deviceId, d.deviceName, d.model, d.assetName ?? ''].some((v) => v.toLowerCase().includes(q)))
        .slice(0, limit)
        .map((d) => ({
          deviceId: d.deviceId, deviceName: d.deviceName, deviceType: d.deviceType, model: d.model, assetRegistrationId: d.assetRegistrationId,
          assetName: d.assetName, siteId: d.siteId, siteName: d.siteName, label: `${d.deviceId} · ${d.deviceName}`,
        })),
    );
  }

  technicians(): Observable<TechnicianDto[]> {
    return demo(TECHNICIANS);
  }

  vendors(): Observable<AmcVendorDto[]> {
    return demo(AMC_VENDORS);
  }

  /** Signed-in user (createdBy, history entries). */
  userName(): string | null {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  private fields(b: MaintenanceJobRequest): Omit<MaintenanceJobDto, 'id' | 'maintenanceId' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'> {
    const d = IOT_DEVICES.find((x) => x.deviceId === b.deviceId);
    return {
      deviceId: b.deviceId, deviceName: b.deviceName ?? d?.deviceName ?? null, model: b.model ?? d?.model ?? '',
      assetRegistrationId: b.assetRegistrationId ?? d?.assetRegistrationId ?? null, assetName: b.assetName ?? d?.assetName ?? null,
      siteId: b.siteId ?? d?.siteId ?? null, siteName: b.siteName ?? d?.siteName ?? '', maintenanceType: b.maintenanceType,
      dueDate: `${b.dueDate.slice(0, 10)}T00:00:00Z`, assignedTo: b.assignedTo, assignedToId: b.assignedToId, assignedToType: b.assignedToType,
      priority: b.priority ?? MAINTENANCE_OPTIONS.defaultPriority, description: b.description, status: b.status ?? 'Scheduled',
    };
  }
}

export function toTechnician(t: TechnicianDto): Assignee {
  return { id: t.technicianId, name: t.technicianName, type: 'Technician', skill: t.primarySkill ?? '', contact: t.technicianName, phone: t.phoneNumber ?? '', email: t.email ?? '' };
}

export function toVendor(v: AmcVendorDto): Assignee {
  return { id: v.code, name: v.amcVendorName, type: 'Vendor', skill: v.assetType?.name ?? '', contact: v.primaryContact ?? '', phone: v.phone ?? '', email: v.email ?? '' };
}

/** Request body that keeps a job as it is (callers change the fields they edit). */
export function requestOf(j: MaintenanceJobDto): MaintenanceJobRequest {
  return {
    deviceId: j.deviceId, deviceName: j.deviceName, model: j.model, assetRegistrationId: j.assetRegistrationId, assetName: j.assetName,
    siteId: j.siteId, siteName: j.siteName, maintenanceType: j.maintenanceType, dueDate: j.dueDate.slice(0, 10),
    assignedTo: j.assignedTo, assignedToId: j.assignedToId, assignedToType: j.assignedToType, priority: j.priority, description: j.description, status: j.status,
  };
}
