// CDP-тест ежедневных миссий (retention) для ХРОНОЛИФТ.
// Проход 1: автотест-забег (?autotest=1) -> хуки геймплея копят прогресс миссий.
// Проход 2: «выполнение» (счётчик = цель) -> сцена Missions -> ЗАБРАТЬ -> монеты.
// Проход 3: rollover — save.missions.date в прошлом -> новые миссии, нули.
// Запуск: cd game && python -m http.server 8321  (отдельно), затем node test/probe_missions.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9231;
const OUT = __dirname;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let failures = 0;
function check(name, cond, extra) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msn-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });

  let ok = false;
  for (let i = 0; i < 50 && !ok; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) ok = true; } catch (e) {}
    await sleep(300);
  }
  if (!ok) { console.error('no debugger'); process.exit(1); }

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
    if (r.result && r.result.exceptionDetails) return { __exc: (r.result.exceptionDetails.exception || {}).description };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  };
  const click = async (gx, gy) => {
    const vp = JSON.parse(await evaluate('JSON.stringify({w:window.innerWidth,h:window.innerHeight})') || '{"w":480,"h":800}');
    const scale = Math.min(vp.w / 480, vp.h / 800);
    const x = (vp.w - 480 * scale) / 2 + gx * scale;
    const y = (vp.h - 800 * scale) / 2 + gy * scale;
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await send('Page.enable');
  await send('Runtime.enable');

  /* ---------- Проход 1: автотест-забег, хуки миссий ---------- */
  await send('Page.navigate', { url: BASE + '?autotest=1' });
  await sleep(32000);
  const testlog = await evaluate("(document.getElementById('testlog')||{textContent:'null'}).textContent");
  check('autotest finished', /"status":"TEST_DONE"/.test(testlog || ''), String(testlog || '').slice(0, 140));

  // добиваем забег, чтобы сработал gameOver() (счётчик runs + saveNow). Если автопилот ни разу
  // не умер, возрождения не было: засчитываем его (как сделал бы автопилот) и завершаем забег
  await evaluate(`(function(){ var gs = window.__GAME.scene.getScene('Game');
    if (gs && !gs.dead) { if (!gs.reviveUsed) gs.revive(); gs.invincible = 0; gs.die('test_end'); } return true; })()`);
  await sleep(2500);

  const m1 = JSON.parse(await evaluate(`(function(){
    var t = MissionService.todayMissions();
    return JSON.stringify({
      version: save.version,
      date: save.missions.date,
      today: new Date().toLocaleDateString('sv-SE'),  // местная дата YYYY-MM-DD, сброс — в 00:00 игрока
      n: t.length,
      ids: t.map(function(m){return m.id;}),
      counters: save.missions.counters
    });
  })()`));
  check('save version 3', m1.version === 3, 'v=' + m1.version);
  check('missions date == today', m1.date === m1.today, m1.date);
  check('3 missions selected', m1.n === 3, JSON.stringify(m1.ids));
  check('hook: floors tracked', (m1.counters.floors || 0) > 0, 'floors=' + m1.counters.floors);
  check('hook: coins tracked', (m1.counters.coins || 0) > 0, 'coins=' + m1.counters.coins);
  check('hook: runs tracked', (m1.counters.runs || 0) >= 1, 'runs=' + m1.counters.runs);
  check('hook: revives tracked (autotest revives)', (m1.counters.revives || 0) >= 1, 'revives=' + m1.counters.revives);
  check('hook: frozen_secs tracked', (m1.counters.frozen_secs || 0) >= 1, 'secs=' + m1.counters.frozen_secs);

  /* ---------- Проход 2: выполнение + забор награды ---------- */
  await send('Page.navigate', { url: BASE });
  await sleep(4000);
  // автотест-забег уже выполнил часть миссий хуками (интеграция с геймплеем)
  const pre = JSON.parse(await evaluate(`JSON.stringify((function(){
    var ms = MissionService.todayMissions();
    var before = MissionService.claimableCount();
    var autoDone = ms.filter(function(m){ return m.progress >= m.value && !m.claimed; })
                     .map(function(x){ return x.id; });
    var m = ms.find(function(x){ return x.progress < x.value; });
    var newly = 0;
    if (m) {
      save.missions.counters[m.type] = m.value;
      saveNow();
      // сколько незавершённых миссий этого типа доделывает это значение
      newly = ms.filter(function(x){ return x.progress < x.value && x.type === m.type && m.value >= x.value; }).length;
    }
    return {
      before: before,
      after: MissionService.claimableCount(),
      newly: newly,
      autoDone: autoDone,
      set: m ? { id: m.id, type: m.type, value: m.value, reward: m.reward,
                 idx: ms.indexOf(m), coinsBefore: save.coins } : null
    };
  })())`));
  check('autotest run auto-completed >=1 mission (gameplay integration)',
    pre.autoDone.length >= 1, 'autoDone=' + JSON.stringify(pre.autoDone));
  if (pre.set) {
    check('completing an unfinished mission -> claimable +N',
      pre.after === pre.before + pre.newly,
      'before=' + pre.before + ' after=' + pre.after + ' newly=' + pre.newly);
    await evaluate('window.__GAME.scene.start("Missions")');
    await sleep(900);
    await screenshot('msn_1_scene.png');
    const by = 210 + pre.set.idx * 155 + 34;   // карточка: y=210, шаг 155, кнопка y+34
    await click(382, by);                       // «ЗАБРАТЬ»
    await sleep(900);
    await screenshot('msn_2_claimed.png');
    const m2 = JSON.parse(await evaluate(`JSON.stringify((function(){
      return { coins: save.coins,
        claimed: !!save.missions.claimed['${pre.set.id}'],
        claimable: MissionService.claimableCount() };
    })())`));
    check('reward granted (+N coins)', m2.coins === pre.set.coinsBefore + pre.set.reward,
      'before=' + pre.set.coinsBefore + ' after=' + m2.coins + ' expected=' + (pre.set.coinsBefore + pre.set.reward));
    check('mission marked claimed', m2.claimed === true);
    check('claimable back to pre-run level', m2.claimable === pre.before,
      'claimable=' + m2.claimable + ' pre=' + pre.before);
  }
  // забираем всё оставшееся через API — финальный claimable == 0
  const rest = JSON.parse(await evaluate(`JSON.stringify((function(){
    var n = 0, sum = 0, guard = 0;
    while (guard++ < 10) {
      var ms = MissionService.todayMissions();
      var m = ms.find(function(x){ return x.progress >= x.value && !x.claimed; });
      if (!m) break;
      var g = MissionService.claim(m.id);
      if (!g) break;
      sum += g.reward; n++;
    }
    return { n: n, sum: sum, claimable: MissionService.claimableCount(), coins: save.coins };
  })())`));
  check('all claimable missions claimed -> 0 left', rest.claimable === 0,
    'n=' + rest.n + ' claimable=' + rest.claimable);

  /* ---------- Проход 3: rollover (смена дня) ---------- */
  await evaluate(`(function(){
    save.missions.date = '2020-01-01';
    save.missions.counters = { floors: 99, runs: 9 };
    saveNow(); return true;
  })()`);
  await send('Page.reload');
  await sleep(4500);
  const m3 = JSON.parse(await evaluate(`JSON.stringify((function(){
    var t = MissionService.todayMissions();
    return { date: save.missions.date, today: new Date().toLocaleDateString('sv-SE'),  // местная дата YYYY-MM-DD, сброс — в 00:00 игрока
             nCounters: Object.keys(save.missions.counters).length, n: t.length,
             claimed: t.filter(function(m){ return m.claimed; }).length };
  })())`));
  check('rollover: date refreshed to today', m3.date === m3.today, m3.date);
  check('rollover: counters reset', m3.nCounters === 0, 'counters=' + m3.nCounters);
  check('rollover: fresh 3 missions, none claimed', m3.n === 3 && m3.claimed === 0, JSON.stringify(m3));

  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  check('no js errors at end', errors === '[]', errors);

  ws.close();
  try { chrome.kill(); } catch (e) {}
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
