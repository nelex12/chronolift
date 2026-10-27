// Фокусная проверка: обучение (рука/заморозка) + миниигры в автотесте.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9224;
const OUT = __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitDebugger() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch (e) {}
    await sleep(300);
  }
  return false;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  if (!await waitDebugger()) { console.error('no debugger'); process.exit(1); }

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let mid = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++mid; pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  };
  const click = async (gx, gy) => {
    const vp = await evaluate('JSON.stringify({w:window.innerWidth,h:window.innerHeight})');
    const v = JSON.parse(vp || '{"w":480,"h":800}');
    const scale = Math.min(v.w / 480, v.h / 800);
    const x = (v.w - 480 * scale) / 2 + gx * scale;
    const y = (v.h - 800 * scale) / 2 + gy * scale;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const pressAt = async (gx, gy) => {   // нажать и держать
    const vp = await evaluate('JSON.stringify({w:window.innerWidth,h:window.innerHeight})');
    const v = JSON.parse(vp || '{"w":480,"h":800}');
    const scale = Math.min(v.w / 480, v.h / 800);
    const x = (v.w - 480 * scale) / 2 + gx * scale;
    const y = (v.h - 800 * scale) / 2 + gy * scale;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  };
  const releaseAt = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 240, y: 400, button: 'left', clickCount: 1 });
  };

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---- Фаза 1: ручной ввод, обучение ---- */
  await send('Page.navigate', { url: BASE });
  await sleep(3200);
  await click(240, 522);            // welcome: играть без входа
  await sleep(900);
  await click(240, 490);            // daily: забрать
  await sleep(900);
  await click(240, 590);            // меню: ИГРАТЬ
  await sleep(1200);

  const handVisibleBefore = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s&&s.hand?s.hand.visible:null})()");
  const floor1 = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s?s.floorIdx:null})()");
  await pressAt(240, 700);          // ЗАЖАТЬ экран
  await sleep(900);
  const st1 = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s?JSON.stringify({frozen:s.frozen,energy:Math.round(s.energy),hand:s.hand.visible,hasFrozen:s.hasFrozenOnce}):null})()");
  await screenshot('edu_1_freeze.png');
  await releaseAt();
  await sleep(400);

  // подтолкнуть кабину к первой ловушке, чтобы увидеть урок-1 вживую
  await evaluate("(()=>{const s=__GAME.scene.getScene('Game');if(s&&s.traps[0])s.roofY=s.traps[0].ledgeY+330;return 'ok'})()");
  await sleep(1100);
  const st2 = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s?JSON.stringify({floor:s.floorIdx,alive:!s.dead,floorsPassed:s.floorsPassed,tut:save.tutorialDone}):null})()");
  await screenshot('edu_2_lesson1.png');
  console.log('HAND-VISIBLE-BEFORE-HOLD:', handVisibleBefore, 'FLOOR:', floor1);
  console.log('AFTER-HOLD:', st1);
  console.log('NEAR-TRAP:', st2);

  /* ---- Фаза 2: автотест, миниигры ---- */
  await send('Page.navigate', { url: BASE + '?autotest=1' });
  await sleep(4000);
  let miniShots = 0, maxCount = 0, sawActive = false;
  for (let i = 0; i < 70; i++) {
    const st = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s?JSON.stringify({active:!!(s.minigames&&s.minigames.active),count:s.minigames?s.minigames.count:0,fp:s.floorsPassed,dead:s.dead}):null})()");
    if (st) {
      const o = JSON.parse(st);
      maxCount = Math.max(maxCount, o.count);
      if (o.active && !sawActive && miniShots < 2) {
        sawActive = true; miniShots++;
        await screenshot('mini_' + o.count + '.png');
      }
      if (!o.active) sawActive = false;
      if (o.fp >= 20) break;
    }
    await sleep(400);
  }
  const miniResult = await evaluate("(()=>{const s=__GAME.scene.getScene('Game');return s?JSON.stringify({count:s.minigames.count,floorsPassed:s.floorsPassed,energy:Math.round(s.energy),coinsRun:s.coinsRun}):null})()");
  const analytics = await evaluate("(localStorage.getItem('chronolift_analytics')||'[]')");
  const miniEvents = analytics ? (analytics.match(/minigame_start/g) || []).length : 0;
  const miniWins = analytics ? (analytics.match(/minigame_result/g) || []).length : 0;
  console.log('MINIGAME-RUN:', miniResult, 'starts:', miniEvents, 'results:', miniWins, 'maxCount:', maxCount);
  await screenshot('edu_3_autotest_late.png');
  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  console.log('ERRORS:', errors);

  ws.close();
  try { chrome.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
