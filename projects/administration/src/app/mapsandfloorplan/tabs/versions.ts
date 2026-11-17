import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  CloudUpload,
  Ellipsis,
  Eye,
  FileText,
  Layers,
  LucideAngularModule,
  Maximize2,
  RefreshCw,
  Building2
} from 'lucide-angular';
import { MapCanvas } from '../map-canvas/map-canvas';
import { MapsApiService } from '../maps-api.service';
import { MapVersion, MapStatus, STATUS_TONE, fmtDate, fmtTime } from '../maps.data';
import { MapsStore } from '../maps.store';
import { SiteTree } from '../site-tree/site-tree';
import { UploadDialog } from '../upload-dialog/upload-dialog';
import { MapSettings, cloneSettings, mergeSettings } from './settings';

/**
 * Versions & Publishing: version history of the current plan (GET versions), upload a new version, publish or
 * restore a version, and the publishing options kept in the map settings (approval, download, watermark).
 */
@Component({
  standalone: true,
  selector: 'app-maps-versions',
  imports: [FormsModule, LucideAngularModule, SiteTree, MapCanvas, UploadDialog],
  templateUrl: './versions.html',
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css']
})
export class VersionsTab {
  readonly store = inject(MapsStore);
  private readonly api = inject(MapsApiService);
  readonly icons = {
    Archive, Building2, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock, CloudUpload, Ellipsis, Eye, FileText, Layers, Maximize2, RefreshCw
  };
  readonly pageSizes = [5, 10, 20];

  rightTab: 'details' | 'access' = 'details';
  selectedVersion: string | null = null;
  menuFor: string | null = null;
  headMenuOpen = false;
  uploadOpen = false;
  previewOpen = false;
  page = 0;
  pageSize = 10;

  /**
   * Publishing & access. approval / download / watermark are the map settings' approval / allowDownload / watermark;
   * audience and roles have no API field yet and stay on this page.
   */
  access = { audience: 'All Users', roles: ['Administrator', 'Facility Manager'], download: true, watermark: false, approval: true };
  readonly roles = ['Administrator', 'Facility Manager', 'Technician', 'Security', 'Auditor', 'Viewer'];
  private settings: MapSettings | null = null;

  date = fmtDate;
  time = fmtTime;

  constructor() {
    this.api.getSettings().subscribe({
      next: (dto) => {
        this.settings = mergeSettings(dto);
        this.access = { ...this.access, approval: this.settings.approval, download: this.settings.allowDownload, watermark: this.settings.watermark };
      },
      error: () => undefined
    });
  }

  tone(s: MapStatus) {
    return STATUS_TONE[s];
  }

  /** The chosen version, else the current one, else the newest. */
  get selected(): MapVersion | undefined {
    const list = this.store.versions;
    return list.find((v) => v.version === this.selectedVersion) ?? this.store.currentVersion ?? list[0];
  }

  get emptyText(): string {
    if (this.store.versionsLoading) return 'Loading versions…';
    if (!this.store.currentPlan) return 'No floor plan for this location - upload one first.';
    return 'No versions yet.';
  }

  get paged(): MapVersion[] {
    return this.store.versions.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.store.versions.length / this.pageSize));
  }

  get pages(): number[] {
    return Array.from({ length: this.pageCount }, (_, i) => i);
  }

  toggleMenu(event: MouseEvent, v: string): void {
    event.stopPropagation();
    this.menuFor = this.menuFor === v ? null : v;
  }

  toggleHeadMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.headMenuOpen = !this.headMenuOpen;
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menuFor = null;
    this.headMenuOpen = false;
  }

  publish(v: MapVersion): void {
    if (this.store.working) return;
    const ask = this.access.approval && v.status !== 'Published'
      ? `Publishing needs approval. Publish ${v.version} now as an administrator?`
      : `Publish ${v.version}? The version published now will be archived.`;
    if (!confirm(ask)) return;
    this.store.publishVersion(v.version, () => (this.selectedVersion = v.version));
  }

  /** Copies the version as a new draft (POST versions/{version}/restore). */
  restore(v: MapVersion): void {
    if (this.store.working) return;
    this.store.restoreVersion(v.version, (copy) => (this.selectedVersion = copy.version));
  }

  download(v: MapVersion): void {
    this.store.download(v.fileUrl, v.fileName);
  }

  uploaded(version: string): void {
    this.uploadOpen = false;
    this.selectedVersion = version;
  }

  toggleRole(r: string): void {
    this.access.roles = this.access.roles.includes(r) ? this.access.roles.filter((x) => x !== r) : [...this.access.roles, r];
  }

  /** PUT settings with the publishing options (the rest of the settings is sent back unchanged). */
  saveAccess(): void {
    if (this.store.working) return;
    const next = cloneSettings(this.settings ?? mergeSettings(null));
    next.approval = this.access.approval;
    next.allowDownload = this.access.download;
    next.watermark = this.access.watermark;
    this.store.run(this.api.saveSettings(next), { pending: 'Saving…', success: 'Publishing & access settings saved', error: 'Could not save the publishing settings' }, (dto) => {
      this.settings = dto && typeof dto === 'object' ? mergeSettings(dto) : next;
    });
  }
}
