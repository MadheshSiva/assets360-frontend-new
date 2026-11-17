import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DEMO_ASSETS, assetLocation, buildingById, floorById, siteById } from '../shared/master-data.data';
import { demo } from '../shared/tracking-api';
import { FLOOR_LAYOUTS } from './floor-layouts.data';

/**
 * What was drawn in Administration › Maps & Floor Plans for a floor (static demo, floor-layouts.data.ts): its floor
 * plan, the zones drawn on it and the assets / devices plotted on it. Positions are % of the plan (0–100, from the
 * top-left corner), so they line up with the plan image wherever the image is placed.
 */

export interface LayoutZone {
  id: string;
  code: string;
  name: string;
  type: string;
  color: string;
  shape: 'Rectangle' | 'Circle' | 'Polygon';
  x: number;
  y: number;
  w: number;
  h: number;
  points: { x: number; y: number }[];
  /** % of the plan width (circles). */
  radius: number | null;
  restricted: boolean;
  rule: string;
}

export interface LayoutPlot {
  id: string;
  kind: 'asset' | 'device';
  code: string;
  name: string;
  type: string;
  status: string;
  x: number;
  y: number;
}

/** A floor's plan from Maps & Floor Plans with its zones and plots. */
export interface FloorLayout {
  planName: string;
  /** Image of the plan when it was uploaded as a picture (PDF / DWG plans have none). */
  imageUrl: string | null;
  widthM: number | null;
  heightM: number | null;
  zones: LayoutZone[];
  plots: LayoutPlot[];
}

/** A registered asset for the Locate Asset search. */
export interface RegisteredAsset {
  /** Mongo id and registration id (plots use the registration id, else the Mongo id). */
  id: string;
  regId: string;
  name: string;
  tag: string;
  category: string;
  type: string;
  status: string;
  site: string;
  building: string;
  floor: string;
  zone: string;
  /** "Site › Building › Floor › Zone" (or what was entered). */
  location: string;
}

@Injectable({ providedIn: 'root' })
export class FloorLayoutApi {
  /** Registered assets, as listed on the Asset list. */
  registeredAssets(): Observable<RegisteredAsset[]> {
    return demo(
      DEMO_ASSETS.map((d) => ({
        id: d.id, regId: d.regId, name: d.name, tag: d.tag, category: d.category, type: d.type, status: d.status,
        site: siteById(d.siteId)?.name ?? '', building: buildingById(d.buildingId)?.name ?? '', floor: floorById(d.floorId)?.name ?? '', zone: d.zone,
        location: assetLocation(d),
      })),
    );
  }

  /** The floor's plan with its zones and plots; null when the floor has no plan. */
  layout(floorId: string): Observable<FloorLayout | null> {
    return demo(FLOOR_LAYOUTS.get(floorId) ?? null);
  }
}
