import { TeamRecord, TeamStatus } from '../../../people/team/team.model';

/*
 * DEMO MODE: 28 teams; the first ten match the approved design (leader and member counts).
 * Members are employee (EMP001-EMP320) and technician (TECH001-TECH086) IDs.
 */

// [code, name, department, leader, members, status, preset members, shift]
type Seed = [string, string, string, string, number, TeamStatus, string[], string];
const SEEDS: Seed[] = [
  ['TM-A', 'Team A', 'Maintenance', 'TECH001', 8, 'Active', ['TECH002', 'TECH007'], 'SH-MOR'],
  ['TM-B', 'Team B', 'Facilities', 'TECH003', 10, 'Active', ['TECH004', 'TECH010'], 'SH-EVE'],
  ['TM-C', 'Team C', 'Operations', 'TECH006', 6, 'Active', ['TECH005'], 'SH-MOR'],
  ['TM-D', 'Team D', 'Projects', 'TECH008', 7, 'Active', ['TECH009'], 'SH-NIG'],
  ['TM-IT', 'IT Support', 'IT Department', 'EMP003', 5, 'Active', [], 'SH-MOR'],
  ['TM-HSE', 'HSE Team', 'Safety', 'EMP004', 6, 'Active', ['EMP010'], 'SH-MOR'],
  ['TM-CIV', 'Civil Team', 'Civil', 'EMP005', 8, 'On Leave', [], 'SH-MOR'],
  ['TM-MEC', 'Mechanical Team', 'Maintenance', 'TECH002', 9, 'Active', [], 'SH-ROT'],
  ['TM-ELC', 'Electrical Team', 'Maintenance', 'TECH007', 7, 'Active', [], 'SH-ROT'],
  ['TM-INS', 'Inspection Team', 'Quality', 'TECH009', 6, 'Inactive', [], 'SH-MOR'],
  ['TM-E', 'Team E', 'Maintenance', '', 6, 'Active', [], 'SH-EVE'],
  ['TM-F', 'Team F', 'Facilities', '', 5, 'Active', [], 'SH-WKD'],
  ['TM-NGT', 'Night Shift Team', 'Operations', '', 7, 'Active', [], 'SH-NIG'],
  ['TM-HVAC', 'HVAC Team', 'Facilities', '', 6, 'Active', [], 'SH-MOR'],
  ['TM-PLB', 'Plumbing Team', 'Facilities', '', 4, 'Active', [], 'SH-MOR'],
  ['TM-FIRE', 'Fire Safety Team', 'Safety', '', 5, 'Active', [], 'SH-OC'],
  ['TM-FLT', 'Fleet Team', 'Operations', '', 6, 'Active', [], 'SH-MOR'],
  ['TM-WH', 'Warehouse Team', 'Stores', '', 8, 'Active', [], 'SH-EVE'],
  ['TM-CAL', 'Calibration Team', 'Quality', '', 4, 'Active', [], 'SH-MOR'],
  ['TM-UTL', 'Utilities Team', 'Maintenance', '', 6, 'Active', [], 'SH-ROT'],
  ['TM-LND', 'Landscaping Team', 'Facilities', '', 5, 'Active', [], 'SH-MOR'],
  ['TM-CLN', 'Cleaning Team', 'Facilities', '', 9, 'Active', [], 'SH-FLX'],
  ['TM-SEC', 'Security Team', 'Safety', '', 8, 'Active', [], 'SH-NIG'],
  ['TM-COM', 'Commissioning Team', 'Projects', '', 5, 'Active', [], 'SH-MOR'],
  ['TM-ERT', 'Emergency Response Team', 'HSE', '', 6, 'Active', [], 'SH-OC'],
  ['TM-INST', 'Instrumentation Team', 'Maintenance', '', 5, 'Active', [], 'SH-MOR'],
  ['TM-PNT', 'Painting Team', 'Civil', '', 4, 'Inactive', [], 'SH-MOR'],
  ['TM-LFT', 'Lift Maintenance Team', 'Facilities', '', 4, 'Active', [], 'SH-EVE']
];

const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(3, '0')}`;

export function initialTeams(): TeamRecord[] {
  // Technicians TECH011+ and employees EMP011+ are handed out in order, each to one team
  let nextTech = 11;
  let nextEmp = 11;
  return SEEDS.map(([code, name, department, leader, size, status, preset, shiftCode], i) => {
    const members = [...new Set([leader, ...preset].filter(Boolean))];
    // Technical teams take technicians first; the rest take employees
    const technical = !['IT Department', 'Safety', 'HSE', 'Stores', 'Quality'].includes(department);
    while (members.length < size) {
      members.push(technical && nextTech <= 86 ? id('TECH', nextTech++) : id('EMP', nextEmp++));
    }
    return {
      code,
      name,
      department,
      leaderId: leader || members[0],
      description: `${name} handles ${department.toLowerCase()} work orders and inspections.`,
      status,
      members,
      shiftCode,
      responsibilities: ['Preventive maintenance', 'Breakdown response', 'Inspections'].slice(0, 2 + (i % 2)),
      notifyLeader: true,
      autoAssign: i % 3 !== 2,
      createdOn: new Date(Date.UTC(2024, 0, 20) + i * 3 * 86400000).toISOString().slice(0, 16),
      updatedOn: new Date(Date.UTC(2026, 2, 1) + i * 4 * 86400000).toISOString().slice(0, 16)
    };
  });
}

export function blankTeam(): TeamRecord {
  return {
    code: '',
    name: '',
    department: '',
    leaderId: '',
    description: '',
    status: 'Active',
    members: [],
    shiftCode: '',
    responsibilities: [],
    notifyLeader: true,
    autoAssign: false,
    createdOn: '',
    updatedOn: ''
  };
}
