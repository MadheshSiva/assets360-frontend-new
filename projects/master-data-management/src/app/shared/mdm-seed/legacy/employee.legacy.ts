import { DESIGNATIONS, FIRST_NAMES, LAST_NAMES, PEOPLE_DEPARTMENTS, demoPhone, slugEmail } from './people.legacy';
import { EmployeeRecord, EmployeeStatus } from '../../../people/employee/employee.model';

/* DEMO MODE: 320 employees; the first ten match the approved design. */

export const NATIONALITIES = ['UAE', 'India', 'Pakistan', 'Philippines', 'Egypt', 'Jordan', 'United Kingdom', 'Spain', 'Brazil', 'Sri Lanka'];
const SITES = ['Dubai Factory', 'Abu Dhabi Office', 'Sharjah Warehouse', 'Riyadh Plant', 'Doha Office'];

// [id, name, department, designation, status, skills]
type Seed = [string, string, string, string, EmployeeStatus, string[]];
const SEEDS: Seed[] = [
  ['EMP001', 'Ahmed Al Mansoori', 'Operations', 'Technician', 'Active', ['Mechanical', 'Asset Inspection']],
  ['EMP002', 'Priya Sharma', 'Maintenance', 'Engineer', 'Active', ['Electrical', 'Reliability Engineering', 'CMMS Usage']],
  ['EMP003', 'John Mathew', 'IT Support', 'Technician', 'Active', ['IT/Network', 'CMMS Usage']],
  ['EMP004', 'Sara Khan', 'Facilities', 'Supervisor', 'Active', ['Safety Management', 'Team Leadership']],
  ['EMP005', 'Ramesh Kumar', 'Maintenance', 'Technician', 'On Leave', ['Civil', 'Plumbing']],
  ['EMP006', 'Aisha Rahman', 'Operations', 'Supervisor', 'Active', ['Team Leadership', 'Permit to Work']],
  ['EMP007', 'Daniel Silva', 'Projects', 'Engineer', 'Active', ['Mechanical', 'Report Writing']],
  ['EMP008', 'Fatima Ali', 'Administration', 'Coordinator', 'Active', ['Communication', 'CMMS Usage']],
  ['EMP009', 'Sunil Verma', 'Maintenance', 'Technician', 'Inactive', ['Welding', 'Mechanical']],
  ['EMP010', 'Maria Gomez', 'HSE', 'Officer', 'Active', ['Safety', 'First Aid', 'Fire Protection']]
];

const SKILL_POOL = ['Electrical', 'Mechanical', 'HVAC', 'Plumbing', 'IT/Network', 'Instrumentation', 'CMMS Usage', 'Asset Inspection', 'Safety', 'Communication'];
const TOTAL = 320;

function stamp(day: number): string {
  return new Date(Date.UTC(2023, 0, 9) + day * 86400000).toISOString().slice(0, 16);
}

function build(i: number, [id, name, department, designation, status, skills]: Seed): EmployeeRecord {
  const designMaria = id === 'EMP010';
  return {
    id,
    name,
    photo: null,
    department,
    designation,
    email: slugEmail(name),
    phone: demoPhone(i + 11),
    status,
    employmentType: i % 9 === 4 ? 'Contract' : 'Permanent',
    joiningDate: new Date(Date.UTC(2016, 0, 15) + ((i * 97) % 3600) * 86400000).toISOString().slice(0, 10),
    site: SITES[i % SITES.length],
    reportingManager: designation === 'Technician' ? 'EMP004' : designation === 'Engineer' ? 'EMP006' : '',
    costCenter: `CC-${department.slice(0, 3).toUpperCase()}-001`,
    alternatePhone: '',
    emergencyName: `${name.split(' ')[0]}'s family`,
    emergencyPhone: demoPhone(i + 501),
    address: `Villa ${10 + (i % 80)}, ${['Al Barsha', 'Deira', 'Al Nahda', 'Karama', 'JLT'][i % 5]}, Dubai`,
    nationality: designMaria ? 'Spain' : NATIONALITIES[i % NATIONALITIES.length],
    skills,
    certifications: skills.includes('Safety') || skills.includes('Electrical') ? [{ name: `${skills[0]} Certificate`, expiry: '2027-06-30' }] : [],
    accessRole: designation === 'Supervisor' ? 'Supervisor' : designation === 'Technician' ? 'Technician' : 'Requester',
    canApprove: designation === 'Supervisor' || designation === 'Manager',
    notifyEmail: true,
    notifySms: designation === 'Technician',
    createdOn: stamp(i),
    updatedOn: stamp(600 + (i % 200))
  };
}

export function initialEmployees(): EmployeeRecord[] {
  const list = SEEDS.map((seed, i) => build(i, seed));
  const used = new Set(list.map((e) => e.name));
  for (let i = SEEDS.length, k = 0; i < TOTAL; k++) {
    const name = `${FIRST_NAMES[k % FIRST_NAMES.length]} ${LAST_NAMES[(k * 7 + Math.floor(k / FIRST_NAMES.length)) % LAST_NAMES.length]}`;
    if (used.has(name)) continue;
    used.add(name);
    const status: EmployeeStatus = i % 31 === 7 ? 'Inactive' : i % 23 === 5 ? 'On Leave' : 'Active';
    const skills = [SKILL_POOL[i % SKILL_POOL.length], SKILL_POOL[(i * 3 + 1) % SKILL_POOL.length]].filter((s, n, a) => a.indexOf(s) === n);
    list.push(build(i, [`EMP${String(i + 1).padStart(3, '0')}`, name, PEOPLE_DEPARTMENTS[(i * 5) % 9], DESIGNATIONS[i % DESIGNATIONS.length], status, skills]));
    i++;
  }
  return list;
}

export function blankEmployee(id: string): EmployeeRecord {
  return {
    ...build(0, [id, '', '', '', 'Active', []]),
    email: '',
    phone: '',
    site: '',
    reportingManager: '',
    costCenter: '',
    emergencyName: '',
    emergencyPhone: '',
    address: '',
    nationality: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    accessRole: 'Viewer',
    canApprove: false,
    notifySms: false,
    certifications: [],
    createdOn: '',
    updatedOn: ''
  };
}

export const EMPLOYEE_SITES = SITES;
