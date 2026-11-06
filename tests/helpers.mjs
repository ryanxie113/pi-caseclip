import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const fixture = () => readFileSync(new URL('../examples/session.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
export const branch = () => fixture().slice(1);
export const meta = { cwd: '/demo/shop', sessionId: 'caseclip-demo', leafId: 'a2' };
export function temp(t) { const p = mkdtempSync(join(tmpdir(), 'caseclip-test-')); t.after(() => rmSync(p, { recursive: true, force: true })); return p; }
