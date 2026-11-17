import { Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ASSET_CATALOG, CatalogAsset, findCatalogAsset } from './asset-catalog';

let nextId = 0;

/**
 * Asset Tag + Asset Name pair for a `.form-grid`. Typing or picking a known tag fills the name and emits
 * `picked` with the catalog record so the form can copy type and location.
 */
@Component({
  selector: 'app-mnt-asset-picker',
  imports: [FormsModule],
  host: { style: 'display: contents' },
  template: `
    <label class="field">
      <span class="field-label">Asset Tag <span class="req">*</span></span>
      <input class="control" [attr.list]="listId" placeholder="e.g. GEN-00045" [ngModel]="assetId()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="onTag($event)" />
      <datalist [id]="listId">
        @for (a of options; track a.tag) { <option [value]="a.tag">{{ a.name }}</option> }
      </datalist>
    </label>
    <label class="field">
      <span class="field-label">Asset Name @if (nameRequired()) { <span class="req">*</span> }</span>
      <input class="control" placeholder="Asset name" [ngModel]="assetName()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="assetName.set($event)" />
    </label>
  `,
  styleUrl: './mnt-base.css'
})
export class AssetPicker {
  readonly assetId = model('');
  readonly assetName = model('');
  readonly nameRequired = input(false);
  readonly picked = output<CatalogAsset>();
  readonly options = ASSET_CATALOG;
  readonly listId = `mnt-assets-${++nextId}`;

  onTag(value: string): void {
    this.assetId.set(value);
    const asset = findCatalogAsset(value);
    if (asset) {
      this.assetName.set(asset.name);
      this.picked.emit(asset);
    }
  }
}
