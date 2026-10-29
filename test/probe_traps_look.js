// Снимки ловушек без рамок: каждая в двух состояниях — «скоро ударит» (пик последней вспышки,
// за 167 мс до удара) и «опасно». Плюс лифт с часами, коллайдер персонажа по спрайту, меню.
// Шипы — ещё «покой» и «середина рывка». Непрерывные звуки ловушек создаются, когда нужно.
// Снимки: test/look_<ловушка>_<состояние>.png, test/look_menu.png
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=9230', `--user-data-dir=${tmp}`, '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) { try { const r = await fetch('http://127.0.0.1:9230/json/version'); if (r.ok) break; } catch (e) {} await sleep(300); }
  const t = await (await fetch('http://127.0.0.1:9230/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const p = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (me, pa) => new Promise((res) => { const id = ++mid; p.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa || {} })); });
  const ev = async (e, aw) => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception || r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, name), Buffer.from(r.result.data, 'base64')); };
  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fail++; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8321/index.html' });
  await sleep(4000);
  await ev("save.seenWelcome = true; if (DailyService.pending()) DailyService.claim(); __GAME.scene.getScenes(true)[0].scene.start('Menu')");
  await sleep(1200);
  await shot('look_menu.png');
  await ev("save.tutorialDone = true; save.seenTraps = { laser: 1, saw: 1, spikes: 1, crusher: 1, tesla: 1 }; __GAME.scene.getScene('Menu').scene.start('Game')");
  await sleep(1500);

  // коллайдер по спрайту: силуэт ровно 94 px, ширина по картинке
  const m = JSON.parse(await ev(`(() => { const g = __GAME.scene.getScene('Game'), m = g.playerMask, pr = g.playerRects()[0];
    return JSON.stringify({ rows: m.rows.length, nulls: m.rows.filter(r => !r).length, minX: m.minX, maxX: m.maxX, scale: m.scale, h: pr.y2 - pr.y1 }); })()`));
  console.log('силуэт:', JSON.stringify(m));
  check(m.rows === 94 && m.h === 94, 'высота коллайдера 94 px (PLAN.playerH), как в расчёте проходимости');
  check(m.minX > -30 && m.maxX < 30 && m.maxX - m.minX > 30, 'ширина коллайдера по спрайту: ' + (m.maxX - m.minX).toFixed(1) + ' px');

  // пила: круг вписан в прежний квадрат — у угла квадрата не задевает, по центру задевает
  const saw = JSON.parse(await ev(`(() => { const g = __GAME.scene.getScene('Game'), pr = g.playerRects()[0];
    const cy = (pr.y1 + pr.y2) / 2;
    const corner = g.playerHits({ cx: pr.x2 + 52 - 6, cy: pr.y1 - 52 + 6, r: 52 }, pr);   // квадрат задел бы угол
    const side = g.playerHits({ cx: pr.x2 + 50, cy: cy, r: 52 }, pr);                     // круг заходит на 2 px
    return JSON.stringify({ corner, side }); })()`));
  check(!saw.corner && saw.side, 'пила по кругу: угол квадрата не убивает, касание силуэта убивает');

  // остановить сцену: дальше ловушки двигаем вручную и рисуем кадр сами
  await ev(`(() => { const g = __GAME.scene.getScene('Game'); g.scene.pause();
    for (const tr of g.traps) tr.destroy(); g.traps = []; g.invincible = 99; return 1; })()`);

  const types = ['laser', 'saw', 'spikes', 'crusher', 'tesla'];
  const TRAP_LOOP = { saw: 1, laser: 1, tesla: 1 };
  for (const type of types) {
    for (const state of (type === 'spikes' ? ['calm', 'warn', 'dash', 'hit'] : ['warn', 'hit'])) {
      const info = await ev(`(() => {
        const g = __GAME.scene.getScene('Game');
        for (const tr of g.traps) tr.destroy();
        const ledgeY = g.roofY - 230;
        const tr = new TRAP_CLASSES['${type}'](g, ledgeY, 1, g.prefabs['${type}']);
        g.traps = [tr];
        const warn = '${state}' === 'warn';
        const before = (d) => d - 1000 / 6;           // пик третьей вспышки: k = 5/6
        if ('${type}' === 'laser') { tr.phase = warn ? 'tele' : 'on'; tr.t = warn ? before(tr.durTele) : 10; }
        if ('${type}' === 'spikes') {
          const st = '${state}';
          if (st === 'calm') { tr.phase = 'hidden'; tr.t = 300; }
          else if (st === 'dash') { tr.phase = 'out'; tr.t = SpikesTrap.DASH_MS * 0.3; }
          else { tr.phase = warn ? 'warn' : 'out'; tr.t = warn ? before(tr.durWarn) : 200; }
        }
        if ('${type}' === 'crusher') { tr.phase = warn ? 'warn' : 'hold'; tr.t = warn ? before(tr.durWarn) : 10; tr.shakeT = 0; if (!warn) tr.press.y = tr.yDown; }
        if ('${type}' === 'tesla') { tr.phase = warn ? 'charge' : 'zap'; tr.t = warn ? before(tr.durCharge) : 10; }
        if ('${type}' === 'saw') { tr.t = warn ? 0 : 600; }
        if ('${type}' === 'tesla' && warn) { const r = Math.random; Math.random = () => 0.1; tr.update(0); Math.random = r; }
        else tr.update(0);
        g.updateVisuals(0, g.time.now);
        g.updateTrapLoops();                            // непрерывный звук: пила всегда, лазер и тесла в ударе
        const loud = !!tr.loop;
        g.stopTrapLoops();
        return JSON.stringify({ dangerous: tr.dangerous, k: +trapWarnK(tr).toFixed(2), y: Math.round(tr.img ? tr.img.y - ledgeY : 0), loop: loud });
      })()`);
      await sleep(150);
      await shot(`look_${type}_${state}.png`);
      console.log(type, state, info);
      const o = JSON.parse(info);
      const wantLoop = type === 'saw' || ((type === 'laser' || type === 'tesla') && state === 'hit');
      if (TRAP_LOOP[type]) check(o.loop === wantLoop, type + ' ' + state + ': непрерывный звук ' + (wantLoop ? 'есть' : 'нет'));
    }
  }
  console.log('ERRORS:', await ev('JSON.stringify(window.__ERRORS||[])'));
  ws.close(); try { chrome.kill(); } catch (e) {}
  console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
