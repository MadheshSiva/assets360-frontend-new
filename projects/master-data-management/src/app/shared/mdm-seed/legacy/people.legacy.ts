/* DEMO MODE: lists shared by the People masters until they come from the API. */

export type PersonStatus = 'Active' | 'On Duty' | 'On Leave' | 'Inactive';

export const PEOPLE_DEPARTMENTS = [
  'Operations', 'Maintenance', 'IT Support', 'IT Department', 'Facilities', 'Projects', 'Administration', 'HSE',
  'Safety', 'Civil', 'Quality', 'Finance', 'Procurement', 'Stores', 'Human Resources'
];

export const DESIGNATIONS = [
  'Technician', 'Senior Technician', 'Engineer', 'Senior Engineer', 'Supervisor', 'Coordinator', 'Officer',
  'Manager', 'Planner', 'Inspector', 'Storekeeper', 'Analyst', 'Administrator'
];

export const EMPLOYMENT_TYPES = ['Permanent', 'Contract', 'Temporary', 'Intern'];
export const ACCESS_ROLES = ['No access', 'Viewer', 'Requester', 'Technician', 'Supervisor', 'Administrator'];

export const FIRST_NAMES = [
  'Omar', 'Neha', 'Rahul', 'Layla', 'Vikram', 'Hana', 'Imran', 'Deepa', 'Yusuf', 'Anita', 'George', 'Mariam',
  'Kiran', 'Noor', 'Thomas', 'Asha', 'Hassan', 'Lina', 'Pradeep', 'Sofia', 'Tariq', 'Meera', 'Joseph', 'Reem'
];
export const LAST_NAMES = [
  'Khalil', 'Iyer', 'Menon', 'Haddad', 'Reddy', 'Saleh', 'Qureshi', 'Pillai', 'Farouk', 'Joseph', 'Mathew',
  'Nasser', 'Rao', 'Hamdan', 'Varghese', 'Shetty', 'Al Amiri', 'Das', 'Fernandes', 'Kapoor', 'Ali', 'Thomas'
];

const AVATAR_COLORS = ['#4f46e5', '#0f766e', '#b45309', '#be123c', '#0369a1', '#7c3aed', '#15803d', '#c2410c'];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function avatarColor(seed: string): string {
  const h = [...seed].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Next free ID after the highest one in use, e.g. EMP320 gives EMP321. */
export function nextId(prefix: string, ids: string[], width = 3): string {
  const max = ids.reduce((m, id) => {
    const n = id.startsWith(prefix) ? Number(id.slice(prefix.length)) : NaN;
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

export function slugEmail(name: string, domain = 'dcs.ae'): string {
  return `${name.toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '.')}@${domain}`;
}

export function demoPhone(n: number): string {
  return `+971 5${n % 10} ${String(100 + ((n * 37) % 900))} ${String(1000 + ((n * 7919) % 9000))}`;
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export function nowStamp(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Reads a PNG/JPG up to 2 MB as a data URL; calls back with an error message otherwise. */
export function readPhoto(event: Event, done: (dataUrl: string) => void, fail: (message: string) => void): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type)) return fail('Use a PNG or JPG image.');
  if (file.size > MAX_PHOTO_BYTES) return fail('Image must be 2 MB or smaller.');
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result));
  reader.readAsDataURL(file);
}
