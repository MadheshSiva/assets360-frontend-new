/** Asset details the Maintenance pages show (asset panel, location block, pickers). */
export interface CatalogAsset {
  tag: string;
  name: string;
  type: string;
  site: string;
  building: string;
  area: string;
  department: string;
  manufacturer: string;
  model: string;
  serial: string;
  image?: string;
}

/** Assets offered by the pickers. Empty until an asset lookup API is wired; tags can still be typed. */
export const ASSET_CATALOG: CatalogAsset[] = [];

export function findCatalogAsset(tag: string | null | undefined): CatalogAsset | undefined {
  const t = (tag ?? '').trim().toLowerCase();
  return t ? ASSET_CATALOG.find((a) => a.tag.toLowerCase() === t) : undefined;
}
