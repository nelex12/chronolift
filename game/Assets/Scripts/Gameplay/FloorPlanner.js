/* ХРОНОЛИФТ — Gameplay/FloorPlanner.js
 * Генератор этажей сериями с гарантией проходимости.
 *
 * Гарантия строится на стратегии «держать заморозку всё время, пока игрок в опасной зоне
 * этажа»: она проходит любую ловушку при любой фазе, а идеальная игра тратит не больше неё.
 * Планировщик ведёт худший запас энергии по шахте и ставит ловушку, только если эта стратегия
 * с ошибкой игрока на 20% не опустит запас ниже PLAN.minEnergy. Ошибка — держит на 20% дольше
 * нужного; лишнее время может прийтись и на свободный ход, где игрок недополучит восстановление,
 * поэтому секунда лишнего удержания стоит drainRate + regenRate (см. holdCost).
 *
 * Ловушки идут сериями по 2–4 угрозы (этаж с двумя ловушками — две угрозы). После серии —
 * передышка: увеличенный промежуток, за который энергия гарантированно восстанавливается до
 * полной. Проверка: test/audit_passability.js (математика) и test/sim_players.js (симуляция).
 *
 * Без Phaser: rng, зоны ловушек (TRAP_SPANS) и баланс (CFG) передаются снаружи.
 */
'use strict';

const PLAN = {
  margin: 1.2,         // игрок может потратить на 20% больше энергии, чем идеальная игра
  minEnergy: 2,        // ниже заморозку не включить (GameScene: energy > 1)
  seriesMin: 2,
  seriesMax: 4,
  restMin: 150,        // передышка после серии — не короче этого (px сверх обычного шага этажей)
  playerH: 94,         // рост хитбокса игрока: контакт с зоной = её высота + 94 px
  types: ['spikes', 'saw', 'laser', 'crusher', 'tesla']
};

class FloorPlanner {
  /* rng() -> [0, 1); spans — TRAP_SPANS; cfg — CFG */
  constructor(rng, spans, cfg) {
    this.rng = rng;
    this.spans = spans;
    this.cfg = cfg;
    this.j = 0;                  // сколько этажей с ловушками уже запланировано
    this.energy = cfg.energyMax; // худший запас на выходе из зоны предыдущего этажа
    this.prevY1 = null;          // верх зоны предыдущего этажа (относительно его пола)
    this.threatsLeft = 0;        // сколько угроз ещё в текущей серии
    this.seriesNo = 0;
  }

  /* скорость на этаже j, пока игрок его не прошёл (меньше — дольше держать: худший случай) */
  speedAt(j) {
    return Math.min(this.cfg.maxSpeed, this.cfg.baseSpeed + (j - 1) * this.cfg.speedPerFloor);
  }

  /* зона этажа: объединение зон его ловушек */
  zoneOf(types) {
    let y1 = Infinity, y2 = -Infinity;
    for (const t of types) { y1 = Math.min(y1, this.spans[t].y1); y2 = Math.max(y2, this.spans[t].y2); }
    return { y1, y2, contact: y2 - y1 + PLAN.playerH };
  }

  /* сколько px свободного хода между зоной предыдущего этажа и зоной нового при шаге step */
  freeBefore(zone, step) {
    if (this.prevY1 === null) return Infinity;           // первый этаж: стартуем с полной батареей
    return step + this.prevY1 - zone.y2 - PLAN.playerH;
  }

  /* худший запас после этажа с такими ловушками; null — не помещается */
  tryFloor(types, step, j) {
    const zone = this.zoneOf(types), v = this.speedAt(j);
    const free = this.freeBefore(zone, step);
    const entry = Math.min(this.cfg.energyMax, this.energy + this.cfg.regenRate * free / v);
    const after = entry - this.holdCost(zone.contact, v);
    return after >= PLAN.minEnergy ? { zone, after } : null;
  }

  /* худшая цена прохода зоны: держать всё время контакта + 20% сверху, причём лишние 20%
   * ещё и съедают восстановление (держит там, где мог бы восстанавливаться) */
  holdCost(contact, v) {
    const t = contact / v;
    return t * (PLAN.margin * this.cfg.drainRate + (PLAN.margin - 1) * this.cfg.regenRate);
  }

  pick(list) { return list[Math.floor(this.rng() * list.length)]; }

  /* случайный выбор, как раньше: одна ловушка или (с 6-го этажа) две */
  randomTypes(j) {
    const pool = PLAN.types;
    const combo = j >= 6 && this.threatsLeft >= 2 && this.rng() < Math.min(0.45, 0.12 + j * 0.02);
    const a = this.pick(pool);
    if (!combo) return [a];
    let b = this.pick(pool);
    if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
    return [a, b];
  }

  /* передышка: шаг до следующего этажа, за который худший запас восстановится до полного */
  restStep(zone, j) {
    const v = this.speedAt(j);
    const needFree = (this.cfg.energyMax - this.energy) / this.cfg.regenRate * v;
    const baseFree = this.cfg.floorH + this.prevY1 - zone.y2 - PLAN.playerH;
    return this.cfg.floorH + Math.max(PLAN.restMin, Math.ceil(needFree - baseFree));
  }

  /* следующий этаж: { types, step, seriesStart } — step: расстояние от предыдущего этажа (px).
   * forced — обязательный набор ловушек (уроки обучения). */
  next(forced) {
    const j = this.j + 1;
    let step = this.cfg.floorH;
    let seriesStart = false;
    const startSeries = () => {
      this.seriesNo++;
      seriesStart = true;
      this.threatsLeft = PLAN.seriesMin + Math.floor(this.rng() * (PLAN.seriesMax - PLAN.seriesMin + 1));
    };

    if (this.threatsLeft <= 0) {
      if (this.prevY1 !== null) {
        // серия кончилась: передышка до полной энергии (зону следующего этажа берём худшую — выше всех)
        step = this.restStep({ y2: Math.max(...PLAN.types.map(t => this.spans[t].y2)) }, j);
        this.energy = this.cfg.energyMax;
        this.prevY1 = null;              // после передышки — как с полной батареей
      }
      startSeries();
    }

    let chosen = null, res = null;
    const candidates = forced ? [forced] : [this.randomTypes(j)];
    if (!forced) {
      // если случайный выбор не помещается — другие одиночные ловушки в случайном порядке
      const singles = PLAN.types.slice().sort(() => this.rng() - 0.5).map(t => [t]);
      candidates.push(...singles);
    }
    for (const c of candidates) { res = this.tryFloor(c, step, j); if (res) { chosen = c; break; } }

    if (!chosen) {
      // не помещается ничего: серия заканчивается раньше, передышка перед этим этажом
      const types = forced || candidates[0];
      const zone = this.zoneOf(types);
      step = this.prevY1 === null ? step : this.restStep(zone, j);
      this.energy = this.cfg.energyMax;
      this.prevY1 = null;
      startSeries();
      chosen = types;
      res = this.tryFloor(chosen, step, j);
      if (!res) {
        // одна ловушка не помещается даже в полную батарею — сюда не попадаем при текущем балансе,
        // test/audit_passability.js это проверяет
        res = { zone, after: this.cfg.energyMax - this.holdCost(zone.contact, this.speedAt(j)) };
      }
    }

    this.j = j;
    this.energy = res.after;
    this.prevY1 = res.zone.y1;
    this.threatsLeft -= chosen.length;
    return { types: chosen, step, seriesStart, series: this.seriesNo, worstEnergy: res.after };
  }
}
