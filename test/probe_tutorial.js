// Обучение (Gameplay/Tutorial.js) на обычной скорости, настоящими нажатиями мыши:
//  - карточка не закрывается, пока её не успели прочитать; пока она открыта, лифт стоит и время не останавливается;
//  - перед каждой ловушкой лифт останавливается и ждёт; в обучении нельзя умереть: касание — перемотка назад;
//  - следуя подсказке под лифтом («ЗАЖМИ!» / «ОТПУСТИ»), все пять ловушек проходятся без касаний;
//  - в конце — обычный забег, save.tutorialDone; «пропустить» тоже работает.
// Снимки: test/tut_*.png
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9236;
const BASE = 'http://127.0.0.1:8321/index.html';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--no-sandbox', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=' + PORT, `--user-data-dir=${tmp}`, '--window-size=480,800', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch (e) {} await sleep(300); }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const p = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (me, pa) => new Promise((res) => { const id = ++mid; p.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa || {} })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, name), Buffer.from(r.result.data, 'base64')); };
  const mouse = async (type, gx, gy) => {
    const v = JSON.parse(await ev('JSON.stringify({w:innerWidth,h:innerHeight})'));
    const sc = Math.min(v.w / 480, v.h / 800);
    await send('Input.dispatchMouseEvent', { type, x: (v.w - 480 * sc) / 2 + gx * sc, y: (v.h - 800 * sc) / 2 + gy * sc, button: 'left', clickCount: 1 });
  };
  const tap = async (gx = 240, gy = 520) => { await mouse('mousePressed', gx, gy); await sleep(60); await mouse('mouseReleased', gx, gy); };
  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fail++; };
  const ST = `(() => { const g = __GAME.scene.getScene('Game'); if (!g || !g.scene.isActive()) return JSON.stringify({ active: false });
    const u = g.tutorial; const f = u && u.cur();
    return JSON.stringify({ active: true, tut: !!u, stage: u && u.stage, idx: u ? u.idx : -1, card: !!(u && u.card), ready: !!(u && u.card && u.card.ready),
      title: u && u.card ? u.card.c.list[1].text : null, roofY: +g.roofY.toFixed(1), stopY: f ? f.stopY : null, frozen: g.frozen, dead: g.dead,
      energy: Math.round(g.energy), hits: u ? u.hits : 0, need: u ? u.needHold(0.4) : false, hand: u ? (u.hand.visible ? u.handLabel.text : '') : '',
      fp: g.floorsPassed, done: save.tutorialDone }); })()`;
  const st = async () => JSON.parse(await ev(ST));

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(4000);
  await ev("save.seenWelcome = true; if (DailyService.pending()) DailyService.claim(); saveNow(); __GAME.scene.getScenes(true)[0].scene.start('Game'); 1");
  await sleep(800);

  // 1. вступительная карточка: лифт стоит, раннее нажатие карточку не закрывает
  let o = await st();
  check(o.tut && o.card && o.title === 'ОБУЧЕНИЕ', 'старт: обучение, карточка «ОБУЧЕНИЕ» — ' + JSON.stringify({ tut: o.tut, title: o.title }));
  await shot('tut_1_intro.png');
  const y0 = o.roofY;
  await tap();
  await sleep(700);
  o = await st();
  check(o.card && o.roofY === y0 && !o.frozen, 'раннее нажатие не закрыло карточку, лифт стоит, время идёт');
  for (let i = 0; i < 40 && !(await st()).ready; i++) await sleep(100);
  await tap();
  await sleep(300);
  o = await st();
  check(!o.card && o.stage === 'hold' && o.hand === 'ЗАЖМИ!', 'карточка закрыта, шаг «зажми», подсказка «ЗАЖМИ!» — ' + o.stage + ' ' + o.hand);
  await shot('tut_2_hold.png');

  // 2. зажать — время стоит, энергия тратится; затем карточка про энергию
  await mouse('mousePressed', 240, 520);
  await sleep(500);
  o = await st();
  check(o.frozen && o.energy < 100, 'зажал: время стоит, энергия тратится (' + o.energy + ')');
  await sleep(1100);
  o = await st();
  check(o.card && o.title === 'ХРОНО-ЭНЕРГИЯ' && !o.frozen, 'карточка про энергию; пока она открыта, время идёт — ' + o.title);
  await shot('tut_3_energy.png');
  await mouse('mouseReleased', 240, 520);
  for (let i = 0; i < 40 && !(await st()).ready; i++) await sleep(100);
  await tap();

  // 3. лифт подъезжает к лазеру и встаёт; без нажатий — касание и перемотка, а не смерть
  for (let i = 0; i < 100 && !(await st()).card; i++) await sleep(100);
  o = await st();
  check(o.card && o.title === 'ЛАЗЕР' && Math.abs(o.roofY - o.stopY) < 0.5, 'лифт встал перед лазером, карточка «ЛАЗЕР»');
  await sleep(600);
  check((await st()).roofY === o.roofY, 'пока карточка открыта, лифт стоит');
  await shot('tut_4_laser_watch.png');
  for (let i = 0; i < 120 && !(await st()).ready; i++) await sleep(100);
  check((await st()).ready, 'карточку можно закрыть после того, как ловушка показала удар');
  await tap();
  let hitSeen = false, rewindShot = false;
  for (let i = 0; i < 150; i++) {
    o = await st();
    if (o.dead) break;
    if (o.stage === 'rewind' && !rewindShot) { rewindShot = true; await shot('tut_5_rewind.png'); }
    if (o.card && o.title === 'ЗАДЕЛО!') { hitSeen = true; break; }
    await sleep(80);
  }
  check(hitSeen && !o.dead && Math.abs(o.roofY - o.stopY) < 0.5, 'без нажатий лазер задел: не смерть, перемотка к точке остановки, карточка «ЗАДЕЛО!»');
  await shot('tut_6_hit_card.png');
  for (let i = 0; i < 40 && !(await st()).ready; i++) await sleep(100);
  await tap();

  // 4. каждую следующую ловушку сначала проезжаем без нажатий (должна задеть: урок не пропустить),
  // потом — строго по подсказке: зажимать на «ЗАЖМИ!», отпускать на «ОТПУСТИ»
  const hitsBefore = o.hits;
  const idled = { 0: true };
  let held = false, shots = {}, finalCard = false, idleHits = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    o = await st();
    if (!o.active || o.dead) break;
    if (o.card) {
      if (held) { await mouse('mouseReleased', 240, 520); held = false; }
      if (o.title === 'ОБУЧЕНИЕ ПРОЙДЕНО!') { finalCard = true; if (o.ready) break; }
      if (o.title !== 'ЛАЗЕР' && !shots[o.title]) { shots[o.title] = 1; await shot('tut_watch_' + o.idx + '.png'); }
      if (o.title === 'ЗАДЕЛО!' && !idled[o.idx]) { idled[o.idx] = true; idleHits++; }
      if (o.ready) await tap();
      await sleep(100);
      continue;
    }
    if (o.stage === 'pass' && !idled[o.idx]) { await sleep(40); continue; }
    if (o.hand === 'ЗАЖМИ!' && !held) { await mouse('mousePressed', 240, 520); held = true; }
    else if (o.hand === 'ОТПУСТИ' && held) { await mouse('mouseReleased', 240, 520); held = false; }
    await sleep(40);
  }
  if (held) await mouse('mouseReleased', 240, 520);
  check(finalCard, 'дошёл до карточки «ОБУЧЕНИЕ ПРОЙДЕНО!»');
  check(idleHits === 4, 'без нажатий задевает каждая ловушка (пила, шипы, пресс, тесла): ' + idleHits + ' из 4');
  check(o.hits - hitsBefore === idleHits, 'по подсказке все ловушки пройдены без касаний (лишних касаний: ' + (o.hits - hitsBefore - idleHits) + ')');
  check(o.fp === 0 && !o.dead, 'в обучении этажи не засчитываются, смертей нет');
  await shot('tut_7_done.png');
  await tap();
  await sleep(800);
  o = await st();
  check(o.active && !o.tut && o.done, 'после обучения — обычный забег, save.tutorialDone');

  // 5. «пропустить»
  await ev("save.tutorialDone = false; __GAME.scene.getScene('Game').scene.restart(); 1");
  await sleep(800);
  check((await st()).tut, 'обучение снова включено');
  await tap(440, 44);
  await sleep(800);
  o = await st();
  check(o.active && !o.tut && o.done && !o.frozen, '«пропустить» — обычный забег, время не остановилось');

  const errors = await ev('JSON.stringify(window.__ERRORS||[])');
  console.log('ERRORS:', errors);
  console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
  ws.close(); try { chrome.kill(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
