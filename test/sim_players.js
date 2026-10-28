/* Симуляция игроков на настоящем коде ловушек (Traps.js) и генератора (FloorPlanner.js), без браузера.
 * Повторяет порядок кадра GameScene.update: решение о заморозке -> движение -> энергия -> ловушки ->
 * засчитывание этажа -> столкновение. Этажи появляются, как в игре, за 2400 px до игрока.
 *
 * Реактивный игрок зажимает ровно тогда, когда без этого в следующем кадре погиб бы, и держит,
 * пока это так (держать меньше нельзя). Варианты ошибок:
 *  - тратит на 20% больше энергии (заморозка стоит ×1,2);
 *  - отпускает на 20% позже, чем нужно (лишнее удержание после выхода из зоны).
 * Для них должно быть 0 смертей: это гарантия генератора (test/audit_passability.js).
 * Оба промаха сразу (+44%) — за пределами гарантии, печатается для сведения.
 * Запуск: node test/sim_players.js (RUNS=300 FLOORS=60 по умолчанию)
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
  clear() {}, lineStyle() {}, beginPath() {}, moveTo() {}, lineTo() {}, strokePath() {}
};
const stub = (x, y) => Object.assign(Object.create(stubProto), { __stub: true, x: x || 0, y: y || 0 });
const scene = { add: { image: stub, rectangle: stub, graphics: () => stub() }, trapTone() {}, time: { now: 0 }, cameras: { main: { shake() {} } } };
const ctx = { window: { devicePixelRatio: 1, innerWidth: 480, innerHeight: 800 }, Phaser: { Math: { Linear: (a, b, t) => a + (b - a) * t } } };
vm.createContext(ctx);
vm.runInContext(['Core/Config.js', 'Gameplay/Traps.js', 'Gameplay/FloorPlanner.js']
  .map(f => fs.readFileSync(path.join(S, f), 'utf8')).join('\n') +
  '\nthis.CFG = CFG; this.TRAP_CLASSES = TRAP_CLASSES; this.TRAP_SPANS = TRAP_SPANS; this.FloorPlanner = FloorPlanner;' +
  ' Math.random = function () { return __rng(); };', ctx);
const { CFG, TRAP_CLASSES, TRAP_SPANS, FloorPlanner } = ctx;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DT = 1 / 60;

function cloneTrap(tr) {
  const c = Object.create(Object.getPrototypeOf(tr));
  for (const k of Object.keys(tr)) { const v = tr[k]; c[k] = (v && v.__stub) ? Object.assign(Object.create(stubProto), v) : v; }
  return c;
}

class Run {
  constructor(seed, drainMul) {
    this.rng = mulberry32(seed);
    ctx.__rng = this.rng;                                  // фаза пилы при создании
    this.planner = new FloorPlanner(mulberry32(seed * 7919), TRAP_SPANS, CFG);
    this.drainMul = drainMul;
    this.roofY = 700; this.lastFloorY = 700; this.pending = null; this.floorIdx = 0;
    this.traps = []; this.energy = CFG.energyMax; this.frozen = false; this.overload = false;
    this.floorsPassed = 0; this.dead = false; this.t = 0;
    this.ensureFloors();
  }
  ensureFloors() {
    for (;;) {
      if (!this.pending) this.pending = this.planner.next(null);
      const y = this.lastFloorY - this.pending.step;
      if (y <= this.roofY - 2400) break;
      this.floorIdx++;
      const diff = 1 + Math.min(2.2, this.floorIdx * 0.09);
      for (const t of this.pending.types) { const tr = new TRAP_CLASSES[t](scene, y, diff, PREFABS[t]); tr.floor = this.floorIdx; this.traps.push(tr); }
      this.lastFloorY = y; this.pending = null;
    }
  }
  speed() { return Math.min(CFG.maxSpeed, CFG.baseSpeed + this.floorsPassed * CFG.speedPerFloor); }
  probe() {                                                // кадр без заморозки: погиб бы?
    const c = Object.create(Run.prototype);
    Object.assign(c, this);
    c.traps = this.traps.filter(tr => Math.abs(tr.ledgeY - this.roofY) < 700).map(cloneTrap);
    c.probing = true;
    c.step(false);
    return c.dead;
  }
  step(wantHold) {
    this.t += DT;
    if (wantHold && !this.frozen && !this.overload && this.energy > 1) this.frozen = true;
    if ((!wantHold || this.overload) && this.frozen) this.frozen = false;
    this.roofY -= this.speed() * DT;
    if (this.frozen) {
      this.energy -= CFG.drainRate * this.drainMul * DT;
      if (this.energy <= 0) { this.energy = 0; this.frozen = false; this.overload = true; }
    } else {
      this.energy = Math.min(CFG.energyMax, this.energy + CFG.regenRate * DT);
      if (this.overload && this.energy >= CFG.overloadRegen) this.overload = false;
    }
    for (const tr of this.traps) {
      if (!this.frozen) tr.update(DT * 1000);
      if (!tr.done && this.roofY < tr.ledgeY - 150) {
        tr.done = true;
        if (!this.traps.some(x => x.ledgeY === tr.ledgeY && !x.done)) this.floorsPassed++;   // как GameScene.floorPassedBy
      }
    }
    if (!this.frozen) {
      const pr = { x1: 218, x2: 262, y1: this.roofY - 92, y2: this.roofY + 2 };
      for (const tr of this.traps) {
        if (Math.abs(tr.ledgeY - this.roofY) > 320) continue;
        for (const r of tr.rects()) if (pr.x1 < r.x2 && pr.x2 > r.x1 && pr.y1 < r.y2 && pr.y2 > r.y1) { this.dead = true; this.killer = tr; }
      }
    }
    if (!this.probing) { this.ensureFloors(); this.traps = this.traps.filter(tr => tr.ledgeY <= this.roofY + 500); }
  }
}

function play(seed, drainMul, lateRelease, floors) {
  const r = new Run(seed, drainMul);
  let holding = false, holdStart = 0, releaseAt = -1, minE = r.energy;
  while (!r.dead && r.floorsPassed < floors && r.t < 900) {
    let want;
    if (r.probe()) { if (!holding) holdStart = r.t; holding = true; releaseAt = -1; want = true; }
    else if (holding) {
      if (releaseAt < 0) releaseAt = r.t + lateRelease * (r.t - holdStart);
      want = r.t < releaseAt;
      if (!want) holding = false;
    } else want = false;
    r.step(want);
    minE = Math.min(minE, r.energy);
  }
  return { dead: r.dead, floor: r.floorsPassed, minE, killer: r.dead ? r.killer.type + '@' + r.killer.floor : null };
}

const RUNS = +(process.env.RUNS || 300), FLOORS = +(process.env.FLOORS || 60);
let fail = 0;
const players = [
  ['без ошибок', 1.0, 0, true],
  ['тратит на 20% больше энергии', 1.2, 0, true],
  ['отпускает на 20% позже', 1.0, 0.2, true],
  ['оба промаха сразу (+44%, вне гарантии)', 1.2, 0.2, false]
];
for (const [name, dm, lr, guaranteed] of players) {
  const res = []; for (let s = 1; s <= RUNS; s++) res.push(play(s, dm, lr, FLOORS));
  const dead = res.filter(x => x.dead);
  const minE = res.reduce((m, x) => Math.min(m, x.minE), Infinity);
  const msg = `${name}: погибли ${dead.length} из ${RUNS} (до ${FLOORS} этажа), минимум энергии ${minE.toFixed(1)}` +
    (dead.length ? ', например ' + dead.slice(0, 3).map(x => x.killer + ' на ' + x.floor).join(', ') : '');
  if (guaranteed) { const ok = dead.length === 0; console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; }
  else console.log('INFO | ' + msg);
}
console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
process.exit(fail ? 1 : 0);
