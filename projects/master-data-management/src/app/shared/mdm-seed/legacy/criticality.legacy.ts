import { BusinessImpact, CriticalityRecord, MaintenancePriority, MonitoringNeed, Scale } from '../../../asset/criticality/criticality.model';

/* DEMO MODE: the five criticality levels from the approved design, until the API is wired up. */

export const SCALE: Scale[] = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
export const PRIORITIES: MaintenancePriority[] = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];
export const MONITORING: MonitoringNeed[] = ['Required', 'Recommended', 'Optional', 'Not Required'];
export const STRATEGIES = ['Predictive + Preventive', 'Preventive', 'Condition Based', 'Corrective', 'Run to Failure'];
export const INSPECTION_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'None'];

// [code, name, description, colour, risk/likelihood/impact, priority, default, impacts, strategy, inspection, monitoring, spares, response h, assets]
type Seed = [string, string, string, string, Scale, MaintenancePriority, boolean, string[], string, string, MonitoringNeed, MaintenancePriority, number, [number, number, number]];
const SEEDS: Seed[] = [
  [
    'CRIT-VH', 'Very High (Critical)', 'Asset failure will result in severe safety, operational and financial impact.', '#EF4444', 'Very High', 'Highest', false,
    ['Severe', 'Major production/service disruption', 'High financial loss', 'Non-compliance penalties', 'Significant reputation damage', 'Major environmental consequences'],
    'Predictive + Preventive', 'Monthly', 'Required', 'High', 4, [56, 3, 1]
  ],
  [
    'CRIT-H', 'High', 'High impact on operations and cost if asset fails.', '#F97316', 'High', 'High', false,
    ['Major', 'Significant disruption to one site', 'Moderate to high financial loss', 'Possible non-compliance', 'Noticeable reputation impact', 'Moderate environmental impact'],
    'Preventive', 'Quarterly', 'Recommended', 'High', 8, [142, 6, 4]
  ],
  [
    'CRIT-M', 'Medium', 'Moderate impact on operations.', '#FACC15', 'Medium', 'Medium', true,
    ['Moderate', 'Partial disruption with workarounds', 'Moderate financial loss', 'Minor compliance findings', 'Limited reputation impact', 'Minor environmental impact'],
    'Preventive', 'Half-yearly', 'Optional', 'Medium', 24, [318, 9, 11]
  ],
  [
    'CRIT-L', 'Low', 'Minor impact, easily replaceable or limited operational effect.', '#2563EB', 'Low', 'Low', false,
    ['Minor', 'Minor inconvenience', 'Low financial loss', 'None expected', 'Negligible', 'Negligible'],
    'Corrective', 'Yearly', 'Not Required', 'Low', 48, [205, 4, 7]
  ],
  [
    'CRIT-NC', 'Non-Critical', 'No significant impact on operations.', '#9CA3AF', 'Very Low', 'Lowest', false,
    ['None', 'No disruption', 'Negligible', 'None', 'None', 'None'],
    'Run to Failure', 'None', 'Not Required', 'Lowest', 72, [87, 1, 5]
  ]
];

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 12) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

function impacts([safety, operational, financial, regulatory, reputation, environmental]: string[]): BusinessImpact {
  return { safety, operational, financial, regulatory, reputation, environmental };
}

export function initialCriticalities(): CriticalityRecord[] {
  return SEEDS.map(([code, name, description, color, level, priority, isDefault, impact, strategy, inspection, monitoring, spares, response, [total, underMaintenance, retired]], i) => ({
    code,
    name,
    description,
    color,
    icon: (['shield', 'shieldAlert', 'alert', 'info', 'dot'] as const)[i],
    image: null,
    riskLevel: level,
    maintenancePriority: priority,
    isDefault,
    status: 'Active',
    likelihood: level,
    impact: level,
    businessImpact: impacts(impact),
    recommendedStrategy: strategy,
    inspectionFrequency: inspection,
    conditionMonitoring: monitoring,
    sparePartsPriority: spares,
    responseTimeHours: response,
    escalateOnFailure: i < 2,
    rootCauseRequired: i < 3,
    approvalForDisposal: i < 3,
    showInReports: true,
    assets: { total, underMaintenance, retired },
    documents: [4, 3, 2, 2, 1][i],
    createdOn: i === 0 ? '2024-01-12T10:30' : stamp(i),
    createdBy: 'Rex Kumar',
    updatedOn: i === 0 ? '2026-10-15T14:45' : stamp(400 + i * 30)
  }));
}

export function blankCriticality(): CriticalityRecord {
  return {
    code: '',
    name: '',
    description: '',
    color: '#EF4444',
    icon: 'shield',
    image: null,
    riskLevel: 'Medium',
    maintenancePriority: 'Medium',
    isDefault: false,
    status: 'Active',
    likelihood: 'Medium',
    impact: 'Medium',
    businessImpact: impacts(['', '', '', '', '', '']),
    recommendedStrategy: 'Preventive',
    inspectionFrequency: 'Quarterly',
    conditionMonitoring: 'Optional',
    sparePartsPriority: 'Medium',
    responseTimeHours: 24,
    escalateOnFailure: false,
    rootCauseRequired: false,
    approvalForDisposal: false,
    showInReports: true,
    assets: { total: 0, underMaintenance: 0, retired: 0 },
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}
