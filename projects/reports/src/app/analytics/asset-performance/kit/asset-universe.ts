import { RA_CATEGORIES } from '../../shared/analytics-common';

// Filter options shared by Asset Performance, Maintenance Analytics and Predictive Analytics. The figures come from the
// Report Analytics API; this file only holds the "All …" choices and the filter scope shape.

export const ALL_CATEGORIES = 'All categories';
export const ALL_TYPES = 'All asset types';
export const RA_ASSET_TYPES = ['Rotating Equipment', 'Static Equipment', 'Mobile Equipment', 'Electrical Equipment', 'IT & Electronics'];
export const CATEGORY_OPTIONS = [ALL_CATEGORIES, ...RA_CATEGORIES];
export const TYPE_OPTIONS = [ALL_TYPES, ...RA_ASSET_TYPES];

export interface RaScope {
  organization: string;
  location: string;
  category: string;
  type: string;
}
