import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError } from 'rxjs';
import { AuthService, environment } from 'shared-ui';
import { apiError, tenantBody, tenantParams, trackingUrl } from '../shared/tracking-api';

/** A maintenance job as /api/device-maintenance returns it (addressed by maintenanceId, e.g. DM000001). */
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

interface TechnicianDto { technicianId: string; technicianName: string; primarySkill: string | null; email: string | null; phoneNumber: string | null; isDeleted?: boolean }
interface AmcVendorDto { code: string; amcVendorName: string; primaryContact: string | null; email: string | null; phone: string | null; assetType: { name?: string } | null; isDeleted?: boolean }

/** Device Maintenance → Tracking service /api/device-maintenance. */
@Injectable({ providedIn: 'root' })
export class MaintenanceApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  list(): Observable<MaintenanceJobDto[]> {
    return this.http.get<MaintenanceJobDto[]>(trackingUrl('device-maintenance'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load maintenance jobs.')));
  }

  get(maintenanceId: string): Observable<MaintenanceJobDto> {
    return this.http.get<MaintenanceJobDto>(trackingUrl(`device-maintenance/${encodeURIComponent(maintenanceId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not load ${maintenanceId}.`)));
  }

  create(body: MaintenanceJobRequest): Observable<MaintenanceJobDto> {
    return this.http
      .post<MaintenanceJobDto>(trackingUrl('device-maintenance'), { ...body, createdBy: this.userName(), ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, 'Could not create the service request.')));
  }

  update(maintenanceId: string, body: MaintenanceJobRequest): Observable<MaintenanceJobDto> {
    return this.http
      .put<MaintenanceJobDto>(trackingUrl(`device-maintenance/${encodeURIComponent(maintenanceId)}`), { ...body, createdBy: null, ...tenantBody() }, { params: tenantParams() })
      .pipe(catchError((e) => apiError(e, `Could not update ${maintenanceId}.`)));
  }

  remove(maintenanceId: string): Observable<void> {
    return this.http.delete<void>(trackingUrl(`device-maintenance/${encodeURIComponent(maintenanceId)}`), { params: tenantParams() }).pipe(catchError((e) => apiError(e, `Could not delete ${maintenanceId}.`)));
  }

  options(): Observable<MaintenanceOptionsDto> {
    return this.http.get<MaintenanceOptionsDto>(trackingUrl('device-maintenance/options'), { params: tenantParams() }).pipe(catchError((e) => apiError(e, 'Could not load the maintenance options.')));
  }

  devices(search = '', limit = 100): Observable<MaintenanceDeviceDto[]> {
    return this.http.get<MaintenanceDeviceDto[]>(trackingUrl('device-maintenance/devices'), { params: tenantParams({ search, limit }) }).pipe(catchError((e) => apiError(e, 'Could not load devices.')));
  }

  /** Technicians from Master Data (GET /api/master-data/technicians). */
  technicians(): Observable<TechnicianDto[]> {
    return this.http.get<TechnicianDto[]>(`${environment.masterDataApiUrl}api/master-data/technicians`, { params: new HttpParams().set('clientId', environment.clientId) });
  }

  /** AMC vendors from Master Data (GET /api/master-data/amc-vendors). */
  vendors(): Observable<AmcVendorDto[]> {
    return this.http.get<AmcVendorDto[]>(`${environment.masterDataApiUrl}api/master-data/amc-vendors`, { params: new HttpParams().set('clientId', environment.clientId) });
  }

  /** Signed-in user (createdBy, history entries). */
  userName(): string | null {
    let stored: string | null = null;
    try { stored = localStorage.getItem('userEmail'); } catch { /* storage blocked */ }
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || stored || null;
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
