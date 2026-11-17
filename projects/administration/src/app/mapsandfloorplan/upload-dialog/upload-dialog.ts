import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CloudUpload, LucideAngularModule } from 'lucide-angular';
import { formatFromFileName } from '../maps-api.service';
import { FILE_FORMATS, FileFormat, FloorPlanType } from '../maps.data';
import { MapsStore } from '../maps.store';

/** Largest file accepted (the Settings tab default). */
const MAX_FILE_MB = 50;

/**
 * Upload a floor plan for the selected location, or a new version of the current plan. The file goes to the
 * Media service first (POST api/media/upload); its URL, name, size and format are then saved with the plan / version.
 */
@Component({
  standalone: true,
  selector: 'app-upload-dialog',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="close()">
      <form class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title" (click)="$event.stopPropagation()" (ngSubmit)="submit()">
        <h2>{{ title }}</h2>
        <div class="rform">
          @if (mode === 'plan') {
            <div class="field" [class.invalid]="tried && !store.selectedFloorId">
              <label for="up-loc">Location <span class="req">*</span></label>
              <select id="up-loc" name="loc" [ngModel]="store.selectedFloorId" (ngModelChange)="store.selectFloor($event)" [disabled]="store.working">
                <option value="" disabled>Select Location</option>
                @for (f of store.floors; track f.id) { <option [value]="f.id">{{ f.label }}</option> }
              </select>
              @if (!store.floors.length) { <small>No locations yet — add sites, buildings and floors in Master Data Management.</small> }
            </div>
          } @else {
            <div class="field">
              <label for="up-plan">Floor Plan</label>
              <input id="up-plan" name="plan" [value]="store.currentPlan ? store.currentPlan.name + ' (current ' + store.currentPlan.version + ')' : 'No floor plan selected'" readonly />
            </div>
          }
          <label class="dropzone" for="up-file" [class.invalid]="tried && !!fileError">
            <lucide-icon [img]="icons.CloudUpload" [size]="28"></lucide-icon>
            <b>{{ file?.name || 'Click to choose a file' }}</b>
            <span>{{ file ? sizeLabel : 'PNG, JPG, PDF, SVG, DWG or DXF, up to ' + maxMb + ' MB' }}</span>
            <input id="up-file" type="file" hidden accept=".png,.jpg,.jpeg,.pdf,.svg,.dwg,.dxf" [disabled]="store.working" (change)="pick($event)" />
          </label>
          @if (tried && fileError) { <small class="err">{{ fileError }}</small> }
          @if (mode === 'plan') {
            <div class="field" [class.invalid]="tried && !name.trim()">
              <label for="up-name">Floor Plan Name <span class="req">*</span></label>
              <input id="up-name" name="name" [(ngModel)]="name" [disabled]="store.working" />
              @if (tried && !name.trim()) { <small>Name is required</small> }
            </div>
            <div class="field">
              <label for="up-desc">Description</label>
              <input id="up-desc" name="desc" [(ngModel)]="description" [disabled]="store.working" />
            </div>
            <div class="field" [class.invalid]="tried && !type">
              <label for="up-type">Type <span class="req">*</span></label>
              <select id="up-type" name="type" [(ngModel)]="type" [disabled]="store.working">
                <option value="" disabled>Select Type</option>
                <option value="Floor Plan">Floor Plan</option>
                <option value="Site Map">Site Map</option>
              </select>
              @if (tried && !type) { <small>Type is required</small> }
            </div>
          } @else {
            <div class="field" [class.invalid]="tried && !bump">
              <label for="up-bump">Version Change <span class="req">*</span></label>
              <select id="up-bump" name="bump" [(ngModel)]="bump" [disabled]="store.working">
                <option value="" disabled>Select Version Change</option>
                <option value="minor">Minor (e.g. v2.0 → v2.1)</option>
                <option value="major">Major (e.g. v2.1 → v3.0)</option>
              </select>
              @if (tried && !bump) { <small>Version change is required</small> }
            </div>
            <div class="field">
              <label for="up-desc">Changes / Description</label>
              <textarea id="up-desc" name="desc" rows="3" [(ngModel)]="description" [disabled]="store.working" placeholder="What changed in this version? One change per line."></textarea>
            </div>
          }
          <div class="field">
            <label for="up-format">Format</label>
            <select id="up-format" name="format" [(ngModel)]="format" disabled>
              <option value="" disabled>Select Format</option>
              @for (f of formats; track f) { <option [value]="f">{{ f }}</option> }
            </select>
          </div>
        </div>
        <div class="rfoot">
          <button type="button" class="btn" [disabled]="store.working" (click)="close()">Cancel</button>
          <button type="submit" class="btn btn--primary" [disabled]="store.working || (mode === 'version' && !store.currentPlan)">
            {{ store.working ? 'Uploading…' : 'Upload' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrls: ['../../shared/admin-workspace.css', '../maps.css'],
  styles: `.dropzone.invalid { border-color: #ef4444; } .err { color: #b91c1c; font-size: 12px; margin-top: -6px; }`
})
export class UploadDialog {
  readonly store = inject(MapsStore);
  readonly icons = { CloudUpload };
  readonly formats = FILE_FORMATS;
  readonly maxMb = MAX_FILE_MB;

  /** 'plan' adds a floor plan; 'version' uploads a new version of the current one. */
  @Input() mode: 'plan' | 'version' = 'plan';
  /** Emits the new plan's name, or the new version (e.g. "v2.2"). */
  @Output() done = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  file: File | null = null;
  name = '';
  description = '';
  type: FloorPlanType = '' as FloorPlanType;
  format: FileFormat = 'PNG';
  bump: 'minor' | 'major' = '' as 'minor' | 'major';
  tried = false;

  get title(): string {
    return this.mode === 'plan' ? 'Upload Floor Plan' : 'Upload New Version';
  }

  get sizeLabel(): string {
    const mb = (this.file?.size ?? 0) / (1024 * 1024);
    return `${this.format} · ${mb < 0.1 ? '< 0.1' : mb.toFixed(1)} MB`;
  }

  get fileError(): string | null {
    if (!this.file) return 'Choose a file to upload';
    if (!formatFromFileName(this.file.name)) return 'Unsupported file type - use PNG, JPG, PDF, SVG, DWG or DXF';
    if (this.file.size > MAX_FILE_MB * 1024 * 1024) return `The file is larger than ${MAX_FILE_MB} MB`;
    return null;
  }

  pick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.file = file;
    const format = formatFromFileName(file.name);
    if (format) this.format = format;
    if (!this.name) this.name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  }

  close(): void {
    if (!this.store.working) this.cancel.emit();
  }

  submit(): void {
    this.tried = true;
    if (this.store.working || this.fileError || !this.file) return;
    if (this.mode === 'plan') {
      if (!this.name.trim() || !this.store.selectedFloorId || !this.type) return;
      this.store.addPlan(
        this.file,
        { name: this.name.trim(), description: this.description.trim(), type: this.type, format: this.format },
        (plan) => this.done.emit(plan.name)
      );
    } else {
      if (!this.bump) return;
      this.store.addVersion(this.file, { format: this.format, bump: this.bump, description: this.description }, (v) => this.done.emit(v.version));
    }
  }
}
