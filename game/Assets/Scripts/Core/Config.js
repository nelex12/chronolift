/* ХРОНОЛИФТ — Core/Config.js
 * Глобальные константы игры: баланс, скины, товары, достижения, ежедневные награды.
 */
'use strict';

const CFG = {
  W: 480, H: 800,
  floorH: 300,
  baseSpeed: 95, speedPerFloor: 4.5, maxSpeed: 270,
  energyMax: 100, drainRate: 26, regenRate: 17, overloadRegen: 30,
  reviveCostCoins: 100
};

/* Масштаб отрисовки. Мир игры — всегда CFG.W×CFG.H (480×800), все координаты в коде в нём.
 * Холст же создаётся в RENDER_SCALE раз больше, а камера каждой сцены увеличивает мир
 * в столько же раз (fitCamera). Иначе браузер растягивал холст 480×800 на экран — мыло:
 * на мониторе 2560×1440 примерно в 1,8 раза, на телефоне с плотностью 3 — в 2,4 раза.
 * Считается по экрану, чтобы и в полноэкранном режиме было чётко, и по окну — на случай, если
 * браузер сообщает о экране неправдоподобный размер (бывает в iframe и headless); берётся больший.
 * Не больше 3. */
const RENDER_SCALE = (function () {
  const dpr = window.devicePixelRatio || 1;
  const fit = (w, h) => Math.min((w || 0) / CFG.W, (h || 0) / CFG.H);
  const scr = window.screen || {};
  const s = Math.max(fit(scr.width, scr.height), fit(window.innerWidth, window.innerHeight)) * dpr;
  return Math.min(3, Math.max(1, Math.round(s * 4) / 4));  // шаг 0,25: холст без дробных пикселей
})();

/* Скины: 3 открываются достижениями, золотой — покупкой в магазине.
 * Бонусы: regenMul — скорость восстановления энергии, energyMul — макс. энергия. */
const SKINS = [
  { id: 'orange', name: 'БОРТИНЖЕНЕР', sprite: 'player_orange',
    bonus: 'сбалансированный костюм', regenMul: 1.0, energyMul: 1.0, unlock: null },
  { id: 'mint', name: 'ХРОНО-АГЕНТ', sprite: 'player_mint',
    bonus: '+25% к восстановлению энергии', regenMul: 1.25, energyMul: 1.0,
    unlock: { type: 'floors', value: 10, text: 'Достигни 10 этажа за один забег' } },
  { id: 'violet', name: 'НОЧНОЙ СТРАЖ', sprite: 'player_violet',
    bonus: '+15% к макс. энергии', regenMul: 1.0, energyMul: 1.15,
    unlock: { type: 'perfects', value: 25, text: 'Сделай 25 идеальных остановок суммарно' } },
  { id: 'gold', name: 'ХРОНО-СУЛТАН', sprite: 'player_gold',
    bonus: '+10% к макс. энергии', regenMul: 1.0, energyMul: 1.10,
    unlock: { type: 'purchase', value: 'skin_gold', text: 'Эксклюзив магазина' } }
];

/* Магазин: минимум 3 товара (требование курса). IAP через платёжный SDK Яндекса. */
const PRODUCTS = [
  { id: 'remove_ads', name: 'ТИШИНА', desc: 'Отключает межсессионную рекламу навсегда',
    price: '99 ₽', iap: true, consumable: false },
  { id: 'coins_pack', name: 'МЕШОК МОНЕТ', desc: '500 монет для возрождений и будущих трат',
    price: '49 ₽', iap: true, consumable: true },
  { id: 'skin_gold', name: 'СКИН «ХРОНО-СУЛТАН»', desc: 'Золотой костюм: +10% к макс. энергии',
    price: '149 ₽', iap: true, consumable: false }
];

/* Ежедневная награда: серия входов (streak), 7-дневный цикл. */
const DAILY_REWARDS = [25, 50, 75, 100, 150, 200, 300];

/* Ежедневные миссии: пул из 11, каждый день детерминированно выбираются 3 (MissionService).
 * mode 'add' — счётчик суммируется за день; 'max' — лучшее значение в рамках забега за день.
 * Награда — монеты (faucet экономики, см. docs/RETENTION.md). */
const MISSIONS = [
  { id: 'm_floors30', name: 'ПОДЪЁМ',       desc: 'Пройди в сумме 30 этажей',         type: 'floors',      mode: 'add', value: 30, reward: 40 },
  { id: 'm_floors60', name: 'МАРАФОН',      desc: 'Пройди в сумме 60 этажей',         type: 'floors',      mode: 'add', value: 60, reward: 80 },
  { id: 'm_runs3',    name: 'СМЕНЫ',        desc: 'Сыграй 3 забега',                  type: 'runs',        mode: 'add', value: 3,  reward: 30 },
  { id: 'm_runs5',    name: 'НОЧНАЯ СМЕНА', desc: 'Сыграй 5 забегов',                 type: 'runs',        mode: 'add', value: 5,  reward: 50 },
  { id: 'm_perf5',    name: 'ТОЧНОСТЬ',     desc: 'Сделай 5 идеальных остановок',     type: 'perfects',    mode: 'add', value: 5,  reward: 50 },
  { id: 'm_coins25',  name: 'КАЗНА',        desc: 'Собери 25 монет в забегах',        type: 'coins',       mode: 'add', value: 25, reward: 40 },
  { id: 'm_freeze30', name: 'ХРОНОМАСТЕР',  desc: 'Останови время в сумме 30 секунд', type: 'frozen_secs', mode: 'add', value: 30, reward: 60 },
  { id: 'm_mini2',    name: 'КАЛИБРОВЩИК',  desc: 'Победи в 2 минииграх',             type: 'minigames',   mode: 'add', value: 2,  reward: 45 },
  { id: 'm_revive1',  name: 'НЕУЯЗВИМЫЙ',   desc: 'Используй 1 возрождение',             type: 'revives',     mode: 'add', value: 1,  reward: 35 },
  { id: 'm_floor20',  name: 'ВЫСОТЫ',       desc: 'Достигни 20 этажа за один забег',  type: 'floor_run',   mode: 'max', value: 20, reward: 80 },
  { id: 'm_combo4',   name: 'КОМБО-МАСТЕР', desc: 'Собери комбо ×4 за один забег',    type: 'combo',       mode: 'max', value: 4,  reward: 60 }
];

/* Достижения: коллекционные + мастерство. Награда — монеты (faucet экономики). */
const ACHIEVEMENTS = [
  { id: 'f3',  name: 'ПЕРВЫЙ ПОДЪЁМ',  desc: 'Пройди 3 этажа за один забег',
    type: 'floors_run', value: 3, reward: 20 },
  { id: 'f10', name: 'СМОТРИТЕЛЬ',     desc: 'Пройди 10 этажей за один забег',
    type: 'floors_run', value: 10, reward: 50 },
  { id: 'f25', name: 'ХРОНО-ВЕТЕРАН',  desc: 'Пройди 25 этажей за один забег',
    type: 'floors_run', value: 25, reward: 150 },
  { id: 'c15', name: 'МОНЕТНЫЙ МАГНАТ', desc: 'Собери 15 монет за один забег',
    type: 'coins_run', value: 15, reward: 40 },
  { id: 'p25', name: 'ИДЕАЛЬНЫЙ ТАЙМИНГ', desc: 'Сделай 25 идеальных остановок суммарно',
    type: 'perfects_total', value: 25, reward: 100 },
  { id: 'g10', name: 'ЗАВСЕГДАТАЙ',    desc: 'Сыграй 10 игр',
    type: 'games_total', value: 10, reward: 60 },
  { id: 'd3',  name: 'СЕРИЯ ×3',       desc: 'Заходи в игру 3 дня подряд',
    type: 'streak', value: 3, reward: 100 }
];
