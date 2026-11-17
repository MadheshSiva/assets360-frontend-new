/**
 * DEMO MODE: firmware inventory, update campaigns and network health for Tracking & IoT → Firmware & Connectivity.
 * Figures agree with each other: models add up to 1,248 devices (1,106 online), the 184 devices on old firmware are
 * the running campaign's target, and site issues add up to the 42 connectivity issues.
 */

export type ModelKind = 'sensor' | 'beacon' | 'tracker' | 'vibration' | 'tag';
export type CampaignStatus = 'Running' | 'Paused' | 'Scheduled' | 'Completed' | 'Cancelled';
export type Health = 'Healthy' | 'Degraded' | 'Offline';
export type Conn = 'Online' | 'Degraded' | 'Offline' | 'Stable';
export type Protocol = 'Wi-Fi / Ethernet' | 'Cellular' | 'LoRaWAN' | 'BLE';

export interface DeviceModel {
  id: string;
  name: string;
  vendor: string;
  kind: ModelKind;
  current: string;
  latest: string;
  devices: number;
  online: number;
  releaseDate: string;
  notes: string[];
}

export interface Campaign {
  id: string;
  name: string;
  models: string[];
  started: string;
  status: CampaignStatus;
  target: number;
  updated: number;
  failed: number;
  window: string;
}

export interface Site {
  code: string;
  name: string;
  health: number;
  gateways: number;
  online: number;
  issues: number;
}

export interface Gateway {
  id: string;
  site: string;
  protocol: Protocol;
  model: string;
  conn: Conn;
  lastSeenMin: number;
  rssi: number;
  devices: number;
  firmware: string;
}

export interface NetworkProfile {
  id: string;
  name: string;
  type: Protocol;
  detail: string;
  security: string;
  sites: string[];
  devices: number;
  active: boolean;
}

export const MODELS: DeviceModel[] = [
  { id: 'em300', name: 'Milesight EM300-TH', vendor: 'Milesight', kind: 'sensor', current: 'v1.6.2', latest: 'v1.7.0', devices: 124, online: 116, releaseDate: '2026-10-12',
    notes: ['Lower power draw on LoRaWAN Class A uplinks', 'Fixes humidity drift above 90% RH', 'Adds remote reboot downlink'] },
  { id: 'e8', name: 'Minew E8 BLE Beacon', vendor: 'Minew', kind: 'beacon', current: 'v2.4.1', latest: 'v2.4.1', devices: 208, online: 197, releaseDate: '2026-09-01',
    notes: ['Battery level reported in every advertisement', 'Configurable advertising interval down to 100 ms'] },
  { id: 'fmc920', name: 'Teltonika FMC920', vendor: 'Teltonika', kind: 'tracker', current: 'v03.27.15', latest: 'v03.28.02', devices: 36, online: 31, releaseDate: '2026-10-18',
    notes: ['Faster GNSS fix after deep sleep', 'Roaming APN fallback for UAE-M2M', 'Security patch for SMS commands'] },
  { id: 'vib2', name: 'Industrial Vibration V2', vendor: 'SenseTech', kind: 'vibration', current: 'v2.8.1', latest: 'v2.8.4', devices: 18, online: 17, releaseDate: '2026-10-20',
    notes: ['New RMS velocity alarm thresholds', 'Spectrum upload compressed by 40%'] },
  { id: 'tmt250', name: 'Teltonika TMT250', vendor: 'Teltonika', kind: 'tracker', current: 'v01.04.07', latest: 'v01.05.00', devices: 6, online: 5, releaseDate: '2026-10-08',
    notes: ['Man-down detection sensitivity options', 'Longer standby on 800 mAh battery'] },
  { id: 'e7', name: 'Minew E7 Asset Tag', vendor: 'Minew', kind: 'tag', current: 'v1.9.0', latest: 'v1.9.0', devices: 856, online: 740, releaseDate: '2026-08-14',
    notes: ['Motion-triggered advertising', 'Tamper flag in telemetry'] },
];

export const CAMPAIGNS: Campaign[] = [
  { id: 'CMP-2026-014', name: 'UAE Sensor Fleet – October', models: ['em300', 'fmc920', 'vib2', 'tmt250'], started: '2026-10-12', status: 'Running', target: 184, updated: 118, failed: 6, window: 'Sun 02:00 – 06:00 (GST)' },
  { id: 'CMP-2026-011', name: 'Beacon Fleet v2.4.1', models: ['e8'], started: '2026-09-03', status: 'Completed', target: 208, updated: 205, failed: 3, window: 'Daily 01:00 – 04:00 (GST)' },
  { id: 'CMP-2026-008', name: 'Asset Tags v1.9.0', models: ['e7'], started: '2026-08-16', status: 'Completed', target: 856, updated: 849, failed: 7, window: 'Sun 02:00 – 06:00 (GST)' },
];

export const SITES: Site[] = [
  { code: 'DXB', name: 'Dubai (DXB)', health: 96, gateways: 4, online: 4, issues: 9 },
  { code: 'AUH', name: 'Abu Dhabi (AUH)', health: 92, gateways: 3, online: 3, issues: 8 },
  { code: 'SHJ', name: 'Sharjah (SHJ)', health: 78, gateways: 3, online: 2, issues: 17 },
  { code: 'RAK', name: 'Ras Al Khaimah (RAK)', health: 100, gateways: 2, online: 2, issues: 0 },
  { code: 'AJM', name: 'Ajman (AJM)', health: 88, gateways: 2, online: 2, issues: 8 },
];

export const GATEWAYS: Gateway[] = [
  { id: 'GW-DXB-04', site: 'DXB', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 2, rssi: -58, devices: 214, firmware: 'v60.0.0.44' },
  { id: 'GW-AUH-02', site: 'AUH', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 3, rssi: -61, devices: 176, firmware: 'v60.0.0.44' },
  { id: 'GW-DXB-02', site: 'DXB', protocol: 'LoRaWAN', model: 'Kerlink iStation', conn: 'Degraded', lastSeenMin: 12, rssi: -97, devices: 88, firmware: 'v5.9.2' },
  { id: 'APN-UAE-M2M', site: 'UAE (Multiple)', protocol: 'Cellular', model: 'Cellular APN (UAE-M2M)', conn: 'Stable', lastSeenMin: 1, rssi: -79, devices: 42, firmware: '—' },
  { id: 'GW-DXB-01', site: 'DXB', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 1, rssi: -55, devices: 192, firmware: 'v60.0.0.44' },
  { id: 'GW-DXB-03', site: 'DXB', protocol: 'BLE', model: 'Minew G1', conn: 'Online', lastSeenMin: 2, rssi: -64, devices: 131, firmware: 'v3.2.8' },
  { id: 'GW-AUH-01', site: 'AUH', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 4, rssi: -60, devices: 158, firmware: 'v60.0.0.41' },
  { id: 'GW-AUH-03', site: 'AUH', protocol: 'BLE', model: 'Minew G1', conn: 'Online', lastSeenMin: 6, rssi: -70, devices: 74, firmware: 'v3.2.8' },
  { id: 'GW-SHJ-01', site: 'SHJ', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 3, rssi: -66, devices: 103, firmware: 'v60.0.0.41' },
  { id: 'GW-SHJ-02', site: 'SHJ', protocol: 'LoRaWAN', model: 'Kerlink iStation', conn: 'Degraded', lastSeenMin: 18, rssi: -101, devices: 47, firmware: 'v5.9.0' },
  { id: 'GW-SHJ-03', site: 'SHJ', protocol: 'BLE', model: 'Minew G1', conn: 'Offline', lastSeenMin: 196, rssi: -120, devices: 0, firmware: 'v3.1.4' },
  { id: 'GW-RAK-01', site: 'RAK', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 2, rssi: -57, devices: 62, firmware: 'v60.0.0.44' },
  { id: 'GW-RAK-02', site: 'RAK', protocol: 'BLE', model: 'Minew G1', conn: 'Online', lastSeenMin: 5, rssi: -63, devices: 38, firmware: 'v3.2.8' },
  { id: 'GW-AJM-01', site: 'AJM', protocol: 'Wi-Fi / Ethernet', model: 'Milesight UG65', conn: 'Online', lastSeenMin: 3, rssi: -62, devices: 51, firmware: 'v60.0.0.44' },
  { id: 'GW-AJM-02', site: 'AJM', protocol: 'LoRaWAN', model: 'Kerlink iStation', conn: 'Online', lastSeenMin: 7, rssi: -88, devices: 27, firmware: 'v5.9.2' },
];

export const PROFILES: NetworkProfile[] = [
  { id: 'NP-01', name: 'Plant Wi-Fi (Enterprise)', type: 'Wi-Fi / Ethernet', detail: 'SSID PIQ-IOT · VLAN 40', security: 'WPA2-Enterprise (EAP-TLS)', sites: ['DXB', 'AUH', 'SHJ', 'RAK', 'AJM'], devices: 1051, active: true },
  { id: 'NP-02', name: 'Cellular UAE-M2M', type: 'Cellular', detail: 'APN uae-m2m.iot · roaming fallback', security: 'Private APN + IPsec', sites: ['DXB', 'AUH', 'SHJ'], devices: 42, active: true },
  { id: 'NP-03', name: 'LoRaWAN EU868', type: 'LoRaWAN', detail: 'Class A · ADR on · SF7–SF12', security: 'AES-128 (OTAA)', sites: ['DXB', 'SHJ', 'AJM'], devices: 162, active: true },
  { id: 'NP-04', name: 'BLE Gateway Mesh', type: 'BLE', detail: 'Scan 1 s · MQTT over TLS', security: 'TLS 1.2 to broker', sites: ['DXB', 'AUH', 'SHJ', 'RAK'], devices: 243, active: true },
  { id: 'NP-05', name: 'Legacy Wi-Fi (PSK)', type: 'Wi-Fi / Ethernet', detail: 'SSID PIQ-LEGACY', security: 'WPA2-PSK', sites: ['SHJ'], devices: 0, active: false },
];

/** Totals shown in the header cards. */
export const PREVIOUS = { online: 1043, updates: 164, issues: 58 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 14-day trend ending at `last`, for the header sparklines. */
export function trend(seed: number, start: number, last: number, wobble: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: 14 }, (_, i) => (i === 13 ? last : start + ((last - start) * i) / 13 + (rng() - 0.5) * wobble));
}

/** Signal quality (%) every 30 min over 24 h for a gateway selection: Wi-Fi/Ethernet and cellular. */
export function signalSeries(key: string): { wifi: number[]; cellular: number[] } {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = mulberry32(h || 7);
  const wifi: number[] = [];
  const cellular: number[] = [];
  const dip = key.includes('SHJ') || key.includes('DXB-02') ? 12 : 0;
  for (let i = 0; i < 48; i++) {
    const hour = i / 2;
    const busy = hour >= 8 && hour <= 18 ? 4 : 0;
    wifi.push(Math.max(40, Math.min(99, 84 - busy - dip + Math.sin(i / 3) * 3 + (rng() - 0.5) * 8)));
    cellular.push(Math.max(30, Math.min(95, 62 - busy / 2 + Math.cos(i / 4) * 4 + (rng() - 0.5) * 10)));
  }
  return { wifi, cellular };
}
