/**
 * Static demo location events (what /api/location-events returned), newest first. Asset ids are the asset tags of
 * master-data.data.ts (the devices on those assets match them); zones are the demo geofences and floor-plan zones.
 */
import { assetByRef } from '../shared/master-data.data';
import { isoMinutesAgo } from '../shared/tracking-api';
import type { LocationEventDto } from './location-event-api.service';

type Row = [minutesAgo: number, asset: string, eventType: string, zone: string, details: string | null];

const ROWS: Row[] = [
  [3, 'FLT-0107', 'Entered Zone', 'Loading Dock A', 'Via aisle 4 · BLE-2001'],
  [7, 'AGV-1204', 'Departed Zone', 'Assembly Line 1', 'Route TUG-2 to Welding Cell'],
  [9, 'AGV-1204', 'Entered Zone', 'Welding Cell', null],
  [14, 'FLT-0121', 'Entered Zone', 'High-Bay Racking', 'Aisle 12, level 3 putaway'],
  [18, 'TRK-0702', 'Departed Zone', 'Bengaluru DC Yard', 'Route BLR-07 · 14 drops'],
  [26, 'FLT-0141', 'Entered Zone', 'Cold Room 1', 'Door D2 · dwell limit 15 min'],
  [33, 'FLT-0141', 'Departed Zone', 'Cold Room 1', 'Stayed 7 min'],
  [41, 'FLT-0112', 'Geofence Alert', 'Hazardous Materials Store', 'Entry without permit · rule AR-0003'],
  [47, 'FLT-0112', 'Entered Zone', 'Hazardous Materials Store', null],
  [58, 'PJK-0133', 'Entered Zone', 'Inbound Staging', 'Dock door 3'],
  [72, 'RFT-1501', 'Entered Zone', 'Cold Chain Dispatch Dock', 'Bay 2 · loading 18 pallets'],
  [95, 'RFT-1501', 'Dwell Exceeded', 'Cold Chain Dispatch Dock', 'Dwell 27 min (limit 20 min)'],
  [128, 'FLT-0107', 'Dwell Exceeded', 'Loading Dock A', 'Idle 42 min (limit 30 min)'],
  [170, 'FLT-0107', 'Entered Zone', 'Loading Dock A', null],
  [186, 'TRK-0705', 'Entered Zone', 'Bengaluru DC Yard', 'Returned from route BLR-03'],
  [204, 'TLC-1311', 'Departed Zone', 'Tool Crib', 'Checked out by line 2'],
  [215, 'TLC-1311', 'Entered Zone', 'Assembly Line 1', null],
  [262, 'FLT-0121', 'Entered Zone', 'Charging Bay', 'Battery 22%'],
  [301, 'FLT-0121', 'Departed Zone', 'Charging Bay', 'Battery 96%'],
  [345, 'FLT-0151', 'Entered Zone', 'Dispatch Apron', null],
  [388, 'RCN-1602', 'Entered Zone', 'Reefer Plug-in Area', 'Plugged in at socket R-14'],
  [420, 'FLT-0112', 'Departed Zone', 'Racking Aisles', null],
  [512, 'TRK-0702', 'Entered Zone', 'Bengaluru DC Yard', 'Overnight parking'],
  [603, 'FLT-0141', 'Entered Zone', 'Ante Room', null],
  [690, 'AGV-1204', 'Entered Zone', 'Assembly Line 1', 'Shift start'],
  [745, 'TLC-1311', 'Geofence Alert', 'Paint Shop Clean Zone', 'Tool cart entered clean zone · rule AR-0005'],
  [760, 'TLC-1311', 'Entered Zone', 'Paint Shop Clean Zone', null],
  [840, 'RFT-1501', 'Departed Zone', 'Cold Chain Dispatch Dock', 'Trip HYD-22 to Vijayawada'],
  [905, 'FLT-0107', 'Departed Zone', 'Loading Dock A', null],
  [1010, 'TRK-0705', 'Departed Zone', 'Bengaluru DC Yard', 'Route BLR-03 · 9 drops'],
  [1180, 'FLT-0151', 'Departed Zone', 'Dispatch Apron', null],
  [1325, 'PJK-0133', 'Departed Zone', 'Inbound Staging', null],
  [1490, 'FLT-0112', 'Entered Zone', 'Racking Aisles', null],
  [1720, 'FLT-0141', 'Dwell Exceeded', 'Cold Room 1', 'Stayed 21 min (limit 15 min)'],
  [1960, 'RFT-1501', 'Entered Zone', 'Cold Chain Dispatch Dock', null],
  [2210, 'TRK-0702', 'Geofence Alert', 'Bengaluru DC Yard', 'Exit outside dispatch window'],
  [2475, 'FLT-0121', 'Entered Zone', 'High-Bay Racking', null],
  [2800, 'FLT-0107', 'Entered Zone', 'Chennai Plant Perimeter', 'Returned from vendor yard'],
];

export const LOCATION_EVENTS: LocationEventDto[] = ROWS.map(([min, asset, eventType, zoneName, details], i) => {
  const a = assetByRef(asset);
  const at = isoMinutesAgo(min);
  return {
    id: `6630f6a5d4e7b8${String(i + 1).padStart(10, '0')}`,
    eventId: `LE${String(ROWS.length - i + 1200).padStart(6, '0')}`,
    eventTime: at,
    assetId: asset,
    assetName: a?.name ?? asset,
    eventType,
    zoneName,
    details,
    createdBy: 'system',
    createdAt: at,
    clientId: 'demo-client',
    tenantId: 'demo-tenant',
  };
});
