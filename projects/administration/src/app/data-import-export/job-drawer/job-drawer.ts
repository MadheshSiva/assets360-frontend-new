import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Calendar, FileSpreadsheet, LucideAngularModule, Lock, Paperclip, X } from 'lucide-angular';
import { CURRENT_USER } from '../../shared/admin-common';
import { DataJob } from '../data-import.model';
import { DATA_OBJECT_NAMES, DATE_FORMATS, DELIMITERS, DUPLICATE_OPTIONS, ENCODINGS } from '../data-import.data';
import { DataJobService, nowStamp } from '../data-import.service';
import { formatStamp } from '../data-import.util';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type ScheduleChoice = 'manual' | 'once' | 'Daily' | 'Weekly' | 'Monthly';

/** Right-hand "Import Settings" drawer: create or edit a data job. */
@Component({
  selector: 'app-adm-job-drawer',
  imports: [FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './job-drawer.html',
  styleUrls: ['../../shared/admin-workspace.css', '../data-import-export.css']
})
export class JobDrawer implements OnChanges {
  @Input({ required: true }) job!: DataJob;
  @Input() organization = '';
  @Output() saved = new EventEmitter<DataJob>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  private readonly service = inject(DataJobService);
  readonly icons = { X, FileSpreadsheet, Paperclip, Calendar, Lock };
  readonly objects = DATA_OBJECT_NAMES;
  readonly duplicateOptions = DUPLICATE_OPTIONS;
  readonly dateFormats = DATE_FORMATS;
  readonly delimiters = DELIMITERS;
  readonly encodings = ENCODINGS;
  readonly formatStamp = formatStamp;

  recipientInput = '';
  recipientError = '';
  errors: Record<string, string> = {};

  ngOnChanges(): void {
    this.errors = {};
    this.recipientInput = '';
    this.recipientError = '';
  }

  get isImport(): boolean {
    return this.job.type === 'Import';
  }

  get isNew(): boolean {
    return !this.job.id;
  }

  get title(): string {
    if (this.isNew) return this.isImport ? 'New Import' : 'New Export';
    return this.isImport ? 'Import Settings' : 'Export Settings';
  }

  focusName(): void {
    this.nameInput?.nativeElement.focus();
  }

  // ----- Schedule (the drawer collapses mode + frequency into one select) -----
  get scheduleChoice(): ScheduleChoice {
    return this.job.schedule.mode === 'recurring' ? this.job.schedule.frequency : this.job.schedule.mode;
  }

  set scheduleChoice(v: ScheduleChoice) {
    const s = this.job.schedule;
    if (v === 'manual' || v === 'once') {
      s.mode = v;
      if (v === 'once' && !s.date) s.date = this.tomorrow();
    } else {
      s.mode = 'recurring';
      s.frequency = v;
    }
  }

  private tomorrow(): string {
    return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  }

  // ----- Source file -----
  onFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext !== 'xlsx' && ext !== 'csv') {
      this.errors['file'] = 'Only .xlsx or .csv files are supported.';
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      this.errors['file'] = 'File is larger than 50 MB.';
      return;
    }
    delete this.errors['file'];
    this.job.fileName = file.name;
    this.job.fileFormat = ext === 'csv' ? 'CSV' : 'XLSX';
    const mb = file.size / (1024 * 1024);
    this.job.fileSize = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    this.job.uploadedBy = CURRENT_USER.name;
    this.job.uploadedOn = nowStamp();
  }

  clearFile(): void {
    this.job.fileName = '';
    this.job.fileSize = '';
    this.job.uploadedBy = '';
    this.job.uploadedOn = '';
  }

  // ----- Notification recipients -----
  onRecipientKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addRecipient();
    } else if (event.key === 'Backspace' && !this.recipientInput && this.job.recipients.length) {
      this.job.recipients.pop();
    }
  }

  addRecipient(): void {
    const email = this.recipientInput.trim().replace(/,$/, '');
    if (!email) return;
    if (!EMAIL.test(email)) {
      this.recipientError = `"${email}" is not a valid email address.`;
      return;
    }
    if (this.job.recipients.some((r) => r.toLowerCase() === email.toLowerCase())) {
      this.recipientError = `${email} is already added.`;
      return;
    }
    this.job.recipients.push(email);
    this.recipientInput = '';
    this.recipientError = '';
  }

  removeRecipient(email: string): void {
    this.job.recipients = this.job.recipients.filter((r) => r !== email);
  }

  // ----- Save -----
  private validate(): boolean {
    const e: Record<string, string> = {};
    const name = this.job.name.trim();
    if (!name) e['name'] = 'Job name is required.';
    else if (name.length > 80) e['name'] = 'Keep the name under 80 characters.';
    else if (this.service.isNameTaken(name, this.job.id)) e['name'] = 'Another job already uses this name.';
    if (!this.job.dataObject) e['object'] = 'Choose a data object.';
    if (this.isImport && !this.job.operation) e['operation'] = 'Choose an operation.';
    if (this.isImport && !this.job.fileName) e['file'] = 'Attach an .xlsx or .csv file.';
    if (!this.job.fileFormat) e['format'] = this.isImport ? 'Choose a file format.' : 'Choose an export format.';
    if (this.isImport && !this.job.duplicateHandling) e['duplicate'] = 'Choose how duplicates are handled.';
    if (!this.job.dateFormat) e['dateFormat'] = 'Choose a date format.';
    if (!this.job.delimiter) e['delimiter'] = 'Choose a delimiter.';
    if (!this.job.encoding) e['encoding'] = 'Choose an encoding.';
    const batch = Number(this.job.batchSize);
    if (!Number.isInteger(batch) || batch < 1 || batch > 50000) e['batch'] = 'Batch size must be 1 – 50,000.';
    if (this.job.schedule.mode === 'once' && !this.job.schedule.date) e['schedule'] = 'Pick a run date on the Schedule tab.';
    if (this.recipientInput.trim()) e['recipients'] = 'Press Enter to add the email, or clear it.';
    this.errors = e;
    return Object.keys(e).length === 0;
  }

  save(): void {
    if (!this.validate()) return;
    this.job.batchSize = Number(this.job.batchSize);
    this.saved.emit(this.job);
  }
}
