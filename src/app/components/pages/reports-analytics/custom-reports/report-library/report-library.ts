import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import {
  ArrowRightLeft, ChartColumn, CircleDollarSign, ClipboardCheck, Ellipsis, Factory, FileText, LucideAngularModule,
  Package, Radio, ShieldCheck, SlidersHorizontal, Star, Wrench
} from 'lucide-angular';
import { CustomReport, ReportStatus } from '../custom-reports.model';

export type LibrarySort = 'updated' | 'name' | 'favourites';

const MODULE_ICONS: Record<string, { icon: typeof Star; tone: string }> = {
  'Assets': { icon: ChartColumn, tone: 'purple' },
  'Tracking & IoT': { icon: Radio, tone: 'blue' },
  'Movement & Custody': { icon: ArrowRightLeft, tone: 'blue' },
  'Maintenance': { icon: Wrench, tone: 'blue' },
  'Inspection': { icon: ClipboardCheck, tone: 'green' },
  'Inventory': { icon: Package, tone: 'blue' },
  'WIP / Operations': { icon: Factory, tone: 'green' },
  'Audit & Compliance': { icon: ShieldCheck, tone: 'pink' },
  'Contracts & Warranty': { icon: FileText, tone: 'orange' },
  'Financial': { icon: CircleDollarSign, tone: 'pink' }
};

const STATUS_TONES: Record<ReportStatus, string> = { Draft: 'orange', Published: 'green', Scheduled: 'blue' };

/** Custom Report Library: favourites, row menu and selection of the report shown in the builder. */
@Component({
  selector: 'cr-report-library',
  imports: [LucideAngularModule],
  templateUrl: './report-library.html',
  styleUrls: ['../../shared/analytics-page.css', '../custom-reports.css']
})
export class ReportLibrary {
  @Input({ required: true }) reports: CustomReport[] = [];
  @Input() selectedId = '';
  @Input() sort: LibrarySort = 'updated';
  @Output() sortChange = new EventEmitter<LibrarySort>();
  @Output() open = new EventEmitter<CustomReport>();
  @Output() favourite = new EventEmitter<CustomReport>();
  @Output() duplicate = new EventEmitter<CustomReport>();
  @Output() remove = new EventEmitter<CustomReport>();
  @Output() togglePublish = new EventEmitter<CustomReport>();

  readonly Star = Star;
  readonly Ellipsis = Ellipsis;
  readonly SlidersHorizontal = SlidersHorizontal;
  readonly sorts: { key: LibrarySort; label: string }[] = [
    { key: 'updated', label: 'Recently updated' },
    { key: 'name', label: 'Name (A–Z)' },
    { key: 'favourites', label: 'Favourites first' }
  ];

  menuId: string | null = null;
  sortOpen = false;

  @HostListener('document:click')
  closeMenus(): void {
    this.menuId = null;
    this.sortOpen = false;
  }

  iconOf(r: CustomReport): typeof Star {
    return (MODULE_ICONS[r.module] ?? MODULE_ICONS['Assets']).icon;
  }

  toneOf(r: CustomReport): string {
    return (MODULE_ICONS[r.module] ?? MODULE_ICONS['Assets']).tone;
  }

  statusTone(r: CustomReport): string {
    return STATUS_TONES[r.status];
  }

  updatedText(r: CustomReport): string {
    const d = new Date(`${r.updatedAt}:00Z`);
    if (Number.isNaN(d.getTime())) return r.updatedAt;
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${date}, ${r.updatedAt.slice(11, 16)}`;
  }

  toggleMenu(event: Event, r: CustomReport): void {
    event.stopPropagation();
    this.sortOpen = false;
    this.menuId = this.menuId === r.id ? null : r.id;
  }

  toggleSort(event: Event): void {
    event.stopPropagation();
    this.menuId = null;
    this.sortOpen = !this.sortOpen;
  }

  pickSort(key: LibrarySort): void {
    this.sortChange.emit(key);
    this.sortOpen = false;
  }

  star(event: Event, r: CustomReport): void {
    event.stopPropagation();
    this.favourite.emit(r);
  }

  act(event: Event, kind: 'open' | 'duplicate' | 'remove' | 'publish', r: CustomReport): void {
    event.stopPropagation();
    this.menuId = null;
    if (kind === 'open') this.open.emit(r);
    else if (kind === 'duplicate') this.duplicate.emit(r);
    else if (kind === 'remove') this.remove.emit(r);
    else this.togglePublish.emit(r);
  }
}
