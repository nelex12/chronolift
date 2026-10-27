// Микро-диагностика: срабатывает ли заморозка от CDP-ввода во время опасного лазера.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9226;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitDbg() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch (e) {}
    await sleep(300);
  }
  return false;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`, '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  if (!await waitDbg()) process.exit(1);
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const id = ++mid; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const mouse = async (type) => {
    await send('Input.dispatchMouseEvent', { type, x: 240, y: 500, button: 'left', clickCount: 1 });
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(2500);
  await evaluate(`(()=>{const c=document.querySelector('canvas');if(!c)return 'no-canvas';
    const r=c.getBoundingClientRect();return JSON.stringify({rect:{x:r.x,y:r.y,w:r.width,h:r.height},iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio})})()`).then(x => console.log('CANVAS:', x));
  // клики по меню
  const click = async (gx, gy) => {
    const o = JSON.parse(await evaluate('JSON.stringify({w:innerWidth,h:innerHeight})'));
    const sc = Math.min(o.w / 480, o.h / 800);
    const x = (o.w - 480 * sc) / 2 + gx * sc, y = (o.h - 800 * sc) / 2 + gy * sc;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await click(240, 522); await sleep(900);
  await click(240, 490); await sleep(900);
  await click(240, 560); await sleep(1000);

  // ждём опасный лазер в окне и жмём
  for (let i = 0; i < 300; i++) {
    const st = await evaluate(`(()=>{const s=__GAME.scene.getScene('Game');if(!s||!s.scene.isActive())return null;
      const tr=s.traps[0];return JSON.stringify({dy:tr.ledgeY-s.roofY,danger:tr.dangerous,held:s.held,frozen:s.frozen,dead:s.dead})})()`);
    if (st) {
      const o = JSON.parse(st);
      if (i % 10 === 0) console.log('t' + i, st);
      if (o.dead) { console.log('DIED before hold'); break; }
      if (o.danger && o.dy > -170 && o.dy < 60) {
        console.log('>>> pressing, state:', st);
        await mouse('mousePressed');
        await sleep(400);
        const after = await evaluate(`(()=>{const s=__GAME.scene.getScene('Game');return JSON.stringify({held:s.held,frozen:s.frozen,energy:Math.round(s.energy),dead:s.dead,overload:s.overload})})()`);
        console.log('AFTER PRESS:', after);
        await sleep(1500);
        const after2 = await evaluate(`(()=>{const s=__GAME.scene.getScene('Game');return JSON.stringify({held:s.held,frozen:s.frozen,energy:Math.round(s.energy),dead:s.dead,fp:s.floorsPassed})})()`);
        console.log('AFTER 1.5s:', after2);
        await mouse('mouseReleased');
        break;
      }
    }
    await sleep(60);
  }
  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  console.log('ERRORS:', errors);
  ws.close(); try { chrome.kill(); } catch (e) {} process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
