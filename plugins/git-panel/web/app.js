const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('git-panel-token');
if(location.hash){sessionStorage.setItem('git-panel-token',token);history.replaceState(null,'',location.pathname);}
let state,selected,busy=false,activeAction='',diffRequest=0;
const staged=f=>f.x!==' '&&f.x!=='?';
const changed=f=>f.y!==' '||f.x==='?';
async function api(url,body){const r=await fetch('/api/'+url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function icon(name){
 const paths={open:'M14 3h7v7m0-7L10 14M10 5H5v14h14v-5',close:'m6 6 12 12M18 6 6 18',chevron:'m8 5 6 7-6 7',branch:'M6 5v14M6 13c8 0 12-2 12-8',light:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',dark:'M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5',auto:'M4 4h16v13H4zM8 21h8m-4-4v4'};
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-icon');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]);svg.append(path);
 for(const [cx,cy,r] of name==='branch'?[[6,4,2],[6,20,2],[18,4,2]]:name==='light'?[[12,12,4]]:[]){const circle=document.createElementNS(svg.namespaceURI,'circle');for(const [key,value] of Object.entries({cx,cy,r}))circle.setAttribute(key,value);svg.append(circle);}
 return svg;
}
function renderBranch(s){const label=el('span',s.branch||'detached HEAD','branch-name');$('branch').replaceChildren(icon('branch'),label,el('span',s.upstream?'已关联上游':'无上游','branch-state'),icon('chevron'));$('branch').title=s.upstream||'尚未配置上游分支';}
function closePreview(){selected=null;++diffRequest;document.body.classList.add('preview-closed');$('diff').replaceChildren();renderFiles();}
async function openInApp(path,button){
 if(button.disabled)return;button.disabled=true;button.classList.add('loading');button.setAttribute('aria-busy','true');status('正在打开文件…');
 try{await api('action',{action:'open',path});status('已请求默认 App 打开文件');}catch(e){status(e.message,true);}finally{button.disabled=busy;button.classList.remove('loading');button.setAttribute('aria-busy','false');}
}
const closeButton=el('button',undefined,'preview-control');closeButton.append(icon('close'));closeButton.title='关闭预览';closeButton.setAttribute('aria-label','关闭预览');closeButton.onclick=()=>{closePreview();$('refresh').focus();};document.querySelector('.diff-heading').append(closeButton);
const openPreview=el('button',undefined,'preview-control');openPreview.append(icon('open'));openPreview.title='用默认 App 打开当前文件';openPreview.setAttribute('aria-label',openPreview.title);openPreview.hidden=true;openPreview.onclick=()=>{if(selected?.path)openInApp(selected.path,openPreview);};$('diffTitle').after(openPreview);
function closeBranches(){$('branchMenu').hidden=true;$('branch').setAttribute('aria-expanded','false');}
$('branch').onclick=()=>{
 const menu=$('branchMenu');if(!menu.hidden)return closeBranches();
 menu.replaceChildren();
 for(const name of state.branches){const b=el('button',name);b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',name===state.branch);b.onclick=()=>{closeBranches();$('branch').focus();if(name!==state.branch)action('switch',{branch:name});};menu.append(b);}
 if(!state.branches.length)menu.append(el('p','没有可切换的本地分支','muted'));
 menu.hidden=false;$('branch').setAttribute('aria-expanded','true');menu.querySelector('button')?.focus();
};
document.addEventListener('click',e=>{if(!e.target.closest('.branch-wrap'))closeBranches();});
document.querySelector('.branch-wrap').addEventListener('focusout',e=>{if(!e.currentTarget.contains(e.relatedTarget))closeBranches();});
$('branchMenu').onkeydown=e=>{if(e.key==='Escape'){closeBranches();$('branch').focus();}if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const items=[...$('branchMenu').querySelectorAll('button')],i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}};
function buttons(){
 const locked=!state||busy||state?.busy||state?.conflict||!!state?.operation;
 const hasChanges=!!state?.files.length, pushMode=!hasChanges&&state?.ahead>0;
 document.querySelectorAll('button').forEach(b=>b.disabled=busy);
 $('commit').textContent=pushMode?`↑ Push ↑${state.ahead}`:'Commit';
 $('commit').disabled=locked||!state?.branch||(pushMode?!state.upstream:!hasChanges||!$('message').value.trim());
 let hint=!state?'正在读取仓库…':state.conflict||state.operation?'请先处理冲突或正在进行的 Git 操作':!state.branch?'请先创建分支':pushMode?'提交已完成，点击 Push 推送到 '+state.upstream:hasChanges?(state.files.some(staged)?'仅提交已暂存内容':'点击 Commit 将暂存全部更改并提交'):!state.upstream?'本地提交已保存；配置上游后才能推送':'工作区干净，没有待提交更改';
 if(hasChanges&&!$('message').value.trim())hint='请输入提交说明。'+hint;
 $('commit').title=hint;
 $('fetch').disabled=locked||!state?.remote;
 for(const a of ['pull','push'])$(a).disabled=locked||!state?.upstream||!state?.branch;
 $('push').textContent=state?.ahead>0?`↑ Push ↑${state.ahead}`:'↑ Push';
 $('pull').textContent='↓ 拉取';$('fetch').textContent='获取';
 if(state)renderBranch(state);$('branch').disabled=locked;
 for(const id of ['branch','pull','push','fetch','commit']){$(id).classList.remove('loading');$(id).setAttribute('aria-busy','false');}
 const target={switch:'branch',pull:'pull',push:'push',fetch:'fetch',commit:'commit'}[activeAction];
 if(target){$(target).textContent={switch:'切换中…',pull:'拉取中…',push:'推送中…',fetch:'获取中…',commit:'提交中…'}[activeAction];$(target).classList.add('loading');$(target).setAttribute('aria-busy','true');}
 document.querySelector('main').setAttribute('aria-busy',busy);
}
async function refresh(){const s=await api('state');if(!state){$('message').value=localStorage.getItem('draft:'+s.root)||'';}state=s;$('repoName').textContent=s.root.split(/[\\/]/).pop();$('root').textContent=s.root;$('root').title=s.root;$('repoName').title=s.root;$('kind').textContent=s.worktree?'worktree':'本地仓库';renderBranch(s);$('warning').hidden=!s.conflict&&!s.operation;$('warning').textContent='仓库有冲突或正在进行 '+s.operation+'，请先在终端处理。';$('counts').textContent=s.upstream?`待拉取 ${s.behind} · 待推送 ${s.ahead}`:'未配置上游 · 本地操作可用';$('lastFetch').textContent=s.fetched?'获取于 '+new Date(s.fetched).toLocaleTimeString():'';renderFiles();renderHistory();buttons();}
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
   const fileIcon=el('span',/\.(m?js|json|css|html)$/.test(base)?'{}':'≡','file-icon');fileIcon.setAttribute('aria-hidden','true');
   const name=el('button',undefined,'filename');name.title=f.path;name.setAttribute('aria-label',f.path);
   name.append(el('span',base,'file-name'),el('span',parts.join('/')||'仓库根目录','file-dir'));
   name.onclick=()=>showDiff({path:f.path,staged:isStaged});row.append(fileIcon,name);
   const open=el('button',undefined,'open-file');open.append(icon('open'));open.title='用默认 App 打开';open.setAttribute('aria-label','用默认 App 打开 '+f.path);open.onclick=()=>openInApp(f.path,open);row.append(open);
   if(!isStaged&&f.x!=='?'){
    const discard=el('button','↶','action');discard.title='放弃未暂存更改';discard.setAttribute('aria-label','放弃 '+f.path+' 的未暂存更改');
    discard.onclick=()=>{if(confirm(`放弃 ${f.path} 的未暂存修改？\n此操作不能通过 Git 撤销。`))action('discard',{path:f.path,confirm:true});};row.append(discard);
   }
   const b=el('button',isStaged?'−':'+','action');b.title=isStaged?'取消暂存':'暂存';b.setAttribute('aria-label',b.title+' '+f.path);
   b.onclick=()=>action(isStaged?'unstage':'stage',{path:f.path});row.append(b,el('span',isStaged?f.x:f.y===' '?'M':f.y,'code'));d.append(row);
  }
  $('groups').append(d);
 }
 if(!state.files.length)$('groups').append(el('p','工作区干净','muted'));
}
function renderHistory(){$('history').replaceChildren();for(const c of state.history){const b=el('button',undefined,'log');b.title=c.subject+'\n'+c.refs+' · '+c.when;b.append(el('span','●','dot'),el('span',c.subject,'subject'),el('small',c.short));b.onclick=()=>showDiff({commit:c.id,title:c.subject});$('history').append(b);}if(!state.history.length)$('history').append(el('p','尚无提交','muted'));}
async function showDiff(selection){
 openPreview.hidden=!selection.path;document.body.classList.remove('preview-closed');selected=selection;const seq=++diffRequest;renderFiles();buttons();
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
 }catch(e){if(seq!==diffRequest)return;status(e.message,true);$('diff').replaceChildren(el('p',e.message,'empty'));}
}
async function action(name,extra={}){if(busy)return;busy=true;activeAction=name;buttons();const labels={stage:'暂存',unstage:'取消暂存',discard:'放弃更改',commit:'提交',fetch:'获取',pull:'拉取',push:'推送',switch:'切换分支'};status(labels[name]+'中…');try{await api('action',{action:name,...extra});if(name==='switch')closePreview();if(name==='commit'){$('message').value='';localStorage.removeItem('draft:'+state.root);}await refresh();if(selected?.commit||state.files.some(f=>f.path===selected?.path))await showDiff(selected);else {closePreview();}status(''+labels[name]+'完成');}catch(e){status(e.message,true);try{await refresh();}catch{}}finally{busy=false;activeAction='';buttons();}}
$('message').oninput=()=>{if(state)localStorage.setItem('draft:'+state.root,$('message').value);buttons();};
$('commit').onclick=()=>{
 if(!state||$('commit').disabled)return;
 if(!state.files.length&&state.ahead>0)return action('push');
 const stageAll=!state.files.some(staged);
 return action('commit',{message:$('message').value,snapshot:state.snapshot,stageAll,paths:state.files.map(f=>f.path)});
};$('message').onkeydown=e=>{if(e.ctrlKey&&e.key==='Enter'&&!$('commit').disabled&&state?.files.length){e.preventDefault();$('commit').click();}};
for(const a of ['fetch','pull','push'])$(a).onclick=()=>action(a);
$('refresh').onclick=async()=>{try{await refresh();if(selected)await showDiff(selected);status('已刷新');}catch(e){status(e.message,true);}};
const mq=matchMedia('(prefers-color-scheme:light)');function theme(){document.body.classList.toggle('light',$('theme').value==='light'||$('theme').value==='auto'&&mq.matches);localStorage.setItem('git-theme',$('theme').value);}$('theme').value=localStorage.getItem('git-theme')||'light';$('theme').onchange=theme;mq.onchange=theme;theme();
$('divider').onpointerdown=e=>{e.preventDefault();$('divider').setPointerCapture(e.pointerId);$('divider').onpointermove=e=>{document.querySelector('aside').style.width=Math.max(210,e.clientX)+'px';};};$('divider').onpointerup=()=>{$('divider').onpointermove=null;};$('divider').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const aside=document.querySelector('aside');aside.style.width=aside.offsetWidth+(e.key==='ArrowLeft'?-20:20)+'px';}};
try{await refresh();status('已连接');}catch(e){status(e.message,true);}

// Resizable history pane, with a keyboard-accessible handle.
const historyPanel=document.querySelector('.history');
const historyDivider=el('div');historyDivider.id='historyDivider';historyDivider.tabIndex=0;
historyDivider.setAttribute('role','separator');historyDivider.setAttribute('aria-label','调整提交历史高度');historyDivider.setAttribute('aria-orientation','horizontal');
historyPanel.before(historyDivider);
let historyRatio=Number(localStorage.getItem('history-ratio'))||0.38;
function resizeHistory(ratio){
 historyRatio=Math.max(0.2,Math.min(0.75,ratio));
 historyPanel.style.height=Math.round(document.querySelector('aside').clientHeight*historyRatio)+'px';
 historyDivider.setAttribute('aria-valuenow',Math.round(historyRatio*100));
}
historyDivider.onpointerdown=e=>{
 e.preventDefault();historyDivider.setPointerCapture(e.pointerId);
 historyDivider.onpointermove=event=>{const rect=document.querySelector('aside').getBoundingClientRect();resizeHistory((rect.bottom-event.clientY)/rect.height);};
};
function finishHistoryDrag(){historyDivider.onpointermove=null;localStorage.setItem('history-ratio',historyRatio);}
historyDivider.onpointerup=finishHistoryDrag;historyDivider.onpointercancel=finishHistoryDrag;
historyDivider.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();resizeHistory(historyRatio+(e.key==='ArrowUp'?0.05:-0.05));finishHistoryDrag();}};
new ResizeObserver(()=>resizeHistory(historyRatio)).observe(document.querySelector('aside'));resizeHistory(historyRatio);

// Custom theme popover instead of the browser's native select popup.
const themeSelect=$('theme');themeSelect.hidden=true;
const themeWrap=el('div',undefined,'theme-wrap');
const themeButton=el('button');themeButton.id='themeButton';themeButton.setAttribute('aria-label','选择主题');themeButton.setAttribute('aria-haspopup','menu');themeButton.setAttribute('aria-expanded','false');
const themeMenu=el('div',undefined,'theme-menu');themeMenu.id='themeMenu';themeMenu.hidden=true;themeMenu.setAttribute('role','menu');themeButton.setAttribute('aria-controls','themeMenu');
const themeNames={light:'浅色',dark:'深色',auto:'跟随系统'};
function syncTheme(){themeButton.replaceChildren(icon(themeSelect.value),el('span',themeNames[themeSelect.value]),icon('chevron'));for(const b of themeMenu.children)b.setAttribute('aria-checked',b.dataset.value===themeSelect.value);}
function closeTheme(){themeMenu.hidden=true;themeButton.setAttribute('aria-expanded','false');}
for(const [value,label] of Object.entries(themeNames)){
 const b=el('button');b.append(icon(value),el('span',label));b.dataset.value=value;b.setAttribute('role','menuitemradio');
 b.onclick=()=>{themeSelect.value=value;theme();syncTheme();closeTheme();themeButton.focus();};themeMenu.append(b);
}
themeButton.onclick=()=>{const opening=themeMenu.hidden;themeMenu.hidden=!opening;themeButton.setAttribute('aria-expanded',opening);if(opening)themeMenu.querySelector('[aria-checked="true"]').focus();};
themeWrap.append(themeButton,themeMenu);themeSelect.after(themeWrap);syncTheme();
document.addEventListener('click',e=>{if(!themeWrap.contains(e.target))closeTheme();});
themeWrap.addEventListener('focusout',e=>{if(!themeWrap.contains(e.relatedTarget))closeTheme();});
themeWrap.addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeTheme();themeButton.focus();}
 if(!themeMenu.hidden&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();const items=[...themeMenu.children];const i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:items.length-1))%items.length].focus();}
});
