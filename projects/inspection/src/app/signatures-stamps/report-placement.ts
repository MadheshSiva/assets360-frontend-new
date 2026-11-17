import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Eye, X } from 'lucide-angular';
import { SignatureAndStamp } from '../shared/inspection.models';
import { fmtDate } from '../shared/insp-utils';
import { StampSeal } from './stamp-seal';

export const POSITIONS = ['Footer – left', 'Footer – center', 'Footer – right'];

/** Where the signature and stamp land on generated reports; edits the selected signature record. */
@Component({
  selector: 'app-insp-report-placement',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, StampSeal],
  template: `
    <div class="card wrap">
      <h2>Report Placement</h2>
      <div class="thumb" aria-hidden="true">
        <i></i><i></i><i class="s"></i><i></i>
        <div class="foot">
          @for (p of positions; track p) {
            <span>
              @if (record().signaturePosition === p) { <em class="sig">{{ initialsOf() }}</em> }
              @if (stamp() && record().stampPosition === p) { <b class="dot"></b> }
            </span>
          }
        </div>
      </div>
      <label class="field"><span class="field-label">Signature position</span>
        <select class="control" [(ngModel)]="record().signaturePosition" (ngModelChange)="changed.emit()">
          <option value="" disabled>Select Signature Position</option>
          @for (p of positionsFor(record().signaturePosition); track p) { <option [value]="p">{{ p }}</option> }
        </select></label>
      <label class="field"><span class="field-label">Stamp position</span>
        <select class="control" [(ngModel)]="record().stampPosition" (ngModelChange)="changed.emit()">
          <option value="" disabled>Select Stamp Position</option>
          @for (p of positionsFor(record().stampPosition); track p) { <option [value]="p">{{ p }}</option> }
        </select></label>
      <div class="field"><span class="field-label">Include signer name &amp; date</span>
        <span class="tg"><label class="toggle"><input type="checkbox" [(ngModel)]="record().includeSignerNameDate" (ngModelChange)="changed.emit()" /><span></span></label>
          {{ record().includeSignerNameDate ? 'On' : 'Off' }}</span></div>
      <button type="button" class="btn btn-accent-outline" (click)="open = true"><lucide-icon [img]="icons.Eye" [size]="16"></lucide-icon>Preview Report</button>
    </div>

    @if (open) {
      <div class="backdrop" (click)="open = false"></div>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Report preview">
        <div class="drawer-head"><h2 class="grow">Report Preview</h2>
          <button type="button" class="icon-btn" aria-label="Close" (click)="open = false"><lucide-icon [img]="icons.X" [size]="18"></lucide-icon></button></div>
        <div class="page">
          <div class="ph"><b>Inspection Report</b><span class="muted">Page 3 of 3</span></div>
          <i></i><i></i><i class="s"></i><i></i><i class="s"></i>
          <div class="pfoot">
            @for (p of positions; track p) {
              <div class="slot">
                @if (record().signaturePosition === p) {
                  @if (record().signatureImage) { <img [src]="record().signatureImage" alt="Signature" /> }
                  @else { <span class="cursive">{{ record().signatureName || record().user }}</span> }
                  @if (record().includeSignerNameDate) {
                    <small>{{ record().user || record().signatureName }} · {{ record().authorizedRole }}<br />{{ today }}</small>
                  }
                }
                @if (stamp(); as st) {
                  @if (record().stampPosition === p) { <app-insp-stamp-seal [name]="st.signatureName" [image]="st.stampImage" [caption]="st.department" [size]="78" /> }
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['../shared/insp-page.css'],
  styles: [
    `.wrap { display: grid; grid-template-columns: auto 90px repeat(3, minmax(0, 1fr)) auto; align-items: end; gap: 12px 18px; padding: 14px 18px; }
     .wrap h2 { margin: 0; font-size: 18px; font-weight: 800; align-self: center; }
     .thumb, .page { display: flex; flex-direction: column; gap: 5px; padding: 8px; border: 1px solid var(--ip-border); border-radius: 6px; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.06); }
     .thumb i, .page > i { display: block; height: 4px; border-radius: 2px; background: #dedbe8; }
     .thumb i.s, .page > i.s { width: 60%; }
     .foot, .pfoot { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 4px; min-height: 18px; }
     .foot span { display: flex; align-items: center; justify-content: center; gap: 2px; }
     .sig { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 11px; color: #1b1640; }
     .dot { width: 14px; height: 14px; border: 2px solid #3b2ea8; border-radius: 50%; }
     .tg { display: inline-flex; align-items: center; gap: 10px; height: 38px; font-size: 13.5px; }
     .modal { position: fixed; z-index: 901; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(640px, calc(100vw - 32px)); background: #fff; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.2); }
     .page { margin: 18px 20px 22px; padding: 18px; gap: 10px; }
     .page > i { height: 7px; }
     .ph { display: flex; justify-content: space-between; margin-bottom: 6px; }
     .pfoot { margin-top: 26px; padding-top: 12px; border-top: 1px solid var(--ip-border); min-height: 100px; gap: 10px; }
     .slot { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; text-align: center; }
     .slot img { max-width: 140px; max-height: 54px; object-fit: contain; }
     .slot small { font-size: 11px; color: var(--ip-muted); }
     .cursive { font-family: 'Brush Script MT', 'Segoe Script', cursive; font-size: 26px; color: #1b1640; }
     @media (max-width: 1100px) { .wrap { grid-template-columns: repeat(2, minmax(0, 1fr)); } .thumb { display: none; } }
     @media (max-width: 600px) { .wrap { grid-template-columns: minmax(0, 1fr); } }`
  ]
})
export class ReportPlacement {
  readonly icons = { Eye, X };
  readonly record = input.required<SignatureAndStamp>();
  readonly stamp = input<SignatureAndStamp | undefined>();
  readonly changed = output<void>();
  readonly positions = POSITIONS;
  readonly today = fmtDate(new Date().toISOString());
  open = false;

  /** Keeps a stored value that is not in the list selectable. */
  positionsFor(current: string): string[] {
    return current && !POSITIONS.includes(current) ? [current, ...POSITIONS] : POSITIONS;
  }

  initialsOf(): string {
    return (this.record().signatureName || this.record().user || 'Sig').split(/\s+/)[0]!.slice(0, 6);
  }
}
