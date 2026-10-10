// The admin CMS: a self-contained visual editor for the form config. Served at
// /admin to logged-in Council members. Reads/writes via /admin/config (cookie
// auth). Plain browser page, so inline CSS/JS is fine (no Activity CSP here).
//
// The client JS deliberately uses no template literals or ${} so this whole file
// stays one clean TS template literal.

export function renderAdminPage(): string {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MUME Idea Submission — form editor</title>
<style>
:root{--bg:#1E1F22;--panel:#2B2D31;--raised:#313338;--input:#1E1F22;--text:#F2F3F5;
  --body:#DBDEE1;--muted:#B5BAC1;--faint:#949BA4;--rule:#3F4147;--blurple:#5865F2;
  --blurple-hover:#4752C4;--green:#248046;--red:#DA373C;--amber:#F0B232;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--body);font-family:'gg sans','Noto Sans',system-ui,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45}
.top{position:sticky;top:0;z-index:10;background:var(--panel);border-bottom:1px solid var(--rule);
  display:flex;align-items:center;gap:12px;padding:12px 20px;flex-wrap:wrap}
.top h1{font-size:16px;margin:0;color:var(--text);font-weight:700}
.badge{font-size:12px;color:var(--faint);background:var(--input);border-radius:10px;padding:2px 10px}
.spacer{flex:1}
.wrap{max-width:860px;margin:0 auto;padding:24px 20px 120px}
.btn{font:inherit;font-size:14px;font-weight:600;border:0;border-radius:4px;padding:8px 14px;cursor:pointer;background:var(--raised);color:var(--text)}
.btn:hover{background:var(--rule)}
.btn.primary{background:var(--blurple);color:#fff}.btn.primary:hover{background:var(--blurple-hover)}
.btn.small{padding:4px 9px;font-size:12.5px}
.btn.icon{padding:4px 8px;font-size:13px;background:var(--input)}
.btn.danger{color:#fca}
a.btn{text-decoration:none;display:inline-block}
.status{font-size:13px;padding:6px 12px;border-radius:4px;min-height:0}
.status.ok{background:rgba(36,128,70,.18);color:#7fe0a0}
.status.err{background:rgba(218,55,60,.16);color:#fca}
h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:34px 0 12px;border-bottom:1px solid var(--rule);padding-bottom:8px}
.card{background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;margin-bottom:12px}
.card .head{display:flex;align-items:center;gap:9px;margin-bottom:10px}
.type{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#fff;background:var(--blurple);border-radius:4px;padding:2px 7px}
.type.radio,.type.checkbox{background:var(--amber);color:#000}
.type.textarea{background:var(--green)}
.fid{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--faint)}
label.lbl{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:9px 0 3px}
input[type=text],input[type=number],textarea,select{width:100%;background:var(--input);color:var(--body);
  border:1px solid var(--rule);border-radius:4px;padding:8px 10px;font:inherit;font-size:14px}
textarea{min-height:52px;resize:vertical}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--blurple)}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:140px}
.chk{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--body);margin-top:6px}
.chk input{width:auto}
.opts{margin-top:10px;border-top:1px solid var(--rule);padding-top:10px}
.opt{display:flex;gap:7px;align-items:flex-start;margin-bottom:7px}
.opt .g{flex:1;display:flex;flex-direction:column;gap:5px}
.opt .v{max-width:130px}
.muted{color:var(--faint);font-size:12.5px}
.pagehdr{display:flex;align-items:center;gap:10px;margin:20px 0 8px}
.pagehdr input{max-width:280px}
.addrow{display:flex;gap:8px;align-items:center;margin:6px 0 26px;flex-wrap:wrap}
.intro textarea{margin-bottom:7px}
.savebar{position:fixed;left:0;right:0;bottom:0;background:var(--panel);border-top:1px solid var(--rule);
  display:flex;align-items:center;gap:14px;padding:12px 20px;z-index:10}
</style>
</head>
<body>
<div class="top">
  <h1>MUME Idea Submission</h1>
  <span class="badge" id="ver">form editor</span>
  <div class="spacer"></div>
  <a class="btn small" href="/admin/export?status=approved">Export approved (CSV)</a>
  <a class="btn small" href="/admin/export">Export all (CSV)</a>
  <a class="btn small" href="/" target="_blank" rel="noopener">View live form</a>
  <button class="btn small" id="reload">Reload</button>
  <a class="btn small" href="/admin/logout">Log out</a>
</div>
<div class="wrap"><div id="editor"></div></div>
<div class="savebar">
  <button class="btn primary" id="save">Save changes</button>
  <span class="status" id="status"></span>
  <div class="spacer"></div>
  <span class="muted">Saving publishes instantly and bumps the version. Old ideas keep their original wording.</span>
</div>
<script>
(function(){
  var cfg=null, editor=document.getElementById('editor'), statusEl=document.getElementById('status'), verEl=document.getElementById('ver');
  function setStatus(m,k){statusEl.textContent=m||'';statusEl.className='status '+(k||'');}
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
  function inp(val,on,attrs){var i=document.createElement('input');i.type=(attrs&&attrs.type)||'text';
    if(attrs&&attrs.placeholder)i.placeholder=attrs.placeholder;if(val!=null)i.value=val;
    i.addEventListener('input',function(){on(i.type==='number'?(i.value===''?undefined:parseInt(i.value,10)):i.value);});return i;}
  function ta(val,on,ph){var t=document.createElement('textarea');if(ph)t.placeholder=ph;if(val!=null)t.value=val;
    t.addEventListener('input',function(){on(t.value);});return t;}
  function lbl(text){return el('label','lbl',text);}
  function btn(text,cls,on){var b=el('button','btn '+(cls||''),text);b.type='button';b.addEventListener('click',on);return b;}

  function allFieldIds(){var a=[];cfg.pages.forEach(function(p){p.fields.forEach(function(f){a.push(f.id);});});return a;}
  function inArr(arr,v){return arr&&arr.indexOf(v)!==-1;}
  function toggleArr(getArr,setArr,v,on){var a=(getArr()||[]).slice();var i=a.indexOf(v);
    if(on&&i===-1)a.push(v);if(!on&&i!==-1)a.splice(i,1);setArr(a);}
  function slug(s){return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,32);}
  function move(arr,i,d){var j=i+d;if(j<0||j>=arr.length)return;var t=arr[i];arr[i]=arr[j];arr[j]=t;}

  function render(){
    editor.innerHTML='';
    verEl.textContent='version '+(cfg.version||'?');

    // Intro
    editor.appendChild(el('h2',null,'Intro (shown at the top of the form)'));
    var introWrap=el('div','intro');
    (cfg.intro||[]).forEach(function(line,i){
      var row=el('div','opt');
      var t=ta(line,function(v){cfg.intro[i]=v;});t.style.minHeight='44px';
      row.appendChild(t);
      row.appendChild(btn('✕','icon',function(){cfg.intro.splice(i,1);render();}));
      introWrap.appendChild(row);
    });
    introWrap.appendChild(btn('+ Add intro line','small',function(){if(!cfg.intro)cfg.intro=[];cfg.intro.push('');render();}));
    editor.appendChild(introWrap);

    // Pages + fields
    cfg.pages.forEach(function(page,pi){
      var ph=el('div','pagehdr');
      var h2=el('h2',null,'Page '+(pi+1));h2.style.margin='0';h2.style.border='0';
      ph.appendChild(h2);
      ph.appendChild(inp(page.title,function(v){page.title=v;},{placeholder:'Page title'}));
      editor.appendChild(ph);

      page.fields.forEach(function(f,fi){editor.appendChild(fieldCard(page,pi,f,fi));});

      // add field
      var add=el('div','addrow');
      var sel=document.createElement('select');
      ['text','textarea','radio','checkbox'].forEach(function(tp){var o=document.createElement('option');o.value=tp;o.textContent=tp;sel.appendChild(o);});
      sel.style.maxWidth='140px';
      var idIn=inp('',function(){},{placeholder:'new question id (optional)'});idIn.style.maxWidth='220px';
      add.appendChild(el('span','muted','Add question:'));
      add.appendChild(sel);add.appendChild(idIn);
      add.appendChild(btn('+ Add','small',function(){
        var type=sel.value;var id=slug(idIn.value)|| (type+'_'+(allFieldIds().length+1));
        if(inArr(allFieldIds(),id)){setStatus('Field id "'+id+'" already exists.','err');return;}
        var nf={id:id,type:type,label:'New question',help:'',required:false};
        if(type==='text'||type==='textarea'){nf.maxLength=type==='textarea'?1000:100;nf.placeholder='';}
        if(type==='radio'||type==='checkbox'){nf.options=[{value:'option_1',label:'Option 1',description:''}];}
        page.fields.push(nf);render();
      }));
      editor.appendChild(add);
    });

    // Embed
    editor.appendChild(el('h2',null,'Posted card'));
    var ce=el('div','card');
    var r=el('div','row');
    var d1=el('div');d1.appendChild(lbl('Card title uses'));d1.appendChild(fieldSelect(cfg.embed.titleField,function(v){cfg.embed.titleField=v;}));
    var d2=el('div');d2.appendChild(lbl('Card body uses'));d2.appendChild(fieldSelect(cfg.embed.bodyField,function(v){cfg.embed.bodyField=v;}));
    r.appendChild(d1);r.appendChild(d2);ce.appendChild(r);
    ce.appendChild(el('div','muted','Per question, use the "Summary on card" / "Full text on card" toggles above.'));
    editor.appendChild(ce);
  }

  function fieldSelect(value,on){
    var s=document.createElement('select');
    allFieldIds().forEach(function(id){var o=document.createElement('option');o.value=id;o.textContent=id;if(id===value)o.selected=true;s.appendChild(o);});
    s.addEventListener('change',function(){on(s.value);});return s;
  }

  function fieldCard(page,pi,f,fi){
    var c=el('div','card');
    var head=el('div','head');
    head.appendChild(el('span','type '+f.type,f.type));
    head.appendChild(el('span','fid',f.id));
    var sp=el('div','spacer');sp.style.flex='1';head.appendChild(sp);
    head.appendChild(btn('↑','icon small',function(){move(page.fields,fi,-1);render();}));
    head.appendChild(btn('↓','icon small',function(){move(page.fields,fi,1);render();}));
    head.appendChild(btn('Delete','icon small danger',function(){
      page.fields.splice(fi,1);
      ['summaryFields','detailFields'].forEach(function(k){if(cfg.embed[k])cfg.embed[k]=cfg.embed[k].filter(function(x){return x!==f.id;});});
      render();
    }));
    c.appendChild(head);

    c.appendChild(lbl('Question label'));
    c.appendChild(inp(f.label,function(v){f.label=v;}));
    c.appendChild(lbl('Help text (small print under the label)'));
    c.appendChild(inp(f.help||'',function(v){f.help=v;}));

    var row=el('div','row');
    var reqd=el('div');
    var chk=el('label','chk');var cb=document.createElement('input');cb.type='checkbox';cb.checked=!!f.required;
    cb.addEventListener('change',function(){f.required=cb.checked;});chk.appendChild(cb);chk.appendChild(el('span',null,'Required'));
    reqd.appendChild(lbl('Required?'));reqd.appendChild(chk);
    row.appendChild(reqd);
    if(f.type==='text'||f.type==='textarea'){
      var mx=el('div');mx.appendChild(lbl('Max characters'));mx.appendChild(inp(f.maxLength,function(v){f.maxLength=v;},{type:'number'}));row.appendChild(mx);
    }
    c.appendChild(row);

    if(f.type==='text'||f.type==='textarea'){
      c.appendChild(lbl('Placeholder (grey example text)'));
      c.appendChild(inp(f.placeholder||'',function(v){f.placeholder=v;}));
    }

    var row2=el('div','row');
    var en=el('div');en.appendChild(lbl('Error name (used in "please provide ___")'));en.appendChild(inp(f.errorName||'',function(v){f.errorName=v;}));
    var eln=el('div');eln.appendChild(lbl('Card label (short name on the posted card)'));eln.appendChild(inp(f.embedLabel||'',function(v){f.embedLabel=v;}));
    row2.appendChild(en);row2.appendChild(eln);c.appendChild(row2);

    if(f.type==='radio'||f.type==='checkbox'){
      var opts=el('div','opts');
      opts.appendChild(el('div','muted','Choices'));
      (f.options||[]).forEach(function(o,oi){
        var orow=el('div','opt');
        var v=inp(o.value,function(val){o.value=val;},{placeholder:'value'});v.className='v';
        var g=el('div','g');
        g.appendChild(inp(o.label,function(val){o.label=val;},{placeholder:'Choice label'}));
        g.appendChild(inp(o.description||'',function(val){o.description=val;},{placeholder:'Description (optional)'}));
        orow.appendChild(v);orow.appendChild(g);
        orow.appendChild(btn('↑','icon small',function(){move(f.options,oi,-1);render();}));
        orow.appendChild(btn('↓','icon small',function(){move(f.options,oi,1);render();}));
        orow.appendChild(btn('✕','icon small',function(){f.options.splice(oi,1);render();}));
        opts.appendChild(orow);
      });
      opts.appendChild(btn('+ Add choice','small',function(){if(!f.options)f.options=[];
        f.options.push({value:'option_'+(f.options.length+1),label:'New choice',description:''});render();}));
      c.appendChild(opts);
    }

    // Card display toggles
    var disp=el('div','row');disp.style.marginTop='10px';
    var s1=el('label','chk');var c1=document.createElement('input');c1.type='checkbox';c1.checked=inArr(cfg.embed.summaryFields,f.id);
    c1.addEventListener('change',function(){toggleArr(function(){return cfg.embed.summaryFields;},function(a){cfg.embed.summaryFields=a;},f.id,c1.checked);});
    s1.appendChild(c1);s1.appendChild(el('span',null,'Summary on card'));
    var s2=el('label','chk');var c2=document.createElement('input');c2.type='checkbox';c2.checked=inArr(cfg.embed.detailFields,f.id);
    c2.addEventListener('change',function(){toggleArr(function(){return cfg.embed.detailFields;},function(a){cfg.embed.detailFields=a;},f.id,c2.checked);});
    s2.appendChild(c2);s2.appendChild(el('span',null,'Full text on card'));
    disp.appendChild(s1);disp.appendChild(s2);c.appendChild(disp);

    return c;
  }

  function load(){
    setStatus('Loading…');
    fetch('/admin/config',{headers:{'Accept':'application/json'}}).then(function(r){
      if(r.status===401){location.href='/admin';return null;}
      return r.json();
    }).then(function(d){
      if(!d)return;
      if(!d.config){setStatus('No form config found. Seed it first.','err');return;}
      cfg=d.config;if(!cfg.embed.summaryFields)cfg.embed.summaryFields=[];if(!cfg.embed.detailFields)cfg.embed.detailFields=[];
      setStatus('');render();
    }).catch(function(e){setStatus('Load failed: '+e,'err');});
  }

  function save(){
    setStatus('Saving…');
    fetch('/admin/config',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)}).then(function(r){
      return r.json().then(function(d){return {status:r.status,d:d};});
    }).then(function(res){
      if(res.status===200&&res.d.ok){cfg.version=res.d.version;verEl.textContent='version '+res.d.version;setStatus('Saved. Now live as version '+res.d.version+'.','ok');}
      else if(res.status===422){setStatus('Not saved: '+(res.d.detail||'invalid form'),'err');}
      else if(res.status===401){location.href='/admin';}
      else{setStatus('Save failed ('+res.status+').','err');}
    }).catch(function(e){setStatus('Save failed: '+e,'err');});
  }

  document.getElementById('save').addEventListener('click',save);
  document.getElementById('reload').addEventListener('click',load);
  load();
})();
</script>
</body>
</html>`;
}
