import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, writeFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
const exec = promisify(execFile);
const hash = s => createHash('sha256').update(s).digest('hex');
const web = fileURLToPath(new URL('../web/', import.meta.url));
export async function createPanel(directory) {
  const requested = await realpath(directory);
  async function git(args, allowFailure=false) {
    try { return (await exec('git',['--no-pager','-c','core.quotepath=false',...args],{cwd:requested,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_LITERAL_PATHSPECS:'1',GIT_OPTIONAL_LOCKS:'0'}})).stdout; }
    catch(e) { if(allowFailure) return ''; throw new Error((e.stderr || e.message).trim()); }
  }
  const root = (await git(['rev-parse','--show-toplevel'])).trim();
  if((await realpath(root)).toLowerCase()!==requested.toLowerCase()) throw new Error('请传入仓库根目录');
  const gitDir=(await git(['rev-parse','--absolute-git-dir'])).trim();
  let busy=false, fetched=null;
  async function state() {
    const raw=await git(['status','--porcelain=v1','-z','--untracked-files=all']);
    const chunks=raw.split('\0'), files=[];
    for(let i=0;i<chunks.length;i++) { const s=chunks[i]; if(!s)continue; const f={x:s[0],y:s[1],path:s.slice(3)}; if('RC'.includes(f.x)||'RC'.includes(f.y))f.oldPath=chunks[++i]; files.push(f); }
    const head=(await git(['rev-parse','--verify','HEAD'],true)).trim();
    const branch=(await git(['symbolic-ref','--short','HEAD'],true)).trim();
    const upstream=(await git(['rev-parse','--abbrev-ref','@{upstream}'],true)).trim();
    const counts=upstream?(await git(['rev-list','--left-right','--count','HEAD...@{upstream}'])).trim().split(/\s+/).map(Number):[null,null];
    const logs=head?await git(['log','-25','--format=%H%x00%h%x00%s%x00%d%x00%ar']):'';
    const history=logs.trim().split('\n').filter(Boolean).map(l=>{const [id,short,subject,refs,when]=l.split('\0');return {id,short,subject,refs,when};});
    let operation='';
    for(const name of ['MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD','REVERT_HEAD']) {try{await stat(path.join(gitDir,name));operation=name;break;}catch{}}
    const conflict=files.some(f=>f.x==='U'||f.y==='U'||['AA','DD'].includes(f.x+f.y));
    const index=await git(['ls-files','--stage','-z']);
    return {root,branch,upstream,head,files,history,ahead:counts[0],behind:counts[1],snapshot:hash(head+index),busy,operation,conflict,fetched,remote:!!(await git(['remote'])).trim(),worktree:gitDir.replaceAll('\\','/').includes('/worktrees/')};
  }
  async function diff(p, staged, commit) {
    if(commit) { if(!/^[a-f0-9]{40}$/.test(commit))throw Error('无效提交'); return await git(['show','--format=fuller','--first-parent','--no-ext-diff','--no-textconv',commit]); }
    const s=await state(), f=s.files.find(f=>f.path===p);
    if(!f)throw Error('文件状态已变化，请刷新');
    if(f.x==='?' && !staged) {
      const resolved=await realpath(path.join(root,p));
      if(!resolved.startsWith((await realpath(root))+path.sep))throw Error('不能预览仓库外的链接目标');
      if((await stat(resolved)).size>512000)return '文件过大，暂不预览';
      const bytes=await readFile(resolved);if(bytes.includes(0))return '二进制文件';
      return '--- /dev/null\n+++ b/'+p+'\n@@ -0,0 +1,'+bytes.toString().split('\n').length+' @@\n'+bytes.toString().split('\n').map(l=>'+'+l).join('\n');
    }
    return await git(['diff','--no-ext-diff','--no-textconv',...(staged?['--cached']:[]),'--',p,...(f.oldPath?[f.oldPath]:[])]);
  }
  async function act(body) {
    if(busy)throw Error('另一个操作正在执行');busy=true;
    try {
      const s=await state();
      if(s.operation||s.conflict)throw Error('仓库正在合并、变基或有冲突，请先在终端处理');
      const a=body.action;
      if(['stage','unstage','discard'].includes(a)) {
        const f=s.files.find(f=>f.path===body.path);if(!f)throw Error('文件状态已变化');
        const paths=[f.path,...(f.oldPath?[f.oldPath]:[])];
        if(a==='stage')await git(['add','--',...paths]);
        if(a==='unstage')await git(s.head?['restore','--staged','--',...paths]:['rm','--cached','--',...paths]);
        if(a==='discard') {if(f.x==='?'||body.confirm!==true)throw Error('仅支持确认后放弃已跟踪文件的未暂存修改');await git(['restore','--worktree','--',f.path]);}
      } else if(a==='commit') {
        if(!s.branch)throw Error('请先创建分支');
        if(body.snapshot!==s.snapshot)throw Error('暂存内容已变化，请重新查看后提交');
        if(typeof body.message!=='string'||!body.message.trim()||body.message.length>10000)throw Error('请输入提交说明');
        if(body.stageAll===true){
          if(s.files.some(f=>f.x!==' '&&f.x!=='?'))throw Error('暂存状态已变化，请刷新后重试');
          if(!s.files.length||JSON.stringify(body.paths)!==JSON.stringify(s.files.map(f=>f.path)))throw Error('文件列表已变化，请重新确认');
          await git(['add','--all','--','.']);
        }else if(!s.files.some(f=>f.x!==' '&&f.x!=='?'))throw Error('请先暂存文件');
        await git(['commit','-m',body.message]);
      } else if(a==='fetch') {if(!s.remote)throw Error('尚未配置远端');await git(['fetch','--all']);fetched=new Date().toISOString();}
      else if(a==='pull'||a==='push') {if(!s.branch||!s.upstream)throw Error('需要分支及上游配置'); if(a==='pull'&&s.files.length)throw Error('请先提交或自行保存工作区更改'); if(a==='pull')await git(['pull','--ff-only','--no-rebase']);else {const remote=(await git(['config','--get',`branch.${s.branch}.remote`])).trim();const ref=(await git(['config','--get',`branch.${s.branch}.merge`])).trim(); if(!remote||!ref.startsWith('refs/heads/'))throw Error('上游配置无效');await git(['push','--',remote,`HEAD:${ref}`]);}}
      else throw Error('未知操作');
      return {ok:true};
    } finally {busy=false;}
  }
  const token=randomBytes(32).toString('hex');let origin;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'Host rejected'});
      const url=new URL(req.url,origin);
      if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      if(url.pathname.startsWith('/api/')) {
        if(req.headers.authorization!==`Bearer ${token}`)return send(401,{error:'请从启动链接打开面板'});
        if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Origin rejected'});
        if(req.method==='GET'&&url.pathname==='/api/state')return send(200,await state());
        if(req.method==='GET'&&url.pathname==='/api/diff')return send(200,{diff:await diff(url.searchParams.get('path'),url.searchParams.get('staged')==='true',url.searchParams.get('commit'))});
        if(req.method==='POST'&&url.pathname==='/api/action') {let data='';for await(const c of req){data+=c;if(data.length>16000)throw Error('请求过大');}return send(200,await act(JSON.parse(data)));}
        return send(404,{error:'Not found'});
      }
      const asset={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[url.pathname];
      if(!asset||req.method!=='GET')return send(404,{error:'Not found'});
      res.writeHead(200,{'Content-Type':asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(await readFile(path.join(web,asset)));
    }catch(e){send(400,{error:e.message});}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
  return {server,url:origin+'/#'+token,origin,token,state,act,diff};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const panel=await createPanel(process.argv[2]);
  if(process.argv[3])await writeFile(process.argv[3],JSON.stringify({url:panel.url,pid:process.pid}));
  else console.log(panel.url);
}
