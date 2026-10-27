/* Мок Яндекс Игр SDK для оффлайн-тестирования интеграции.
 * Переопределяет window.YaGames; все вызовы пишет в window.__YANDEX_CALLS. */
(function () {
  'use strict';
  window.__YANDEX_CALLS = [];
  function log(m) { window.__YANDEX_CALLS.push(m); }
  var cloudStore = {};
  var lbScores = {};
  var purchases = [];
  var handlers = {};

  window.YaGames = {
    init: function () {
      log('YaGames.init');
      var player = {
        _name: 'Тестовый Игрок',
        // как в SDK: signature только при getPlayer({ signed: true }), вход — через isAuthorized()
        _authorized: true,
        isAuthorized: function () { return this._authorized; },
        getName: function () { return this._name; },
        setData: function (d) { Object.keys(d).forEach(function (k) { cloudStore[k] = d[k]; }); log('player.setData:' + Object.keys(d).join(',')); return Promise.resolve(); },
        getData: function () { log('player.getData'); return Promise.resolve(JSON.parse(JSON.stringify(cloudStore))); }
      };
      // как в текущем SDK: ysdk.leaderboards — объект с setScore/getEntries
      var lb = {
        setScore: function (n, s) { lbScores[n] = s; log('lb.set:' + n + '=' + s); return Promise.resolve(); },
        getEntries: function (n, o) {
          log('lb.get:' + n);
          var mine = lbScores[n] || 0;
          return Promise.resolve({
            entries: [
              { rank: 1, score: 55, player: { publicName: 'Мок-Мастер', getAvatarSrc: function () { return ''; } } },
              { rank: 2, score: Math.max(mine, 21), player: { publicName: 'Тестовый Игрок', getAvatarSrc: function () { return ''; } } }
            ],
            userRank: mine ? 2 : 0  // как в SDK: 0 — игрока нет в таблице
          });
        }
      };
      var pay = {
        purchase: function (opt) { log('payments.purchase:' + opt.id); purchases.push({ productID: opt.id }); return Promise.resolve({ productID: opt.id }); },
        getPurchases: function () { log('payments.getPurchases'); return Promise.resolve(purchases.slice()); }
      };
      window.__YSDK = {
        auth: { openAuthDialog: function () { log('auth.openAuthDialog'); player._authorized = true; return Promise.resolve(); } },
        getPlayer: function () { log('ysdk.getPlayer'); return Promise.resolve(player); },
        leaderboards: lb,
        getPayments: function () { log('ysdk.getPayments'); return Promise.resolve(pay); },
        adv: {
          showRewardedVideo: function (o) { log('adv.showRewardedVideo'); setTimeout(function () { o.callbacks.onRewarded(); o.callbacks.onClose(); }, 250); },
          showFullscreenAdv: function (o) { log('adv.showFullscreenAdv'); setTimeout(function () { o.callbacks.onClose(); }, 250); }
        },
        features: {
          LoadingAPI: { ready: function () { log('LoadingAPI.ready'); } },
          GameplayAPI: {
            start: function () { log('GameplayAPI.start'); },
            stop: function () { log('GameplayAPI.stop'); }
          }
        },
        environment: { i18n: { lang: 'ru', tld: 'ru' } },
        on: function (e, cb) { (handlers[e] = handlers[e] || []).push(cb); log('ysdk.on:' + e); },
        off: function (e, cb) {},
        __trigger: function (e) { (handlers[e] || []).forEach(function (f) { f(); }); }
      };
      return Promise.resolve(window.__YSDK);
    }
  };
  window.__triggerYandex = function (e) { window.__YSDK && window.__YSDK.__trigger(e); };
})();
