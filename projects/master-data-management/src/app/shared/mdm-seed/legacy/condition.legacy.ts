import { LevelIcon } from '../../../asset/level-icons';
import { ConditionRecord, ConditionType } from '../../../asset/condition/condition.model';

/* DEMO MODE: the eight condition values from the approved design, until the API is wired up. */

export const CONDITION_TYPES: ConditionType[] = ['Operational', 'Non Operational'];

// [code, name, description, type, colour, health, icon, inactive?, default?,
//  characteristics, can move from, can move to, [assets, open work orders, SLA breaches, under warranty]]
type Seed = [string, string, string, ConditionType, string, number, LevelIcon, boolean, boolean, string[], string[], string[], [number, number, number, number]];
const SEEDS: Seed[] = [
  ['COND-NEW', 'New', 'New and unused', 'Operational', '#1B5E20', 100, 'sparkles', false, true,
    ['Brand new', 'Fully functional', 'No wear', 'None', '100%'], [], ['COND-LN', 'COND-GOOD', 'COND-REPAIR'], [412, 3, 0, 398]],
  ['COND-LN', 'Like New', 'Excellent condition', 'Operational', '#2E7D32', 90, 'thumbsUp', false, false,
    ['As good as new', 'Fully functional', 'Negligible wear', 'Routine checks', '> 80%'], ['COND-NEW', 'COND-GOOD'], ['COND-GOOD', 'COND-FAIR', 'COND-REPAIR'], [318, 12, 1, 260]],
  ['COND-GOOD', 'Good', 'Good working condition', 'Operational', '#8BC34A', 70, 'gear', false, false,
    ['Good working condition', 'Fully functional', 'Minor wear and tear', 'Normal maintenance', '> 50%'],
    ['COND-NEW', 'COND-LN', 'COND-FAIR', 'COND-POOR'], ['COND-LN', 'COND-FAIR', 'COND-POOR', 'COND-REPAIR'], [245, 38, 6, 180]],
  ['COND-FAIR', 'Fair', 'Minor wear and tear', 'Operational', '#FFC107', 50, 'gauge', false, false,
    ['Visible wear', 'Functional with minor issues', 'Moderate wear and tear', 'Increased maintenance', '25% - 50%'],
    ['COND-LN', 'COND-GOOD', 'COND-POOR', 'COND-REPAIR'], ['COND-GOOD', 'COND-POOR', 'COND-UNS', 'COND-REPAIR'], [162, 41, 9, 64]],
  ['COND-POOR', 'Poor', 'Significant wear, requires attention', 'Operational', '#FF7A1A', 25, 'alert', false, false,
    ['Heavy wear', 'Reduced performance', 'Significant wear and damage', 'Frequent repairs', '< 25%'],
    ['COND-GOOD', 'COND-FAIR'], ['COND-GOOD', 'COND-FAIR', 'COND-UNS', 'COND-REPAIR', 'COND-RET'], [74, 29, 12, 15]],
  ['COND-UNS', 'Unserviceable', 'Not working, requires major repair', 'Non Operational', '#E53935', 0, 'ban', false, false,
    ['Damaged', 'Not functional', 'Major damage', 'Major repair or replacement', 'None'],
    ['COND-FAIR', 'COND-POOR', 'COND-REPAIR'], ['COND-REPAIR', 'COND-RET'], [0, 0, 0, 0]],
  ['COND-REPAIR', 'Under Repair', 'Currently under repair', 'Non Operational', '#1E88E5', 0, 'wrench', false, false,
    ['Being repaired', 'Not available', 'Varies', 'Repair in progress', 'Depends on repair'],
    ['COND-NEW', 'COND-LN', 'COND-GOOD', 'COND-FAIR', 'COND-POOR', 'COND-UNS'], ['COND-FAIR', 'COND-UNS', 'COND-RET'], [0, 0, 0, 0]],
  ['COND-RET', 'Retired', 'End of useful life', 'Non Operational', '#9AA3B5', 0, 'archive', true, false,
    ['End of life', 'Decommissioned', 'Worn out', 'None', 'None'], ['COND-POOR', 'COND-UNS', 'COND-REPAIR'], [], [0, 0, 0, 0]]
];

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 0, 12) + day * 86400000 + (day % 9) * 3600000).toISOString().slice(0, 16);
}

export function initialConditions(): ConditionRecord[] {
  return SEEDS.map(([code, name, description, type, color, healthScore, icon, inactive, isDefault, chars, from, to, [assets, openWorkOrders, slaBreaches, underWarranty]], i) => {
    const [physicalState, functionality, appearance, maintenanceNeed, expectedRemainingLife] = chars;
    const operational = type === 'Operational';
    return {
      code,
      name,
      description: code === 'COND-GOOD' ? 'Good working condition with normal wear and tear.' : description,
      type,
      color,
      icon,
      image: null,
      healthScore,
      isDefault,
      status: inactive ? 'Inactive' : 'Active',
      displayOrder: i + 1,
      showInMobile: !inactive,
      showInReports: true,
      characteristics: { physicalState, functionality, appearance, maintenanceNeed, expectedRemainingLife },
      canMoveFrom: from,
      canMoveTo: to,
      triggerCriteria: operational ? 'Based on inspection result or maintenance assessment' : 'Set by a work order or disposal request',
      autoUpdate: false,
      photoRequired: !operational || healthScore <= 25,
      commentRequired: !operational,
      notifyOwner: healthScore <= 50,
      blocksAssignment: !operational,
      usage: { assets, openWorkOrders, slaBreaches, underWarranty },
      documents: operational ? 2 : 1,
      createdOn: i === 2 ? '2024-01-12T10:30' : stamp(i),
      createdBy: 'Rex Kumar',
      updatedOn: i === 2 ? '2026-10-15T14:45' : stamp(380 + i * 25)
    };
  });
}

export function blankCondition(): ConditionRecord {
  return {
    code: '',
    name: '',
    description: '',
    type: 'Operational',
    color: '#4CAF50',
    icon: 'gear',
    image: null,
    healthScore: 50,
    isDefault: false,
    status: 'Active',
    displayOrder: 0,
    showInMobile: true,
    showInReports: true,
    characteristics: { physicalState: '', functionality: '', appearance: '', maintenanceNeed: '', expectedRemainingLife: '' },
    canMoveFrom: [],
    canMoveTo: [],
    triggerCriteria: '',
    autoUpdate: false,
    photoRequired: false,
    commentRequired: false,
    notifyOwner: false,
    blocksAssignment: false,
    usage: { assets: 0, openWorkOrders: 0, slaBreaches: 0, underWarranty: 0 },
    documents: 0,
    createdOn: '',
    createdBy: '',
    updatedOn: ''
  };
}
