import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createPanel} from '../plugins/git-panel/scripts/server.mjs';

const execute=promisify(execFile);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plugin=fileURLToPath(new URL('../plugins/git-panel',import.meta.url));

test('concurrent launchers and different plugin paths reuse one workspace service; repositories stay separate',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'panel-runtime-'));
 const root=path.join(base,'repo'),other=path.join(base,'other');
 await mkdir(root);await mkdir(other);
 for(const directory of [root,other])await execute('git',['-C',directory,'init']);
 const copy=path.join(base,'plugin-copy');await cp(plugin,copy,{recursive:true});
 const env={...process.env,LOCALAPPDATA:base};
 const launch=async(source,directory)=>(await execute(process.execPath,[path.join(source,'scripts/launch.mjs'),directory],{env,windowsHide:true,timeout:30000})).stdout.trim();
 try{
  const urls=await Promise.all([launch(plugin,root),launch(copy,root),launch(plugin,root),launch(copy,root)]);
  assert.equal(new Set(urls).size,1);
  const otherUrl=await launch(plugin,other);assert.notEqual(new URL(otherUrl).origin,new URL(urls[0]).origin);
  const url=new URL(urls[0]);
  const state=await fetch(url.origin+'/api/state',{headers:{Authorization:'Bearer '+url.hash.slice(1)}}).then(r=>r.json());
  assert.equal(path.resolve(state.root),root);
  assert.equal(await launch(copy,root),urls[0]);
 }finally{
  const {readdir}=await import('node:fs/promises');
  for(const file of await readdir(path.join(base,'CodexGitPanel'))){
   if(!file.endsWith('.json'))continue;
   const info=JSON.parse(await readFile(path.join(base,'CodexGitPanel',file),'utf8'));
   try{process.kill(info.pid);}catch{}
  }
 }
});

test('authenticated heartbeat keeps a service alive; inactivity closes it',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'panel-idle-'));await execute('git',['-C',root,'init']);
 const panel=await createPanel(root,{idleTimeoutMs:150});let closed=false;
 panel.server.once('close',()=>{closed=true;});
 try{
  for(let i=0;i<5;i++){
   const r=await fetch(panel.origin+'/api/heartbeat',{headers:{Authorization:'Bearer '+panel.token}});
   assert.equal(r.status,200);assert.equal((await r.json()).protocol,1);
   await sleep(60);assert.equal(closed,false);
  }
  for(let i=0;i<20&&!closed;i++)await sleep(50);
  assert.equal(closed,true);
 }finally{if(!closed)await new Promise(resolve=>panel.server.close(resolve));}
});
