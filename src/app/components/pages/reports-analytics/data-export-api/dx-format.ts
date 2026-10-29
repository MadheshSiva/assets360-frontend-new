import {
  Boxes, ChartColumn, ClipboardCheck, Cloud, Coins, Database, Factory, FileText, Mail, MapPin, Package, Plug, Radio, Server,
  ShieldCheck, Snowflake, Wrench
} from 'lucide-angular';
import { ConnectionStatus, ExportStatus } from './data-export-api.model';

export { formatStamp } from './data-export-api.data';

export const JOB_TONES: Record<ExportStatus, string> = {
  Success: 'green',
  Running: 'blue',
  Scheduled: 'purple',
  Failed: 'red',
  Paused: 'orange',
  Draft: 'grey'
};

export const CONNECTION_TONES: Record<ConnectionStatus, string> = {
  Connected: 'green',
  Warning: 'orange',
  Disconnected: 'red',
  Testing: 'blue'
};

export const MODULE_ICONS: Record<string, typeof Boxes> = {
  Assets: Boxes,
  Maintenance: Wrench,
  Inspection: ClipboardCheck,
  Inventory: Package,
  Financial: Coins,
  'Tracking & IoT': Radio,
  'Audit & Compliance': ShieldCheck,
  'WIP / Operations': Factory,
  'Movement & Custody': MapPin,
  'Contracts & Warranty': FileText
};

export const MODULE_TONES: Record<string, string> = {
  Assets: 'purple',
  Maintenance: 'pink',
  Inspection: 'blue',
  Inventory: 'green',
  Financial: 'orange',
  'Tracking & IoT': 'blue',
  'Audit & Compliance': 'purple',
  'WIP / Operations': 'green',
  'Movement & Custody': 'pink',
  'Contracts & Warranty': 'orange'
};

const DESTINATION_ICONS: Record<string, typeof Boxes> = {
  S3: Database,
  SFTP: Server,
  Email: Mail,
  API: Plug,
  Snowflake: Snowflake,
  Azure: Cloud,
  'Power BI': ChartColumn
};

export function moduleIcon(module: string): typeof Boxes {
  return MODULE_ICONS[module] ?? Database;
}

export function destinationIcon(destination: string): typeof Boxes {
  return DESTINATION_ICONS[destination] ?? Plug;
}
