// Проверка без браузера: смена дня для ежедневной награды и миссий + выбор миссий дня.
// Запуск: node test/check_daily.js (часовой пояс задаётся внутри, от машины не зависит).
process.env.TZ = 'Asia/Yekaterinburg';  // UTC+5: тут ошибка с UTC-датой была видна 5 часов в сутки
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = path.join(__dirname, '..', 'game', 'Assets', 'Scripts');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(['Core/Config.js', 'Services/DailyService.js', 'Services/MissionService.js']
  .map(f => fs.readFileSync(path.join(S, f), 'utf8')).join('\n') +
  '\nthis.Daily = DailyService; this.Missions = MissionService; this.POOL = MISSIONS;', ctx);
const { Daily, Missions, POOL } = ctx;

let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; };

/* 1. Дата дня — местная */
check(new Date(2026, 9, 28, 0, 30).getTimezoneOffset() === -300, 'часовой пояс теста: UTC+5');
check(Daily._dateStr(new Date(2026, 9, 28, 0, 30)) === '2026-10-28', '00:30 28.10 по местному — это уже 28.10');
check(Daily._dateStr(new Date(2026, 9, 27, 23, 59, 59)) === '2026-10-27', '23:59 27.10 — ещё 27.10');
check(Daily._dateStr(new Date(2026, 9, 28, 4, 59)) === '2026-10-28', '04:59 28.10 — 28.10 (по UTC было бы 27.10)');
check(Daily._dateStr(new Date(2026, 0, 1, 0, 0)) === '2026-01-01', 'Новый год: 01.01 в 00:00');

/* 2. День меняется ровно в местную полночь — там же, где заканчивается таймер в сцене Missions */
const now = new Date(2026, 9, 28, 15, 0);
const next = new Date(now); next.setHours(24, 0, 0, 0);  // как в MissionsScene
check(Daily._dateStr(new Date(next - 1)) === Daily._dateStr(now), 'за миг до конца таймера — тот же день');
check(Daily._dateStr(next) !== Daily._dateStr(now), 'таймер дошёл до нуля — день сменился');

/* 3. Серия входов: «вчера» через границу месяца и года */
const yesterdayOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - 1); return Daily._dateStr(x); };
check(yesterdayOf(new Date(2026, 10, 1, 0, 10)) === '2026-10-31', 'вчера для 01.11 — 31.10');
check(yesterdayOf(new Date(2027, 0, 1, 0, 10)) === '2026-12-31', 'вчера для 01.01.2027 — 31.12.2026');

/* 4. Миссии дня: 3 штуки, разные счётчики, одинаковы при повторном выборе */
const typeOf = (id) => POOL.find(m => m.id === id).type;
let shared = 0, notThree = 0, unstable = 0;
const d = new Date(2026, 9, 1);
const DAYS = 730;
const seen = {};
for (let i = 0; i < DAYS; i++) {
  const day = Daily._dateStr(d);
  const ids = Missions.selectFor(day);
  if (ids.length !== 3) notThree++;
  if (new Set(ids.map(typeOf)).size !== ids.length) shared++;
  if (JSON.stringify(Missions.selectFor(day)) !== JSON.stringify(ids)) unstable++;
  ids.forEach(id => { seen[id] = (seen[id] || 0) + 1; });
  d.setDate(d.getDate() + 1);
}
check(!notThree, 'каждый день ровно 3 миссии (' + DAYS + ' дней)');
check(!shared, 'нет дней, где две миссии считают одно и то же (было ~14% дней)');
check(!unstable, 'выбор детерминирован по дате (одинаков на всех устройствах)');
check(Object.keys(seen).length === POOL.length, 'за ' + DAYS + ' дней выпадает каждая из ' + POOL.length + ' миссий');

console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
process.exit(fail ? 1 : 0);
