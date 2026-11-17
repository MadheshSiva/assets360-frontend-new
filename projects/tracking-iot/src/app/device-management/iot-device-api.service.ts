import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from 'shared-ui';
import { DEMO_ASSETS, DEMO_SITES, siteById, siteByName } from '../shared/master-data.data';
import { DEMO_USER, demo, demoError, newRecordId } from '../shared/tracking-api';
import { DEVICE_MODELS, modelByNumber } from '../device-type-model/device-models.data';
import { Conn, DevEvent, Device, Health, LinkedAsset, Power } from './device-data';
import { DEVICE_CONN, IOT_DEVICES, LAST_SEEN_MIN, deviceById, liveDevices } from './iot-devices.data';

/** A device record (addressed by deviceId). */
export interface IoTDeviceDto {
  id: string;
  deviceId: string;
  deviceName: string;
  deviceType: string;
  model: string;
  serialNumber: string | null;
  connectivity: string;
  siteId: string | null;
  siteName: string | null;
  assetRegistrationId: string | null;
  assetCode: string | null;
  assetName: string | null;
  gateway: string | null;
  powerSource: string;
  batteryLevel: number | null;
  lastSeenAt: string | null;
  health: string | null;
  firmwareVersion: string | null;
  pendingFirmwareVersion: string | null;
  firmwareUpdateScheduledAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  clientId: string | null;
  tenantId: string | null;
  /** List rows only (GET /api/iot-devices): connection state, battery % and signal as the API reports them. */
  status?: string | null;
  batteryPercent?: number | null;
  lowBattery?: boolean | null;
  signalDbm?: number | null;
  modelDisplayName?: string | null;
}

/** GET /api/iot-devices/models */
export interface DeviceModelOption {
  modelNumber: string;
  manufacturer: string;
  displayName: string;
  deviceType: string;
  connectivity: string;
  protocol: string | null;
  defaultConnectivity: string;
  powerSource: string;
}

/** GET /api/iot-devices/gateways */
export interface GatewayOption {
  deviceId: string;
  deviceName: string;
  siteId: string | null;
  siteName: string | null;
}

export interface SiteOption {
  id: string;
  name: string;
}

/** Minutes without a message after which a device counts as Offline (the page's default "mark offline after"). */
export const DEFAULT_OFFLINE_MIN = 30;

function epoch(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function powerOf(source: string | null | undefined): Power {
  const s = (source ?? '').toLowerCase();
  return s.startsWith('battery') ? 'Battery' : s === 'poe' ? 'PoE' : 'External';
}

/** Online / Offline from the last message; Pending until the first one arrives (the API has no connection state). */
export function connOf(lastSeenSec: number | null, offlineAfterMin = DEFAULT_OFFLINE_MIN): Conn {
  if (lastSeenSec === null) return 'Pending';
  return lastSeenSec <= offlineAfterMin * 60 ? 'Online' : 'Offline';
}

/**
 * A page device for an API device. The API has no IMEI, signal strength, telemetry or event history:
 * those stay empty (shown as "—"); the events list what the record itself says (registered, updated, last message).
 */
export function deviceFromDto(dto: IoTDeviceDto): Device {
  const created = epoch(dto.createdAt);
  const updated = epoch(dto.updatedAt);
  const seen = epoch(dto.lastSeenAt);
  const lastSeenSec = seen === null ? null : Math.max(0, Math.round((Date.now() - seen) / 1000));
  const health = (['Good', 'Warning', 'Critical'] as Health[]).find((h) => h === dto.health) ?? 'Good';
  const log: DevEvent[] = [];
  if (seen !== null) log.push({ at: seen, title: 'Last message received', detail: dto.gateway ? `via ${dto.gateway}` : '', level: 'green' });
  if (updated !== null) log.push({ at: updated, title: 'Device updated', detail: dto.updatedBy ? `by ${dto.updatedBy}` : '', level: 'purple' });
  if (created !== null) log.push({ at: created, title: 'Device registered', detail: [dto.model, dto.serialNumber, dto.createdBy ? `by ${dto.createdBy}` : ''].filter(Boolean).join(' · '), level: 'grey' });
  log.sort((a, b) => b.at - a.at);
  const code = dto.assetCode || dto.assetRegistrationId;
  const status = (['Online', 'Offline', 'Pending'] as Conn[]).find((c) => c.toLowerCase() === (dto.status ?? '').toLowerCase());
  return {
    id: dto.deviceId,
    name: dto.deviceName,
    type: dto.deviceType,
    model: dto.model,
    serial: dto.serialNumber ?? '',
    imei: '',
    protocol: dto.connectivity,
    conn: status ?? connOf(lastSeenSec),
    health,
    asset: code ? { name: dto.assetName || code, code } : null,
    site: dto.siteName ?? '',
    gateway: dto.gateway ?? '',
    power: powerOf(dto.powerSource),
    battery: dto.batteryPercent ?? dto.batteryLevel ?? null,
    rssi: dto.signalDbm ?? null,
    lastSeenSec,
    firmware: dto.firmwareVersion ?? '',
    installedDaysAgo: created === null ? 0 : Math.max(0, Math.floor((Date.now() - created) / 86_400_000)),
    settings: { intervalMin: 10, lowBattery: 20, offlineAfterMin: DEFAULT_OFFLINE_MIN, alerts: true },
    log,
    api: dto,
  };
}

/** IoT Device Management (static demo): the in-memory device registry of iot-devices.data.ts. */
@Injectable({ providedIn: 'root' })
export class IoTDeviceApiService {
  private readonly auth = inject(AuthService);

  currentUser(): string {
    return this.auth.getUser()?.userName || this.auth.getUserEmail() || DEMO_USER;
  }

  getAll(): Observable<Device[]> {
    return demo(liveDevices().map(deviceFromDto));
  }

  get(deviceId: string): Observable<Device> {
    const dto = liveDevices().find((d) => d.deviceId === deviceId);
    return dto ? demo(deviceFromDto(dto)) : demoError(`Device ${deviceId} was not found.`);
  }

  deviceTypes(): Observable<string[]> {
    return demo([...new Set([...DEVICE_MODELS.map((m) => m.deviceType), ...IOT_DEVICES.map((d) => d.deviceType)])].sort());
  }

  models(deviceType?: string): Observable<DeviceModelOption[]> {
    return demo(
      DEVICE_MODELS.filter((m) => m.status !== 'Inactive' && (!deviceType || m.deviceType === deviceType)).map((m) => ({
        modelNumber: m.modelNumber,
        manufacturer: m.manufacturer,
        displayName: `${m.manufacturer} ${m.modelNumber}`,
        deviceType: m.deviceType,
        connectivity: m.connectivity,
        protocol: m.protocol,
        defaultConnectivity: m.protocol ?? m.connectivity,
        powerSource: m.powerSource,
      })),
    );
  }

  connectivities(model?: string, deviceType?: string): Observable<string[]> {
    const rows = DEVICE_MODELS.filter((m) => (!model || m.modelNumber === model) && (!deviceType || m.deviceType === deviceType));
    return demo([...new Set(rows.flatMap((m) => [m.protocol ?? '', m.connectivity]).filter(Boolean))].sort());
  }

  gateways(siteId?: string): Observable<GatewayOption[]> {
    return demo(
      IOT_DEVICES.filter((d) => d.deviceType === 'Gateway' && (!siteId || d.siteId === siteId)).map((d) => ({
        deviceId: d.deviceId, deviceName: d.deviceName, siteId: d.siteId, siteName: d.siteName,
      })),
    );
  }

  /** Registered assets for the "Link to asset" pickers. */
  registeredAssets(): Observable<LinkedAsset[]> {
    return demo(
      DEMO_ASSETS.map((a): LinkedAsset => ({ name: a.name, code: a.tag, registrationId: a.regId })).sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  sites(): Observable<SiteOption[]> {
    return demo(DEMO_SITES.map((s) => ({ id: s.id, name: s.name })));
  }

  create(d: Device, siteId: string | null): Observable<Device> {
    if (deviceById(d.id)) return demoError(`A device with id ${d.id} is already registered.`);
    const dto = this.toDto(d, siteId, null);
    IOT_DEVICES.unshift(dto);
    return demo(deviceFromDto(dto));
  }

  update(d: Device, siteId?: string | null): Observable<Device> {
    const i = IOT_DEVICES.findIndex((x) => x.deviceId === d.id);
    if (i < 0) return demoError(`Could not save ${d.id}: it is no longer registered.`);
    const old = IOT_DEVICES[i];
    const dto = this.toDto(d, siteId === undefined ? old.siteId : siteId, old);
    IOT_DEVICES[i] = dto;
    return demo(deviceFromDto(dto));
  }

  delete(deviceId: string): Observable<void> {
    const i = IOT_DEVICES.findIndex((x) => x.deviceId === deviceId);
    if (i < 0) return demoError(`Could not delete ${deviceId}: it is no longer registered.`);
    IOT_DEVICES.splice(i, 1);
    delete LAST_SEEN_MIN[deviceId];
    delete DEVICE_CONN[deviceId];
    return demo(undefined as void);
  }

  /** The stored record for a page device (`old` keeps the fields the page does not edit). */
  private toDto(d: Device, siteId: string | null, old: IoTDeviceDto | null): IoTDeviceDto {
    const m = modelByNumber(d.model);
    const site = siteById(siteId) ?? siteByName(d.site);
    const asset = d.asset ? DEMO_ASSETS.find((a) => a.tag === d.asset!.code || a.regId === d.asset!.code || a.regId === d.asset!.registrationId) : undefined;
    const now = new Date().toISOString();
    const user = this.currentUser();
    return {
      ...(old ?? {
        id: newRecordId(), lastSeenAt: null, health: 'Good', firmwareVersion: m?.firmwareTo ?? null, pendingFirmwareVersion: null, firmwareUpdateScheduledAt: null,
        createdBy: user, createdAt: now, updatedBy: null, updatedAt: null, clientId: 'demo-client', tenantId: 'demo-tenant', status: 'Pending', signalDbm: null,
      }),
      deviceId: d.id,
      deviceName: d.name,
      deviceType: d.type,
      model: d.model,
      serialNumber: d.serial || old?.serialNumber || null,
      connectivity: d.protocol,
      siteId: site?.id ?? siteId ?? null,
      siteName: site?.name ?? (d.site || null),
      assetRegistrationId: asset?.regId ?? d.asset?.registrationId ?? (d.asset ? d.asset.code : null),
      assetCode: asset?.tag ?? d.asset?.code ?? null,
      assetName: asset?.name ?? (d.asset ? d.asset.name : null),
      gateway: d.gateway || null,
      powerSource: old?.powerSource ?? m?.powerSource ?? 'Battery (replaceable)',
      batteryLevel: old ? old.batteryLevel : /battery/i.test(m?.powerSource ?? '') ? 100 : null,
      batteryPercent: old ? old.batteryPercent ?? old.batteryLevel : /battery/i.test(m?.powerSource ?? '') ? 100 : null,
      modelDisplayName: m ? `${m.manufacturer} ${m.modelNumber}` : d.model,
      updatedBy: old ? user : null,
      updatedAt: old ? now : null,
    };
  }
}
