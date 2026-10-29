/* Все тесты разом: без браузера — сразу все, браузерные — по JOBS штук параллельно (по умолчанию 4).
 * Браузерные тесты в основном ждут: игра идёт в реальном времени (бот играет забег, автотест
 * обучения 31 с), а между шагами стоят паузы. Поэтому параллельный запуск сокращает время в разы.
 * Каждый тест — свой Chrome на своём порту отладки, сервер игры общий: python tools/serve.py (обычный http.server
 * держит очередь из 5 соединений и под нагрузкой отбрасывает запросы).
 * Тест упал, если код выхода не 0, в выводе есть строка FAIL или непустой список ERRORS.
 * Логи: test/logs/<тест>.log. Запуск: node test/run_all.js  (JOBS=6 node test/run_all.js)
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const NODE_ONLY = ['check_pages', 'check_daily', 'audit_passability', 'sim_players', 'check_offline'];
// самые долгие — первыми, чтобы не остались в хвосте одни
const BROWSER = ['probe_missions', 'probe_playthrough', 'cdp_test', 'probe_minigames', 'probe_revive',
  'probe_input', 'probe_wave', 'probe_traps_look', 'probe_yandex', 'probe_scenes', 'probe_pause'];
const JOBS = Math.max(1, +process.env.JOBS || 4);
const LOGS = path.join(__dirname, 'logs');
fs.mkdirSync(LOGS, { recursive: true });

function run(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(__dirname, name + '.js')], { cwd: path.join(__dirname, '..') });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const kill = setTimeout(() => { out += '\nTIMEOUT 300 s'; p.kill(); }, 300000);
    p.on('close', (code) => {
      clearTimeout(kill);
      fs.writeFileSync(path.join(LOGS, name + '.log'), out);
      const errs = (out.match(/ERRORS: (\[.*\])/g) || []).filter((l) => !/ERRORS: \[\]/.test(l));
      const bad = code !== 0 || /^FAIL|\bFAIL\b|TIMEOUT/m.test(out) || errs.length > 0;
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      console.log((bad ? 'FAIL ' : 'ok   ') + name.padEnd(20) + s.padStart(6) + ' с' + (bad ? '   см. test/logs/' + name + '.log' : ''));
      resolve(!bad);
    });
  });
}

async function pool(names, jobs) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (i < names.length) res.push(await run(names[i++]));
  }));
  return res;
}

(async () => {
  const t0 = Date.now();
  try { await fetch('http://127.0.0.1:8321/index.html'); } catch (e) {
    console.log('Нет сервера игры. Запусти: python tools/serve.py');
    process.exit(1);
  }
  const [a, b] = await Promise.all([pool(NODE_ONLY, NODE_ONLY.length), pool(BROWSER, JOBS)]);
  const all = a.concat(b), failed = all.filter((x) => !x).length;
  console.log(`\n${all.length - failed}/${all.length} прошли за ${((Date.now() - t0) / 1000).toFixed(0)} с (браузерных одновременно: ${JOBS})`);
  console.log(failed ? 'FAIL' : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})();
