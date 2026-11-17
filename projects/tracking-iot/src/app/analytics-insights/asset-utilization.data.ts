/** Static demo asset utilization: running / idle minutes per tracked asset and day, generated deterministically. */
import { DEMO_ASSETS, siteById } from '../shared/master-data.data';
import { IOT_DEVICES } from '../device-management/iot-devices.data';
import { seeded } from '../shared/tracking-api';
import type { AssetTypeUtilizationDto, AssetUtilizationDto, UtilizationByAssetTypeDto } from './analytics-api';

/** Typical share of the day an asset type runs: [weekday, weekend]. */
const PROFILE: Record<string, [number, number]> = {
  Forklift: [0.58, 0.22], 'Pallet Jack': [0.46, 0.15], Vehicle: [0.52, 0.3], 'Reefer Vehicle': [0.61, 0.4], Compressor: [0.74, 0.35], Pump: [0.82, 0.8],
  Generator: [0.04, 0.03], 'CNC Machine': [0.68, 0.12], 'Moulding Machine': [0.79, 0.4], Chiller: [0.71, 0.55], Conveyor: [0.63, 0.1], Robot: [0.66, 0.08],
  Oven: [0.57, 0.05], AGV: [0.6, 0.1], 'Tool Cart': [0.35, 0.05], 'Cold Room': [0.64, 0.64], 'Reefer Container': [0.7, 0.7], 'Charging Station': [0.4, 0.3],
};

const DAY = 86_400_000;

/** One row per tracked asset (an asset with a device) and UTC day, for the last `days` days including today. */
export function utilizationRows(days: number, assetType?: string): AssetUtilizationDto[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tracked = DEMO_ASSETS.filter((a) => (!assetType || a.type === assetType) && IOT_DEVICES.some((d) => d.assetRegistrationId === a.regId));
  const rows: AssetUtilizationDto[] = [];
  for (let i = 0; i < days; i++) {
    const t = today.getTime() - i * DAY;
    const date = new Date(t).toISOString();
    const weekend = [0, 6].includes(new Date(t).getUTCDay());
    const elapsed = i === 0 ? Math.max(1, Math.round((Date.now() - t) / 60_000)) : 1440;
    for (const a of tracked) {
      const dev = IOT_DEVICES.find((d) => d.assetRegistrationId === a.regId)!;
      const [wd, we] = PROFILE[a.type] ?? [0.5, 0.2];
      const share = Math.min(0.98, Math.max(0, (weekend ? we : wd) + (seeded(`${a.regId}|${date}`) - 0.5) * 0.18));
      const running = a.status === 'Under Maintenance' ? 0 : Math.round(elapsed * share);
      const idle = elapsed - running;
      rows.push({
        id: `${a.regId}-${date.slice(0, 10)}`, utilizationId: `UT-${a.regId.slice(4)}-${date.slice(0, 10).replace(/-/g, '')}`, date, assetRegistrationId: a.regId, assetName: a.name,
        assetType: a.type, deviceId: dev.deviceId, siteName: siteById(a.siteId)?.name ?? null, runningMinutes: running, idleMinutes: idle,
        runningPercent: Math.round((running / elapsed) * 1000) / 10, idlePercent: Math.round((idle / elapsed) * 1000) / 10, createdBy: 'system', createdAt: date,
      });
    }
  }
  return rows;
}

export function utilizationByType(days: number): UtilizationByAssetTypeDto {
  const rows = utilizationRows(days);
  const types = new Map<string, AssetUtilizationDto[]>();
  for (const r of rows) types.set(r.assetType, [...(types.get(r.assetType) ?? []), r]);
  const pct = (run: number, idle: number) => (run + idle ? Math.round((run / (run + idle)) * 1000) / 10 : 0);
  const items: AssetTypeUtilizationDto[] = [...types].map(([assetType, list]) => {
    const run = list.reduce((s, r) => s + r.runningMinutes, 0);
    const idle = list.reduce((s, r) => s + r.idleMinutes, 0);
    const p = pct(run, idle);
    return { assetType, assetCount: new Set(list.map((r) => r.assetRegistrationId)).size, runningHours: Math.round(run / 6) / 10, idleHours: Math.round(idle / 6) / 10, runningPercent: p, idlePercent: Math.round((100 - p) * 10) / 10 };
  }).sort((a, b) => b.runningPercent - a.runningPercent);
  const run = rows.reduce((s, r) => s + r.runningMinutes, 0);
  const idle = rows.reduce((s, r) => s + r.idleMinutes, 0);
  const overall = pct(run, idle);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    days, from: new Date(today.getTime() - (days - 1) * DAY).toISOString(), to: new Date().toISOString(),
    overallRunningPercent: overall, overallIdlePercent: Math.round((100 - overall) * 10) / 10, items,
  };
}
