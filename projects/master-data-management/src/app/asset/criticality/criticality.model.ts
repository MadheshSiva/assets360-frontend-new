import { LevelIcon } from '../level-icons';

export type CriticalityStatus = 'Active' | 'Inactive';
// Five-point scale used for risk level, likelihood and impact
export type Scale = 'Very Low' | 'Low' | 'Medium' | 'High' | 'Very High';
export type MaintenancePriority = 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest';
export type MonitoringNeed = 'Required' | 'Recommended' | 'Optional' | 'Not Required';

export interface BusinessImpact {
  safety: string;
  operational: string;
  financial: string;
  regulatory: string;
  reputation: string;
  environmental: string;
}

export interface CriticalityRecord {
  code: string;
  name: string;
  description: string;
  color: string;
  icon: LevelIcon;
  image: string | null;
  riskLevel: Scale;
  maintenancePriority: MaintenancePriority;
  isDefault: boolean;
  status: CriticalityStatus;
  // Risk & impact: where this level sits on the risk matrix
  likelihood: Scale;
  impact: Scale;
  businessImpact: BusinessImpact;
  // Maintenance & lifecycle
  recommendedStrategy: string;
  inspectionFrequency: string;
  conditionMonitoring: MonitoringNeed;
  sparePartsPriority: MaintenancePriority;
  responseTimeHours: number;
  // Settings
  escalateOnFailure: boolean;
  rootCauseRequired: boolean;
  approvalForDisposal: boolean;
  showInReports: boolean;
  // asset counts owned by the Assets module
  assets: { total: number; underMaintenance: number; retired: number };
  documents: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
}

export interface CriticalityFilters {
  search: string;
  status: '' | CriticalityStatus;
}
