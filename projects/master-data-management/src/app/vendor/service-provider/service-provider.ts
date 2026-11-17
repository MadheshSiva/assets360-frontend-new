import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Ellipsis, LucideAngularModule, Plus, Search, Star, Wrench } from 'lucide-angular';
import { MASTER_DATA_BASE_PATH } from 'shared-ui';
import { badgeInk, badgeText } from '../../asset/manufacturer/manufacturer.data';
import { Observable } from 'rxjs';
import { ListPage } from '../../shared/list-page';
import { apiErrorMessage } from '../../shared/mdm-api';
import { SERVICE_TYPES } from './service-provider.data';
import { ServiceProviderForm } from './service-provider-form/service-provider-form';
import { ServiceProviderFilters, ServiceProviderRecord } from './service-provider.model';
import { ServiceProviderService } from './service-provider.service';

type SortKey = 'name' | 'code' | 'serviceType' | 'country' | 'rating';

/** Master Data Management > Vendor > Service Provider */
@Component({
  selector: 'app-mdm-vendor-service-provider',
  imports: [FormsModule, RouterLink, LucideAngularModule, ServiceProviderForm],
  templateUrl: './service-provider.html',
  styleUrls: ['../../shared/styles/mdm-page.css', '../vendor.css', '../../shared/styles/mdm-purple-theme.css']
})
export class ServiceProviderPage extends ListPage<ServiceProviderRecord, ServiceProviderFilters, SortKey> {
  readonly service = inject(ServiceProviderService);
  readonly basePath = MASTER_DATA_BASE_PATH;
  readonly serviceTypes = SERVICE_TYPES;
  readonly badgeText = badgeText;
  readonly badgeInk = badgeInk;
  readonly icons = { Wrench, Star, Search, Plus, Ellipsis, ArrowUp, ArrowDown, ChevronLeft, ChevronRight };

  saving = false;

  constructor() {
    super({ search: '', serviceType: '', country: '', status: '' });
    this.service.refresh().subscribe({ error: (err) => this.notify(`Couldn't load service providers: ${apiErrorMessage(err)}`) });
  }

  keyOf(r: ServiceProviderRecord): string {
    return r.code;
  }

  nameOf(r: ServiceProviderRecord): string {
    return r.name;
  }

  protected all(): ServiceProviderRecord[] {
    return this.service.all();
  }

  protected matches(r: ServiceProviderRecord, f: ServiceProviderFilters): boolean {
    const term = f.search.trim().toLowerCase();
    return (
      (!f.serviceType || r.serviceType === f.serviceType || r.services.includes(f.serviceType)) &&
      (!f.country || r.country === f.country) &&
      (!f.status || r.status === f.status) &&
      (!term || [r.name, r.code, r.contactPerson, r.serviceType, r.email].some((v) => v.toLowerCase().includes(term)))
    );
  }

  protected sortValue(r: ServiceProviderRecord, key: SortKey): string | number {
    return r[key];
  }

  protected removeRecords(codes: string[]): Observable<unknown> {
    return this.service.delete(codes);
  }

  duplicate(r: ServiceProviderRecord): void {
    this.openAdd({ ...structuredClone(r), code: '', name: `${r.name} (Copy)`, status: 'Active', logo: null });
  }

  onSaved(event: { record: ServiceProviderRecord; originalCode: string | null }): void {
    if (this.saving) return;
    this.saving = true;
    this.service.persist(event.record, event.originalCode).subscribe({
      next: (saved) => {
        this.saving = false;
        this.carrySelection(event.originalCode, saved.code);
        this.notify(`${saved.name} ${event.originalCode ? 'updated' : 'added'}.`);
        this.closeForm();
      },
      error: (err) => {
        this.saving = false;
        this.notify(apiErrorMessage(err));
      }
    });
  }

  toggleStatus(r: ServiceProviderRecord): void {
    this.menuFor = null;
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    this.service.setStatus(r, status).subscribe({
      next: () => this.notify(`${r.name} marked ${status}.`),
      error: (err) => this.notify(apiErrorMessage(err))
    });
  }
}
