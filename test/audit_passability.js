/* Аудит проходимости: гарантия генератора этажей (Gameplay/FloorPlanner.js), без браузера.
 *
 * 1. Зоны TRAP_SPANS действительно охватывают все опасные rects() ловушек во всех фазах
 *    (иначе гарантия считалась бы по неверным размерам).
 * 2. Для тысяч сгенерированных шахт заново, независимо от планировщика, проходит «худший игрок»:
 *    держит заморозку всё время, пока он в опасной зоне этажа (так проходится любая ловушка при
 *    любой фазе, идеальная игра тратит не больше), и держит на 20% дольше — причём лишнее время
 *    вне зоны, где он недополучает восстановление. Его запас не должен опускаться ниже 2.
 * 3. Статистика серий: сколько угроз в серии, какие передышки.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const S = path.join(__dirname, '..', 'game', 'Assets', 'Scripts');
const PREFABS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game', 'Assets', 'Prefabs', 'traps.json'), 'utf8'));
const stubProto = {
  setScale() { return this; }, setDepth() { return this; }, setAlpha() { return this; }, setX(x) { this.x = x; return this; },
  setY(y) { this.y = y; return this; }, setTint() { return this; }, clearTint() { return this; }, destroy() {},
  clear() {}, lineStyle() {}, beginPath() {}, moveTo() {}, lineTo() {}, strokePath() {}, lineBetween() {}, fillStyle() {}, fillCircle() {}, fillRect() {}, setCrop() { return this; }, setTintFill() { return this; }, frame: { width: 256, height: 256 }
};
const stub = (x, y) => Object.assign(Object.create(stubProto), { x: x || 0, y: y || 0 });
const scene = { add: { image: stub, rectangle: stub, graphics: () => stub() }, trapTone() {}, time: { now: 0 }, cameras: { main: { shake() {} } } };
const ctx = { window: { devicePixelRatio: 1, innerWidth: 480, innerHeight: 800 }, Phaser: { Math: { Linear: (a, b, t) => a + (b - a) * t } } };
vm.createContext(ctx);
vm.runInContext(['Core/Config.js', 'Gameplay/Traps.js', 'Gameplay/FloorPlanner.js']
  .map(f => fs.readFileSync(path.join(S, f), 'utf8')).join('\n') +
  '\nthis.CFG = CFG; this.TRAP_CLASSES = TRAP_CLASSES; this.TRAP_SPANS = TRAP_SPANS; this.FloorPlanner = FloorPlanner; this.PLAN = PLAN;', ctx);
const { CFG, TRAP_CLASSES, TRAP_SPANS, FloorPlanner, PLAN } = ctx;

let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; };

/* ---------- 1. зоны ---------- */
for (const t of Object.keys(TRAP_SPANS)) {
  let lo = Infinity, hi = -Infinity, out = 0;
  for (const diff of [0.62, 1, 2, 3.2]) {
    const tr = new TRAP_CLASSES[t](scene, 0, diff, PREFABS[t]);
    for (let k = 0; k < 2000; k++) {
      tr.update(5);
      for (const r of tr.rects()) {
        lo = Math.min(lo, r.y1); hi = Math.max(hi, r.y2);
        if (r.y1 < TRAP_SPANS[t].y1 - 0.5 || r.y2 > TRAP_SPANS[t].y2 + 0.5) out++;
      }
    }
  }
  check(out === 0 && lo - TRAP_SPANS[t].y1 < 2 && TRAP_SPANS[t].y2 - hi < 2,
    `зона ${t}: TRAP_SPANS ${TRAP_SPANS[t].y1}..${TRAP_SPANS[t].y2}, по rects() ${Math.round(lo)}..${Math.round(hi)}`);
}

/* ---------- 2. гарантия на сгенерированных шахтах ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LESSONS = ['laser', 'saw', 'spikes', 'crusher', 'tesla'];
const SEEDS = +(process.env.SEEDS || 2000), FLOORS = 300;
let worst = Infinity, worstAt = '';
const series = [], rests = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const tutorial = seed % 4 === 0;                       // часть шахт — с обучением
  const pl = new FloorPlanner(mulberry32(seed), TRAP_SPANS, CFG);
  let y = 700, prev = null, E = CFG.energyMax, cur = null;
  for (let j = 1; j <= FLOORS; j++) {
    const p = pl.next(tutorial && j <= 5 ? [LESSONS[j - 1]] : null);
    y -= p.step;
    if (p.step > CFG.floorH && j > 1) rests.push({ j, extra: p.step - CFG.floorH });
    if (p.seriesStart) { if (cur) series.push(cur); cur = { from: j, threats: 0 }; }
    cur.threats += p.types.length;
    // независимый пересчёт: зона этажа и свободный ход от предыдущей зоны
    let y1 = Infinity, y2 = -Infinity;
    p.types.forEach(t => { y1 = Math.min(y1, TRAP_SPANS[t].y1); y2 = Math.max(y2, TRAP_SPANS[t].y2); });
    const v = Math.min(CFG.maxSpeed, CFG.baseSpeed + (j - 1) * CFG.speedPerFloor);
    const enter = y + y2 + 92;                           // roofY, на котором игрок касается зоны
    const exit = y + y1 - 2;                             // roofY, на котором выходит из неё
    const free = (prev === null ? 700 : prev) - enter;
    if (free < 0) { check(false, `seed ${seed} этаж ${j}: зоны соседних этажей перекрываются`); }
    E = Math.min(CFG.energyMax, E + CFG.regenRate * free / v);
    const tHold = (enter - exit) / v;                    // всё время контакта с зоной
    E -= tHold * CFG.drainRate + (PLAN.margin - 1) * tHold * (CFG.drainRate + CFG.regenRate);
    if (E < worst) { worst = E; worstAt = `seed ${seed} этаж ${j} (${p.types.join('+')})`; }
    prev = exit;
  }
  series.push(cur);
}
check(worst >= PLAN.minEnergy, `худший запас при игре «держать всю зону» и держать на ${Math.round((PLAN.margin - 1) * 100)}% дольше: ${worst.toFixed(1)} (${worstAt}), ${SEEDS} шахт × ${FLOORS} этажей`);

/* ---------- 3. серии и передышки ---------- */
const byLen = {}; series.forEach(s => { byLen[s.threats] = (byLen[s.threats] || 0) + 1; });
const over = series.filter(s => s.threats > PLAN.seriesMax).length;
const short = series.filter(s => s.threats < PLAN.seriesMin).length;
check(over === 0, `серий длиннее ${PLAN.seriesMax} угроз: ${over}`);
console.log('     угроз в серии:', JSON.stringify(byLen), `| короче ${PLAN.seriesMin}: ${(100 * short / series.length).toFixed(2)}% (энергии хватило только на одну тяжёлую ловушку)`);
for (const [a, b] of [[1, 10], [11, 20], [21, 40], [41, 300]]) {
  const r = rests.filter(x => x.j >= a && x.j <= b), s = series.filter(x => x.from >= a && x.from <= b);
  const avg = (arr, f) => arr.length ? (arr.reduce((m, x) => m + f(x), 0) / arr.length) : 0;
  console.log(`     этажи ${String(a).padStart(3)}–${String(b).padEnd(3)}: в среднем ${avg(s, x => x.threats).toFixed(1)} угроз в серии, передышка +${Math.round(avg(r, x => x.extra))} px (макс +${r.reduce((m, x) => Math.max(m, x.extra), 0)})`);
}

console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
process.exit(fail ? 1 : 0);
