import { PersonStatus, demoPhone, slugEmail } from './people.legacy';
import { SkillLevel, TechnicianRecord } from '../../../people/technician/technician.model';

/* DEMO MODE: 86 technicians; the first ten match the approved design. Teams hold their members. */

export const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

// [id, name, primary skill, status]
type Seed = [string, string, string, PersonStatus];
const SEEDS: Seed[] = [
  ['TECH001', 'Arjun Nair', 'Electrical', 'Active'],
  ['TECH002', 'Mohammed Rashid', 'Mechanical', 'Active'],
  ['TECH003', 'Carlos Mendez', 'HVAC', 'On Duty'],
  ['TECH004', 'Li Wei', 'Instrumentation', 'Active'],
  ['TECH005', 'Sanjay Patel', 'Civil', 'Active'],
  ['TECH006', 'Ahmed Hassan', 'IT/Network', 'Active'],
  ['TECH007', 'Ravi Kumar', 'Electrical', 'On Leave'],
  ['TECH008', 'Elena Petrova', 'Safety', 'Active'],
  ['TECH009', 'Faisal Al Qasimi', 'Plumbing', 'Active'],
  ['TECH010', 'Kim Jong', 'Maintenance', 'Inactive']
];

// Own name pools so generated technicians don't share names (or emails) with employees
const FIRST = ['Abdul', 'Bilal', 'Chen', 'Dmitri', 'Eduardo', 'Farhan', 'Gopal', 'Hamza', 'Ivan', 'Jamal', 'Karim', 'Luis', 'Manoj', 'Nikhil', 'Oscar', 'Rajesh'];
const LAST = ['Bose', 'Castillo', 'Dutta', 'Esposito', 'Gill', 'Hussain', 'Jadhav', 'Kowalski', 'Lopez', 'Mishra', 'Novak', 'Ortega', 'Pinto', 'Quadri', 'Sahin', 'Tiwari'];

const SKILLS = ['Electrical', 'Mechanical', 'HVAC', 'Plumbing', 'Instrumentation', 'IT/Network', 'Civil', 'Refrigeration', 'Generator Maintenance', 'Elevator Maintenance', 'Fire Protection', 'Hydraulics'];
const TOTAL = 86;

function build(i: number, [id, name, primarySkill, status]: Seed): TechnicianRecord {
  const contractor = i % 7 === 5;
  return {
    id,
    name,
    photo: null,
    primarySkill,
    email: slugEmail(name),
    phone: demoPhone(i + 301),
    status,
    skillLevel: SKILL_LEVELS[(i * 3 + 2) % SKILL_LEVELS.length],
    secondarySkills: [SKILLS[(i + 3) % SKILLS.length]].filter((s) => s !== primarySkill),
    certifications: primarySkill === 'Electrical' || primarySkill === 'Safety' ? [{ name: `${primarySkill} Licence`, expiry: '2027-03-31' }] : [],
    employeeId: '',
    source: contractor ? 'Contractor' : 'In-house',
    employmentType: contractor ? 'Contract' : 'Permanent',
    joiningDate: new Date(Date.UTC(2017, 2, 1) + ((i * 131) % 3000) * 86400000).toISOString().slice(0, 10),
    hourlyRate: contractor ? 60 + (i % 5) * 10 : null,
    emergencyName: `${name.split(' ')[0]}'s family`,
    emergencyPhone: demoPhone(i + 801),
    address: `Staff accommodation ${1 + (i % 6)}, Dubai`,
    availableForDispatch: status === 'Active' || status === 'On Duty',
    mobileAppAccess: true,
    maxOpenWorkOrders: 5 + (i % 4),
    createdOn: new Date(Date.UTC(2023, 5, 1) + i * 86400000).toISOString().slice(0, 16),
    updatedOn: new Date(Date.UTC(2026, 0, 10) + (i % 120) * 86400000).toISOString().slice(0, 16)
  };
}

export function initialTechnicians(): TechnicianRecord[] {
  const list = SEEDS.map((seed, i) => build(i, seed));
  const used = new Set(list.map((t) => t.name));
  for (let i = SEEDS.length, k = 0; i < TOTAL; k++) {
    const name = `${FIRST[k % FIRST.length]} ${LAST[(k * 5 + Math.floor(k / FIRST.length)) % LAST.length]}`;
    if (used.has(name)) continue;
    used.add(name);
    const status: PersonStatus = i % 17 === 3 ? 'On Leave' : i % 13 === 6 ? 'On Duty' : i % 29 === 9 ? 'Inactive' : 'Active';
    list.push(build(i, [`TECH${String(i + 1).padStart(3, '0')}`, name, SKILLS[i % SKILLS.length], status]));
    i++;
  }
  return list;
}

export function blankTechnician(id: string): TechnicianRecord {
  return {
    ...build(0, [id, '', '', 'Active']),
    email: '',
    phone: '',
    secondarySkills: [],
    certifications: [],
    emergencyName: '',
    emergencyPhone: '',
    address: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    createdOn: '',
    updatedOn: ''
  };
}
