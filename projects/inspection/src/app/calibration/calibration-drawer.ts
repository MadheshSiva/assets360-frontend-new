import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { InspectionApi, apiErrorMessage } from '../shared/inspection-api';
import { CalibrationInstrument, CalibrationPoint } from '../shared/inspection.models';
import { isoDay } from '../shared/insp-utils';
import { addMonths, calibrationStatus, toleranceFor } from './calibration-utils';

export type DrawerMode = 'instrument' | 'result';

interface PointRow {
  reference: number | null;
  asFound: number | null;
  asLeft: number | null;
  result: string;
}

/** Side drawer: register / edit an instrument, or record a calibration result against one. */
@Component({
  selector: 'app-insp-calibration-drawer',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './calibration-drawer.html',
  styleUrls: ['../shared/insp-page.css', './calibration-drawer.css']
})
export class CalibrationDrawer implements OnInit {
  readonly api = inject(InspectionApi);
  readonly mode = input<DrawerMode>('instrument');
  readonly instrument = input<CalibrationInstrument | null>(null);
  readonly people = input<string[]>([]);
  readonly saved = output<{ instrument: CalibrationInstrument; message: string }>();
  readonly closed = output<void>();

  readonly icons = { Plus, Trash2, X };
  readonly today = isoDay(new Date());
  readonly current = signal<DrawerMode>('instrument');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  form: Partial<CalibrationInstrument> = {};
  result = { instrumentId: '', date: '', performedBy: '', certificate: '', referenceStandard: '', referenceCertificate: '', validAtCalibration: true };
  points: PointRow[] = [];

  ngOnInit(): void {
    this.current.set(this.mode());
    const i = this.instrument();
    this.form = i
      ? { ...i, lastCalibration: i.lastCalibration?.slice(0, 10) ?? null, nextDue: i.nextDue?.slice(0, 10) ?? null }
      : {
          instrumentCode: '',
          instrumentName: '',
          serialNumber: '',
          location: '',
          range: '',
          unit: '',
          tolerance: '',
          intervalMonths: 12,
          provider: '',
          providerType: '',
          assignedTo: '',
          lastCalibration: null,
          nextDue: null,
          certificate: '',
          lastResult: '',
          results: [],
          referenceStandard: '',
          referenceCertificate: '',
          validAtCalibration: true,
          history: []
        };
    this.pickInstrument(i?.id ?? '');
  }

  setMode(m: DrawerMode): void {
    this.current.set(m);
    this.error.set(null);
  }

  /** Seeds the result form from the chosen instrument: its traceability and last reference points. */
  pickInstrument(id: string): void {
    const inst = this.api.instruments.byId(id);
    this.result = {
      instrumentId: id,
      date: this.today,
      performedBy: inst?.assignedTo ?? '',
      certificate: '',
      referenceStandard: inst?.referenceStandard ?? '',
      referenceCertificate: inst?.referenceCertificate ?? '',
      validAtCalibration: true
    };
    const refs = (inst?.results ?? []).map((r) => r.reference);
    this.points = (refs.length ? refs : [null]).map((reference) => ({ reference, asFound: null, asLeft: null, result: '' }));
  }

  selectedInstrument(): CalibrationInstrument | undefined {
    return this.api.instruments.byId(this.result.instrumentId);
  }

  addPoint(): void {
    this.points = [...this.points, { reference: null, asFound: null, asLeft: null, result: '' }];
  }

  removePoint(index: number): void {
    this.points = this.points.filter((_, k) => k !== index);
  }

  /** Pass / Fail from the instrument tolerance when it can be parsed; otherwise the user picks it. */
  autoResult(p: PointRow): void {
    const inst = this.selectedInstrument();
    if (!inst || p.reference === null || p.asLeft === null) return;
    const tol = toleranceFor(inst.tolerance, Number(p.reference));
    if (tol === null) return;
    const ok = [p.asLeft, p.asFound].every((v) => v === null || Math.abs(Number(v) - Number(p.reference)) <= tol + 1e-9);
    p.result = ok ? 'Pass' : 'Fail';
  }

  canAuto(): boolean {
    const inst = this.selectedInstrument();
    return !!inst && toleranceFor(inst.tolerance, 1) !== null;
  }

  save(): void {
    if (this.current() === 'instrument') this.saveInstrument();
    else this.saveResult();
  }

  private saveInstrument(): void {
    const f = this.form;
    if (!f.instrumentCode?.trim()) return this.error.set('Instrument ID is required.');
    if (!f.instrumentName?.trim()) return this.error.set('Instrument name is required.');
    const code = f.instrumentCode.trim();
    if (this.api.instruments.items().some((i) => i.instrumentCode.toLowerCase() === code.toLowerCase() && i.id !== f.id)) {
      return this.error.set(`Instrument ID ${code} is already used.`);
    }
    const record: Partial<CalibrationInstrument> = {
      ...f,
      instrumentCode: code,
      instrumentName: f.instrumentName.trim(),
      intervalMonths: Math.max(1, Number(f.intervalMonths) || 12),
      lastCalibration: f.lastCalibration || null,
      nextDue: f.nextDue || (f.lastCalibration ? addMonths(f.lastCalibration, Math.max(1, Number(f.intervalMonths) || 12)) : null)
    };
    record.status = calibrationStatus({ status: f.id ? f.status ?? null : null, lastResult: record.lastResult ?? '', nextDue: record.nextDue ?? null }, this.today);
    this.persist(record, f.id ? 'Instrument updated.' : 'Instrument registered.');
  }

  private saveResult(): void {
    const inst = this.selectedInstrument();
    if (!inst) return this.error.set('Select an instrument.');
    const rows = this.points.filter((p) => p.reference !== null && p.reference !== undefined);
    if (!rows.length) return this.error.set('Add at least one measurement point with a reference value.');
    if (rows.some((p) => !p.result)) return this.error.set('Set a result (Pass / Fail) for every point.');
    const date = this.result.date || this.today;
    const results: CalibrationPoint[] = rows.map((p) => ({
      reference: Number(p.reference),
      asFound: Number(p.asFound ?? 0),
      asLeft: Number(p.asLeft ?? p.asFound ?? 0),
      result: p.result
    }));
    const lastResult = results.every((r) => r.result === 'Pass') ? 'Pass' : 'Fail';
    const certificate = this.result.certificate.trim() || inst.certificate;
    const nextDue = addMonths(date, inst.intervalMonths || 12);
    const record: CalibrationInstrument = {
      ...inst,
      results,
      lastCalibration: date,
      nextDue,
      lastResult,
      certificate,
      referenceStandard: this.result.referenceStandard,
      referenceCertificate: this.result.referenceCertificate,
      validAtCalibration: this.result.validAtCalibration,
      status: calibrationStatus({ status: null, lastResult, nextDue }, this.today),
      history: [...(inst.history ?? []), { date, result: lastResult, certificate, performedBy: this.result.performedBy }]
    };
    this.persist(record, `Result recorded: ${lastResult}.`);
  }

  private persist(record: Partial<CalibrationInstrument>, message: string): void {
    this.error.set(null);
    this.saving.set(true);
    this.api.instruments.save(record).subscribe({
      next: (instrument) => {
        this.saving.set(false);
        this.saved.emit({ instrument, message });
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(apiErrorMessage(e));
      }
    });
  }
}
