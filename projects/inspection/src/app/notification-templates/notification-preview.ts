import { Component, input, output } from '@angular/core';
import { LucideAngularModule, Bell, RefreshCw } from 'lucide-angular';
import { NotificationTemplate } from '../shared/inspection.models';

type Channel = 'Email' | 'In-app' | 'Push';

/** Substitutes {{variables}}; unknown variables stay visible. */
export function fillVariables(text: string, sample: Record<string, string>): string {
  return (text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => sample[k] ?? m);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Markdown-ish body (**b**, *i*, __u__, lists, [text](url)) -> safe HTML. */
export function bodyHtml(text: string, sample: Record<string, string>): string {
  const inline = (l: string) =>
    escapeHtml(l)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  for (const raw of fillVariables(text, sample).split('\n')) {
    const ul = /^\s*[-•]\s+(.*)$/.exec(raw);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(raw);
    const kind = ul ? 'ul' : ol ? 'ol' : null;
    if (list && kind !== list) {
      out.push(`</${list}>`);
      list = null;
    }
    if (kind) {
      if (!list) out.push(`<${kind}>`);
      list = kind;
      out.push(`<li>${inline((ul ?? ol)![1]!)}</li>`);
    } else if (raw.trim()) {
      out.push(`<p>${inline(raw)}</p>`);
    }
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}

/** Plain text for in-app / push: markers stripped. */
export function plainText(text: string, sample: Record<string, string>): string {
  return fillVariables(text, sample)
    .replace(/\*\*|__|\*/g, '')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/^\s*[-•]\s+/gm, '• ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

@Component({
  selector: 'app-insp-notification-preview',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <h2 class="hd">Live Preview</h2>
    <div class="tabs" role="tablist">
      @for (c of tabs; track c) {
        <button type="button" role="tab" [class.on]="channel === c" [attr.aria-selected]="channel === c" (click)="channel = c">
          {{ c }}@if (!template().channels.includes(c)) {<small> (off)</small>}
        </button>
      }
    </div>
    <div class="body">
      @switch (channel) {
        @case ('Email') {
          <div class="meta"><span>To:</span><b>{{ email() }}</b><span>Subject:</span><b>{{ subject() }}</b></div>
          <div class="mail">
            <div class="brand"><span class="logo">◆</span>asset360 <small>by Purple IQ</small></div>
            <h3>{{ subject() }}</h3>
            <div class="msg" [innerHTML]="html()"></div>
            @if (template().buttonLabel) { <a class="cta" [href]="sample()['inspection_url']" target="_blank" rel="noopener">{{ template().buttonLabel }}</a> }
            <p class="sent">Sent by Asset360 • {{ sample()['location'] }}</p>
          </div>
        }
        @case ('In-app') {
          <div class="inapp">
            <span class="ic"><lucide-icon [img]="icons.Bell" [size]="18"></lucide-icon></span>
            <div><b>{{ subject() }}</b><p>{{ plain() }}</p>
              @if (template().buttonLabel) { <span class="btnlink">{{ template().buttonLabel }} →</span> }
              <small>Just now</small></div>
          </div>
        }
        @case ('Push') {
          <div class="phone">
            <div class="push"><div class="push-h"><span class="logo">◆</span>ASSET360 · now</div>
              <b>{{ subject() }}</b><p>{{ plain().slice(0, 140) }}{{ plain().length > 140 ? '…' : '' }}</p></div>
          </div>
        }
      }
    </div>
    <div class="sd-head"><h3>Sample Data</h3>
      <button type="button" class="refresh" (click)="refresh.emit()"><lucide-icon [img]="icons.RefreshCw" [size]="14"></lucide-icon>Refresh preview</button></div>
    <table class="sd">
      <tr><td>Inspection</td><td>{{ sample()['inspection_id'] || '—' }}</td></tr>
      <tr><td>Inspector</td><td>{{ sample()['inspector_name'] || '—' }}</td></tr>
      <tr><td>Asset</td><td class="acc">{{ sample()['asset_code'] || sample()['asset_name'] || '—' }}</td></tr>
      <tr><td>Due date</td><td>{{ sample()['due_date'] || '—' }}</td></tr>
    </table>
  `,
  styleUrls: ['./notification-preview.css']
})
export class NotificationPreview {
  readonly icons = { Bell, RefreshCw };
  readonly template = input.required<NotificationTemplate>();
  readonly sample = input.required<Record<string, string>>();
  readonly refresh = output<void>();
  readonly tabs: Channel[] = ['Email', 'In-app', 'Push'];
  channel: Channel = 'Email';

  subject(): string {
    return fillVariables(this.template().subject, this.sample());
  }

  html(): string {
    return bodyHtml(this.template().messageBody, this.sample());
  }

  plain(): string {
    return plainText(this.template().messageBody, this.sample());
  }

  email(): string {
    return this.sample()['inspector_name'] || 'Assigned inspector';
  }
}
