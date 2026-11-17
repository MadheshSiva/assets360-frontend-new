import { SkillRecord } from './skill.model';

export const SKILL_CATEGORIES = ['Technical', 'Operational', 'Software', 'Safety', 'Soft Skill', 'Management'];
export const DEFAULT_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

export function blankSkill(): SkillRecord {
  return {
    code: '',
    name: '',
    category: '',
    type: 'Hard Skill',
    description: '',
    icon: 'wrench',
    status: '' as SkillRecord['status'],
    levels: [...DEFAULT_LEVELS],
    relatedRoles: [],
    certificationRequired: false,
    certificationValidityMonths: 36,
    assessmentRequired: false,
    createdOn: '',
    updatedOn: ''
  };
}
