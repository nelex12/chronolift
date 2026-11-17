// Фокусная проверка: мини-игры на обычной скорости (обучение проверяет test/probe_tutorial.js).
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
    '--headless=new', '--mute-audio', '--disable-gpu', '--no-sandbox',
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

  /* ---- Мини-игры на обычной скорости (в ?autotest=1 лифт в 10 раз быстрее, и передышка
   * под мини-игру длится доли секунды). Игрок неуязвим, ловушки сами не трогаем. Проверяем:
   * мини-игра начинается, когда игрок вне зон ловушек, и кончается до входа в зону следующей;
   * нажатие в ней засчитывается, время не останавливает и энергию не тратит ---- */
  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fail++; };
  await send('Page.navigate', { url: BASE });
  await sleep(4000);
  await evaluate("save.seenWelcome = true; save.tutorialDone = true; if (DailyService.pending()) DailyService.claim(); __GAME.scene.getScenes(true)[0].scene.start('Game'); 1");
  await sleep(1000);
  await evaluate("__GAME.scene.getScene('Game').invincible = 9999; 1");
  // зона ловушки по TRAP_SPANS пересекается с игроком (roofY − 92 … roofY + 2)? и через сколько секунд вход в ближайшую
  const STATE = `(() => { const s = __GAME.scene.getScene('Game'); const a = s.minigames.active;
    const v = Math.min(CFG.maxSpeed, CFG.baseSpeed + s.floorsPassed * CFG.speedPerFloor);
    let inZone = false, nextIn = Infinity;
    for (const tr of s.traps) {
      const sp = TRAP_SPANS[tr.type], z1 = tr.ledgeY + sp.y1, z2 = tr.ledgeY + sp.y2;
      if (s.roofY - 92 < z2 && s.roofY + 2 > z1) inZone = true;
      else if (z2 < s.roofY - 92) nextIn = Math.min(nextIn, (s.roofY - 92 - z2) / v);
    }
    return JSON.stringify({ active: !!a, life: a ? Math.round(a.life) : 0, count: s.minigames.count, inZone, nextIn: +nextIn.toFixed(2),
      frozen: s.frozen, energy: +s.energy.toFixed(1), fp: s.floorsPassed, coins: s.coinsRun }); })()`;
  let seen = 0, tapped = false, shots = 0, prevActive = false, overlapWhileActive = 0;
  for (let i = 0; i < 900 && seen < 2; i++) {          // до 90 с
    const o = JSON.parse(await evaluate(STATE));
    if (o.active && o.inZone) overlapWhileActive++;
    if (o.active && !prevActive) {
      seen++;
      console.log('MINIGAME START:', JSON.stringify(o));
      check(!o.inZone, `мини-игра ${seen} началась вне зон ловушек (этаж ${o.fp})`);
      check(o.nextIn >= o.life / 1000 + 0.8, `мини-игра ${seen} кончится за ${(o.nextIn - o.life / 1000).toFixed(2)} с до зоны следующей ловушки`);
      if (shots < 2) { shots++; await screenshot('mini_' + seen + '.png'); }
      if (!tapped) {
        // нажать и держать: ответ засчитан, время не остановилось, энергия не потрачена
        // энергия не полная — иначе расход не был бы виден (выше максимума она не растёт)
        tapped = true;
        await evaluate("__GAME.scene.getScene('Game').energy = 50; 1");
        await pressAt(240, 700);
        await sleep(500);
        const p = JSON.parse(await evaluate(STATE));
        await releaseAt();
        console.log('AFTER TAP+HOLD:', JSON.stringify(p));
        check(!p.active, 'нажатие засчитано в мини-игре');
        check(!p.frozen, 'нажатие в мини-игре не остановило время (даже если палец остался на экране)');
        check(p.energy >= 50, `энергия не потрачена: 50 → ${p.energy} (выигрыш добавляет 12–15)`);
      }
    }
    prevActive = o.active;
    await sleep(100);
  }
  check(seen >= 2, 'за забег было ' + seen + ' мини-игры');
  check(overlapWhileActive === 0, 'пока идёт мини-игра, игрок ни разу не в зоне ловушки');
  await screenshot('edu_3_autotest_late.png');
  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  console.log('ERRORS:', errors);

  ws.close();
  try { chrome.kill(); } catch (e) {}
  console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
