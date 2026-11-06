// Real Pi loader + real branch manager, offline fixtures, scripted UI. No model request.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DefaultResourceLoader, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { CaseStore } from '../dist/store.js';
import { projectKey } from '../dist/core.js';
const root=mkdtempSync(join(tmpdir(),'caseclip-host-'));
const oldRoot=process.env.CASECLIP_DIR;
try {
  mkdirSync(join(root,'project')); const cwd=realpathSync(join(root,'project')); const agentDir=join(root,'pi'); mkdirSync(agentDir);
  process.env.CASECLIP_DIR=join(root,'cases');
  const loader=new DefaultResourceLoader({cwd,agentDir,settingsManager:SettingsManager.inMemory({packages:[]}),additionalExtensionPaths:[resolve('dist/index.js')],noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true});
  await loader.reload();
  const loaded=loader.getExtensions(); assert.deepEqual(loaded.errors,[]);
  const extension=loaded.extensions.find(e=>e.commands.has('case')); assert.ok(extension,'/case command loaded by Pi');
  assert.equal(extension.tools.size,0,'no agent-callable tool');
  const command=extension.commands.get('case');
  const session=SessionManager.inMemory(cwd);
  const entries=readFileSync('examples/session.jsonl','utf8').trim().split('\n').map(JSON.parse).slice(1);
  const ids=entries.map(e=>session.appendMessage(e.message));
  const firstUser=ids[0];
  session.branch(firstUser);
  const alternate={...entries.at(-1).message,content:[{type:'text',text:'Alternate branch answer'}]};
  session.appendMessage(alternate);
  const events=[]; let edit=x=>x; let confirm=true;
  const ctx={cwd,hasUI:true,sessionManager:session,isIdle:()=>true,hasPendingMessages:()=>false,
    ui:{editor:async(_title,value)=>edit(value),input:async()=>undefined,select:async(_title,items)=>items[0],confirm:async()=>confirm,notify:(message,level)=>events.push({message,level})}};
  await command.handler('save Wrong version; expected v2',ctx);
  assert.ok(!events.some(e=>e.level==='error'),JSON.stringify(events));
  const store=new CaseStore(process.env.CASECLIP_DIR,projectKey(cwd));
  const card=store.list().cards[0]; assert.ok(card);
  assert.equal(card.answer,'Alternate branch answer'); assert.equal(card.tools.length,0,'abandoned tool calls excluded');
  assert.equal(card.source.promptEntryId,firstUser); assert.equal(card.source.leafId,session.getLeafId());
  await command.handler(`show ${card.id}`,ctx);
  edit=value=>{ const v=JSON.parse(value); delete v.source; delete v.tools; return JSON.stringify(v); };
  await command.handler(`export ${card.id} json`,ctx);
  const exported=events.find(e=>e.message.startsWith('Exported locally: ')); assert.ok(exported);
  const exportPath=exported.message.split('\n')[0].replace('Exported locally: ','');
  assert.equal(JSON.parse(readFileSync(exportPath)).source,undefined); assert.ok(store.load(card.id).source);
  await command.handler(`edit ${card.id}`,ctx); assert.equal(store.load(card.id).source,undefined);
  confirm=false; await command.handler(`delete ${card.id}`,ctx); assert.equal(store.list().cards.length,1);
  confirm=true; await command.handler(`delete ${card.id}`,ctx); assert.equal(store.list().cards.length,0);
  edit=()=>undefined; await command.handler('save cancelled',ctx); assert.equal(store.list().cards.length,0);
  await command.handler('save busy',{...ctx,isIdle:()=>false}); assert.match(events.at(-1).message,/Wait/);
  await command.handler('save headless',{...ctx,hasUI:false}); assert.match(events.at(-1).message,/interactive/);
  console.log('PASS: Pi 1.5.0 loader, /case registration, actual session branch selection, save/show/edit/export/delete, cancellation and mode guards.');
} finally {
  if(oldRoot===undefined) delete process.env.CASECLIP_DIR; else process.env.CASECLIP_DIR=oldRoot;
  rmSync(root,{recursive:true,force:true});
}
