// Dark-only stylesheet for the Activity, adapted from the approved preview.
// gg sans is present inside the Discord client; the system stack covers the rest,
// so no external font is loaded (Activity CSP forbids third-party requests).

export const FORM_CSS = `
:root{
  --font:'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif;
  --blurple:#5865F2; --blurple-hover:#4752C4;
  --backdrop:rgba(0,0,0,.85); --chrome:#1E1F22;
  --modal:#313338; --footer:#2B2D31; --raised:#2B2D31; --input:#1E1F22;
  --text:#F2F3F5; --text-body:#DBDEE1; --muted:#B5BAC1; --faint:#949BA4;
  --rule:#3F4147; --rule-soft:#35373C;
  --danger:#DA373C; --danger-text:#FA777C; --danger-bg:rgba(218,55,60,.12);
  --warn:#F0B232; --warn-bg:rgba(240,178,50,.1); --accent:#C9A227; --green:#248046;
}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--backdrop);color:var(--text-body);font-family:var(--font);
  font-size:16px;line-height:1.375;display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:16px;-webkit-font-smoothing:antialiased}
.modal{position:relative;width:min(540px,100%);background:var(--modal);border-radius:5px;
  box-shadow:0 8px 24px rgba(0,0,0,.42);display:flex;flex-direction:column;
  max-height:min(880px,94vh);overflow:hidden}
.head{padding:16px 16px 0}
.brandrow{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.crest{width:34px;height:34px;border-radius:50%;flex:none;background:var(--raised);
  border:1px solid var(--rule);display:flex;align-items:center;justify-content:center;
  color:var(--accent);font-weight:700;font-size:13px}
.brandrow h1{font-size:20px;font-weight:700;color:var(--text);margin:0;line-height:1.2}
.brandrow .sub{font-size:12px;color:var(--faint);margin-top:2px;font-weight:500}
.tabs{display:flex;gap:20px;border-bottom:1px solid var(--rule-soft)}
.tab{background:none;border:0;padding:0 0 10px;cursor:default;text-align:left;font-size:14px;
  font-weight:600;color:var(--faint);border-bottom:2px solid transparent;margin-bottom:-1px}
.tab[aria-current="true"]{color:var(--text);border-bottom-color:var(--blurple)}
.tab.done{color:var(--muted)}
.bodywrap{position:relative;flex:1;min-height:0;display:flex}
.sheet{position:relative;flex:1;overflow-y:auto;padding:16px 16px 24px;scroll-behavior:smooth}
.gutter{width:10px;flex:none;background:var(--footer);position:relative}
.tick{position:absolute;left:0;width:10px;height:12px;border:0;background:none;padding:0;cursor:pointer}
.tick::after{content:"";position:absolute;left:1px;top:5px;width:8px;height:2px;background:var(--danger);border-radius:1px}
.callout{background:var(--warn-bg);border:1px solid var(--warn);border-radius:4px;padding:12px 14px;
  margin:0 0 22px;display:flex;gap:11px}
.callout .ico{color:var(--warn);font-size:15px;line-height:1.4;flex:none;font-weight:700}
.callout ul{margin:0;padding-left:16px;font-size:13.5px;color:var(--muted);line-height:1.5}
.callout li{margin-bottom:4px}
.callout li:last-child{margin-bottom:0}
.group{padding:0 0 20px;margin:0 0 20px;border-bottom:1px solid var(--rule-soft);position:relative}
.group:last-of-type{border-bottom:0;margin-bottom:0;padding-bottom:4px}
.group.miss{padding-left:12px;margin-left:-12px;border-left:2px solid var(--danger)}
fieldset{border:0;padding:0;margin:0}
legend,.label{display:block;padding:0;margin:0 0 2px;color:var(--text);font-size:15px;font-weight:600;line-height:1.35}
.hint{margin:0 0 10px;color:var(--muted);font-size:13.5px;line-height:1.45}
.req{color:var(--danger-text);margin-left:4px;font-weight:400}
input[type=text],textarea{width:100%;background:var(--input);color:var(--text-body);
  border:1px solid transparent;border-radius:3px;padding:10px 11px;font-family:var(--font);
  font-size:14.5px;line-height:1.45}
textarea{min-height:100px;resize:vertical}
input::placeholder,textarea::placeholder{color:var(--faint)}
input:focus,textarea:focus{outline:none;border-color:var(--blurple)}
.group.miss input,.group.miss textarea{border-color:var(--danger)}
.count{font-size:11px;color:var(--faint);text-align:right;margin-top:5px;font-weight:500}
details{margin-top:9px;border-top:1px solid var(--rule-soft);padding-top:9px}
summary{cursor:pointer;font-size:12.5px;font-weight:600;color:var(--muted);list-style:none;
  display:flex;align-items:center;gap:6px}
summary::-webkit-details-marker{display:none}
summary::before{content:"\\25B8";font-size:10px;transition:transform .12s}
details[open] summary::before{transform:rotate(90deg)}
details ul{margin:9px 0 0;padding-left:17px;font-size:13px;color:var(--faint);line-height:1.55}
.choice{display:flex;gap:11px;padding:7px 0;cursor:pointer;align-items:flex-start}
.choice:hover .box,.choice:hover .dot{border-color:var(--blurple)}
.choice input{position:absolute;opacity:0;width:1px;height:1px}
.box,.dot{flex:none;width:18px;height:18px;margin-top:1px;border:2px solid var(--faint);
  background:transparent;position:relative;border-radius:3px;transition:.1s}
.dot{border-radius:50%}
.choice input:checked ~ .box{border-color:var(--blurple);background:var(--blurple)}
.choice input:checked ~ .box::after{content:"";position:absolute;left:5px;top:1px;width:4px;height:9px;
  border:solid #fff;border-width:0 2px 2px 0;transform:rotate(42deg)}
.choice input:checked ~ .dot{border-color:var(--blurple)}
.choice input:checked ~ .dot::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--blurple)}
.choice .text{font-size:14.5px;color:var(--text-body);font-weight:500;line-height:1.4}
.choice .text em{display:block;font-style:normal;font-weight:400;color:var(--faint);font-size:12.5px;
  margin-top:2px;line-height:1.45}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 20px}
@media (max-width:560px){.cols{grid-template-columns:1fr}}
.foot{flex:none;background:var(--footer)}
.alert{display:none;gap:11px;padding:12px 16px;background:var(--danger-bg);border-top:1px solid var(--danger)}
.alert.on{display:flex}
.alert .ico{color:var(--danger-text);font-weight:700;font-size:15px;line-height:1.4;flex:none}
.alert .msg{font-size:13px;line-height:1.6}
.alert .msg strong{display:block;color:var(--text);font-size:13.5px;font-weight:600;margin-bottom:1px}
.alert a{color:var(--danger-text);text-decoration:underline;text-underline-offset:2px;cursor:pointer;font-weight:500}
.sep{color:var(--faint);padding:0 5px}
.actions{display:flex;gap:8px;align-items:center;padding:16px}
.actions .spacer{flex:1}
.btn{font-family:var(--font);font-size:14px;font-weight:500;padding:10px 18px;border-radius:3px;
  border:0;cursor:pointer;background:none;color:var(--text);transition:background .12s,color .12s}
.btn.text:hover{text-decoration:underline}
.btn.primary{background:var(--blurple);color:#fff}
.btn.primary:hover{background:var(--blurple-hover)}
.btn:disabled{opacity:.5;cursor:default}
@keyframes flash{0%,100%{background:transparent}30%{background:var(--danger-bg)}}
.flash{animation:flash .85s ease}
@media (prefers-reduced-motion:reduce){.flash{animation:none}.sheet{scroll-behavior:auto}}
.sent{padding:20px 16px 24px}
.sent h2{font-size:17px;font-weight:700;color:var(--text);margin:0 0 4px}
.sent > p{color:var(--muted);font-size:14px;margin:0 0 18px}
.embed{background:var(--raised);border-left:4px solid var(--green);border-radius:4px;padding:14px 16px}
.embed h3{font-size:15px;font-weight:600;color:var(--text);margin:0 0 8px}
.embed dl{display:grid;grid-template-columns:auto 1fr;gap:5px 14px;margin:0 0 10px;font-size:13px}
.embed dt{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);padding-top:2px}
.embed dd{margin:0;color:var(--text-body)}
.embed p.b{margin:0;font-size:13.5px;color:var(--muted);line-height:1.5}
.embed .fnote{margin-top:11px;padding-top:9px;border-top:1px solid var(--rule-soft);font-size:11.5px;color:var(--faint);font-weight:500}
.sent .open{display:inline-block;margin-top:16px;background:var(--blurple);color:#fff;text-decoration:none;
  font-size:14px;font-weight:500;padding:10px 18px;border-radius:3px}
.boot{padding:40px 16px;text-align:center;color:var(--faint);font-size:14px}
.hidden{display:none !important}
`;
