/* ХРОНОЛИФТ — YandexSDK/YandexSDK.js
 * Низкоуровневый клиент Яндекс Игр SDK (ysdk):
 * инициализация, авторизация, облачные сохранения, реклама, лидерборды, платежи.
 * Все вызовы безопасны вне платформы (локальная разработка): методы деградируют в no-op.
 */
'use strict';

const YandexClient = {
  ysdk: null,
  player: null,
  lb: null,
  payments: null,
  _paymentsTried: false,

  async init() {
    if (!window.YaGames) return false;
    try {
      this.ysdk = await window.YaGames.init();
      await this.loadPlayer();
      // текущий SDK: ysdk.leaderboards — объект (setScore/getEntries), не функция; вызов
      // ysdk.leaderboards() падал, и лидерборд на платформе был бы выключен.
      // getLeaderboards() (устаревший) — только если нового объекта нет
      try {
        if (this.ysdk.leaderboards && typeof this.ysdk.leaderboards.getEntries === 'function') this.lb = this.ysdk.leaderboards;
        else if (this.ysdk.getLeaderboards) this.lb = await this.ysdk.getLeaderboards();
      } catch (e) { this.lb = null; }
      this._subscribePlatformEvents();
    } catch (e) {
      this.ysdk = null;
    }
    return !!this.ysdk;
  },

  /* Требования модерации:
     - LoadingAPI.ready() когда игра готова к взаимодействию;
     - game_api_pause/resume — остановка звука и геймплея при потере фокуса;
     - GameplayAPI.start/stop — разметка геймплея вокруг рекламы. */
  ready() {
    try { this.ysdk && this.ysdk.features && this.ysdk.features.LoadingAPI && this.ysdk.features.LoadingAPI.ready(); } catch (e) {}
  },
  gameplayStart() { try { this.ysdk && this.ysdk.features && this.ysdk.features.GameplayAPI && this.ysdk.features.GameplayAPI.start(); } catch (e) {} },
  gameplayStop()  { try { this.ysdk && this.ysdk.features && this.ysdk.features.GameplayAPI && this.ysdk.features.GameplayAPI.stop(); } catch (e) {} },
  lang() {
    try { return (this.ysdk && this.ysdk.environment && this.ysdk.environment.i18n && this.ysdk.environment.i18n.lang) || 'ru'; }
    catch (e) { return 'ru'; }
  },
  _pauseCbs: [], _resumeCbs: [],
  onPlatformPause(cb) { this._pauseCbs.push(cb); },
  onPlatformResume(cb) { this._resumeCbs.push(cb); },
  _subscribePlatformEvents() {
    if (!this.ysdk || !this.ysdk.on) return;
    try {
      this.ysdk.on('game_api_pause', () => { this._pauseCbs.forEach(f => { try { f(); } catch (e) {} }); });
      this.ysdk.on('game_api_resume', () => { this._resumeCbs.forEach(f => { try { f(); } catch (e) {} }); });
    } catch (e) {}
  },

  async loadPlayer() {
    if (!this.ysdk) { this.player = null; return null; }
    try { this.player = await this.ysdk.getPlayer(); } catch (e) { this.player = null; }
    return this.player;
  },

  /* Авторизация: диалог Яндекса. Возвращает true при успехе. */
  async auth() {
    if (!this.ysdk || !this.ysdk.auth) return false;
    try {
      await this.ysdk.auth.openAuthDialog();
      await this.loadPlayer();
      return this.isAuthorized();
    } catch (e) { return false; }
  },

  /* player.signature есть только при getPlayer({ signed: true }) — по нему вошедший игрок
     считался бы гостем. По документации: player.isAuthorized(); getMode() — устаревший запасной путь */
  isAuthorized() {
    const p = this.player;
    if (!p) return false;
    try {
      if (typeof p.isAuthorized === 'function') return !!p.isAuthorized();
      if (typeof p.getMode === 'function') return p.getMode() !== 'lite';
    } catch (e) { return false; }
    return !!p.signature;
  },
  getName() { return (this.player && this.player.getName) ? (this.player.getName() || 'Игрок') : 'Игрок'; },

  /* ---------- облачные сохранения ---------- */
  async cloudLoad() {
    if (this.player && this.player.getData) {
      try { return await this.player.getData(); } catch (e) {}
    }
    return null;
  },
  cloudSave(data) {
    if (this.player && this.player.setData) {
      try { this.player.setData(data); } catch (e) {}
    }
  },

  /* ---------- реклама ---------- */
  /* Rewarded: cb(true) — награда выдана, cb(false) — закрыто/ошибка без награды.
     cb гарантированно вызывается один раз (onRewarded и onClose могут прийти в паре). */
  rewarded(cb) {
    if (!this.ysdk || !this.ysdk.adv) { setTimeout(() => cb(true), 600); return; } // dev-фолбэк
    let done = false;
    const once = (ok) => { if (done) return; done = true; cb(ok); };
    this.ysdk.adv.showRewardedVideo({
      callbacks: {
        onRewarded: () => once(true),
        onClose: () => once(false),
        onError: () => once(false)
      }
    });
  },
  fullscreen(cb) {
    if (!this.ysdk || !this.ysdk.adv) { if (cb) cb(); return; }
    this.ysdk.adv.showFullscreenAdv({
      callbacks: { onClose: () => { if (cb) cb(); }, onError: () => { if (cb) cb(); } }
    });
  },

  /* ---------- лидерборды ---------- */
  async lbSet(name, score) {
    if (!this.lb) return;
    try {
      if (this.lb.setScore) await this.lb.setScore(name, score);
      else await this.lb.setLeaderboardScore(name, score);
    } catch (e) {}
  },
  async lbTop(name, qty) {
    if (!this.lb) return null;
    try {
      const opts = { quantityTop: qty, includeUser: true };
      return this.lb.getEntries ? await this.lb.getEntries(name, opts) : await this.lb.getLeaderboardEntries(name, opts);
    } catch (e) { return null; }
  },

  /* ---------- платежи (IAP) ---------- */
  async ensurePayments() {
    if (this._paymentsTried) return this.payments;
    this._paymentsTried = true;
    if (this.ysdk && this.ysdk.getPayments) {
      try { this.payments = await this.ysdk.getPayments(); } catch (e) { this.payments = null; }
    }
    return this.payments;
  },
  /* cb(true) — покупка завершена; cb(false) — отмена/ошибка */
  purchase(productId, cb) {
    this.ensurePayments().then((p) => {
      if (!p) { setTimeout(() => cb(true), 600); return; } // dev-фолбэк
      p.purchase({ id: productId }).then(() => cb(true)).catch(() => cb(false));
    });
  },
  async getPurchases() {
    const p = await this.ensurePayments();
    if (!p) return [];
    try { return await p.getPurchases(); } catch (e) { return []; }
  }
};
