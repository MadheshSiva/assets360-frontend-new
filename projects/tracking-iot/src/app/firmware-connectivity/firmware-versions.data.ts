/** Static demo firmware inventory by device model. Device counts and installed versions match the demo device registry. */
import { IOT_DEVICES } from '../device-management/iot-devices.data';
import { isoDaysAgo, isoUtcDay } from '../shared/tracking-api';
import type { FirmwareVersionDto } from './firmware-version-api.service';

interface Spec { model: string; latest: string; releasedDays: number; notes: string[] }

const SPECS: Spec[] = [
  { model: 'UG65', latest: '2.4.3', releasedDays: 48, notes: ['Basics Station reconnect after WAN failover', 'Packet forwarder memory leak fixed', 'NTP fallback servers added'] },
  { model: 'Portal Beam', latest: '1.6.2', releasedDays: 35, notes: ['Improved BLE scan duty cycle', 'Occupancy counting accuracy +6%', 'Wi-Fi roaming fixes'] },
  { model: 'FMC130', latest: '3.29.4', releasedDays: 62, notes: ['Faster GNSS fix after ignition on', 'Geofence overspeed scenario added', 'LTE band 5 stability fix'] },
  { model: 'TMT250', latest: '2.4.2', releasedDays: 90, notes: ['Man-down detection tuning', 'Lower sleep current (-18%)', 'SOS button debounce fix'] },
  { model: 'Asset Tag 2', latest: '2.6.1', releasedDays: 27, notes: ['Motion-triggered advertising', 'Battery reporting resolution 1%', 'Security patch for pairing mode'] },
  { model: 'EM300-TH', latest: '1.3.2', releasedDays: 120, notes: ['Data retransmission after network outage', 'Temperature calibration offset support', 'Join retry back-off improved'] },
  { model: 'WISE-2410', latest: '2.2.1', releasedDays: 74, notes: ['Velocity RMS on all three axes', 'OTA over LoRaWAN FUOTA', 'Battery estimate corrected at low temperature'] },
  { model: 'SDM630-LoRa', latest: '1.2.0', releasedDays: 150, notes: ['Export energy register added', 'Modbus timeout handling', 'Uplink payload v2'] },
  { model: 'FX9600', latest: '3.18.2', releasedDays: 210, notes: ['LLRP keep-alive fix', 'Antenna diagnostics in health report', 'TLS 1.3 for management interface'] },
];

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
}

/** The in-memory firmware inventory. */
export const FIRMWARE_VERSIONS: FirmwareVersionDto[] = SPECS.map((s, i) => {
  const devices = IOT_DEVICES.filter((d) => d.model === s.model);
  const oldest = devices.map((d) => d.firmwareVersion ?? '').filter(Boolean).sort()[0];
  const current = oldest && oldest !== s.latest ? oldest : mostCommon(devices.map((d) => d.firmwareVersion ?? '')) || s.latest;
  return {
    id: `FW-${String(i + 1).padStart(4, '0')}`,
    deviceModel: s.model,
    currentVersion: current,
    latestVersion: s.latest,
    deviceCount: devices.length,
    status: current === s.latest ? 'Up to date' : 'Update available',
    releaseDate: isoUtcDay(-s.releasedDays),
    releaseNotes: s.notes,
    createdBy: 'arjun.mehta',
    createdAt: isoDaysAgo(s.releasedDays + 3),
  };
});
