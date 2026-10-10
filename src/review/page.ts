// The Council idea-review SPA (served at /admin/review?idea=N). Design matches the
// approved preview; here it is wired to the live API and the logged-in reviewer's
// identity. Client JS deliberately avoids backticks/${} so this stays a clean TS
// template literal.

export function renderReviewPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Council idea review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;450;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --ink-1:#17171a;--ink-2:#3d3d44;--ink-3:#6b6b74;--ink-4:#9a9aa3;
  --bg:#f6f7f8;--card:#fff;--line:#e7e8ea;--line-2:#d8dadd;--rail:#eef0f2;
  --accent:#0e7490;--accent-ink:#0c6276;--accent-soft:#ecfeff;--accent-line:#a5e8f2;
  --amber:#9a6a00;--amber-bg:#fff8e8;--amber-line:#f0dca0;
  --green:#166534;--green-bg:#f0fdf4;--green-line:#bbe8cb;
  --sans:"Geist",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --mono:"Geist Mono",ui-monospace,Menlo,monospace;
  --b1:#8a8f98;--b2:#b4792a;--b3:#2f6bb0;--b4:#2f9e5e;--b5:#15803d;
}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink-1);font-family:var(--sans);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased}
.mast{background:var(--card);border-bottom:1px solid var(--line);padding:14px 30px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.brand{font-weight:600;font-size:15px;letter-spacing:-.01em}
.brand .d{color:var(--ink-4);font-weight:400}
.mast .sp{flex:1}
.who{font-size:12.5px;color:var(--ink-3)}
.who b{color:var(--ink-1);font-weight:550}
.wrap{max-width:1180px;margin:0 auto;padding:24px 30px 90px;display:grid;grid-template-columns:1fr 360px;gap:26px;align-items:start}
@media(max-width:940px){.wrap{grid-template-columns:1fr;padding:18px}}
.idea-panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:26px}
.idea-panel h1{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:0 0 4px}
.idea-panel .st{font-family:var(--mono);font-size:11px;color:var(--ink-4);margin-bottom:12px}
.idea-fld{padding:9px 0;border-top:1px solid var(--line)}
.idea-fld .l{font-size:11px;font-weight:600;color:var(--ink-3);margin-bottom:3px}
.idea-fld .v{font-size:13px;color:var(--ink-2);white-space:pre-wrap;line-height:1.5}
.eyebrow{font-size:12px;font-weight:600;color:var(--accent-ink);margin:0 0 3px}
h2.sec{font-size:19px;font-weight:600;letter-spacing:-.015em;margin:0 0 3px}
.sec-note{color:var(--ink-3);font-size:13px;margin:0 0 16px;max-width:64ch}
.block{margin-bottom:34px}
.rule{font-size:12.5px;color:var(--ink-3);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:9px;padding:11px 13px;margin-bottom:22px;line-height:1.5}
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.item.flag{border-color:var(--amber-line);background:var(--amber-bg)}
.item.ok{border-color:var(--green-line)}
.item-h{display:flex;align-items:baseline;gap:10px;margin-bottom:11px}
.item-h .name{font-weight:550;font-size:15px;letter-spacing:-.01em}
.item-h .wt{font-family:var(--mono);font-size:11px;color:var(--accent-ink);background:var(--accent-soft);border:1px solid var(--accent-line);padding:1px 6px;border-radius:5px}
.item-h .sp{flex:1}
.state{font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:6px}
.state .dot{width:7px;height:7px;border-radius:50%;background:var(--ink-4)}
.state.agreed{color:var(--green)}.state.agreed .dot{background:var(--green)}
.state.await .dot{background:var(--b2)}
.scale{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}
.seg{border:1px solid var(--line-2);background:var(--card);border-radius:8px;padding:9px 0;font-family:var(--mono);font-size:14px;font-weight:500;color:var(--ink-2);cursor:pointer;text-align:center;transition:all .12s}
.seg:hover{border-color:var(--accent-line);color:var(--accent-ink)}
.seg.on{background:var(--accent);border-color:var(--accent);color:#fff}
.yn{display:flex;gap:8px;margin-bottom:10px}
.yn .seg{flex:1;font-family:var(--sans);font-size:13px;font-weight:500;padding:9px 12px}
.yn .seg.on.no{background:var(--ink-2);border-color:var(--ink-2);color:#fff}
.yn .seg.on.yes{background:var(--amber);border-color:var(--amber);color:#fff}
.anchor{font-size:13px;color:var(--ink-2);background:var(--rail);border-radius:8px;padding:9px 12px;margin-bottom:11px;min-height:38px}
.anchor.empty{color:var(--ink-4)}
.reason{width:100%;font-family:var(--sans);font-size:13px;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;resize:vertical;min-height:38px;line-height:1.5;color:var(--ink-1)}
.foot{display:flex;align-items:center;gap:9px;margin-top:11px}
.foot .sp{flex:1}
.who-line{font-size:12px;color:var(--ink-3)}
.who-line b{color:var(--ink-2);font-weight:550}
.btn{font-family:var(--sans);font-size:12.5px;font-weight:500;padding:7px 13px;border-radius:7px;border:1px solid var(--line-2);background:var(--card);color:var(--ink-1);cursor:pointer;transition:all .12s}
.btn:hover{border-color:var(--accent-line);color:var(--accent-ink)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.pri:hover{background:var(--accent-ink)}
.btn:disabled{opacity:.4;cursor:default}
.rail{position:sticky;top:20px}
.result{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.result .top{padding:20px 20px 16px}
.status-chip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;color:var(--ink-2);background:var(--rail);padding:5px 11px;border-radius:20px}
.status-chip .dot{width:8px;height:8px;border-radius:50%}
.score-wrap{display:flex;align-items:flex-end;gap:12px;margin:16px 0 4px}
.score{font-size:54px;font-weight:600;letter-spacing:-.03em;line-height:.9;font-feature-settings:"tnum"}
.score .out{font-size:20px;color:var(--ink-4);font-weight:450}
.band{font-size:16px;font-weight:600}
.band-note{font-size:13px;color:var(--ink-3);margin-top:7px;line-height:1.5}
.meter{margin:16px 0 4px}
.meter .track{display:flex;gap:3px;height:8px}
.meter .bseg{flex:1;border-radius:3px;opacity:.28}
.meter .bseg.live{opacity:1}
.meter .labels{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;color:var(--ink-4);margin-top:5px}
.progress{font-size:12.5px;color:var(--ink-3);margin-top:14px;display:flex;align-items:center;gap:8px}
.progress .bar{flex:1;height:5px;background:var(--rail);border-radius:3px;overflow:hidden}
.progress .fill{height:100%;background:var(--accent);border-radius:3px;transition:width .3s}
.flag-row{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:var(--amber);padding:9px 0;border-top:1px solid var(--amber-line)}
.flag-row .fa{font-weight:600}
.divide{border-top:1px solid var(--line)}
.fb{padding:16px 20px 20px}
.fb h3{font-size:13px;font-weight:600;margin:0 0 9px;color:var(--ink-2)}
.notefield{width:100%;font-family:var(--sans);font-size:13px;padding:9px 11px;border:1px solid var(--line-2);border-radius:8px;resize:vertical;min-height:52px;margin-bottom:12px;color:var(--ink-1)}
.fbhead{display:flex;align-items:center;justify-content:space-between;margin:2px 0 8px}
.fblabel{font-size:13px;font-weight:600;color:var(--ink-2)}
.live-badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--accent-ink);font-weight:500}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(14,116,144,.4)}70%{box-shadow:0 0 0 6px rgba(14,116,144,0)}100%{box-shadow:0 0 0 0 rgba(14,116,144,0)}}
.fbcard{border:1px solid var(--line);border-radius:11px;overflow:hidden;background:var(--card)}
.fbcard.flash{animation:flash .65s ease}
@keyframes flash{0%{box-shadow:0 0 0 2px var(--accent-line)}100%{box-shadow:0 0 0 0 transparent}}
.fbcard .hd{display:flex;align-items:center;justify-content:space-between;padding:10px 13px;border-bottom:1px solid var(--line);background:var(--rail)}
.fbcard .hd .ttl{font-size:12px;font-weight:600;color:var(--ink-2)}
.fbcard .hd .src{font-size:11px;color:var(--ink-4)}
.fbcard .bd{padding:13px}
.fb-idea{font-weight:600;font-size:13.5px;margin-bottom:11px}
.verdict{display:flex;align-items:center;gap:10px;margin-bottom:11px}
.bchip{font-size:12.5px;font-weight:600;padding:4px 11px;border-radius:20px;color:#fff}
.verdict .sc{font-family:var(--mono);font-size:13px;color:var(--ink-2);font-weight:500}
.crit-row{display:flex;gap:9px;align-items:baseline;padding:8px 0;border-top:1px dashed var(--line)}
.crit-row .cn{font-weight:500;font-size:12.5px;width:78px;flex:none}
.crit-row .pill{font-family:var(--mono);font-size:11px;padding:1px 7px;border-radius:5px;background:var(--accent-soft);border:1px solid var(--accent-line);color:var(--accent-ink);flex:none}
.crit-row .cr{font-size:12.5px;color:var(--ink-3);line-height:1.45}
.band-para{font-size:12.5px;color:var(--ink-2);line-height:1.5;border-left:3px solid;padding-left:12px;margin-top:12px}
.council-note{font-size:12.5px;color:var(--ink-2);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:9px;padding:10px 12px;margin-top:12px;line-height:1.5}
.council-note .nl{font-size:11px;color:var(--accent-ink);font-weight:600;margin-bottom:3px}
.ret-row{padding:9px 0;border-top:1px dashed var(--amber-line)}
.ret-row .ra{font-weight:600;font-size:13px;color:var(--amber)}
.ret-row .rf{font-size:12.5px;color:var(--ink-2);margin-top:2px;line-height:1.45}
.ret-row .rn{font-size:12px;color:var(--ink-3);font-style:italic;margin-top:3px}
.empty-fb{color:var(--ink-4);font-size:12.5px;padding:4px 0}
.acts{display:flex;gap:8px}
.msg{font-size:12.5px;color:#a3201f;min-height:18px;margin-top:9px}
.msg.good{color:var(--green)}
.published{font-size:12px;color:var(--green);margin-top:9px}
small.fn{display:block;color:var(--ink-4);font-size:11.5px;margin-top:10px}
.load{padding:70px 20px;text-align:center;color:var(--ink-3)}
</style>
</head>
<body>
<div class="mast">
  <div class="brand">Council idea review <span class="d">· MUME</span></div>
  <div class="sp"></div>
  <div class="who" id="who"></div>
</div>
<div id="root"><div class="load">Loading…</div></div>

<script>
var BANDC=['--b1','--b2','--b3','--b4','--b5'];
var S=null, ideaId=null, draft={}, lastSig='';
function $(id){return document.getElementById(id);}
function el(t,txt,cls){var n=document.createElement(t);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;}
function api(path,opts){return fetch(path,opts).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j;});});}
function isCrit(id){return S.rubric.criteria.some(function(c){return c.id===id;});}
function critById(id){return S.rubric.criteria.filter(function(c){return c.id===id;})[0];}
function checkById(id){return S.rubric.checks.filter(function(c){return c.id===id;})[0];}
function bandColor(b){if(!b)return 'var(--b2)';var i=S.rubric.bands.map(function(x){return x.name;}).indexOf(b.name);return 'var('+BANDC[i<0?1:i]+')';}
function say(t,good){var m=$('msg');if(m){m.textContent=t;m.className='msg'+(good?' good':'');}}

function boot(){
  var p=new URLSearchParams(location.search);ideaId=p.get('idea');
  if(!ideaId){$('root').innerHTML='<div class="load">No idea specified. Open this from an idea\\u2019s review post.</div>';return;}
  load();
}
function load(){return api('/admin/api/assess/'+ideaId).then(function(d){S=d;render();}).catch(function(e){$('root').innerHTML='<div class="load">'+e.message+'</div>';});}

function card(item){
  var crit=isCrit(item.id);
  var a=S.assignments[item.id]||null, d=draft[item.id]||{};
  var seconded=!!(a&&a.seconderId), flagged=seconded&&!crit&&a.value===1;
  var c=el('div',null,'item'+(seconded?(flagged?' flag':' ok'):''));
  var h=el('div',null,'item-h');
  h.appendChild(el('span',item.name,'name'));
  if(item.weight===2)h.appendChild(el('span','counts \\u00d72','wt'));
  h.appendChild(el('span',null,'sp'));
  var st=el('span',null,'state'+(seconded?' agreed':(a?' await':'')));
  st.appendChild(el('span',null,'dot'));
  st.appendChild(document.createTextNode(seconded?'Agreed':(a?'Awaiting second':'Not assessed')));
  h.appendChild(st);c.appendChild(h);

  var cur=d.value!==undefined?d.value:(a?a.value:undefined);
  if(crit){
    var scale=el('div',null,'scale');
    for(var i=1;i<=5;i++){(function(v){var b=el('button',String(v),'seg'+(cur===v?' on':''));b.onclick=function(){draft[item.id]=Object.assign({},draft[item.id],{value:v});render();};scale.appendChild(b);})(i);}
    c.appendChild(scale);
    c.appendChild(el('div',(cur?item.levels[cur-1]:'Select 1 (hardest / least) to 5 (easiest / most).'),'anchor'+(cur?'':' empty')));
  }else{
    var yn=el('div',null,'yn');
    var no=el('button','No \\u2014 this does not apply','seg no'+(cur===0?' on':''));no.onclick=function(){draft[item.id]=Object.assign({},draft[item.id],{value:0});render();};
    var yes=el('button','Yes \\u2014 '+item.action,'seg yes'+(cur===1?' on':''));yes.onclick=function(){draft[item.id]=Object.assign({},draft[item.id],{value:1});render();};
    yn.appendChild(no);yn.appendChild(yes);c.appendChild(yn);
    if(cur===1)c.appendChild(el('div',item.feedback,'anchor'));
  }

  var r=el('textarea',null,'reason');r.placeholder='Reason / supporting evidence';r.value=d.reason!==undefined?d.reason:(a?a.reason:'');
  r.oninput=function(){draft[item.id]=Object.assign({},draft[item.id],{reason:r.value});};
  c.appendChild(r);

  var f=el('div',null,'foot');
  if(a){var wl=el('span',null,'who-line');wl.innerHTML=seconded?('Proposed by <b>'+esc(a.proposerName)+'</b>, seconded by <b>'+esc(a.seconderName)+'</b>'):('Proposed by <b>'+esc(a.proposerName)+'</b>');f.appendChild(wl);}
  f.appendChild(el('span',null,'sp'));
  var pb=el('button',a?'Revise':'Propose','btn');
  pb.onclick=function(){
    var dd=draft[item.id]||{};var v=dd.value!==undefined?dd.value:(a?a.value:undefined);
    if(v===undefined){say('Choose an assessment first.');return;}
    doProp(item.id,v,dd.reason!==undefined?dd.reason:(a?a.reason:''));
  };
  var sb=el('button','Second','btn pri');
  sb.disabled=!a||!!a.seconderId||(a&&a.proposerId===S.me.id);
  sb.onclick=function(){doSecond(item.id,a.revision);};
  f.appendChild(pb);f.appendChild(sb);c.appendChild(f);
  return c;
}
function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function doProp(id,value,reason){
  api('/admin/api/assess/'+ideaId+'/propose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id:id,value:value,reason:reason})})
   .then(function(d){S=d;delete draft[id];render();say('Proposed. A different reviewer seconds it.',true);})
   .catch(function(e){say(e.message);});
}
function doSecond(id,rev){
  api('/admin/api/assess/'+ideaId+'/second',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id:id,revision:rev})})
   .then(function(d){S=d;render();say('Seconded.',true);})
   .catch(function(e){say(e.message);});
}
function doPublish(){
  var note=$('note')?$('note').value:'';
  if(!confirm('Publish this assessment to the idea thread in Discord?'))return;
  api('/admin/api/assess/'+ideaId+'/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:note})})
   .then(function(d){S=d;render();say('Published to the idea thread.',true);})
   .catch(function(e){say(e.message);});
}

function plainFeedback(){
  var r=S.result,L=[S.idea.ref,r.status];
  if(r.flags.length){r.flags.forEach(function(c){L.push(c.action+': '+c.feedback);L.push('Note: '+(S.assignments[c.id]||{}).reason);});}
  else if(r.total!=null){L.push(r.band.name+' \\u00b7 '+r.total+' / 20');S.rubric.criteria.forEach(function(c){var a=S.assignments[c.id];L.push(c.name+': '+a.value+'/5 \\u2014 '+a.reason);});L.push(r.band.feedback);}
  else L.push('Final recommendation pending until every check and score is seconded.');
  var note=$('note')?$('note').value:'';if(note.trim())L.push(note.trim());
  return L.join('\\n\\n');
}

function fbCard(){
  var r=S.result,host=$('fbcard');if(!host)return;host.replaceChildren();
  var hd=el('div',null,'hd');hd.appendChild(el('span','To the idea thread','ttl'));hd.appendChild(el('span',S.assessment.status==='published'?'published':'preview','src'));host.appendChild(hd);
  var bd=el('div',null,'bd');
  bd.appendChild(el('div',S.idea.ref,'fb-idea'));
  if(r.flags.length){
    r.flags.forEach(function(c){var row=el('div',null,'ret-row');row.appendChild(el('div',c.action,'ra'));row.appendChild(el('div',c.feedback,'rf'));row.appendChild(el('div','\\u201c'+(S.assignments[c.id]||{}).reason+'\\u201d','rn'));bd.appendChild(row);});
  }else if(r.total!=null){
    var v=el('div',null,'verdict');var chip=el('span',r.band.name,'bchip');chip.style.background=bandColor(r.band);v.appendChild(chip);v.appendChild(el('span',r.total+' / 20','sc'));bd.appendChild(v);
    S.rubric.criteria.forEach(function(c){var a=S.assignments[c.id];var row=el('div',null,'crit-row');row.appendChild(el('span',c.name,'cn'));row.appendChild(el('span',a.value+'/5','pill'));row.appendChild(el('span',a.reason,'cr'));bd.appendChild(row);});
    var bp=el('div',r.band.feedback,'band-para');bp.style.borderColor=bandColor(r.band);bd.appendChild(bp);
  }else{
    bd.appendChild(el('div','The recommendation appears here once every check and score has been seconded.','empty-fb'));
  }
  var note=$('note')?$('note').value:'';if(note.trim()){var n=el('div',null,'council-note');n.appendChild(el('div','Council note','nl'));n.appendChild(el('div',note.trim()));bd.appendChild(n);}
  host.appendChild(bd);
  var sig=JSON.stringify([r.status,r.total,r.flags.map(function(f){return f.id;}),Object.keys(S.assignments).map(function(k){var a=S.assignments[k];return [k,a.value,!!a.seconderId];})]);
  if(sig!==lastSig){lastSig=sig;host.classList.remove('flash');void host.offsetWidth;host.classList.add('flash');}
}

function render(){
  $('who').innerHTML='Reviewing as <b>'+esc(S.me.name)+'</b>';
  var root=$('root');root.replaceChildren();
  var wrap=el('div',null,'wrap');
  var main=el('div',null,'main');

  // idea panel
  var ip=el('div',null,'idea-panel');
  ip.appendChild(el('h1',S.idea.ref));
  ip.appendChild(el('div','status: '+S.idea.status,'st'));
  S.idea.content.forEach(function(f){var fl=el('div',null,'idea-fld');fl.appendChild(el('div',f.label,'l'));fl.appendChild(el('div',f.text,'v'));ip.appendChild(fl);});
  main.appendChild(ip);

  main.appendChild(el('div','Each check and each score is proposed by one member, then seconded by another. You cannot second your own. Revising clears its second. Nothing is published to Discord until you choose to.','rule'));

  var b1=el('div',null,'block');b1.appendChild(el('p','Step one','eyebrow'));b1.appendChild(el('h2','Review checks','sec'));
  b1.appendChild(el('p','Six gates. A seconded \\u201cyes\\u201d returns the idea to the author and sets the score aside until it is resolved.','sec-note'));
  var cw=el('div');S.rubric.checks.forEach(function(c){cw.appendChild(card(c));});b1.appendChild(cw);main.appendChild(b1);

  var b2=el('div',null,'block');b2.appendChild(el('p','Step two','eyebrow'));b2.appendChild(el('h2','Score the idea','sec'));
  b2.appendChild(el('p','Usefulness plus Feasibility (counted twice) plus Interest, giving 4 to 20. Feasibility measures effort only: higher means less work.','sec-note'));
  var sw=el('div');S.rubric.criteria.forEach(function(c){sw.appendChild(card(c));});b2.appendChild(sw);main.appendChild(b2);

  wrap.appendChild(main);

  // rail
  var rail=el('div',null,'rail');
  var res=el('div',null,'result');
  res.appendChild(el('div',null,'top'));res.lastChild.id='rtop';
  res.appendChild(el('div',null,'divide'));
  var fb=el('div',null,'fb');
  fb.appendChild(el('h3','Council feedback'));
  var note=el('textarea',null,'notefield');note.id='note';note.placeholder='Add specific guidance or links for the author\\u2026';
  note.oninput=function(){renderResult();};fb.appendChild(note);
  var fh=el('div',null,'fbhead');fh.appendChild(el('span','Author feedback','fblabel'));var lb=el('span',null,'live-badge');lb.appendChild(el('span',null,'live-dot'));lb.appendChild(document.createTextNode('updates live'));fh.appendChild(lb);fb.appendChild(fh);
  var fc=el('div',null,'fbcard');fc.id='fbcard';fb.appendChild(fc);
  var acts=el('div',null,'acts');
  var pub=el('button',S.assessment.status==='published'?'Publish again':'Publish to Discord','btn pri');pub.id='pub';pub.onclick=doPublish;
  var cp=el('button','Copy','btn');cp.onclick=function(){navigator.clipboard.writeText(plainFeedback()).then(function(){say('Feedback copied.',true);},function(){say('Copy unavailable.');});};
  acts.appendChild(pub);acts.appendChild(cp);fb.appendChild(acts);
  fb.appendChild(el('div',null,'msg'));fb.lastChild.id='msg';
  if(S.assessment.published_at){fb.appendChild(el('div','Last published to the thread.','published'));}
  fb.appendChild(el('small','Publishing posts the assessment to the idea\\u2019s review thread. It does not change the idea\\u2019s status.','fn'));
  res.appendChild(fb);rail.appendChild(res);wrap.appendChild(rail);

  root.appendChild(wrap);
  renderResult();
}

function renderResult(){
  var r=S.result,top=$('rtop');if(!top)return;top.replaceChildren();
  var chip=el('span',null,'status-chip');var dot=el('span',null,'dot');dot.style.background=r.band?bandColor(r.band):(r.flags.length?'var(--amber)':'var(--b2)');chip.appendChild(dot);chip.appendChild(document.createTextNode(r.status));top.appendChild(chip);
  if(r.total!=null){
    var swp=el('div',null,'score-wrap');var sc=el('div',null,'score');sc.appendChild(document.createTextNode(r.total));sc.appendChild(el('span',' / 20','out'));swp.appendChild(sc);top.appendChild(swp);
    var bn=el('div',r.band.name,'band');bn.style.color=bandColor(r.band);top.appendChild(bn);
    top.appendChild(el('div',r.band.feedback,'band-note'));
    var m=el('div',null,'meter');var tr=el('div',null,'track');
    S.rubric.bands.forEach(function(b,i){var seg=el('div',null,'bseg'+(b.name===r.band.name?' live':''));seg.style.background='var('+BANDC[i]+')';tr.appendChild(seg);});
    m.appendChild(tr);var lab=el('div',null,'labels');lab.appendChild(el('span','4'));lab.appendChild(el('span','20'));m.appendChild(lab);top.appendChild(m);
  }else if(r.flags.length){
    r.flags.forEach(function(c){var row=el('div',null,'flag-row');row.appendChild(el('span',c.action,'fa'));row.appendChild(el('span',' \\u2014 '+c.feedback));top.appendChild(row);});
  }
  var total=S.rubric.checks.length+S.rubric.criteria.length;
  var pr=el('div',null,'progress');pr.appendChild(document.createTextNode(r.secondedCount+' of '+total+' seconded'));
  var bar=el('div',null,'bar');var fill=el('div',null,'fill');fill.style.width=(r.secondedCount/total*100)+'%';bar.appendChild(fill);pr.appendChild(bar);top.appendChild(pr);
  fbCard();
}

boot();
</script>
</body>
</html>`;
}
