import { EmployeeRecord } from './employee.model';

export const NATIONALITIES = ['UAE', 'India', 'Pakistan', 'Philippines', 'Egypt', 'Jordan', 'United Kingdom', 'Spain', 'Brazil', 'Sri Lanka'];

export function blankEmployee(id: string): EmployeeRecord {
  return {
    id,
    name: '',
    photo: null,
    department: '',
    designation: '',
    email: '',
    phone: '',
    status: '' as EmployeeRecord['status'],
    employmentType: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    site: '',
    reportingManager: '',
    costCenter: '',
    alternatePhone: '',
    emergencyName: '',
    emergencyPhone: '',
    address: '',
    nationality: '',
    skills: [],
    certifications: [],
    accessRole: '',
    canApprove: false,
    notifyEmail: true,
    notifySms: false,
    createdOn: '',
    updatedOn: ''
  };
}
