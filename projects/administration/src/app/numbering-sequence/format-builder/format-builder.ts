import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArrowLeft, ArrowRight, Building2, Calendar, CircleAlert, CircleCheck, GripVertical, Hash, LucideAngularModule, MapPin, RefreshCw, Tag, X } from 'lucide-angular';
import {
  DATE_FORMATS, FormatToken, LOCATION_CODES, NUMBER_LENGTHS, NumberSequence, SEPARATORS, TOKEN_KINDS, TOKEN_LABELS, TokenKind,
  formatErrors, formatNumber
} from '../numbering-sequence.model';

/** Drag-and-drop token editor with live preview and validation for one sequence. */
@Component({
  standalone: true,
  selector: 'app-format-builder',
  imports: [FormsModule, LucideAngularModule],
  templateUrl: './format-builder.html',
  styleUrls: ['../../shared/admin-workspace.css', './format-builder.css']
})
export class FormatBuilder {
  @Input({ required: true }) sequence!: NumberSequence;
  @Output() changed = new EventEmitter<void>();

  readonly icons = { ArrowLeft, ArrowRight, Building2, Calendar, CircleAlert, CircleCheck, GripVertical, Hash, MapPin, RefreshCw, Tag, X };
  readonly kinds = TOKEN_KINDS;
  readonly labels = TOKEN_LABELS;
  readonly dateFormats = DATE_FORMATS;
  readonly locationCodes = LOCATION_CODES;
  readonly numberLengths = NUMBER_LENGTHS;
  readonly separators = SEPARATORS;

  /** Offset added to the current number in the live preview (the refresh button steps it) */
  previewStep = 0;
  private dragIndex: number | null = null;
  dropIndex: number | null = null;

  kindIcon(kind: TokenKind) {
    switch (kind) {
      case 'date':
        return this.icons.Calendar;
      case 'location':
        return this.icons.MapPin;
      case 'number':
        return this.icons.Hash;
      case 'suffix':
        return this.icons.Building2;
      default:
        return this.icons.Tag;
    }
  }

  hasKind(kind: TokenKind): boolean {
    return this.sequence.tokens.some((t) => t.kind === kind);
  }

  addToken(kind: TokenKind): void {
    if (this.hasKind(kind)) return;
    const token: FormatToken = { kind, value: kind === 'date' ? 'YYYY' : kind === 'location' ? LOCATION_CODES[0] ?? '' : kind === 'prefix' ? 'NEW' : '' };
    const tokens = this.sequence.tokens;
    // Prefix goes first, suffix last, everything else just before the number (or at the end)
    if (kind === 'prefix') tokens.unshift(token);
    else if (kind === 'suffix') tokens.push(token);
    else {
      const numIdx = tokens.findIndex((t) => t.kind === 'number');
      const suffixIdx = tokens.findIndex((t) => t.kind === 'suffix');
      const at = kind === 'number' ? (suffixIdx < 0 ? tokens.length : suffixIdx) : numIdx < 0 ? (suffixIdx < 0 ? tokens.length : suffixIdx) : numIdx;
      tokens.splice(at, 0, token);
    }
    this.changed.emit();
  }

  removeToken(index: number): void {
    this.sequence.tokens.splice(index, 1);
    this.changed.emit();
  }

  move(index: number, delta: number): void {
    const target = index + delta;
    const tokens = this.sequence.tokens;
    if (target < 0 || target >= tokens.length) return;
    [tokens[index], tokens[target]] = [tokens[target], tokens[index]];
    this.changed.emit();
  }

  onDragStart(index: number, event: DragEvent): void {
    this.dragIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
  }

  onDragOver(index: number, event: DragEvent): void {
    if (this.dragIndex === null) return;
    event.preventDefault();
    this.dropIndex = index;
  }

  onDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    const from = this.dragIndex;
    this.dragIndex = null;
    this.dropIndex = null;
    if (from === null || from === index) return;
    const tokens = this.sequence.tokens;
    const [moved] = tokens.splice(from, 1);
    tokens.splice(index, 0, moved);
    this.changed.emit();
  }

  onDragEnd(): void {
    this.dragIndex = null;
    this.dropIndex = null;
  }

  setNumberLength(value: number): void {
    this.sequence.numberLength = Number(value);
    this.changed.emit();
  }

  padSample(len: number): string {
    return '1'.padStart(len, '0');
  }

  stepPreview(): void {
    this.previewStep = (this.previewStep + 1) % 5;
  }

  get preview(): string {
    return formatNumber(this.sequence, this.sequence.currentNumber + this.previewStep * this.sequence.incrementBy);
  }

  get errors(): string[] {
    return formatErrors(this.sequence);
  }
}
