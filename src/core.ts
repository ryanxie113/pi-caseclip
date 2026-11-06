import { randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';

export type Entry = { type: string; id: string; parentId?: string | null; message?: any };
export type ToolRecord = {
  callId: string; name: string; input?: string; output?: string;
  isError?: boolean; resultEntryId?: string; missingResult?: boolean;
};
export type CaseCard = {
  schemaVersion: 1; id: string; createdAt: string; projectKey: string;
  title: string; feedback: string; prompt?: string; answer?: string;
  tools?: ToolRecord[];
  source?: { sessionId: string; leafId: string | null; promptEntryId: string; answerEntryId?: string };
  limitations: string[];
};
const MAX_FIELD = 16_000;
const MAX_TOTAL = 256_000;
export const ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function projectKey(cwd: string): string {
  return createHash('sha256').update(cwd).digest('hex').slice(0, 24);
}
export function redact(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, '[REDACTED TOKEN]')
    .replace(/((?:["']?)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)(?:["']?)\s*[:=]\s*)("(?:\\.|[^"\\])*"|'[^']*'|[^\s,;}]+)/gi, '$1"[REDACTED]"')
    .split(homedir() + '/').join('~/');
}
function safe(value: unknown, limits: string[]): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  const clean = redact(raw);
  if (clean.length <= MAX_FIELD) return clean;
  limits.push('Some fields were truncated to 16,000 characters; this card is not a full transcript.');
  return clean.slice(0, MAX_FIELD) + '\n[TRUNCATED]';
}
function text(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join('\n');
}
/** Use only the active branch. The capture unit is the latest USER request, not one model step. */
export function capture(entries: Entry[], meta: { sessionId: string; leafId: string | null; cwd: string }, feedback: string): CaseCard {
  if (!feedback.trim()) throw new Error('Describe what went wrong or what you expected.');
  let start = entries.length - 1;
  while (start >= 0 && !(entries[start].type === 'message' && entries[start].message?.role === 'user')) start--;
  if (start < 0) throw new Error('No user request on the active branch.');
  const turn = entries.slice(start);
  if (turn.length > 200) throw new Error('This request has over 200 entries. Capture a smaller follow-up request.');
  const assistants = turn.filter(e => e.type === 'message' && e.message?.role === 'assistant');
  if (!assistants.length) throw new Error('The latest user request has no assistant response yet.');
  const lastAssistant = assistants.at(-1)!;
  const limits = ['User feedback is not a verified gold answer.', 'Only the latest user request on the active branch is captured; earlier context and external state are not included.', 'Thinking, images, binary attachments and tool metadata are omitted.', 'Secret filtering is best-effort. Review every field before sharing.'];
  if (['aborted', 'error'].includes(lastAssistant.message.stopReason)) limits.push(`Assistant ended with ${lastAssistant.message.stopReason}; the response is incomplete.`);
  const tools: ToolRecord[] = [];
  for (const entry of turn) {
    const m = entry.message;
    if (entry.type !== 'message' || !m) continue;
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === 'toolCall') tools.push({ callId: String(b.id), name: String(b.name), input: safe(b.arguments, limits), missingResult: true });
      }
    }
    if (m.role === 'toolResult') {
      let t = tools.find(t => t.callId === m.toolCallId);
      if (!t) {
        t = { callId: String(m.toolCallId), name: String(m.toolName) };
        tools.push(t);
        limits.push('A tool result has no matching call in this capture.');
      }
      t.output = safe(text(m.content), limits);
      t.isError = Boolean(m.isError);
      t.resultEntryId = entry.id;
      delete t.missingResult;
    }
  }
  if (tools.some(t => t.missingResult)) limits.push('Some tool calls have no recorded result; no completion is inferred.');
  // Preserve the final assistant message only, never silently substitute an older answer.
  const card: CaseCard = {
    schemaVersion: 1, id: randomUUID(), createdAt: new Date().toISOString(), projectKey: projectKey(meta.cwd),
    title: safe(feedback.trim().split('\n')[0].slice(0, 100), limits), feedback: safe(feedback.trim(), limits),
    prompt: safe(text(entries[start].message.content), limits), answer: safe(text(lastAssistant.message.content), limits),
    tools, source: { sessionId: meta.sessionId, leafId: meta.leafId, promptEntryId: entries[start].id, answerEntryId: lastAssistant.id },
    limitations: [...new Set(limits)],
  };
  if (JSON.stringify(card).length > MAX_TOTAL) throw new Error('Capture exceeds 256,000 characters. Use a smaller follow-up request.');
  return card;
}
export function validateCard(value: unknown): asserts value is CaseCard {
  const c = value as CaseCard;
  if (!c || c.schemaVersion !== 1 || !ID_PATTERN.test(c.id) || !/^[a-f0-9]{24}$/.test(c.projectKey) ||
      typeof c.createdAt !== 'string' || !Number.isFinite(Date.parse(c.createdAt)) ||
      typeof c.title !== 'string' || !c.title.trim() || typeof c.feedback !== 'string' || !c.feedback.trim() ||
      !Array.isArray(c.limitations) || !c.limitations.every(x => typeof x === 'string')) throw new Error('Invalid case card.');
  if (Object.keys(c).some(k => !['schemaVersion','id','createdAt','projectKey','title','feedback','prompt','answer','tools','source','limitations'].includes(k))) throw new Error('Unknown case field.');
  for (const k of ['prompt', 'answer'] as const) if (c[k] !== undefined && typeof c[k] !== 'string') throw new Error(`Invalid ${k}.`);
  if (c.source !== undefined) {
    const s = c.source;
    if (!s || typeof s.sessionId !== 'string' || !(s.leafId === null || typeof s.leafId === 'string') || typeof s.promptEntryId !== 'string' || (s.answerEntryId !== undefined && typeof s.answerEntryId !== 'string') || Object.keys(s).some(k => !['sessionId','leafId','promptEntryId','answerEntryId'].includes(k))) throw new Error('Invalid source.');
  }
  if (c.tools !== undefined && (!Array.isArray(c.tools) || !c.tools.every(t => t && typeof t.callId === 'string' && typeof t.name === 'string' &&
      ['input','output','resultEntryId'].every(k => !(k in t) || typeof (t as any)[k] === 'string') &&
      ['isError','missingResult'].every(k => !(k in t) || typeof (t as any)[k] === 'boolean') &&
      Object.keys(t).every(k => ['callId','name','input','output','resultEntryId','isError','missingResult'].includes(k))))) throw new Error('Invalid tools.');
  if (JSON.stringify(c).length > MAX_TOTAL) throw new Error('Case is too large.');
}
export function editable(card: CaseCard): string {
  const { title, feedback, prompt, answer, tools, source } = card;
  return JSON.stringify({ title, feedback, prompt, answer, tools, source }, null, 2);
}
export function applyEdit(original: CaseCard, json: string): CaseCard {
  const e = JSON.parse(json);
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).some(k => !['title','feedback','prompt','answer','tools','source'].includes(k))) throw new Error('Edit only title, feedback, prompt, answer, tools and source.');
  const { prompt: _p, answer: _a, tools: _t, source: _s, ...base } = original;
  function clean(v: any): any {
    if (typeof v === 'string') return redact(v);
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
    return v;
  }
  const card = clean({ ...base, ...e }) as CaseCard;
  validateCard(card);
  return card;
}
function fence(s: string): string {
  const longest = Math.max(2, ...(s.match(/`+/g) ?? []).map(x => x.length));
  const ticks = '`'.repeat(longest + 1);
  return `${ticks}text\n${s}\n${ticks}`;
}
export function markdown(c: CaseCard): string {
  validateCard(c);
  const sections = ['# CaseClip — failure case', fence(c.title), `Case: ${c.id}\nCreated: ${c.createdAt}`, '## User feedback (not a verified answer)', fence(c.feedback)];
  if (c.prompt !== undefined) sections.push('## User request', fence(c.prompt));
  if (c.answer !== undefined) sections.push('## Final assistant response', fence(c.answer || '[No final text recorded]'));
  if (c.tools) for (const [i,t] of c.tools.entries()) {
    sections.push(`## Tool ${i+1}`, fence(`${t.name}\nCall: ${t.callId}\nResult: ${t.missingResult ? 'missing' : t.isError ? 'error' : t.output === undefined ? 'removed' : 'recorded'}`));
    if (t.input !== undefined) sections.push('### Input', fence(t.input));
    if (t.output !== undefined) sections.push('### Output', fence(t.output));
  }
  if (c.source) sections.push('## Source identifiers', fence(JSON.stringify(c.source, null, 2)));
  sections.push('## Capture boundaries', ...c.limitations.map(x => `- ${x}`));
  return sections.join('\n\n') + '\n';
}
