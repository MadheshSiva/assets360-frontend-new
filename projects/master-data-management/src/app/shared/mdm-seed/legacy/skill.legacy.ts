import { AssetModelIcon } from '../../../asset/asset-model/asset-model.icons';
import { SkillRecord, SkillType } from '../../../people/skill/skill.model';

/* DEMO MODE: 45 skills; the first ten match the approved design. */

export const SKILL_CATEGORIES = ['Technical', 'Operational', 'Software', 'Safety', 'Soft Skill', 'Management'];
export const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

// [name, code, category, type, graded?, inactive?, icon, related roles]
type Seed = [string, string, string, SkillType, boolean, boolean, AssetModelIcon, string[]];
const SEEDS: Seed[] = [
  ['Electrical', 'SK-ELC', 'Technical', 'Hard Skill', true, false, 'generator', ['Technician', 'Engineer']],
  ['Mechanical', 'SK-MEC', 'Technical', 'Hard Skill', true, false, 'machine', ['Technician', 'Engineer']],
  ['HVAC', 'SK-HVAC', 'Technical', 'Hard Skill', true, false, 'ac', ['Technician']],
  ['Plumbing', 'SK-PLB', 'Technical', 'Hard Skill', true, false, 'droplets', ['Technician']],
  ['IT/Network', 'SK-IT', 'Technical', 'Hard Skill', true, false, 'network', ['Technician', 'Engineer', 'Administrator']],
  ['Instrumentation', 'SK-INS', 'Technical', 'Hard Skill', true, false, 'gauge', ['Technician', 'Engineer']],
  ['Safety Management', 'SK-SAF', 'Soft Skill', 'Hard Skill', false, false, 'firewall', ['Supervisor', 'Officer', 'Manager']],
  ['Asset Inspection', 'SK-AIN', 'Operational', 'Hard Skill', true, false, 'scanner', ['Inspector', 'Technician']],
  ['CMMS Usage', 'SK-CMMS', 'Software', 'Soft Skill', true, false, 'software', ['Planner', 'Supervisor', 'Technician']],
  ['Welding', 'SK-WEL', 'Technical', 'Hard Skill', true, true, 'flame', ['Technician']],
  ['Civil', 'SK-CIV', 'Technical', 'Hard Skill', true, false, 'elevator', ['Technician', 'Engineer']],
  ['Safety', 'SK-SFT', 'Safety', 'Hard Skill', true, false, 'firewall', ['Officer', 'Technician']],
  ['Maintenance', 'SK-MNT', 'Technical', 'Hard Skill', true, false, 'wrench', ['Technician']],
  ['Carpentry', 'SK-CRP', 'Technical', 'Hard Skill', true, false, 'desk', ['Technician']],
  ['Painting', 'SK-PNT', 'Technical', 'Hard Skill', true, true, 'droplets', ['Technician']],
  ['Masonry', 'SK-MAS', 'Technical', 'Hard Skill', true, true, 'elevator', ['Technician']],
  ['Refrigeration', 'SK-REF', 'Technical', 'Hard Skill', true, false, 'chiller', ['Technician']],
  ['Generator Maintenance', 'SK-GEN', 'Technical', 'Hard Skill', true, false, 'generator', ['Technician']],
  ['Boiler Operation', 'SK-BLR', 'Operational', 'Hard Skill', true, false, 'flame', ['Technician']],
  ['Pneumatics', 'SK-PNE', 'Technical', 'Hard Skill', true, false, 'gauge', ['Technician', 'Engineer']],
  ['Hydraulics', 'SK-HYD', 'Technical', 'Hard Skill', true, false, 'gauge', ['Technician', 'Engineer']],
  ['PLC Programming', 'SK-PLC', 'Software', 'Hard Skill', true, false, 'server', ['Engineer']],
  ['SCADA', 'SK-SCA', 'Software', 'Hard Skill', true, false, 'monitor', ['Engineer']],
  ['Fire Protection', 'SK-FPR', 'Safety', 'Hard Skill', true, false, 'flame', ['Technician', 'Officer']],
  ['Elevator Maintenance', 'SK-ELV', 'Technical', 'Hard Skill', true, false, 'elevator', ['Technician']],
  ['Solar PV', 'SK-SOL', 'Technical', 'Hard Skill', true, false, 'solar', ['Technician', 'Engineer']],
  ['UPS & Batteries', 'SK-UPS', 'Technical', 'Hard Skill', true, false, 'battery', ['Technician']],
  ['Fleet Maintenance', 'SK-FLT', 'Technical', 'Hard Skill', true, false, 'truck', ['Technician']],
  ['Forklift Operation', 'SK-FLO', 'Operational', 'Hard Skill', true, false, 'forklift', ['Technician', 'Storekeeper']],
  ['Crane Operation', 'SK-CRN', 'Operational', 'Hard Skill', true, false, 'crane', ['Technician']],
  ['Rigging', 'SK-RIG', 'Operational', 'Hard Skill', true, false, 'crane', ['Technician']],
  ['Confined Space Entry', 'SK-CSE', 'Safety', 'Hard Skill', false, false, 'siren', ['Technician', 'Supervisor']],
  ['Working at Height', 'SK-WAH', 'Safety', 'Hard Skill', false, false, 'crane', ['Technician']],
  ['First Aid', 'SK-FAD', 'Safety', 'Hard Skill', false, false, 'medical', ['Officer', 'Supervisor']],
  ['Permit to Work', 'SK-PTW', 'Safety', 'Soft Skill', false, false, 'lock', ['Supervisor', 'Officer']],
  ['Root Cause Analysis', 'SK-RCA', 'Operational', 'Soft Skill', true, false, 'microscope', ['Engineer', 'Analyst']],
  ['Vibration Analysis', 'SK-VIB', 'Technical', 'Hard Skill', true, false, 'activity', ['Engineer', 'Technician']],
  ['Thermography', 'SK-THM', 'Technical', 'Hard Skill', true, false, 'camera', ['Engineer', 'Inspector']],
  ['Calibration', 'SK-CAL', 'Technical', 'Hard Skill', true, false, 'gauge', ['Technician']],
  ['Reliability Engineering', 'SK-REL', 'Operational', 'Hard Skill', true, false, 'activity', ['Engineer']],
  ['Spare Parts Management', 'SK-SPM', 'Operational', 'Soft Skill', true, false, 'conveyor', ['Storekeeper', 'Planner']],
  ['Customer Service', 'SK-CUS', 'Soft Skill', 'Soft Skill', true, false, 'phone', ['Coordinator', 'Technician']],
  ['Team Leadership', 'SK-LDR', 'Management', 'Soft Skill', true, false, 'activity', ['Supervisor', 'Manager']],
  ['Communication', 'SK-COM', 'Soft Skill', 'Soft Skill', true, false, 'phone', ['Coordinator', 'Supervisor']],
  ['Report Writing', 'SK-RPT', 'Soft Skill', 'Soft Skill', true, false, 'software', ['Engineer', 'Analyst']]
];

function stamp(day: number): string {
  return new Date(Date.UTC(2024, 1, 1) + day * 86400000).toISOString().slice(0, 16);
}

export function initialSkills(): SkillRecord[] {
  return SEEDS.map(([name, code, category, type, graded, inactive, icon, relatedRoles], i) => ({
    code,
    name,
    category,
    type,
    description: `${name} skills for maintenance and operations staff.`,
    icon,
    status: inactive ? 'Inactive' : 'Active',
    levels: graded ? [...DEFAULT_LEVELS] : [],
    relatedRoles,
    certificationRequired: category === 'Safety' || ['Electrical', 'Welding', 'Crane Operation', 'Forklift Operation'].includes(name),
    certificationValidityMonths: category === 'Safety' ? 24 : 36,
    assessmentRequired: type === 'Hard Skill',
    createdOn: stamp(i * 2),
    updatedOn: stamp(200 + i * 5)
  }));
}

export function blankSkill(): SkillRecord {
  return {
    code: '',
    name: '',
    category: '',
    type: 'Hard Skill',
    description: '',
    icon: 'wrench',
    status: 'Active',
    levels: [...DEFAULT_LEVELS],
    relatedRoles: [],
    certificationRequired: false,
    certificationValidityMonths: 36,
    assessmentRequired: false,
    createdOn: '',
    updatedOn: ''
  };
}
