import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  Building,
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  LucideAngularModule,
  LucideIconData,
  Map as MapIcon,
  MapPin,
  Pencil
} from 'lucide-angular';
import { formatArea, formatDateTime } from '../location.format';
import { LocationRecord } from '../location.model';
import { LocationService } from '../location.service';
import { LocationMap } from '../location-map/location-map';
import { iconForType } from '../location.icons';

interface LocationAsset {
  tag: string;
  name: string;
  category: string;
  condition: string;
  status: string;
}

interface LocationPerson {
  name: string;
  role: string;
  shift: string;
  phone: string;
}

interface LocationDocument {
  name: string;
  kind: string;
  size: string;
  uploadedOn: string;
  uploadedBy: string;
}

interface LocationActivity {
  when: string;
  who: string;
  text: string;
}

type DetailTab = 'overview' | 'assets' | 'people' | 'equipment' | 'documents' | 'map' | 'children' | 'settings' | 'activity';

interface TreeNode {
  key: string;
  label: string;
  code: string;
  kind: string;
  icon: LucideIconData;
  children: TreeNode[];
  // Code of the location this node opens, if it is a location
  locationCode: string | null;
  current: boolean;
  more?: number;
}

// Locations listed per zone in the hierarchy before "+ N more"
const ZONE_PREVIEW = 6;

/** Panel under the list showing everything about the selected location. */
@Component({
  selector: 'app-location-detail',
  imports: [LucideAngularModule, LocationMap, NgTemplateOutlet],
  templateUrl: './location-detail.html',
  styleUrls: ['../../../shared/styles/mdm-detail.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class LocationDetail implements OnChanges {
  @Input({ required: true }) location!: LocationRecord;
  @Output() edit = new EventEmitter<LocationRecord>();
  @Output() remove = new EventEmitter<LocationRecord>();
  @Output() duplicate = new EventEmitter<LocationRecord>();
  @Output() toggleStatus = new EventEmitter<LocationRecord>();
  @Output() select = new EventEmitter<string>();

  readonly service = inject(LocationService);
  readonly icons = { Pencil, MapIcon, MapPin, ChevronDown, ChevronRight, Building2 };
  readonly formatDateTime = formatDateTime;
  readonly formatArea = formatArea;
  readonly iconForType = iconForType;
  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'assets', label: 'Assets' },
    { id: 'people', label: 'People' },
    { id: 'equipment', label: 'Equipment' },
    { id: 'documents', label: 'Documents' },
    { id: 'map', label: 'Map & Layout' },
    { id: 'children', label: 'Child Locations' },
    { id: 'settings', label: 'Settings' },
    { id: 'activity', label: 'Activity Log' }
  ];

  tab: DetailTab = 'overview';
  moreOpen = false;
  tree: TreeNode | null = null;
  expanded = new Set<string>();

  // Rows for tabs owned by other modules (Assets, People, Documents, audit log); empty until those APIs are wired
  readonly assets: LocationAsset[] = [];
  readonly people: LocationPerson[] = [];
  readonly documents: LocationDocument[] = [];
  readonly activity: LocationActivity[] = [];

  ngOnChanges(): void {
    this.moreOpen = false;
    this.buildTree();
  }

  get children(): LocationRecord[] {
    return this.service.children(this.location.code);
  }

  get equipment(): LocationRecord[] {
    return this.children.filter((c) => c.type === 'Equipment');
  }

  get parent(): LocationRecord | undefined {
    return this.service.find(this.location.parentCode);
  }

  get pathParts(): string[] {
    const r = this.location;
    return [
      `${this.service.siteName(r.siteId)} (${r.buildingCode})`,
      `${this.service.floorName(r.floorCode)} (${r.floorCode})`,
      ...(r.zoneCode ? [`${this.service.zoneName(r)} (${r.zoneCode})`] : [])
    ];
  }

  viewOnMap(): void {
    this.tab = 'map';
  }

  toggleNode(node: TreeNode): void {
    if (this.expanded.has(node.key)) {
      this.expanded.delete(node.key);
    } else {
      this.expanded.add(node.key);
    }
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }

  /**
   * Site > Building > Floors > Zones > Locations, opened along the path to the selected
   * location; its own children are listed under it.
   */
  private buildTree(): void {
    const r = this.location;
    const building = this.service.findBuilding(r.buildingCode);
    if (!building) {
      this.tree = null;
      return;
    }

    // Ancestors from the top-level location down to the selected one
    const chain: LocationRecord[] = [r];
    for (let p = this.service.find(r.parentCode); p && chain.length < 10; p = this.service.find(p.parentCode)) {
      chain.unshift(p);
    }
    const top = chain[0];
    const onChain = new Set(chain.map((c) => c.code));

    const locationNode = (loc: LocationRecord): TreeNode => {
      const childRecords = onChain.has(loc.code) ? this.service.children(loc.code) : [];
      return {
        key: `loc:${loc.code}`,
        label: loc.name,
        code: loc.code,
        kind: loc.type,
        icon: iconForType(loc.type),
        children: childRecords.map(locationNode),
        locationCode: loc.code,
        current: loc.code === r.code
      };
    };

    const floors = this.service.floors(building.code).map((floor): TreeNode => {
      const zones = this.service.zonesOnFloor(building.code, floor.code).map((zone): TreeNode => {
        const inZone = this.service.inZone(building.code, floor.code, zone.code);
        let shown = inZone.slice(0, ZONE_PREVIEW);
        if (inZone.includes(top) && !shown.includes(top)) shown = [top, ...shown.slice(0, ZONE_PREVIEW - 1)];
        return {
          key: `zone:${building.code}:${floor.code}:${zone.code}`,
          label: zone.name,
          code: zone.code,
          kind: 'Zone',
          icon: Layers,
          children: shown.map(locationNode),
          locationCode: null,
          current: false,
          more: inZone.length - shown.length
        };
      });
      return {
        key: `floor:${building.code}:${floor.code}`,
        label: floor.name,
        code: floor.code,
        kind: 'Floor',
        icon: Layers,
        children: zones,
        locationCode: null,
        current: false
      };
    });

    this.tree = {
      key: `site:${r.siteId}`,
      label: this.service.siteName(r.siteId),
      code: '',
      kind: 'Site',
      icon: Building,
      locationCode: null,
      current: false,
      children: [
        {
          key: `building:${building.code}`,
          label: building.name,
          code: building.code,
          kind: 'Building',
          icon: Building2,
          children: floors,
          locationCode: null,
          current: false
        }
      ]
    };

    // Open the path to the selected location
    this.expanded = new Set([
      this.tree.key,
      `building:${building.code}`,
      `floor:${building.code}:${top.floorCode}`,
      `zone:${building.code}:${top.floorCode}:${top.zoneCode}`,
      ...chain.map((c) => `loc:${c.code}`)
    ]);
  }
}
