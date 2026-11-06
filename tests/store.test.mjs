import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { capture, applyEdit, projectKey } from '../dist/core.js';
import { CaseStore } from '../dist/store.js';
import { branch, meta, temp } from './helpers.mjs';
function setup(t) { const root=temp(t); const c=capture(branch(),meta,'Wrong API version'); return {root,c,store:new CaseStore(root,c.projectKey)}; }
test('save/list/export round trip; exported copy can omit data without changing source', t => {
  const {c,store}=setup(t); const path=store.save(c);
  assert.deepEqual(store.load(c.id),c); assert.equal(store.list().cards.length,1);
  const trimmed=applyEdit(c,JSON.stringify({title:c.title,feedback:c.feedback}));
  const file=store.export(trimmed,'json'); assert.equal(JSON.parse(readFileSync(file)).tools,undefined);
  assert.ok(store.load(c.id).tools); assert.equal(statSync(path).mode & 0o777,0o600);
});
test('edits are atomic, concurrent stale writes rejected, deleted cases leave exports alone', t => {
  const {c,store}=setup(t); store.save(c); const out=store.export(c,'md');
  const next=applyEdit(c,JSON.stringify({title:'Corrected',feedback:'Expected v2'}));
  store.update(c,next); assert.equal(store.load(c.id).title,'Corrected');
  assert.throws(()=>store.update(c,next),/changed/);
  store.remove(next); assert.equal(store.list().cards.length,0); assert.ok(existsSync(out));
});
test('traversal, overwrite and cross-project writes are rejected', t => {
  const {root,c,store}=setup(t); store.save(c);
  assert.throws(()=>store.load('../../escape'),/Invalid case/);
  assert.throws(()=>store.save(c),{code:'EEXIST'});
  assert.throws(()=>new CaseStore(root,projectKey('/other')).save(c),/Project/);
});
test('malformed cases are skipped and a symlink is never read', t => {
  const {root,c,store}=setup(t); store.save(c);
  const second=capture(branch(),meta,'second');
  writeFileSync(join(store.dir,`${second.id}.json`),'not-json');
  const third=capture(branch(),meta,'third'); const outside=join(root,'outside'); writeFileSync(outside,JSON.stringify(third));
  symlinkSync(outside,join(store.dir,`${third.id}.json`));
  assert.equal(store.list().skipped,2); assert.equal(store.list().cards.length,1);
});
test('symlinked export directory is rejected', t => {
  const {root,c,store}=setup(t); store.save(c); const outside=join(root,'outside'); mkdirSync(outside);
  symlinkSync(outside,join(store.dir,'exports')); assert.throws(()=>store.export(c,'md'),/symlink/);
});
