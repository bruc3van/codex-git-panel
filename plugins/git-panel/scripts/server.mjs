import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, writeFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {runtimePaths, acquireInstance} from './runtime.mjs';
import {createWorkQueue} from './work-queue.mjs';
const exec = promisify(execFile);
const hash = s => createHash('sha256').update(s).digest('hex');
function isInsideRepo(root, resolved) {
  const relative=path.relative(root,resolved);
  return !!relative && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
}
const web = fileURLToPath(new URL('../web/', import.meta.url));
export async function createPanel(directory, {idleTimeoutMs = 10 * 60 * 1000} = {}) {
  const requested = await realpath(directory);
  const runGit=createWorkQueue();
  async function git(args, allowFailure=false, signal) {
    try { return await runGit(async()=> (await exec('git',['--no-pager','-c','core.quotepath=false',...args],{cwd:requested,signal,windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never',GIT_LITERAL_PATHSPECS:'1',GIT_OPTIONAL_LOCKS:'0'}})).stdout,signal); }
    catch(e) { if(signal?.aborted)throw signal.reason; if(allowFailure) return ''; if(e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')throw Error('Git 输出过大，请忽略生成目录或在终端查看'); throw new Error((e.stderr || e.message).trim()); }
  }
  const root = await realpath((await git(['rev-parse','--show-toplevel'])).trim());
  if((await realpath(root)).toLowerCase()!==requested.toLowerCase()) throw new Error('请传入仓库根目录');
  const gitDir=(await git(['rev-parse','--absolute-git-dir'])).trim();
  let busy=false, fetched=null;
  async function files(signal) {
    const raw=await git(['status','--porcelain=v1','-z','--untracked-files=all'],false,signal);
    const chunks=raw.split('\0'), files=[];
    for(let i=0;i<chunks.length;i++) { const s=chunks[i]; if(!s)continue; const f={x:s[0],y:s[1],path:s.slice(3)}; if('RC'.includes(f.x)||'RC'.includes(f.y))f.oldPath=chunks[++i]; files.push(f); }
    return files;
  }
  let pendingState;
  function state() {
    if(!pendingState) {
      const current=readState().finally(()=>{if(pendingState===current)pendingState=null;});
      pendingState=current;
    }
    return pendingState;
  }
  async function readState() {
    const currentFiles=await files();
    const head=(await git(['rev-parse','--verify','HEAD'],true)).trim();
    const branch=(await git(['symbolic-ref','--short','HEAD'],true)).trim();
    const upstream=(await git(['rev-parse','--abbrev-ref','@{upstream}'],true)).trim();
    const counts=upstream?(await git(['rev-list','--left-right','--count','HEAD...@{upstream}'])).trim().split(/\s+/).map(Number):[null,null];
    const upstreamHead=upstream?(await git(['rev-parse','--verify','@{upstream}'])).trim():'';
    const format='--format=%H%x00%h%x00%s%x00%d%x00%ar';
    let logs=head?await git(['log','-25','--topo-order',format,head,...(upstreamHead?[upstreamHead]:[])]):'';
    // Keep both position markers visible even when one is outside the recent page.
    const listed=new Set(logs.split('\n').map(l=>l.split('\0')[0]));
    for(const id of new Set([head,upstreamHead].filter(Boolean)))if(!listed.has(id))logs+=await git(['log','-1',format,id]);
    const history=logs.trim().split('\n').filter(Boolean).map(l=>{const [id,short,subject,refs,when]=l.split('\0');return {id,short,subject,refs,when};});
    let operation='';
    for(const name of ['MERGE_HEAD','rebase-merge','rebase-apply','CHERRY_PICK_HEAD','REVERT_HEAD']) {try{await stat(path.join(gitDir,name));operation=name;break;}catch{}}
    const conflict=currentFiles.some(f=>f.x==='U'||f.y==='U'||['AA','DD'].includes(f.x+f.y));
    const index=await git(['ls-files','--stage','-z']);
    const branches=(await git(['for-each-ref','--format=%(refname:strip=2)','refs/heads/'])).trim().split('\n').filter(Boolean);
    return {upstreamHead,branches,root,branch,upstream,head,files:currentFiles,history,ahead:counts[0],behind:counts[1],snapshot:hash(head+index),busy,operation,conflict,fetched,remote:!!(await git(['remote'])).trim(),worktree:gitDir.replaceAll('\\','/').includes('/worktrees/')};
  }
  async function diff(p, staged, commit, signal) {
    signal?.throwIfAborted();
    if(commit) { if(!/^[a-f0-9]{40}$/.test(commit))throw Error('无效提交'); return await git(['show','--format=fuller','--first-parent','--no-ext-diff','--no-textconv',commit],false,signal); }
    const f=(await files(signal)).find(f=>f.path===p);
    if(!f)throw Error('文件状态已变化，请刷新');
    if(f.x==='?' && !staged) {
      const resolved=await realpath(path.join(root,p));
      if(!isInsideRepo(root,resolved))throw Error('不能预览仓库外的链接目标');
      if((await stat(resolved)).size>512000)return '文件过大，暂不预览';
      const bytes=await readFile(resolved,{signal});if(bytes.includes(0))return '二进制文件';
      return '--- /dev/null\n+++ b/'+p+'\n@@ -0,0 +1,'+bytes.toString().split('\n').length+' @@\n'+bytes.toString().split('\n').map(l=>'+'+l).join('\n');
    }
    return await git(['diff','--no-ext-diff','--no-textconv',...(staged?['--cached']:[]),'--',p,...(f.oldPath?[f.oldPath]:[])],false,signal);
  }
  async function openFile(p) {
    const s=await state();
    if(typeof p!=='string'||!s.files.some(f=>f.path===p))throw Error('文件状态已变化，请刷新');
    const resolved=await realpath(path.join(root,p));
    if(!isInsideRepo(root,resolved)||!(await stat(resolved)).isFile())throw Error('只能打开仓库内的文件');
    if(/\.(exe|com|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|scr|lnk|url|hta|reg)$/i.test(resolved))throw Error('为防止执行脚本或程序，此文件类型不支持通过默认 App 打开');
    if(process.platform!=='win32')throw Error('当前默认 App 打开功能仅支持 Windows');
    await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command','$info = New-Object System.Diagnostics.ProcessStartInfo; $info.FileName = $env:GIT_PANEL_OPEN_PATH; $info.UseShellExecute = $true; [System.Diagnostics.Process]::Start($info) | Out-Null'],{windowsHide:true,timeout:15000,env:{...process.env,GIT_PANEL_OPEN_PATH:resolved}});
    return {ok:true};
  }
  async function act(body) {
    if(busy)throw Error('另一个操作正在执行');busy=true;
    pendingState=null;
    try {
      const s=await readState();
      if(s.operation||s.conflict)throw Error('仓库正在合并、变基或有冲突，请先在终端处理');
      const a=body.action;
      if(['stage','unstage','discard'].includes(a)) {
        const f=s.files.find(f=>f.path===body.path);if(!f)throw Error('文件状态已变化');
        const paths=[f.path,...(f.oldPath?[f.oldPath]:[])];
        if(a==='stage')await git(['add','--',...('RC'.includes(f.x)?[f.path]:paths)]);
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
      } else if(a==='switch') {
        if(typeof body.branch!=='string'||!s.branches.includes(body.branch))throw Error('请选择已有的本地分支');
        if(s.files.length)throw Error('有未提交更改，请先提交后再切换分支');
        await git(['switch','--no-guess','--',body.branch]);
      } else if(a==='fetch') {if(!s.remote)throw Error('尚未配置远端');await git(['fetch','--all']);fetched=new Date().toISOString();}
      else if(a==='pull'||a==='push') {if(!s.branch||!s.upstream)throw Error('需要分支及上游配置'); if(a==='pull'&&s.files.length)throw Error('请先提交或自行保存工作区更改'); if(a==='pull')await git(['pull','--ff-only','--no-rebase']);else {const remote=(await git(['config','--get',`branch.${s.branch}.remote`])).trim();const ref=(await git(['config','--get',`branch.${s.branch}.merge`])).trim(); if(!remote||!ref.startsWith('refs/heads/'))throw Error('上游配置无效');await git(['push','--',remote,`HEAD:${ref}`]);}}
      else throw Error('未知操作');
      return {ok:true};
    } finally {busy=false;pendingState=null;}
  }
  const token=randomBytes(32).toString('hex');let origin;
  let lastActivity=Date.now(), requests=0;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const send=(code,data)=>{if(res.destroyed)return;res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'Host rejected'});
      const url=new URL(req.url,origin);
      if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
      if(url.pathname.startsWith('/api/')) {
        if(req.headers.authorization!==`Bearer ${token}`)return send(401,{error:'请从启动链接打开面板'});
        if(req.headers.origin && req.headers.origin!==origin)return send(403,{error:'Origin rejected'});
        lastActivity=Date.now();requests++;
        res.once('close',()=>{requests--;lastActivity=Date.now();});
        if(req.method==='GET'&&url.pathname==='/api/heartbeat')return send(200,{root,protocol:1});
        if(req.method==='GET'&&url.pathname==='/api/state')return send(200,await state());
        if(req.method==='GET'&&url.pathname==='/api/diff') {
          const controller=new AbortController();
          const cancel=()=>controller.abort();
          res.once('close',cancel);
          try {return send(200,{diff:await diff(url.searchParams.get('path'),url.searchParams.get('staged')==='true',url.searchParams.get('commit'),controller.signal)});}
          finally {res.removeListener('close',cancel);}
        }
        if(req.method==='POST'&&url.pathname==='/api/action') {const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>64000)throw Error('请求过大');chunks.push(c);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));return send(200,body.action==='open'?await openFile(body.path):await act(body));}
        return send(404,{error:'Not found'});
      }
      const asset={'/':'index.html','/app.js':'app.js','/tooltips.js':'tooltips.js','/style.css':'style.css','/icon.svg':'icon.svg'}[url.pathname];
      if(!asset||req.method!=='GET')return send(404,{error:'Not found'});
      res.writeHead(200,{'Content-Type':asset.endsWith('.svg')?'image/svg+xml':asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});res.end(await readFile(path.join(web,asset)));
    }catch(e){send(400,{error:e.message});}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;
  const idleTimer=setInterval(()=>{
    if(!busy&&!requests&&Date.now()-lastActivity>idleTimeoutMs){server.close();server.closeIdleConnections();}
  },Math.min(30000,idleTimeoutMs));
  idleTimer.unref();server.once('close',()=>clearInterval(idleTimer));
  return {server,url:origin+'/#'+token,origin,token,state,act,diff};
}
export async function startPanel(root, {publish = writeFile, create = createPanel} = {}) {
  const paths=await runtimePaths(root);
  const guard=await acquireInstance(paths.socket);
  let panel;
  try {
    panel=await create(root);
    panel.server.once('close',()=>guard.close());
    await publish(paths.record,JSON.stringify({url:panel.url,pid:process.pid}),{mode:0o600});
    return panel;
  } catch(error) {
    if(panel) {
      const closed=new Promise(resolve=>panel.server.close(resolve));
      panel.server.closeAllConnections();
      await closed;
    }
    await new Promise(resolve=>guard.close(resolve));
    throw error;
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {
    const panel=await startPanel(await realpath(process.argv[2]));
    if(!process.argv[3])console.log(panel.url);
  } catch(error) {
    console.error(error.code==='EADDRINUSE'?'Workspace service already running':error.message);
    process.exitCode=1;
  }
}
