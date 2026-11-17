import { LevelIcon } from '../level-icons';

export type ConditionStatus = 'Active' | 'Inactive';
export type ConditionType = 'Operational' | 'Non Operational';

export interface ConditionCharacteristics {
  physicalState: string;
  functionality: string;
  appearance: string;
  maintenanceNeed: string;
  expectedRemainingLife: string;
}

export interface ConditionRecord {
  code: string;
  name: string;
  description: string;
  type: ConditionType;
  color: string;
  icon: LevelIcon;
  image: string | null;
  healthScore: number;
  isDefault: boolean;
  status: ConditionStatus;
  // Health & visual
  displayOrder: number;
  showInMobile: boolean;
  showInReports: boolean;
  characteristics: ConditionCharacteristics;
  // Usage & rules: allowed moves, by condition code
  canMoveFrom: string[];
  canMoveTo: string[];
  triggerCriteria: string;
  autoUpdate: boolean;
  // Settings
  photoRequired: boolean;
  commentRequired: boolean;
  notifyOwner: boolean;
  blocksAssignment: boolean;
  // counts owned by the Assets and Maintenance modules
  usage: { assets: number; openWorkOrders: number; slaBreaches: number; underWarranty: number };
  documents: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface ConditionFilters {
  search: string;
  status: '' | ConditionStatus;
  type: '' | ConditionType;
}
