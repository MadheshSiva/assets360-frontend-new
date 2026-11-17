import { VARIABLE_GROUPS } from './notification-templates.data';
import { NotificationTemplate } from './notification-templates.model';

/**
 * Message text is stored as plain text with {{variables}}, **bold**, *italic*, __underline__,
 * "Label: value" detail blocks and [button:Label] call-to-action lines. Everything here turns that
 * text into data the templates render with normal bindings, so no user text goes through innerHTML.
 */

export interface Seg {
  text: string;
  variable: string | null;
  style: '' | 'b' | 'i' | 'u';
}

export interface PreviewBlock {
  kind: 'p' | 'kv' | 'button';
  lines: Seg[][];
  rows: { label: string; value: Seg[] }[];
  label: string;
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const INLINE_RE = /(\{\{\s*[a-zA-Z0-9_]+\s*\}\}|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;
const KV_RE = /^([A-Za-z][A-Za-z ]{0,28}):\s+(.+)$/;
const BUTTON_RE = /^\[button:\s*([^\]]+)\]$/;

export const KNOWN_VARIABLES = new Set(VARIABLE_GROUPS.flatMap((g) => g.variables));

export function token(name: string): string {
  return `{{${name}}}`;
}

/** Splits on {{variables}} only, keeping every character, for the highlighted editor mirror. */
export function variableSegments(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(VAR_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), variable: null, style: '' });
    out.push({ text: m[0], variable: m[1], style: '' });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), variable: null, style: '' });
  return out;
}

/** Variables plus inline formatting, for the preview. */
export function inlineSegments(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), variable: null, style: '' });
    const raw = m[0];
    if (raw.startsWith('{{')) out.push({ text: raw, variable: raw.replace(/[{}\s]/g, ''), style: '' });
    else if (raw.startsWith('**')) out.push({ text: raw.slice(2, -2), variable: null, style: 'b' });
    else if (raw.startsWith('__')) out.push({ text: raw.slice(2, -2), variable: null, style: 'u' });
    else out.push({ text: raw.slice(1, -1), variable: null, style: 'i' });
    last = at + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), variable: null, style: '' });
  return out;
}

/** Paragraphs separated by blank lines; all-"Label: value" paragraphs become a detail table. */
export function previewBlocks(body: string): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  for (const para of body.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = para.split('\n').filter((l) => l.trim().length);
    if (!lines.length) continue;
    const button = lines.length === 1 ? BUTTON_RE.exec(lines[0].trim()) : null;
    if (button) {
      blocks.push({ kind: 'button', lines: [], rows: [], label: button[1].trim() });
    } else if (lines.length > 1 && lines.every((l) => KV_RE.test(l.trim()))) {
      blocks.push({
        kind: 'kv',
        lines: [],
        rows: lines.map((l) => {
          const m = KV_RE.exec(l.trim()) as RegExpExecArray;
          return { label: m[1], value: inlineSegments(m[2]) };
        }),
        label: ''
      });
    } else {
      blocks.push({ kind: 'p', lines: lines.map((l) => inlineSegments(l)), rows: [], label: '' });
    }
  }
  return blocks;
}

/** Replaces variables with sample values (unknown ones stay as typed). */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(VAR_RE, (raw, name: string) => values[name] ?? raw);
}

export function variablesIn(text: string): string[] {
  return [...text.matchAll(VAR_RE)].map((m) => m[1]);
}

/** "2 days ago", "1 week ago" ... */
export function relativeTime(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export const SMS_LIMIT = 160;
export const PUSH_TITLE_LIMIT = 50;
export const PUSH_BODY_LIMIT = 120;

/**
 * Field errors for a template. `full` adds the publish / save rules (content per enabled channel);
 * Save Draft only needs the identity fields.
 */
export function validateTemplate(t: NotificationTemplate, codeTaken: boolean, full = true): Record<string, string> {
  const out: Record<string, string> = {};
  if (!t.name.trim()) out['name'] = 'Template name is required.';
  if (!t.code.trim()) out['code'] = 'Template code is required.';
  else if (!/^[A-Z0-9-]{3,20}$/.test(t.code.trim())) out['code'] = 'Use 3-20 capital letters, digits or hyphens.';
  else if (codeTaken) out['code'] = 'This code is already used by another template.';
  if (!full) return out;

  if (!t.category) out['category'] = 'Category is required.';
  if (!t.triggerEvent) out['triggerEvent'] = 'Trigger event is required.';
  if (!t.language) out['language'] = 'Language is required.';
  if (!t.priority) out['priority'] = 'Priority is required.';
  if (!t.deliveryTiming) out['deliveryTiming'] = 'Delivery timing is required.';
  if (!t.retryPolicy) out['retryPolicy'] = 'Retry policy is required.';
  if (!t.channels.email && !t.channels.sms && !t.channels.inApp && !t.channels.push) out['channels'] = 'Select at least one channel.';

  if (t.channels.email) {
    if (!t.email.subject.trim()) out['subject'] = 'Subject is required.';
    if (!t.email.body.trim()) out['body'] = 'Message content is required.';
    if (t.email.replyTo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.replyTo.trim())) out['replyTo'] = 'Enter a valid email address.';
  }
  if (t.channels.sms) {
    if (!t.sms.text.trim()) out['sms'] = 'SMS text is required.';
    else if (t.sms.text.length > SMS_LIMIT) out['sms'] = `SMS is limited to ${SMS_LIMIT} characters.`;
  }
  if (t.channels.inApp && !t.inApp.title.trim()) out['inAppTitle'] = 'In-app title is required.';
  if (t.channels.push) {
    if (!t.push.title.trim()) out['pushTitle'] = 'Push title is required.';
    else if (t.push.title.length > PUSH_TITLE_LIMIT) out['pushTitle'] = `Keep the title under ${PUSH_TITLE_LIMIT} characters.`;
    if (!t.push.body.trim()) out['pushBody'] = 'Push message is required.';
    else if (t.push.body.length > PUSH_BODY_LIMIT) out['pushBody'] = `Keep the message under ${PUSH_BODY_LIMIT} characters.`;
  }

  const all = [t.email.subject, t.email.body, t.sms.text, t.inApp.title, t.inApp.body, t.inApp.link, t.push.title, t.push.body].join(' ');
  const unknown = variablesIn(all).find((v) => !KNOWN_VARIABLES.has(v));
  if (unknown) out['variables'] = `Unknown variable ${token(unknown)}. Pick one from Available Variables.`;
  return out;
}
