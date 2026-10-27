// Скриншоты для памятки к защите (docs/DEFENSE.md) -> docs/defense/*.png.
// Сначала автопилот играет забег (?autotest=1): прогресс, достижения и рекорд — настоящие.
// Потом обход экранов на test-yandex.html (мок SDK: вход, облако, лидерборд, покупки).
// Запуск: сервер на 8321 (cd game && python -m http.server 8321), затем node test/shots_defense.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HOST = 'http://127.0.0.1:8321/';
const PORT = 9229;
const OUT = path.join(__dirname, '..', 'docs', 'defense');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
    console.log('shot', file);
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

  /* 1. Первый вход: приветствие и обучение (релизная страница, игрок не вошёл) */
  await send('Page.navigate', { url: HOST + 'index.html' });
  await sleep(3500);
  await shot('01_welcome.png');
  await click(240, 522);              // играть без входа
  await sleep(900);
  await click(240, 490);              // забрать ежедневную награду
  await sleep(900);
  await click(240, 560);              // ИГРАТЬ -> первый этаж обучения
  await sleep(1200);                  // подсказка «ЗАЖМИ!» видна, пока игрок не остановил время
  await shot('02_tutorial.png');

  /* 2. Забег автопилота на странице с моком: настоящий прогресс миссий и достижений */
  await send('Page.navigate', { url: HOST + 'test-yandex.html?autotest=1' });
  for (let i = 0; i < 80; i++) { await sleep(500); if (await evaluate('document.title') === 'TEST_DONE') break; }
  // автопилот иногда доживает до конца 30 с — тогда завершаем забег сами, чтобы был экран итогов
  await evaluate(`(function(){
    var gs = window.__GAME.scene.getScene('Game');
    if (window.__GAME.scene.isActive('Game') && !gs.dead) { gs.reviveUsed = true; gs.invincible = 0; gs.die('shot'); }
    return 1;
  })()`);
  await sleep(2000);
  await shot('07_gameover.png');

  /* 3. Следующий день: серия входов продолжается — попап ежедневной награды */
  await evaluate(`(function(){
    var d = new Date(); d.setDate(d.getDate() - 1);
    save.lastDaily = DailyService._dateStr(d); save.streak = 2; save.seenWelcome = true; saveNow(); return 1;
  })()`);
  await send('Page.navigate', { url: HOST + 'test-yandex.html' });
  await sleep(4000);
  await shot('03_daily.png');
  await click(240, 490);              // ЗАБРАТЬ
  await sleep(2500);
  await shot('04_menu.png');

  /* 4. Миссии дня: прогресс из забега, выполненная — с кнопкой ЗАБРАТЬ */
  await go('Missions', 900);
  await shot('05_missions.png');

  /* 5. Тост «МИССИЯ ВЫПОЛНЕНА» прямо в забеге: недостающую единицу прогресса
   *    засчитывает тот же хук, который вызывает геймплей (GameScene.trackMission) */
  await evaluate(`(function(){
    var m = MissionService.todayMissions().find(function(x){ return x.mode === 'add' && x.progress < x.value; });
    if (m) { save.missions.counters[m.type] = m.value - 1; saveNow(); }
    window.__SHOT_MISSION = m ? m.type : null; return 1;
  })()`);
  await go('Game', 2500);
  await evaluate(`(function(){
    var t = window.__SHOT_MISSION; if (t) window.__GAME.scene.getScene('Game').trackMission(t, 1); return t;
  })()`);
  await sleep(300);
  await shot('06_mission_toast.png');

  /* 6. Достижения, скины, магазин, лидерборд, настройки */
  await go('Achievements');
  await shot('08_achievements.png');
  await go('Skins');
  await shot('09_skins.png');
  await go('Shop');
  await shot('10_shop.png');
  await evaluate('LeaderboardService.submit(save.best.floors)');  // как после конца забега (мок держит таблицу в памяти страницы)
  await go('Menu', 1200);
  await click(34, 74);                // 🏆 — лидерборд
  await sleep(1500);
  await shot('11_leaderboard.png');
  await click(34, 74);
  await go('Settings');
  await shot('12_settings.png');

  /* 7. Перезагрузка: прогресс на месте (локально + облако мока) */
  const before = await evaluate('JSON.stringify({coins: save.coins, best: save.best, streak: save.streak, ach: save.achievements.length})');
  await send('Page.reload');
  await sleep(4000);
  const after = await evaluate('JSON.stringify({coins: save.coins, best: save.best, streak: save.streak, ach: save.achievements.length})');
  const cloud = await evaluate('(window.__YANDEX_CALLS||[]).filter(function(c){return c.indexOf("player.")===0;}).length');
  console.log('SAVE before reload:', before);
  console.log('SAVE after reload: ', after, before === after ? '(совпадает)' : '(РАЗНЫЕ!)');
  console.log('cloud calls after reload:', cloud);
  console.log('ERRORS:', await evaluate('JSON.stringify(window.__ERRORS||[])'));

  ws.close(); try { chrome.kill(); } catch (e) {} process.exit(before === after ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
