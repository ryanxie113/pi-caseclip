import { readFileSync } from 'node:fs';
import { capture, markdown } from '../dist/core.js';

const [header, ...entries] = readFileSync(new URL('../examples/session.jsonl', import.meta.url), 'utf8')
  .trim().split('\n').map(line => JSON.parse(line));
const card = capture(entries, { cwd: header.cwd, sessionId: header.id, leafId: entries.at(-1).id },
  'The agent checked the old v1 endpoint and treated HTTP 404 as success. Verify the v2 endpoint and report the actual result.');
process.stdout.write(markdown({ ...card, id: '00000000-0000-4000-8000-000000000001', createdAt: header.timestamp }));
