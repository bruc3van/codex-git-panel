import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,realpath} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=await realpath(execFileSync('git',['-C',path.resolve(process.argv[2]||'.'),'rev-parse','--show-toplevel'],{encoding:'utf8',windowsHide:true}).trim());
const dir=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'CodexGitPanel');await mkdir(dir,{recursive:true});
const record=path.join(dir,createHash('sha256').update(root+fileURLToPath(import.meta.url)).digest('hex').slice(0,20)+'.json');
async function existing(){try {const info=JSON.parse(await readFile(record,'utf8'));const u=new URL(info.url);const r=await fetch(u.origin+'/api/state',{headers:{Authorization:'Bearer '+u.hash.slice(1)},signal:AbortSignal.timeout(1500)});if(r.ok&&(await r.json()).root.replaceAll('\\','/').toLowerCase()===root.replaceAll('\\','/').toLowerCase())return info.url;}catch{} }
let url=await existing();
if(!url){const child=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url)),root,record],{detached:true,stdio:'ignore',windowsHide:true});child.unref();for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,200));url=await existing();if(url)break;}}
if(!url)throw Error('启动失败，请手动运行 node scripts/server.mjs <仓库路径> 查看错误');
console.log(url);
