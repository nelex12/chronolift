/* ХРОНОЛИФТ — Services/MissionService.js
 * Ежедневные миссии (retention): 3 миссии в день, детерминированно выбранные
 * из пула MISSIONS по дате. Прогресс копится в течение дня (сумма либо максимум
 * в рамках забега), в 00:00 сбрасывается. Награда — монеты, забирается в
 * сцене «Missions» (эффект Зейгарник + гипотеза градиента цели, см. RETENTION.md).
 */
'use strict';

const MissionService = {
  PER_DAY: 3,

  today() { return DailyService.today(); },

  /* хеш строки (FNV-1a) — сид для детерминированной выборки миссий дня */
  seedOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  /* выбор 3 миссий из пула по дате (одинаков для всех устройств игрока).
   * Миссии дня — с разными счётчиками (type): иначе «30 этажей» и «60 этажей»
   * засчитываются одним действием и фактически миссий меньше трёх */
  selectFor(dateStr) {
    let s = this.seedOf(dateStr) || 1;
    const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    let pool = MISSIONS.slice();
    const picked = [];
    for (let i = 0; i < this.PER_DAY && pool.length; i++) {
      const m = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      picked.push(m.id);
      pool = pool.filter((x) => x.type !== m.type);
    }
    return picked;
  },

  /* ежедневный сброс: save от другого дня -> новые миссии, нулевые счётчики */
  rolloverIfNeeded() {
    const t = this.today();
    if (!save.missions || typeof save.missions !== 'object') save.missions = defaultSave().missions;
    if (save.missions.date !== t) {
      save.missions = { date: t, selected: this.selectFor(t), counters: {}, claimed: {} };
      AnalyticsService.track('missions_reset', { date: t, selected: save.missions.selected });
      saveNow();
    }
    return save.missions;
  },

  /* миссии дня с прогрессом; m.claimed — true, если награду уже забрали */
  todayMissions() {
    const m = this.rolloverIfNeeded();
    return m.selected
      .map((id) => MISSIONS.find((x) => x.id === id))
      .filter(Boolean)
      .map((a) => Object.assign({}, a, {
        progress: (m.counters[a.type] || 0),
        claimed: !!m.claimed[a.id]
      }));
  },

  isDone(m) { return (m.progress || 0) >= m.value; },

  /* прогресс по метрике. mode 'add' — прибавка, 'max' — максимум за день.
   * НЕ сохраняет save (дешёво — вызывается из геймплея); сохранение —
   * в claim()/gameOver()/rolloverIfNeeded(). Возвращает СВЕЖИЕ выполненные
   * (ещё не забранные) миссии — для тостов в HUD. */
  progress(type, amount, mode) {
    const m = this.rolloverIfNeeded();
    if (mode === 'max') m.counters[type] = Math.max(m.counters[type] || 0, amount);
    else m.counters[type] = (m.counters[type] || 0) + amount;
    const fresh = [];
    for (const def of m.selected.map((id) => MISSIONS.find((x) => x.id === id)).filter(Boolean)) {
      if (def.type !== type || m.claimed[def.id]) continue;
      if ((m.counters[type] || 0) >= def.value) {
        fresh.push(Object.assign({}, def, { progress: m.counters[type], claimed: false }));
      }
    }
    return fresh;
  },

  /* забрали награду; возвращает миссию (для звука/тоста) или null */
  claim(id) {
    const m = this.rolloverIfNeeded();
    const def = MISSIONS.find((a) => a.id === id);
    if (!def || m.claimed[id] || (m.counters[def.type] || 0) < def.value) return null;
    m.claimed[id] = true;
    EconomyService.grant(def.reward, 'mission:' + id);
    AnalyticsService.track('mission_claim', { id: id, reward: def.reward });
    return def;
  },

  /* выполненные, но ещё не забранные — для бейджа на кнопке в меню */
  claimableCount() {
    return this.todayMissions().filter((m) => !m.claimed && m.progress >= m.value).length;
  }
};