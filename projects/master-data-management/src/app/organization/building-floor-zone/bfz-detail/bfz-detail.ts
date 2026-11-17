import { Component, EventEmitter, HostListener, Input, OnChanges, Output, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  ArrowRight,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  Hexagon,
  Layers,
  LucideAngularModule,
  MapPin,
  Network,
  Pencil,
  Plus,
  Users
} from 'lucide-angular';
import { formatDateTime } from '../../location/location.format';
import { COUNTRY_FLAGS } from '../bfz.data';
import { BfzRecord } from '../bfz.model';
import { BfzService } from '../bfz.service';
import { BfzPlan } from '../bfz-plan/bfz-plan';

type DetailTab = 'overview' | 'floors' | 'zones' | 'assets' | 'departments' | 'people' | 'documents' | 'map' | 'activity';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Panel under the list showing the selected building, floor or zone in its building's context. */
@Component({
  selector: 'app-bfz-detail',
  imports: [DecimalPipe, LucideAngularModule, BfzPlan],
  templateUrl: './bfz-detail.html',
  styleUrls: ['../../../shared/styles/mdm-detail.css', './bfz-detail.css', '../../../shared/styles/mdm-purple-theme.css']
})
export class BfzDetail implements OnChanges {
  @Input({ required: true }) record!: BfzRecord;
  @Output() edit = new EventEmitter<BfzRecord>();
  @Output() addChild = new EventEmitter<BfzRecord>();
  @Output() toggleStatus = new EventEmitter<BfzRecord>();
  @Output() remove = new EventEmitter<BfzRecord>();
  @Output() select = new EventEmitter<string>();
  @Output() addImage = new EventEmitter<{ building: BfzRecord; image: string }>();
  @Output() imageError = new EventEmitter<string>();

  readonly service = inject(BfzService);
  readonly icons = { Pencil, MapPin, ChevronDown, ChevronRight, Building2, Layers, Hexagon, Boxes, Users, Network, Plus, ArrowRight };
  readonly flags = COUNTRY_FLAGS;
  readonly formatDateTime = formatDateTime;

  tab: DetailTab = 'overview';
  planView: 'map' | 'plan' | '3d' = 'plan';
  moreOpen = false;
  expandedFloors = new Set<string>();

  // Rows for tabs owned by other modules (Assets, People, Documents, audit log); empty until those APIs are wired
  readonly assets: { tag: string; name: string; category: string; status: string }[] = [];
  readonly departments: { name: string; head: string; people: number }[] = [];
  readonly people: { name: string; role: string; department: string }[] = [];
  readonly documents: { name: string; kind: string; size: string; date: string }[] = [];
  readonly activity: { when: string; who: string; text: string }[] = [];

  ngOnChanges(): void {
    this.moreOpen = false;
    // Open the floor holding the selection; for a building, its first two floors as in the design
    const floors = this.floors;
    const focus = this.focusFloor;
    this.expandedFloors = new Set(focus ? [focus] : floors.slice(0, 2).map((f) => f.code));
  }

  get building(): BfzRecord {
    return this.service.buildingOf(this.record) ?? this.record;
  }

  get floors(): BfzRecord[] {
    return this.service.floorsOf(this.building.code);
  }

  get zones(): BfzRecord[] {
    return this.record.type === 'Floor' ? this.service.zonesOfFloor(this.record.code) : this.service.zonesOfBuilding(this.building.code);
  }

  // Floor to show on the plan: the record itself, or the zone's floor
  get focusFloor(): string | null {
    return this.record.type === 'Floor' ? this.record.code : this.record.type === 'Zone' ? this.record.floorCode : null;
  }

  get totalArea(): number | null {
    return this.record.area;
  }

  get images(): string[] {
    return [...(this.building.image ? [this.building.image] : []), ...this.building.images];
  }

  get detailsTitle(): string {
    return `${this.record.type} Details`;
  }

  get childLabel(): string {
    return this.record.type === 'Building' ? 'Add Floor' : 'Add Zone';
  }

  toggleFloor(code: string): void {
    if (this.expandedFloors.has(code)) {
      this.expandedFloors.delete(code);
    } else {
      this.expandedFloors.add(code);
    }
  }

  viewOnMap(): void {
    this.planView = 'map';
    this.tab = 'map';
  }

  onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      this.imageError.emit('Use a PNG or JPG image of 2 MB or less.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.addImage.emit({ building: this.building, image: String(reader.result) });
    reader.readAsDataURL(file);
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.moreOpen = false;
  }
}
