/* ХРОНОЛИФТ — Services/AdsService.js
 * Монетизация: Rewarded Video и Interstitial по правилам удержания:
 *  - interstitial только на естественных паузах (game over), не чаще раза в 90 с,
 *    и отключается покупкой «ТИШИНА»;
 *  - rewarded — всегда по инициативе игрока (возрождение, ×2 монет).
 */
'use strict';

const AdsService = {
  cooldownMs: 90000,
  lastInterstitialAt: 0,

  /* resolves(true) если награда выдана */
  showRewarded(placement) {
    AnalyticsService.track('ad_rewarded_requested', { placement: placement });
    YandexClient.gameplayStop();
    Music.adStart();                 // во время рекламы звук игры выключен (требование Яндекс Игр)
    return new Promise((resolve) => {
      YandexClient.rewarded((granted) => {
        Music.adEnd();
        YandexClient.gameplayStart();
        AnalyticsService.track('ad_rewarded_result', { placement: placement, granted: granted });
        resolve(granted);
      });
    });
  },

  /* returns Promise, resolves когда рекламу можно продолжить */
  showInterstitial() {
    if (save.purchases && save.purchases.remove_ads) return Promise.resolve();
    if (Date.now() - this.lastInterstitialAt < this.cooldownMs) return Promise.resolve();
    this.lastInterstitialAt = Date.now();
    AnalyticsService.track('ad_interstitial_shown', {});
    YandexClient.gameplayStop();
    Music.adStart();
    return new Promise((resolve) => YandexClient.fullscreen(() => {
      Music.adEnd();
      YandexClient.gameplayStart();
      resolve();
    }));
  },

  onGameOver() {
    // каждый второй game over — природная пауза для межсессионной рекламы
    if (save.games > 0 && save.games % 2 === 0) this.showInterstitial();
  }
};
