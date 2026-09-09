const $=id=>document.getElementById(id);
const commitHint=document.createElement('p');commitHint.id='commitHint';commitHint.className='muted';commitHint.setAttribute('aria-live','polite');$('commit').after(commitHint);
const token=location.hash.slice(1)||sessionStorage.getItem('git-panel-token');
if(location.hash){sessionStorage.setItem('git-panel-token',token);history.replaceState(null,'',location.pathname);}
let state,selected,busy=false,diffRequest=0;
const staged=f=>f.x!==' '&&f.x!=='?';
const changed=f=>f.y!==' '||f.x==='?';
async function api(url,body){const r=await fetch('/api/'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function buttons(){
 const locked=!state||busy||state?.busy||state?.conflict||!!state?.operation;
 const hasChanges=!!state?.files.length, pushMode=!hasChanges&&state?.ahead>0;
 document.querySelectorAll('button').forEach(b=>b.disabled=busy);
 $('commit').textContent=pushMode?`↑ Push ↑${state.ahead}`:'✓ Commit';
 $('commit').disabled=locked||!state?.branch||(pushMode?!state.upstream:!hasChanges||!$('message').value.trim());
 let hint=!state?'正在读取仓库…':state.conflict||state.operation?'请先处理冲突或正在进行的 Git 操作':!state.branch?'请先创建分支':pushMode?'提交已完成，点击 Push 推送到 '+state.upstream:hasChanges?(state.files.some(staged)?'仅提交已暂存内容':'点击 Commit 后确认暂存全部并提交'):!state.upstream?'本地提交已保存；配置上游后才能推送':'工作区干净，没有待提交更改';
 if(hasChanges&&!$('message').value.trim())hint='请输入提交说明。'+hint;
 $('commitHint').textContent=hint;$('commit').title=hint;
 $('fetch').disabled=locked||!state?.remote;
 for(const a of ['pull','push'])$(a).disabled=locked||!state?.upstream||!state?.branch;
 $('push').textContent=state?.ahead>0?`↑ Push ↑${state.ahead}`:'↑ Push';
}
async function refresh(){const s=await api('state');if(!state){$('message').value=localStorage.getItem('draft:'+s.root)||'';}state=s;$('repoName').textContent=s.root.split(/[\\/]/).pop();$('root').textContent=s.root;$('root').title=s.root;$('kind').textContent=s.worktree?'worktree':'本地仓库';$('branch').textContent='⑂ '+(s.branch||'detached HEAD')+(s.upstream?' → '+s.upstream:' · 无上游');$('warning').hidden=!s.conflict&&!s.operation;$('warning').textContent='仓库有冲突或正在进行 '+s.operation+'，请先在终端处理。';$('counts').textContent=s.upstream?`待拉取 ${s.behind} · 待推送 ${s.ahead}`:'未配置上游 · 本地操作可用';$('lastFetch').textContent=s.fetched?'获取于 '+new Date(s.fetched).toLocaleTimeString():'';renderFiles();renderHistory();buttons();}
function renderFiles(){
 const collapsed=new Set([...$('groups').querySelectorAll('details')].filter(d=>!d.open).map(d=>d.dataset.group));
 $('groups').replaceChildren();
 for(const [title,isStaged,filter] of [['已暂存的更改',true,staged],['更改',false,changed]]){
  const list=state.files.filter(filter);if(!list.length)continue;
  const d=el('details');d.dataset.group=title;d.open=!collapsed.has(title);
  const summary=el('summary',title);summary.append(el('span',list.length,'count'));d.append(summary);
  for(const f of list){
   const row=el('div',undefined,'file');if(selected?.path===f.path&&selected?.staged===isStaged)row.classList.add('selected');
   const parts=f.path.split('/'),base=parts.pop();
   const icon=el('span',/\.(m?js|json|css|html)$/.test(base)?'{}':'≡','file-icon');icon.setAttribute('aria-hidden','true');
   const name=el('button',undefined,'filename');name.title=f.path;name.setAttribute('aria-label',f.path);
   name.append(el('span',base,'file-name'),el('span',parts.join('/')||'仓库根目录','file-dir'));
   name.onclick=()=>showDiff({path:f.path,staged:isStaged});row.append(icon,name);
   if(!isStaged&&f.x!=='?'){
    const discard=el('button','↶','action');discard.title='放弃未暂存更改';discard.setAttribute('aria-label','放弃 '+f.path+' 的未暂存更改');
    discard.onclick=()=>{if(confirm(`放弃 ${f.path} 的未暂存修改？\n此操作不能通过 Git 撤销。`))action('discard',{path:f.path,confirm:true});};row.append(discard);
   }
   const b=el('button',isStaged?'−':'+','action');b.title=isStaged?'取消暂存':'暂存';b.setAttribute('aria-label',b.title+' '+f.path);
   b.onclick=()=>action(isStaged?'unstage':'stage',{path:f.path});row.append(b,el('span',isStaged?f.x:f.y===' '?'M':f.y,'code'));d.append(row);
  }
  $('groups').append(d);
 }
 if(!state.files.length)$('groups').append(el('p','✓ 工作区干净','muted'));
}
function renderHistory(){$('history').replaceChildren();for(const c of state.history){const b=el('button',undefined,'log');b.title=c.subject+'\n'+c.refs+' · '+c.when;b.append(el('span','●','dot'),el('span',c.subject,'subject'),el('small',c.short));b.onclick=()=>showDiff({commit:c.id,title:c.subject});$('history').append(b);}if(!state.history.length)$('history').append(el('p','尚无提交','muted'));}
async function showDiff(selection){
 selected=selection;const seq=++diffRequest;renderFiles();buttons();
 $('diffTitle').textContent=selection.title||selection.path.split('/').pop();$('diffTitle').title=selection.title||selection.path;
 $('diffType').textContent=selection.commit?'提交 · 第一父提交比较':selection.staged?'暂存区':'工作区';
 try{
  const data=await api('diff?'+new URLSearchParams(selection));if(seq!==diffRequest)return;
  $('diff').replaceChildren();let old=0,next=0,inHunk=false;
  for(const line of (data.diff||'没有差异').split('\n')){
   const h=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
   if(h){old=Number(h[1]);next=Number(h[2]);inHunk=true;}
   if(line.startsWith('diff '))inHunk=false;
   const meta=h||!inHunk;let a='',b='';
   if(!meta&&/^[ +\-]/.test(line)){if(!line.startsWith('+'))a=old++;if(!line.startsWith('-'))b=next++;}
   const row=el('div',undefined,'line '+(meta?'meta':line.startsWith('+')?'add':line.startsWith('-')?'del':''));
   row.append(el('span',a,'number'),el('span',b,'number'),el('code',line));$('diff').append(row);
  }
 }catch(e){status(e.message,true);$('diff').replaceChildren(el('p',e.message,'empty'));}
}
async function action(name,extra={}){if(busy)return;busy=true;buttons();const labels={stage:'暂存',unstage:'取消暂存',discard:'放弃更改',commit:'提交',fetch:'获取',pull:'拉取',push:'推送'};status(labels[name]+'中…');try{await api('action',{action:name,...extra});if(name==='commit'){$('message').value='';localStorage.removeItem('draft:'+state.root);}await refresh();if(selected?.commit||state.files.some(f=>f.path===selected?.path))await showDiff(selected);else {selected=null;$('diffTitle').textContent='更改预览';$('diff').replaceChildren(el('p','操作完成，请选择文件查看差异。','empty'));}status('✓ '+labels[name]+'完成');}catch(e){status(e.message,true);try{await refresh();}catch{}}finally{busy=false;buttons();}}
$('message').oninput=()=>{if(state)localStorage.setItem('draft:'+state.root,$('message').value);buttons();};
$('commit').onclick=()=>{
 if(!state||$('commit').disabled)return;
 if(!state.files.length&&state.ahead>0)return action('push');
 const stageAll=!state.files.some(staged);
 if(stageAll&&!confirm(`当前没有暂存文件。\n将以下 ${state.files.length} 个文件暂存并提交：\n${state.files.map(f=>f.path).join('\n')}\n\n提交说明：${$('message').value}\n确认继续？`))return;
 return action('commit',{message:$('message').value,snapshot:state.snapshot,stageAll,paths:state.files.map(f=>f.path)});
};$('message').onkeydown=e=>{if(e.ctrlKey&&e.key==='Enter'&&!$('commit').disabled&&state?.files.length){e.preventDefault();$('commit').click();}};
for(const a of ['fetch','pull','push'])$(a).onclick=()=>action(a);
$('refresh').onclick=async()=>{try{await refresh();if(selected)await showDiff(selected);status('✓ 状态已刷新');}catch(e){status(e.message,true);}};
$('toggleHistory').onclick=()=>{$('history').hidden=!$('history').hidden;$('toggleHistory').setAttribute('aria-expanded',!$('history').hidden);};
const mq=matchMedia('(prefers-color-scheme:light)');function theme(){document.body.classList.toggle('light',$('theme').value==='light'||$('theme').value==='auto'&&mq.matches);localStorage.setItem('git-theme',$('theme').value);}$('theme').value=localStorage.getItem('git-theme')||'light';$('theme').onchange=theme;mq.onchange=theme;theme();
$('divider').onpointerdown=e=>{e.preventDefault();$('divider').setPointerCapture(e.pointerId);$('divider').onpointermove=e=>{document.querySelector('aside').style.width=Math.max(210,e.clientX)+'px';};};$('divider').onpointerup=()=>{$('divider').onpointermove=null;};$('divider').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const aside=document.querySelector('aside');aside.style.width=aside.offsetWidth+(e.key==='ArrowLeft'?-20:20)+'px';}};
try{await refresh();status('✓ 已连接 · 选择文件查看差异');const f=state.files.find(changed)||state.files[0];if(f)await showDiff({path:f.path,staged:!changed(f)});}catch(e){status(e.message,true);}
