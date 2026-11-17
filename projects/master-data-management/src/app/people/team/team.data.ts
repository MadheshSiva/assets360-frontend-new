import { TeamRecord } from './team.model';

export function blankTeam(): TeamRecord {
  return {
    code: '',
    name: '',
    department: '',
    leaderId: '',
    description: '',
    status: '' as TeamRecord['status'],
    members: [],
    shiftCode: '',
    responsibilities: [],
    notifyLeader: true,
    autoAssign: false,
    createdOn: '',
    updatedOn: ''
  };
}
