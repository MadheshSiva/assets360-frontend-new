/** Static demo geofences and the alert rules attached to them. Coordinates sit on the demo sites (master-data.data.ts). */
import { siteById } from '../shared/master-data.data';
import { isoDaysAgo, isoMinutesAgo } from '../shared/tracking-api';
import type { AlertRuleDto } from './alert-rule-api.service';
import type { GeofenceDto, GeofencePointDto } from './geofence-api.service';

const M_LAT = 111_320;

/** Rectangle of `w` × `h` metres centred `dx` / `dy` metres east / north of a point. */
function rect(lat: number, lng: number, w: number, h: number, dx = 0, dy = 0): GeofencePointDto[] {
  const mLng = M_LAT * Math.cos((lat * Math.PI) / 180);
  const cLat = lat + dy / M_LAT;
  const cLng = lng + dx / mLng;
  const hl = h / 2 / M_LAT;
  const hw = w / 2 / mLng;
  return [
    { latitude: cLat + hl, longitude: cLng - hw },
    { latitude: cLat + hl, longitude: cLng + hw },
    { latitude: cLat - hl, longitude: cLng + hw },
    { latitude: cLat - hl, longitude: cLng - hw },
  ];
}

/** Polygon from metre offsets around a point. */
function poly(lat: number, lng: number, pts: [number, number][]): GeofencePointDto[] {
  const mLng = M_LAT * Math.cos((lat * Math.PI) / 180);
  return pts.map(([dx, dy]) => ({ latitude: lat + dy / M_LAT, longitude: lng + dx / mLng }));
}

function fence(
  id: string, name: string, type: string, siteId: string, colour: string, groups: string[], schedule: string, dwell: number | null,
  entry: boolean, exit: boolean, shape: string, coordinates: GeofencePointDto[], radius: number | null, monitored: number, lastEventMin: number | null,
  ageDays: number, status = 'Active',
): GeofenceDto {
  return {
    id, name, geofenceType: type, siteId, siteName: siteById(siteId)?.name ?? '', monitoredAssetCount: monitored, ruleCount: 0, status,
    lastEventAt: lastEventMin === null ? null : isoMinutesAgo(lastEventMin), mapColour: colour, assetGroups: groups, schedule, dwellAlertMinutes: dwell,
    monitorEntry: entry, monitorExit: exit, shape, polygonPoints: shape === 'Circle' ? null : coordinates.length, coordinates, radiusMeters: radius,
    createdBy: 'kavya.nair', createdAt: isoDaysAgo(ageDays), clientId: 'demo-client', tenantId: 'demo-tenant',
  };
}

const CHN = siteById('SITE-CHN-01')!;
const BLR = siteById('SITE-BLR-01')!;
const PUN = siteById('SITE-PUN-01')!;
const HYD = siteById('SITE-HYD-01')!;
const DXB = siteById('SITE-DXB-01')!;

export const GEOFENCES: GeofenceDto[] = [
  fence('GF-0001', 'Chennai Plant Perimeter', 'Allowed', CHN.id, '#2563EB', ['All assets'], 'Always active', null, false, true, 'Polygon',
    poly(CHN.lat, CHN.lng, [[-190, 160], [60, 185], [210, 120], [225, -95], [40, -170], [-175, -140], [-215, 10]]), null, 11, 26, 240),
  fence('GF-0002', 'Loading Dock A', 'Warning', CHN.id, '#F5B40B', ['Forklifts'], 'During working hours', 30, true, true, 'Rectangle',
    rect(CHN.lat, CHN.lng, 70, 32, 95, -70), null, 2, 9, 180),
  fence('GF-0003', 'Hazardous Materials Store', 'Restricted', CHN.id, '#EF4444', ['Forklifts', 'Mobile Tools'], 'Always active', null, true, false, 'Polygon',
    poly(CHN.lat, CHN.lng, [[150, 95], [195, 95], [195, 55], [172, 40], [150, 55]]), null, 3, 95, 210),
  fence('GF-0004', 'Bengaluru DC Yard', 'Allowed', BLR.id, '#0D9488', ['Vehicles'], 'Always active', null, true, true, 'Polygon',
    poly(BLR.lat, BLR.lng, [[-160, 120], [150, 130], [170, -110], [-140, -125]]), null, 4, 14, 300),
  fence('GF-0005', 'Paint Shop Clean Zone', 'Restricted', PUN.id, '#7C3AED', ['Mobile Tools'], 'During working hours', null, true, false, 'Circle',
    [{ latitude: PUN.lat - 40 / M_LAT, longitude: PUN.lng + 0.0006 }], 38, 2, 410, 150),
  fence('GF-0006', 'Cold Chain Dispatch Dock', 'Warning', HYD.id, '#F97316', ['Vehicles', 'Forklifts'], 'Always active', 20, true, true, 'Rectangle',
    rect(HYD.lat, HYD.lng, 60, 28, -40, -55), null, 3, 47, 120),
  fence('GF-0007', 'Jebel Ali Warehouse Apron', 'Allowed', DXB.id, '#0891B2', ['All assets'], 'Outside working hours', null, false, true, 'Polygon',
    poly(DXB.lat, DXB.lng, [[-120, 80], [130, 80], [130, -70], [-120, -70]]), null, 3, 2880, 90, 'Disabled'),
];

function rule(
  id: string, name: string, geofenceId: string, trigger: string, severity: string, group: string, condition: string, dwell: number | null,
  team: string | null, workflow: string | null, channels: string[], status = 'Active',
): AlertRuleDto {
  return {
    id, name, geofenceId, geofenceName: GEOFENCES.find((g) => g.id === geofenceId)?.name ?? '', trigger, severity, assetGroup: group, condition, dwellMinutes: dwell,
    createAlert: true, notifyTeam: !!team, notifyTeamName: team, startWorkflow: !!workflow, workflowName: workflow, notificationChannels: channels, status,
    createdBy: 'kavya.nair', createdAt: isoDaysAgo(100), clientId: 'demo-client', tenantId: 'demo-tenant',
  };
}

export const ALERT_RULES: AlertRuleDto[] = [
  rule('AR-0001', 'Asset left Chennai plant', 'GF-0001', 'When asset exits zone', 'High', 'All assets', 'During all hours', null, 'Plant Security', null, ['In-app', 'Email', 'Push']),
  rule('AR-0002', 'Forklift idling at Loading Dock A', 'GF-0002', 'When asset remains in zone', 'Medium', 'Forklifts', 'During working hours', 30, 'Warehouse Supervisors', null, ['In-app', 'Push']),
  rule('AR-0003', 'Entry into Hazardous Materials Store', 'GF-0003', 'When asset enters zone', 'Critical', 'All assets', 'During all hours', null, 'EHS Team', 'Hazmat incident review', ['In-app', 'Email', 'Push']),
  rule('AR-0004', 'Fleet movement at Bengaluru yard', 'GF-0004', 'When asset enters or exits zone', 'Low', 'Vehicles', 'During all hours', null, null, null, ['In-app']),
  rule('AR-0005', 'Tool cart in paint clean zone', 'GF-0005', 'When asset enters zone', 'High', 'Mobile Tools', 'During working hours', null, 'Paint Shop Leads', null, ['In-app', 'Email']),
  rule('AR-0006', 'Reefer truck dwell at dispatch dock', 'GF-0006', 'When asset remains in zone', 'Medium', 'Vehicles', 'During all hours', 20, 'Cold Chain Ops', 'Temperature excursion check', ['In-app', 'Email']),
  rule('AR-0007', 'After-hours forklift movement', 'GF-0001', 'When asset enters or exits zone', 'Medium', 'Forklifts', 'Outside working hours', null, 'Plant Security', null, ['In-app', 'Email'], 'Disabled'),
];

/** Rule counts per geofence, kept in step with ALERT_RULES. */
export function syncRuleCounts(): void {
  for (const g of GEOFENCES) g.ruleCount = ALERT_RULES.filter((r) => r.geofenceId === g.id).length;
}
syncRuleCounts();
