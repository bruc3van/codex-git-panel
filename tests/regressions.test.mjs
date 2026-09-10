import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, writeFile, readFile, stat} from 'node:fs/promises';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {createPanel, startPanel} from '../plugins/git-panel/scripts/server.mjs';
import {existingPanel, acquireInstance, runtimePaths} from '../plugins/git-panel/scripts/runtime.mjs';

const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});
async function repo(){const root=await mkdtemp(path.join(os.tmpdir(),'panel-regression-'));git(root,'init','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');return root;}
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});

test('dead PID records never send a token; heartbeat redirects are rejected',async()=>{
  let hits=0,redirectHits=0;
  const server=http.createServer((req,res)=>{hits++;if(req.url==='/redirect'){redirectHits++;res.end('{}');}else{res.writeHead(302,{Location:'/redirect'});res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const root=await repo(),record=path.join(root,'record.json'),url=`http://127.0.0.1:${server.address().port}/#secret`;
    const child=spawn(process.execPath,['-e',''],{windowsHide:true});await once(child,'exit');
    await writeFile(record,JSON.stringify({pid:child.pid,url}));
    assert.equal(await existingPanel(record,root),undefined);assert.equal(hits,0);
    await writeFile(record,JSON.stringify({pid:process.pid,url}));
    assert.equal(await existingPanel(record,root),undefined);assert.equal(hits,1);assert.equal(redirectHits,0);
  }finally{await close(server);}
});

test('record publication failure closes HTTP and releases workspace guard',async()=>{
  const root=await repo();let panel;
  await assert.rejects(startPanel(root,{create:async directory=>(panel=await createPanel(directory)),publish:async()=>{throw Error('disk failure');}}),/disk failure/);
  assert.equal(panel.server.listening,false);
  const guard=await acquireInstance((await runtimePaths(root)).socket);await close(guard);
});

test('UTF-8 commit message survives a split inside a Chinese character',async()=>{
  const root=await repo();await writeFile(path.join(root,'a.txt'),'one');const panel=await createPanel(root);
  try{
    const s=await panel.state(),message='中文提交说明';
    const body=Buffer.from(JSON.stringify({action:'commit',message,snapshot:s.snapshot,stageAll:true,paths:['a.txt']}));
    const split=body.indexOf(Buffer.from('中'))+1;
    const response=await new Promise((resolve,reject)=>{
      const req=http.request(panel.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+panel.token,'Content-Type':'application/json'}},res=>{let result='';res.on('data',c=>result+=c);res.on('end',()=>resolve({status:res.statusCode,result}));});
      req.on('error',reject);req.write(body.subarray(0,split));setTimeout(()=>req.end(body.subarray(split)),40);
    });
    assert.equal(response.status,200,response.result);assert.equal(git(root,'log','-1','--format=%s').trim(),message);
  }finally{await close(panel.server);}
});

test('renamed files can be diffed, discarded, staged and unstaged; open rejects scripts and missing paths',async()=>{
  const root=await repo();await writeFile(path.join(root,'old.txt'),'one\n');git(root,'add','.');git(root,'commit','-m','initial');git(root,'mv','old.txt','new.txt');
  const panel=await createPanel(root);
  try{
    assert.equal((await panel.state()).files[0].oldPath,'old.txt');assert.match(await panel.diff('new.txt',true),/rename to new.txt/);
    await writeFile(path.join(root,'new.txt'),'modified\n');await panel.act({action:'discard',path:'new.txt',confirm:true});assert.equal((await readFile(path.join(root,'new.txt'),'utf8')).trim(),'one');
    await panel.act({action:'stage',path:'new.txt'});await panel.act({action:'unstage',path:'new.txt'});assert.ok((await panel.state()).files.some(f=>f.path==='new.txt'&&f.x==='?'));
    await writeFile(path.join(root,'unsafe.js'),'alert(1)');
    for(const [file,pattern] of [['unsafe.js',/不支持/],['../escape',/文件状态/]]){
      const r=await fetch(panel.origin+'/api/action',{method:'POST',headers:{Authorization:'Bearer '+panel.token},body:JSON.stringify({action:'open',path:file})});assert.equal(r.status,400);assert.match((await r.json()).error,pattern);
    }
  }finally{await close(panel.server);}
});

test('Unix SIGKILL socket recovery remains exclusive and records are private',{skip:process.platform==='win32'},async()=>{
  const root=await repo(),paths=await runtimePaths(root);
  const script=new URL('../plugins/git-panel/scripts/server.mjs',import.meta.url);
  const child=spawn(process.execPath,[script.pathname,root],{stdio:['ignore','pipe','pipe']});
  try{
    await once(child.stdout,'data');
    assert.equal((await stat(path.dirname(paths.record))).mode&0o777,0o700);
    assert.equal((await stat(paths.record)).mode&0o777,0o600);
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    const results=await Promise.allSettled(Array.from({length:4},()=>acquireInstance(paths.socket)));
    const winners=results.filter(r=>r.status==='fulfilled');
    try{assert.equal(winners.length,1);}finally{await Promise.all(winners.map(r=>close(r.value)));}
  }finally{child.kill();}
});
