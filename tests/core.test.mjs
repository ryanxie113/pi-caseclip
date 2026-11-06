import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture, editable, applyEdit, markdown, redact, validateCard } from '../dist/core.js';
import { branch, meta } from './helpers.mjs';
const reason = 'Used v1. Expected v2 and a successful lookup before claiming success.';
test('captures one user request across multiple assistant steps and paired tool result', () => {
  const c = capture(branch(), meta, reason);
  assert.equal(c.source.promptEntryId, 'u1'); assert.equal(c.source.answerEntryId, 'a2');
  assert.equal(c.tools.length, 1); assert.equal(c.tools[0].isError, true);
  assert.match(c.tools[0].output, /404/); assert.match(c.answer, /works/); validateCard(c);
});
test('latest user boundary excludes earlier requests, not just earlier model turns', () => {
  const old = branch(); const next = structuredClone(branch());
  next[0].id = 'new-user'; next[0].message.content = 'Second task';
  const c = capture([...old, ...next], meta, reason);
  assert.equal(c.prompt, 'Second task'); assert.equal(c.tools.length, 1);
});
test('does not fallback to an old response when newest request has not answered', () => {
  const entries = branch(); entries.push({type:'message',id:'new', message:{role:'user',content:'Waiting'}});
  assert.throws(() => capture(entries, meta, reason), /no assistant/);
});
test('does not persist thinking, image data or tool metadata', () => {
  const entries = branch();
  entries[1].message.content.push({ type: 'thinking', thinking: 'hidden-thought' }, { type: 'image', data: 'binary-data' });
  entries[2].message.details = { secret: 'metadata-secret' };
  const json = JSON.stringify(capture(entries, meta, reason));
  for (const v of ['hidden-thought','binary-data','metadata-secret']) assert.ok(!json.includes(v));
});
test('marks interrupted and missing-result traces without inventing completion', () => {
  const entries = branch().slice(0,2); entries[1].message.stopReason = 'aborted';
  const c = capture(entries, meta, reason);
  assert.equal(c.tools[0].missingResult, true);
  assert.ok(c.limitations.some(x => x.includes('aborted')));
});
test('matches out-of-order parallel results by call id', () => {
  const entries = branch();
  entries[1].message.content.push({type:'toolCall',id:'call-2',name:'read',arguments:{path:'second'}});
  entries.splice(2,0,{type:'message',id:'t2',message:{role:'toolResult',toolCallId:'call-2',toolName:'read',content:[{type:'text',text:'second output'}],isError:false}});
  const c = capture(entries,meta,reason);
  assert.equal(c.tools[0].resultEntryId,'t1'); assert.equal(c.tools[1].output,'second output');
});
test('truncation is explicit and overlarge requests fail closed', () => {
  const entries = branch(); entries[2].message.content[0].text = 'x'.repeat(20000);
  const c = capture(entries,meta,reason);
  assert.match(c.tools[0].output,/TRUNCATED/); assert.ok(c.limitations.some(x => x.includes('truncated')));
  assert.throws(() => capture([...branch(),...Array.from({length:201},(_,i)=>({id:`extra${i}`,type:'custom'}))],meta,reason), /200/);
});
test('secret filtering handles bearer, keys, quoted values and terminal controls', () => {
  const raw = 'Bearer abc123 password="hello world" api_key=abc123 sk-abcdefghijklmnop \x1b[31mred\x1b[0m';
  const s = redact(raw);
  for (const v of ['abc123','hello world','sk-abcdefghijklmnop','\x1b']) assert.ok(!s.includes(v));
});
test('editor can remove source, answer and tool arguments without modifying original', () => {
  const c = capture(branch(),meta,reason); const e = JSON.parse(editable(c));
  delete e.source; delete e.answer; delete e.tools[0].input;
  const next = applyEdit(c,JSON.stringify(e));
  assert.equal(next.source,undefined); assert.equal(next.answer,undefined); assert.equal(next.tools[0].input,undefined);
  assert.ok(c.source); assert.ok(c.tools[0].input);
});
test('editor redacts string leaves without corrupting JSON', () => {
  const c = capture(branch(),meta,reason); const e = JSON.parse(editable(c));
  e.feedback = 'password="new secret"'; e.tools[0].input = '{"api_key":"another-secret"}';
  const next = applyEdit(c,JSON.stringify(e));
  assert.ok(!JSON.stringify(next).includes('another-secret')); assert.ok(!next.feedback.includes('new secret'));
});
test('identity and unknown fields cannot be injected from editor', () => {
  const c = capture(branch(),meta,reason);
  assert.throws(() => applyEdit(c,'{"id":"../../escape"}'), /Edit only/);
  assert.throws(() => applyEdit(c,'{"tools":[{"callId":"x","name":"bash","extra":"bad"}]}'), /tools/);
  assert.throws(() => applyEdit(c,'{"feedback":""}'), /Invalid/);
});
test('Markdown quotes untrusted content rather than active links or injected fences', () => {
  const c = capture(branch(),meta,'```\n![secret](https://example.invalid)\n```');
  const md = markdown(c);
  assert.match(md,/````text/); assert.match(md,/not a verified answer/);
});
test('missing user or empty feedback returns a useful error', () => {
  assert.throws(() => capture([],meta,reason), /No user/);
  assert.throws(() => capture(branch(),meta,''), /Describe/);
});
