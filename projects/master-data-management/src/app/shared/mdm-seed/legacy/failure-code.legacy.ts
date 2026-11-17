import { FailureCodeRecord, FailureSeverity } from '../../../maintenance/failure-code/failure-code.model';

/* DEMO MODE: the seven failure codes from the approved design. */

export const FAILURE_CATEGORIES = ['Electrical', 'Mechanical', 'Instrumentation', 'Hydraulic', 'Software', 'Structural', 'General'];
export const FAILURE_SEVERITIES: FailureSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
export const ASSET_CATEGORY_OPTIONS = ['IT Equipment', 'Machinery', 'Vehicles', 'HVAC', 'Electrical & Utilities', 'Buildings & Infrastructure', 'Safety & Security', 'Medical Equipment'];

// [code, name, category, description, severity, inactive?, asset categories, causes, actions]
type Seed = [string, string, string, string, FailureSeverity, boolean, string[], string[], string[]];
const SEEDS: Seed[] = [
  ['FC-001', 'Overheating', 'Electrical', 'Equipment temperature above limit', 'Critical', false, ['Machinery', 'HVAC', 'Electrical & Utilities'],
    ['Blocked ventilation', 'Overload', 'Cooling fan failure'], ['Shut down and isolate', 'Clean vents and filters', 'Check load and cooling']],
  ['FC-002', 'Power Failure', 'Electrical', 'Loss of power supply', 'High', false, ['IT Equipment', 'Machinery', 'Electrical & Utilities'],
    ['Tripped breaker', 'Cable fault', 'Supply outage'], ['Check breakers and fuses', 'Test supply voltage']],
  ['FC-003', 'Leakage', 'Mechanical', 'Fluid or gas leakage', 'High', false, ['Machinery', 'HVAC', 'Vehicles'],
    ['Worn seal', 'Loose fitting', 'Corrosion'], ['Isolate and contain', 'Replace seal or gasket']],
  ['FC-004', 'Excessive Noise', 'Mechanical', 'Abnormal noise during operation', 'Medium', false, ['Machinery', 'HVAC', 'Vehicles'],
    ['Bearing wear', 'Loose parts', 'Misalignment'], ['Inspect bearings', 'Tighten and align']],
  ['FC-005', 'Vibration', 'Mechanical', 'Excessive vibration detected', 'Medium', false, ['Machinery', 'HVAC'],
    ['Imbalance', 'Misalignment', 'Worn mounts'], ['Run vibration analysis', 'Balance and align']],
  ['FC-006', 'Sensor Fault', 'Instrumentation', 'Sensor not responding', 'Low', false, ['Machinery', 'HVAC', 'Safety & Security'],
    ['Wiring fault', 'Sensor drift', 'Power loss'], ['Check wiring', 'Recalibrate or replace sensor']],
  ['FC-007', 'Wear and Tear', 'General', 'Normal wear and tear', 'Low', true, ['Machinery', 'Vehicles', 'Buildings & Infrastructure'],
    ['Age', 'Normal use'], ['Plan replacement']]
];

export function initialFailureCodes(): FailureCodeRecord[] {
  return SEEDS.map(([code, name, category, description, severity, inactive, assetCategories, causes, actions], i) => ({
    code,
    name,
    category,
    description,
    severity,
    status: inactive ? 'Inactive' : 'Active',
    assetCategories,
    causes,
    actions,
    createdOn: new Date(Date.UTC(2024, 1, 2) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 6, 1) + i * 5 * 86400000).toISOString().slice(0, 16)
  }));
}

export function blankFailureCode(): FailureCodeRecord {
  return {
    code: '',
    name: '',
    category: '',
    description: '',
    severity: 'Medium',
    status: 'Active',
    assetCategories: [],
    causes: [],
    actions: [],
    createdOn: '',
    updatedOn: ''
  };
}
