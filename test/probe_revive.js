// Предложение возродиться после смерти: все три кнопки нажимаются мышью.
// Смерть — настоящая: игрок не нажимает ничего, и первая ловушка его убивает.
// Запуск: сервер на 8321, затем node test/probe_revive.js (CHRONO_DPR=2 — чёткая отрисовка)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'http://127.0.0.1:8321/';
const PORT = 9234;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch (e) {}
    await sleep(300);
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const id = ++mid; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  // клик в игровых координатах (480x800) с учётом FIT-масштаба, как в cdp_test.js
  const click = async (gx, gy) => {
    const v = JSON.parse(await evaluate('JSON.stringify({w:window.innerWidth,h:window.innerHeight})') || '{"w":480,"h":800}');
    const scale = Math.min(v.w / 480, v.h / 800);
    const x = (v.w - 480 * scale) / 2 + gx * scale;
    const y = (v.h - 800 * scale) / 2 + gy * scale;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  // переход как по кнопке: из активной сцены (game.scene.start запустил бы новую поверх старой)
  const go = async (scene, wait) => {
    await evaluate(`window.__GAME.scene.getScenes(true)[0].scene.start('${scene}')`);
    await sleep(wait || 800);
  };
  await send('Page.enable'); await send('Runtime.enable');

  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; };
  const active = async () => JSON.parse(await evaluate('JSON.stringify(window.__GAME.scene.getScenes(true).map(function(s){return s.scene.key}))'));
  // забег до предложения возродиться: стоим, пока ловушка не убьёт (обучение уже пройдено)
  const dieAndWaitOffer = async (coins) => {
    await evaluate(`(function(){ save.tutorialDone = true; save.seenWelcome = true; save.coins = ${coins}; saveNow(); return 1; })()`);
    await go('Game', 500);
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      if (await evaluate("(function(){var g=window.__GAME.scene.getScene('Game'); return g.dead && !!g.children.list.find(function(o){return o.type==='Container' && o.depth===50;});})()")) return true;
    }
    return false;
  };

  await send('Page.navigate', { url: HOST + (process.env.PAGE || 'test-yandex.html') });
  await sleep(4000);

  /* 1. «отказаться» -> экран итогов */
  check(await dieAndWaitOffer(0), 'смерть -> предложение возродиться');
  await click(240, 512);
  await sleep(1200);
  check((await active()).includes('GameOver'), '«отказаться» -> экран итогов | ' + JSON.stringify(await active()));

  /* 2. «за 100 монет» -> забег продолжается, монеты списаны */
  check(await dieAndWaitOffer(150), 'смерть -> предложение (150 монет)');
  await click(240, 440);
  await sleep(800);
  const r2 = JSON.parse(await evaluate("JSON.stringify({dead: window.__GAME.scene.getScene('Game').dead, coins: save.coins, active: window.__GAME.scene.getScenes(true).map(function(s){return s.scene.key})})"));
  check(!r2.dead && r2.coins === 50 && r2.active.includes('Game'), 'возрождение за монеты | ' + JSON.stringify(r2));

  /* 3. «бесплатно (реклама)» -> мок показывает рекламу, забег продолжается */
  check(await dieAndWaitOffer(0), 'смерть -> предложение (реклама)');
  await click(240, 360);
  await sleep(1500);
  const r3 = JSON.parse(await evaluate("JSON.stringify({dead: window.__GAME.scene.getScene('Game').dead, ad: (window.__YANDEX_CALLS||[]).indexOf('adv.showRewardedVideo') >= 0})"));
  check(!r3.dead && r3.ad, 'возрождение за рекламу | ' + JSON.stringify(r3));

  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  check(errors === '[]', 'нет ошибок | ' + errors);
  console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
  ws.close(); try { chrome.kill(); } catch (e) {} process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
