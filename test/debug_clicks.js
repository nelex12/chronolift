// Пошаговый перехват ошибки при кликах по меню.
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9225;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new','--mute-audio','--disable-gpu','--no-sandbox',
    `--remote-debugging-port=${PORT}`,`--user-data-dir=${tmp}`,'--window-size=480,800','about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch(e){} });
  for (let i=0;i<50;i++){ try{ const r=await fetch(`http://127.0.0.1:${PORT}/json/version`); if(r.ok) break;}catch(e){} await sleep(300);}
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
  let mid=0; const pending=new Map();
  ws.onmessage=(ev)=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params)=>new Promise((res)=>{const id=++mid;pending.set(id,res);ws.send(JSON.stringify({id,method,params:params||{}}));});
  const evaluate=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});return r.result&&r.result.result?r.result.result.value:undefined;};
  await send('Page.enable');
  await send('Page.navigate',{url:BASE});
  await sleep(3500);
  const click=async(gx,gy)=>{
    const vp=JSON.parse(await evaluate('JSON.stringify({w:innerWidth,h:innerHeight})'));
    const s=Math.min(vp.w/480,vp.h/800), x=(vp.w-480*s)/2+gx*s, y=(vp.h-800*s)/2+gy*s;
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await sleep(60);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
    await sleep(300);
  };
  const errs=async(tag)=>{ console.log(tag, await evaluate('JSON.stringify(window.__ERRORS||[])')); };

  await errs('after-load');
  await click(240,522); await errs('after-skip-welcome');
  await click(240,490); await errs('after-daily-claim');
  await sleep(1200);
  await click(130,668); await errs('after-skins-click');
  await sleep(1200);
  console.log('active scenes:', await evaluate('window.__GAME.scene.getScenes(true).map(s=>s.scene.key).join(",")'));
  await errs('final');
  ws.close(); try{chrome.kill();}catch(e){} process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
