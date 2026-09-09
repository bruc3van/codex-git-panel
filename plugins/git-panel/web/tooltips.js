// One shared tooltip; dynamic Git state remains the source of its text.
const tip=document.createElement('div');
tip.id='panel-tooltip';tip.className='panel-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
document.body.append(tip);
let anchor=null,showTimer,hideTimer;
function hide(){
 clearTimeout(showTimer);clearTimeout(hideTimer);
 if(anchor){const ids=(anchor.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==tip.id);if(ids.length)anchor.setAttribute('aria-describedby',ids.join(' '));else anchor.removeAttribute('aria-describedby');}
 anchor=null;tip.hidden=true;
}
function position(){
 if(!anchor?.isConnected)return hide();
 const r=anchor.getBoundingClientRect(),box=tip.getBoundingClientRect(),gap=8;
 tip.style.left=Math.max(gap,Math.min(r.left+(r.width-box.width)/2,innerWidth-box.width-gap))+'px';
 tip.style.top=Math.max(gap,r.bottom+box.height+gap<innerHeight?r.bottom+gap:r.top-box.height-gap)+'px';
}
function show(target,delay){
 if(anchor===target&&!tip.hidden){clearTimeout(hideTimer);return;}
 hide();if(!target?.dataset.tip)return;
 anchor=target;
 showTimer=setTimeout(()=>{
  if(!target.isConnected||target.getAttribute('aria-expanded')==='true')return hide();
  tip.textContent=target.dataset.tip;tip.hidden=false;
  target.setAttribute('aria-describedby',[target.getAttribute('aria-describedby'),tip.id].filter(Boolean).join(' '));
  position();
 },delay);
}
function convert(node){
 if(!(node instanceof Element))return;
 for(const el of [node,...node.querySelectorAll('[title]')]){
  if(!el.hasAttribute('title'))continue;
  el.dataset.tip=el.getAttribute('title');el.removeAttribute('title');
  if(el===anchor&&!tip.hidden){tip.textContent=el.dataset.tip;position();}
 }
}
convert(document.body);
new MutationObserver(records=>{
 for(const record of records){if(record.type==='attributes')convert(record.target);else for(const node of record.addedNodes)convert(node);}
 if(anchor&&!anchor.isConnected)hide();
}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
document.addEventListener('pointerover',e=>{if(tip.contains(e.target)){clearTimeout(hideTimer);return;}const target=e.target.closest('[data-tip]');if(target)show(target,450);});
document.addEventListener('pointerout',e=>{if(anchor&&!anchor.contains(e.relatedTarget)&&!tip.contains(e.relatedTarget))hideTimer=setTimeout(hide,120);});
document.addEventListener('focusin',e=>{const target=e.target.closest('[data-tip]');if(target)show(target,200);});
document.addEventListener('focusout',hide);
document.addEventListener('pointerdown',hide,true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
document.addEventListener('scroll',hide,true);
window.addEventListener('resize',hide);
window.addEventListener('blur',hide);
