/* Types and option defaults for Geofence & Alerts. Zones, rules and alert events are loaded from the Tracking API. */

export type ZoneType = 'Allowed' | 'Warning' | 'Restricted';
export type ZoneStatus = 'Active' | 'Disabled';
export type ZoneShape = 'Polygon' | 'Rectangle' | 'Circle';
export type Trigger = 'enter-exit' | 'enter' | 'exit' | 'dwell';
export type Severity = 'Low' | 'Medium' | 'High' | 'Critical';
/** Page labels for the IoT alert statuses (Open → Unacknowledged, In Progress → Assigned). */
export type EventStatus = 'Unacknowledged' | 'Acknowledged' | 'Assigned' | 'Resolved';

/* Option defaults; the geofence lists are replaced by GET /api/geofences/options once loaded. Alert rule options have
   no endpoint, so these match the Tracking service's AlertRule* constants. */
export const ASSET_GROUPS = ['Forklifts', 'Mobile Tools', 'Vehicles', 'All assets'];
export const SCHEDULES = ['Always active', 'During working hours', 'Outside working hours'];
export const ZONE_TYPES: ZoneType[] = ['Allowed', 'Warning', 'Restricted'];
export const ZONE_SHAPES: ZoneShape[] = ['Polygon', 'Rectangle', 'Circle'];
export const ZONE_COLORS = ['#2563EB', '#F5B40B', '#EF4444', '#0D9488', '#7C3AED', '#F97316', '#EC4899', '#0891B2'];
export const CONDITIONS = ['During all hours', 'During working hours', 'Outside working hours'];
export const SEVERITIES: Severity[] = ['Low', 'Medium', 'High', 'Critical'];
export const TRIGGERS: { value: Trigger; label: string }[] = [
  { value: 'enter-exit', label: 'When asset enters or exits zone' },
  { value: 'enter', label: 'When asset enters zone' },
  { value: 'exit', label: 'When asset exits zone' },
  { value: 'dwell', label: 'When asset remains in zone longer than…' },
];
export const EVENT_STATUSES: EventStatus[] = ['Unacknowledged', 'Acknowledged', 'Assigned', 'Resolved'];

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  site: string;
  siteId: string | null;
  status: ZoneStatus;
  shape: ZoneShape;
  /** Corner count for polygons / rectangles. */
  points: number;
  color: string;
  groups: string[];
  schedule: string;
  monitorEntry: boolean;
  monitorExit: boolean;
  /** Dwell alert threshold, minutes (null when not set). */
  dwellMin: number | null;
  /** Monitored asset count as stored by the API. */
  monitoredCount: number;
  lastEventAt: Date | null;
  /** Days since the zone was created (null when the API has no creation date). */
  createdDaysAgo: number | null;
  /** Polygon / rectangle outline (WGS84); undefined until drawn on the map. */
  latlngs?: { lat: number; lng: number }[];
  /** Circle zones. */
  center?: { lat: number; lng: number };
  radiusM?: number;
  /** Bumped whenever the geometry changes, so the map redraws the zone. */
  geoRev?: number;
}

export interface Rule {
  id: string;
  name: string;
  zoneId: string;
  trigger: Trigger;
  dwellMin: number;
  severity: Severity;
  group: string;
  condition: string;
  createAlert: boolean;
  notify: boolean;
  team: string;
  workflow: boolean;
  workflowName: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  enabled: boolean;
}

/** An IoT alert shown in the event lists. */
export interface AlertEvent {
  /** Alert id, e.g. AL000001. */
  id: string;
  ts: Date;
  /** Asset registration id, or the asset name when there is none. */
  assetCode: string;
  /** Secondary asset label (the name when the code is a registration id). */
  assetSub: string;
  /** Geofence of the rule that raised the alert ('' when unknown). */
  zoneId: string;
  zoneName: string;
  /** API event type, e.g. "Geofence Breach". */
  type: string;
  severity: string;
  message: string;
  /** Who acknowledged / resolved it ('—' when nobody has). */
  owner: string;
  status: EventStatus;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
