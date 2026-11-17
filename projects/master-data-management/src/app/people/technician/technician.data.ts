import { SkillLevel, TechnicianRecord } from './technician.model';

export const SKILL_LEVELS: SkillLevel[] = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

export function blankTechnician(id: string): TechnicianRecord {
  return {
    id,
    name: '',
    photo: null,
    primarySkill: '',
    email: '',
    phone: '',
    status: '' as TechnicianRecord['status'],
    skillLevel: '' as TechnicianRecord['skillLevel'],
    secondarySkills: [],
    certifications: [],
    employeeId: '',
    source: 'In-house',
    employmentType: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    hourlyRate: null,
    emergencyName: '',
    emergencyPhone: '',
    address: '',
    availableForDispatch: true,
    mobileAppAccess: true,
    maxOpenWorkOrders: 5,
    createdOn: '',
    updatedOn: ''
  };
}
