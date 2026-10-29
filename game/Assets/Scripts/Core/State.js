/* ХРОНОЛИФТ — Core/State.js
 * Сохранения: версионирование, миграция, локальное хранилище + облачная синхронизация.
 */
'use strict';

const SAVE_VERSION = 3;

function defaultSave() {
  return {
    version: SAVE_VERSION,
    updatedAt: 0,
    tutorialDone: false,
    seenWelcome: false,
    seenTraps: {},                            // тип ловушки -> показано интро
    coins: 0,
    perfects: 0,
    games: 0,
    streak: 0,
    lastDaily: '',
    missions: {                               // ежедневные миссии (MissionService)
      date: '',                               // YYYY-MM-DD, к какому дню относятся
      selected: [],                           // id выбранных на день миссий (3)
      counters: {},                           // тип метрики -> прогресс за день
      claimed: {}                             // id миссии -> true (награду забрали)
    },
    selectedSkin: 'orange',
    unlocks: { mint: false, violet: false },   // gold открывается через purchases
    purchases: {},                              // id товара -> true (IAP, облачно)
    achievements: [],                           // id разблокированных достижений
    best: { score: 0, floors: 0 },
    sound: true,
    music: true,                                // фоновая музыка (Core/Music.js), отдельно от звуков
    showZones: false                            // рамки зон ловушек в забеге (GameScene.drawZones)
  };
}

let save = defaultSave();

/* Миграция: глубокое слияние с дефолтом + выставление версии */
function migrateSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const out = Object.assign(base, raw);
  out.best = Object.assign(defaultSave().best, raw.best || {});
  out.unlocks = Object.assign(defaultSave().unlocks, raw.unlocks || {});
  out.purchases = Object.assign({}, raw.purchases || {});
  out.achievements = Array.isArray(raw.achievements) ? raw.achievements : [];
    out.missions = Object.assign(defaultSave().missions, raw.missions || {});
    if (!Array.isArray(out.missions.selected)) out.missions.selected = [];
    if (!out.missions.counters || typeof out.missions.counters !== 'object') out.missions.counters = {};
    if (!out.missions.claimed || typeof out.missions.claimed !== 'object') out.missions.claimed = {};
    out.version = SAVE_VERSION;
    return out;
}

function loadSaveLocal() {
  try {
    const s = localStorage.getItem('chronolift_save');
    if (s) save = migrateSave(JSON.parse(s));
  } catch (e) {}
}

/* Облако vs локаль: побеждает более свежий updatedAt */
async function resolveSaveFromCloud() {
  loadSaveLocal();
  const cloud = await YandexClient.cloudLoad();
  if (cloud && typeof cloud === 'object') {
    const cloudM = migrateSave(cloud);
    if ((cloudM.updatedAt || 0) > (save.updatedAt || 0)) save = cloudM;
  }
  saveNow();
}

function saveNow() {
  save.updatedAt = Date.now();
  try { localStorage.setItem('chronolift_save', JSON.stringify(save)); } catch (e) {}
  YandexClient.cloudSave(save);
}
