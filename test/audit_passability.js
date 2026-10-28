/* Аудит проходимости генератора ХРОНОЛИФТ.
 * Реплицирует формулы spawnFloor (GameScene.js) + геометрию/фазы Traps.js
 * и считает: худший энергетический бюджет этажа vs запас батареи,
 * а также читаемость телеграфов на человеческую реакцию 250 мс.
 */
'use strict';

const CFG = { energyMax: 100, drainRate: 26, regenRate: 17, baseSpeed: 95, speedPerFloor: 4.5, maxSpeed: 270, floorH: 300 };
const PREFABS = {
  laser: { durOff: 1500, durTele: 380, durOn: 950 },
  saw: { amplitude: 175, speed: 1.0 },
  spikes: { durHidden: 1250, durWarn: 380, durOut: 850 },
  crusher: { durUp: 1600, durWarn: 420, slamTime: 120, durHold: 700, durRise: 850 },
  tesla: { durIdle: 1500, durCharge: 750, durZap: 480 }
};
const REACTION = 250; // мс, человеческая реакция

// Ширина зоны контакта в px (из rects() Traps.js): dy-окно пересечения с игроком
const CONTACT_PX = {
  laser: 116,   // +47..+163
  tesla: 116,   // +44..+160
  spikes: 164,  // зона 70 (от остриёв до пола) + игрок 94; до 28.10 было 195
  crusher: 182, // зона 88 (плита пресса) + игрок 94; до 28.10 было 246
  saw: 198      // -39..+159
};
// Плохой случай по фазам: сколько px зоны придётся держать при неудачном тайминге
const WORST_HOLD_PX = {
  laser: 116,   // луч включён всю зону
  tesla: 116,   // разряд всю зону
  spikes: 164,  // warn стартовал на входе -> держим всю зону
  crusher: 190, // warn на входе (зона пустая, но фриз до конца плиты)
  saw: 198      // диск паркуем, держим всю зону
};

function speedAt(i) { return Math.min(CFG.maxSpeed, CFG.baseSpeed + i * CFG.speedPerFloor); }
function diffAt(i) { return 1 + Math.min(2.2, i * 0.09); }

// генератор spawnFloor (копия логики GameScene)
function genFloor(i, rand) {
  const pool5 = ['spikes', 'saw', 'laser', 'crusher', 'tesla'];
  const combo = i >= 6 && rand() < Math.min(0.45, 0.12 + i * 0.02);
  if (combo) {
    const a = pool5[Math.floor(rand() * pool5.length)];
    let b = pool5[Math.floor(rand() * pool5.length)];
    if (b === a) b = pool5[(pool5.indexOf(a) + 1) % pool5.length];
    return [a, b];
  }
  return [pool5[Math.floor(rand() * pool5.length)]];
}

// читаемость телеграфов: телеграф >= реакции? длина ON-окна >= реакции?
function telegraphFair(type, diff) {
  const p = PREFABS[type];
  if (type === 'laser') return p.durTele >= REACTION && p.durOn / diff >= REACTION * 0.8;
  if (type === 'spikes') return p.durWarn >= REACTION && p.durOut / diff >= REACTION * 0.5;
  if (type === 'crusher') return p.durWarn >= REACTION;
  if (type === 'tesla') return p.durCharge >= REACTION;
  if (type === 'saw') { // период синуса: парковка возможна, период >= 2.4с
    const period = 2 * Math.PI / (0.0016 * p.speed) / (0.9 + diff * 0.15);
    return period >= 2400;
  }
  return true;
}

function audit() {
  const WORST_FLOOR = 60;
  let worstMargin = Infinity, worstAt = null;
  const pairStats = {};
  console.log('этаж | скор | сложн | худшая пара (из 200 сидов) | энергия худшего | запас%');
  for (let i = 1; i <= WORST_FLOOR; i++) {
    const v = speedAt(i), diff = diffAt(i);
    let maxCost = 0, worstPair = null;
    const seen = {};
    for (let s = 0; s < 200; s++) {
      const types = genFloor(i, Math.random);
      const key = types.slice().sort().join('+');
      seen[key] = (seen[key] || 0) + 1;
      // энергия: сумма худших удержаний; реген между этажами учитываем отдельно
      const holdPx = types.reduce((a, t) => a + WORST_HOLD_PX[t], 0);
      const cost = CFG.drainRate * holdPx / v;              // энергия на этаже
      if (cost > maxCost) { maxCost = cost; worstPair = key; }
    }
    // реген в пути к этажу: ~300px на скорости v (без заморозки)
    const regen = CFG.regenRate * (CFG.floorH / v);
    const pool = CFG.energyMax + regen;                    // что реально доступно на входе
    const margin = pool - maxCost;
    if (margin < worstMargin) { worstMargin = margin; worstAt = i; }
    if (i <= 12 || i % 6 === 0) {
      console.log(String(i).padStart(4) + ' | ' + v.toFixed(0).padStart(4) + ' | ' + diff.toFixed(2) + ' | ' +
        worstPair.padEnd(16) + ' | ' + maxCost.toFixed(0).padStart(6) + ' | ' + (margin / pool * 100).toFixed(0).padStart(4) + '%');
    }
    // статистика пар (для комбо-баланса)
    if (i >= 6 && i <= 10) {
      for (const k of Object.keys(seen)) {
        if (k.includes('+')) pairStats[k] = (pairStats[k] || 0) + seen[k];
      }
    }
    // честность телеграфов
    if (!telegraphFair('laser', diff) || !telegraphFair('spikes', diff) || !telegraphFair('saw', diff)) {
      console.log('  !! телеграфы короче реакции на этаже ' + i + ' (diff ' + diff.toFixed(2) + ')');
    }
  }
  console.log('\nХУДШИЙ ЗАПАС: этаж ' + worstAt + ', ' + worstMargin.toFixed(1) + ' энергии до перегрузки');
  console.log('Пары комбо (этажи 6-10, частота):', JSON.stringify(pairStats));
}
audit();
