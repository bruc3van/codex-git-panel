import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createWorkQueue} from '../plugins/git-panel/scripts/work-queue.mjs';
import {createPanel} from '../plugins/git-panel/scripts/server.mjs';

test('work queue bounds load, removes cancelled waiters, and recovers after failure',async()=>{
  const run=createWorkQueue(1,1);
  let release,entered=false;
  const first=run(()=>new Promise(resolve=>{release=resolve;}));
  await Promise.resolve();
  const controller=new AbortController();
  const queued=run(()=>{entered=true;},controller.signal);
  await assert.rejects(run(()=>{}),/查询过多/);
  controller.abort();await assert.rejects(queued,{name:'AbortError'});
  release();await first;assert.equal(entered,false);
  await assert.rejects(run(()=>{throw Error('failure');}),/failure/);
  assert.equal(await run(()=>42),42);
});

test('concurrent state reads share work, later reads and mutations remain fresh',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'panel-query-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});
  git('init','-b','main');git('config','user.name','Test');git('config','user.email','test@example.invalid');
  await writeFile(path.join(root,'a.txt'),'one\n');git('add','.');git('commit','-m','initial');
  const panel=await createPanel(root);
  try{
    const first=panel.state();assert.equal(panel.state(),first);
    assert.equal((await first).files.length,0);
    await writeFile(path.join(root,'a.txt'),'two\n');
    assert.equal((await panel.state()).files.length,1);
    await panel.act({action:'stage',path:'a.txt'});
    const staged=await panel.state();
    await writeFile(path.join(root,'a.txt'),'three\n');git('add','.');
    await assert.rejects(panel.act({action:'commit',snapshot:staged.snapshot,message:'stale'}),/暂存内容已变化/);
    assert.match(await panel.diff('a.txt',true),/\+three/);
    await writeFile(path.join(root,'a.txt'),'four!\n');
    assert.match(await panel.diff('a.txt',false),/\+four!/);
    await assert.rejects(panel.diff('a.txt',false,undefined,AbortSignal.abort()),{name:'AbortError'});
    const controller=new AbortController();
    const pending=panel.diff('a.txt',false,undefined,controller.signal);
    queueMicrotask(()=>controller.abort());
    await assert.rejects(pending,{name:'AbortError'});
    assert.match(await panel.diff('a.txt',false),/\+four!/);
  }finally{await new Promise(resolve=>panel.server.close(resolve));}
});
