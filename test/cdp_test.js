// CDP-драйвер: полная проверка игры в headless Chrome.
// Проход A: автотест геймплея (?autotest=1). Проход B: клик по всем сценам UI.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9223;
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
  // клик в игровых координатах (480x800) с учётом FIT-центрирования
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

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---------- Проход A: автотест геймплея ---------- */
  await send('Page.navigate', { url: BASE + '?autotest=1' });
  await sleep(9000);
  await screenshot('shot_game_mid.png');
  await sleep(9000);
  await screenshot('shot_game_late.png');
  // итог автопилот пишет через ~31,5 с после загрузки (Boot.js: старт 1,5 с + забег 30 с),
  // а не к 18-й секунде — раньше здесь всегда было null
  let testlog = 'null';
  for (let i = 0; i < 40 && testlog === 'null'; i++) {
    await sleep(500);
    testlog = await evaluate("(document.getElementById('testlog')||{textContent:'null'}).textContent");
  }
  console.log('TESTLOG:', testlog);

  /* ---------- Проход B: сцены UI ---------- */
  await send('Page.navigate', { url: BASE });
  await sleep(3500);
  await screenshot('ui_1_welcome.png');
  await click(240, 522);            // играть без входа
  await sleep(900);
  await screenshot('ui_2_daily.png');
  await click(240, 490);            // забрать награду
  await sleep(900);
  await screenshot('ui_3_menu.png');
  await click(130, 668);            // миссии дня
  await sleep(700);
  await screenshot('ui_4_missions.png');
  await click(240, 735);            // назад
  await sleep(500);
  await click(350, 668);            // скины
  await sleep(700);
  await screenshot('ui_5_skins.png');
  await click(240, 600);            // назад
  await sleep(500);
  await click(130, 736);            // магазин
  await sleep(700);
  await screenshot('ui_6_shop.png');
  await click(240, 690);            // назад
  await sleep(500);
  await click(350, 736);            // достижения
  await sleep(700);
  await screenshot('ui_7_ach.png');
  await click(240, 730);            // назад
  await sleep(500);
  await click(34, 74);              // лидерборд (иконка в шапке)
  await sleep(1800);
  await screenshot('ui_8_board.png');
  await click(34, 74);              // закрыть лидерборд
  await sleep(400);
  await click(240, 768);            // настройки
  await sleep(700);
  await screenshot('ui_9_settings.png');
  const inSettings = await evaluate("window.__GAME.scene.isActive('Settings')");
  console.log('SETTINGS OPENED:', inSettings);
  await click(240, 730);            // назад
  await sleep(500);
  const backInMenu = await evaluate("window.__GAME.scene.isActive('Menu')");

  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  const saveState = await evaluate("localStorage.getItem('chronolift_save')");
  console.log('ERRORS:', errors);
  console.log('SAVE:', saveState ? saveState.slice(0, 300) : 'null');

  // холст в разрешении экрана: CHRONO_DPR=2 node test/cdp_test.js -> масштаб 2, холст 960×1600
  const render = JSON.parse(await evaluate("JSON.stringify({scale: RENDER_SCALE, canvas: document.querySelector('canvas').width + 'x' + document.querySelector('canvas').height, zoom: window.__GAME.scene.getScene('Menu').cameras.main.zoom})"));
  const renderOk = render.canvas === Math.round(480 * render.scale) + 'x' + Math.round(800 * render.scale) && render.zoom === render.scale;
  console.log('RENDER:', JSON.stringify(render), renderOk ? 'PASS' : 'FAIL');

  const ok = testlog !== 'null' && errors === '[]' && inSettings && backInMenu && renderOk;
  console.log(ok ? 'ALL PASS' : 'FAIL');
  ws.close();
  try { chrome.kill(); } catch (e) {}
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
