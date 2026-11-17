import { initialDepartments } from './legacy/department.legacy';
import { initialEmployees } from './legacy/employee.legacy';
import { initialShifts } from './legacy/shift.legacy';
import { initialSkills } from './legacy/skill.legacy';
import { initialTeams } from './legacy/team.legacy';
import { initialTechnicians } from './legacy/technician.legacy';
import { SeedRow, audit, idFor, once, refByCode, refByName } from './seed-utils';

export const employees = once(initialEmployees);
export const departments = once(initialDepartments);
const technicians = once(initialTechnicians);
const teams = once(initialTeams);
const shifts = once(initialShifts);

const text = (v: string | null | undefined) => (v && v.trim() ? v : null);

/** `{ id, name }` of an employee by Employee ID. */
export function employeeRef(employeeId: string | null | undefined): { id: string; name: string } | null {
  const e = employeeId ? employees().find((r) => r.id === employeeId) : undefined;
  return e ? { id: idFor('employees', e.id), name: e.name } : null;
}

function technicianRef(technicianId: string | null | undefined): { id: string; name: string } | null {
  const t = technicianId ? technicians().find((r) => r.id === technicianId) : undefined;
  return t ? { id: idFor('technicians', t.id), name: t.name } : null;
}

/** `{ id, name }` of a department by name; id null when the department isn't in the master. */
export function departmentRef(name: string | null | undefined): { id: string | null; name: string } | null {
  if (!name) return null;
  return refByName('departments', departments(), name) ?? { id: null, name };
}

/** Seeds of the People masters, keyed by resource path. */
export const PEOPLE_SEED: Record<string, () => SeedRow[]> = {
  employees: () =>
    employees().map((r) => ({
      ...audit('employees', r.id, { status: r.status }),
      employeeName: r.name,
      employeeId: r.id,
      department: departmentRef(r.department),
      designation: text(r.designation),
      email: text(r.email),
      phoneNumber: text(r.phone),
      photo: r.photo,
      employmentType: text(r.employmentType),
      joiningDate: text(r.joiningDate),
      site: text(r.site),
      reportingManager: employeeRef(r.reportingManager),
      costCenter: text(r.costCenter),
      alternatePhone: text(r.alternatePhone),
      emergencyContactName: text(r.emergencyName),
      emergencyContactPhone: text(r.emergencyPhone),
      address: text(r.address),
      nationality: text(r.nationality),
      skills: r.skills,
      certifications: r.certifications.map((c) => ({ name: c.name, expiry: text(c.expiry) })),
      accessRole: text(r.accessRole),
      canApprove: r.canApprove,
      notifyEmail: r.notifyEmail,
      notifySms: r.notifySms
    })),

  technicians: () =>
    technicians().map((r) => {
      const team = teams().find((t) => t.members.includes(r.id));
      return {
        ...audit('technicians', r.id, { status: r.status }),
        technicianName: r.name,
        technicianId: r.id,
        primarySkill: text(r.primarySkill),
        assignedTeam: team ? { id: idFor('teams', team.code), name: team.name } : null,
        email: text(r.email),
        phoneNumber: text(r.phone),
        photo: r.photo,
        skillLevel: r.skillLevel,
        secondarySkills: r.secondarySkills,
        certifications: r.certifications.map((c) => ({ name: c.name, expiry: text(c.expiry) })),
        employee: employeeRef(r.employeeId),
        source: r.source,
        employmentType: text(r.employmentType),
        joiningDate: text(r.joiningDate),
        hourlyRate: r.hourlyRate,
        emergencyContactName: text(r.emergencyName),
        emergencyContactPhone: text(r.emergencyPhone),
        address: text(r.address),
        availableForDispatch: r.availableForDispatch,
        mobileAppAccess: r.mobileAppAccess,
        maxOpenWorkOrders: r.maxOpenWorkOrders
      };
    }),

  teams: () =>
    teams().map((r) => {
      const isTech = (m: string) => technicians().some((t) => t.id === m);
      return {
        ...audit('teams', r.code, r),
        teamName: r.name,
        code: r.code,
        department: departmentRef(r.department),
        teamLeader: technicianRef(r.leaderId) ?? employeeRef(r.leaderId),
        description: text(r.description),
        members: r.members.filter(isTech).map(technicianRef).filter(Boolean),
        employeeMembers: r.members.filter((m) => !isTech(m)).map(employeeRef).filter(Boolean),
        shift: refByCode('shifts', shifts(), r.shiftCode),
        responsibilities: r.responsibilities,
        notifyLeader: r.notifyLeader,
        autoAssign: r.autoAssign
      };
    }),

  shifts: () =>
    shifts().map((r) => ({
      ...audit('shifts', r.code, r),
      shiftName: r.name,
      code: r.code,
      shiftType: r.shiftType,
      startTime: text(r.startTime),
      endTime: text(r.endTime),
      workingDays: r.workingDays,
      color: text(r.color),
      description: text(r.description),
      effectiveFrom: text(r.effectiveFrom),
      graceMinutes: r.graceMinutes,
      rotationPattern: text(r.rotationPattern),
      breaks: r.breaks.map((b) => ({ name: b.name, start: text(b.start), minutes: b.minutes })),
      overtimeAllowed: r.overtimeAllowed,
      nightAllowance: r.nightAllowance,
      attendanceRequired: r.attendanceRequired
    })),

  skills: () =>
    initialSkills().map((r) => ({
      ...audit('skills', r.code, r),
      skillName: r.name,
      code: r.code,
      category: text(r.category),
      type: r.type,
      description: text(r.description),
      icon: r.icon,
      levels: r.levels,
      relatedRoles: r.relatedRoles,
      certificationRequired: r.certificationRequired,
      certificationValidityMonths: r.certificationRequired ? r.certificationValidityMonths : null,
      assessmentRequired: r.assessmentRequired
    }))
};
