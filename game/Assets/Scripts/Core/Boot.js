/* ХРОНОЛИФТ — Core/Boot.js
 * Точка входа: загрузка ассетов, инициализация Яндекс SDK,
 * разрешение сохранения (облако vs локальное), запуск Phaser.
 */
'use strict';

window.__ERRORS = [];
window.addEventListener('error', (e) => {
  window.__ERRORS.push(String(e.message || e) + ' @ ' + String((e.error && e.error.stack) || '').split('\n')[1]);
});
// ошибки в async-коде (весь запуск ниже — async) не доходят до 'error', ловим отдельно
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  window.__ERRORS.push('unhandled rejection: ' + String((r && r.message) || r) + ' @ ' + String((r && r.stack) || '').split('\n')[1]);
});
window.__AUTOTEST = /[?&]autotest=1/.test(location.search);

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const S = 'Assets/Art/Sprites/';
    const list = ['player_orange', 'player_mint', 'player_violet', 'player_gold',
      'trap_spikes', 'trap_saw', 'trap_laser', 'trap_tesla',
      'trap_crusher_frame', 'trap_crusher_press',
      'coin', 'bg_wall_panel', 'bg_floor_ledge', 'lift_platform'];
    for (const n of list) this.load.image(n, S + n + '.png');
    this.load.json('trap_prefabs', 'Assets/Prefabs/traps.json');
  }
  create() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 8);
    g.generateTexture('dot', 16, 16);
    g.clear();
    g.fillStyle(0x57f2ff, 1); g.fillCircle(8, 8, 8);
    g.generateTexture('dot_cyan', 16, 16);
    g.destroy();
    this.scene.launch('MusicLoader');   // фоновая загрузка музыки (Core/Music.js): старт её не ждёт
    this.scene.start('Menu');
  }
}

(async () => {
  // 1) SDK и авторизационное состояние
  await YandexClient.init();
  // 2) сохранение: облако (если свежее) + миграция
  await resolveSaveFromCloud();
  MissionService.rolloverIfNeeded();  // новый день -> новые миссии
  AnalyticsService.track('session_start', { authorized: YandexClient.isAuthorized() });

  // 3) запуск движка
  window.__GAME = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: Math.round(CFG.W * RENDER_SCALE),   // холст в разрешении экрана, мир — 480×800 (Config.js)
    height: Math.round(CFG.H * RENDER_SCALE),
    backgroundColor: '#0b0f17',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    pipeline: { ShockwavePipeline: ShockwavePipeline },   // волна при остановке времени (Gameplay/Shockwave.js)
    disableContextMenu: true,
    fps: { target: 60 },
    scene: [BootScene, MenuScene, GameScene, GameOverScene, SkinsScene, ShopScene, AchievementsScene, MissionsScene, SettingsScene, MusicLoaderScene]
  });

  // 3.1) требования Яндекс Игр: готовность + пауза/возобновление платформы
  YandexClient.ready();
  YandexClient.onPlatformPause(() => {
    try {
      const game = window.__GAME;
      if (game.sound && game.sound.context && game.sound.context.state === 'running') game.sound.context.suspend();
      if (game.loop) game.loop.sleep();
    } catch (e) {}
  });
  YandexClient.onPlatformResume(() => {
    try {
      const game = window.__GAME;
      if (game.sound && game.sound.context && game.sound.context.state === 'suspended' && save.sound !== false) game.sound.context.resume();
      if (game.loop) game.loop.wake();
    } catch (e) {}
  });

  // 4) автотест: автопилот прогоняет игру, результат — в DOM
  if (window.__AUTOTEST) {
    setTimeout(() => { window.__GAME.scene.start('Game'); }, 1500);
    setTimeout(() => {
      const gs = window.__GAME.scene.getScene('Game');
      const res = {
        errors: window.__ERRORS,
        floors: gs ? gs.floorsPassed : -1,
        score: gs ? gs.score + gs.floorsPassed * 10 : -1,
        coins: gs ? gs.coinsRun : -1,
        energyMax: gs ? gs.energyMax : -1,
        reviveUsed: gs ? gs.reviveUsed : null,
        perfects: gs ? gs.perfectsRun : -1,
        runTime: gs ? Math.round(gs.runTime) : -1,
        dead: gs ? gs.dead : null,
        traps: gs ? gs.traps.length : -1,
        status: 'TEST_DONE'
      };
      window.__TEST_RESULT = res;
      const div = document.createElement('div');
      div.id = 'testlog';
      div.style.display = 'none';
      div.textContent = JSON.stringify(res);
      document.body.appendChild(div);
      document.title = 'TEST_DONE';
    }, 30000);
  }
})();
