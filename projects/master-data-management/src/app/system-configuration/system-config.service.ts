import { Injectable } from '@angular/core';
import { Observable, map, of, throwError } from 'rxjs';
import { ApiCodeStore } from '../shared/code-store';
import { MdmAudit } from '../shared/mdm-api';
import { initialSettings } from '../shared/mdm-seed/legacy/system-config.legacy';
import { ChartPreview, ChartTypeRecord, ConfigStatus, SyncStatusRecord, SystemSettings, UpdateSourceRecord } from './system-config.model';

/* System configuration masters and settings, kept in memory (static demo). */

/** `yyyy-mm-ddThh:mm` from an API timestamp, as the pages show it. */
function stampOf(value: string | null | undefined): string {
  return (value ?? '').slice(0, 16);
}

function statusOf(value: string | null): ConfigStatus {
  return value === 'Inactive' ? 'Inactive' : 'Active';
}

/** Code-keyed master with a status PATCH. */
abstract class ConfigStore<T extends { code: string; name: string }, TDto extends MdmAudit> extends ApiCodeStore<T, TDto> {
  setStatus(record: T, status: ConfigStatus): Observable<T> {
    const id = this.idOf(record.code);
    if (!id) return throwError(() => new Error('Record not found.'));
    return this.api.setStatus<TDto>(this.resource, id, status).pipe(
      map((dto) => {
        const saved = this.toRecord(dto);
        this.save(saved, record.code);
        return saved;
      })
    );
  }
}

interface SyncStatusDto extends MdmAudit {
  statusName: string;
  code: string;
  description: string | null;
  color: string | null;
  isSuccess: boolean;
}

@Injectable({ providedIn: 'root' })
export class SyncStatusService extends ConfigStore<SyncStatusRecord, SyncStatusDto> {
  protected readonly resource = 'api-sync-statuses';

  constructor() {
    super();
  }

  protected toRecord(dto: SyncStatusDto): SyncStatusRecord {
    return {
      code: dto.code,
      name: dto.statusName,
      description: dto.description ?? '',
      // The API stores colours in upper case; the swatches are lower case
      color: (dto.color ?? '').toLowerCase(),
      isSuccess: dto.isSuccess,
      status: statusOf(dto.status),
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: SyncStatusRecord): object {
    return { statusName: r.name, code: r.code, description: r.description, color: r.color, isSuccess: r.isSuccess, status: r.status };
  }
}

interface ChartTypeDto extends MdmAudit {
  chartTypeName: string;
  code: string;
  category: string;
  description: string | null;
  iconUrl: string | null;
  previewType: string | null;
}

@Injectable({ providedIn: 'root' })
export class ChartTypeService extends ConfigStore<ChartTypeRecord, ChartTypeDto> {
  protected readonly resource = 'chart-types';

  constructor() {
    super();
  }

  protected toRecord(dto: ChartTypeDto): ChartTypeRecord {
    return {
      code: dto.code,
      name: dto.chartTypeName,
      category: dto.category,
      description: dto.description ?? '',
      preview: (dto.previewType as ChartPreview) || 'column',
      image: dto.iconUrl,
      status: statusOf(dto.status),
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: ChartTypeRecord): object {
    return { chartTypeName: r.name, code: r.code, category: r.category, description: r.description, iconUrl: r.image, previewType: r.preview, status: r.status };
  }
}

interface UpdateSourceDto extends MdmAudit {
  sourceName: string;
  code: string;
  type: string;
  description: string | null;
}

@Injectable({ providedIn: 'root' })
export class UpdateSourceService extends ConfigStore<UpdateSourceRecord, UpdateSourceDto> {
  protected readonly resource = 'update-sources';

  constructor() {
    super();
  }

  protected toRecord(dto: UpdateSourceDto): UpdateSourceRecord {
    return {
      code: dto.code,
      name: dto.sourceName,
      type: dto.type,
      description: dto.description ?? '',
      status: statusOf(dto.status),
      createdOn: stampOf(dto.createdAt),
      updatedOn: stampOf(dto.updatedAt)
    };
  }

  protected toRequest(r: UpdateSourceRecord): object {
    return { sourceName: r.name, code: r.code, type: r.type, description: r.description, status: r.status };
  }
}

/** One settings document per client, read and saved whole. STATIC DEMO: kept in memory for the session. */
@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  private settings: SystemSettings = initialSettings();
  private savedOn = '2026-10-15T14:45';

  /** A copy to edit; nothing changes until `save`. */
  draft(): SystemSettings {
    return structuredClone(this.settings);
  }

  current(): SystemSettings {
    return this.settings;
  }

  lastSaved(): string {
    return this.savedOn;
  }

  load(): Observable<SystemSettings> {
    return of(this.settings);
  }

  save(settings: SystemSettings): Observable<SystemSettings> {
    this.settings = structuredClone(settings);
    const now = new Date();
    this.savedOn = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return of(this.settings);
  }

  /** Default code references, so the referenced master can't be deleted. */
  isDefault(kind: 'updateSource' | 'chartType', code: string): boolean {
    return this.settings.defaults[kind] === code;
  }

  usesSyncStatus(code: string): boolean {
    return this.settings.integration.failedSyncStatus === code;
  }

  usesSource(code: string): boolean {
    return this.settings.defaults.updateSource === code || this.settings.integration.sources.includes(code);
  }
}
