/* ХРОНОЛИФТ — Services/LeaderboardService.js
 * Онлайн-лидерборд Яндекс Игр (глобальный, топ-N + позиция игрока).
 * Фолбэк — локальный рекорд, чтобы UI не ломался вне платформы.
 */
'use strict';

const LEADERBOARD_NAME = 'chronolift_floors';

const LeaderboardService = {
  submit(floors) {
    AnalyticsService.track('leaderboard_submit', { floors: floors });
    return YandexClient.lbSet(LEADERBOARD_NAME, floors);
  },

  /* → { entries: [{rank, name, score, me}], mine } | null */
  async top(qty) {
    const res = await YandexClient.lbTop(LEADERBOARD_NAME, qty || 5);
    if (!res || !res.entries || !res.entries.length) return null;
    // userRank в SDK Яндекса: 0 — игрока нет в таблице (раньше выводилось «Ты: 0 место»
    // или «null место»). Флага isCurrentUser у записей нет — своя строка ищется по рангу
    const myRank = res.userRank > 0 ? res.userRank : 0;
    const entries = res.entries.map((e) => ({
      rank: e.rank, name: (e.player && e.player.publicName) || 'Игрок',
      score: e.score, me: myRank > 0 && e.rank === myRank
    }));
    let mine = null;
    if (myRank) {
      const own = entries.find((e) => e.me);
      mine = { rank: myRank, score: own ? own.score : save.best.floors };
    }
    return { entries: entries, mine: mine };
  }
};
