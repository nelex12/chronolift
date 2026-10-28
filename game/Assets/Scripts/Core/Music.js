/* ХРОНОЛИФТ — Core/Music.js
 * Фоновая музыка: в меню — один трек, в забеге — три по очереди (каждый новый забег — следующий).
 * Все треки зациклены. Музыка — HydroGene, «High Quality 8-bit / Chiptune Musics», CC0
 * (Assets/Audio/Music/CREDITS.md). Играет, только если включены звук (save.sound) и музыка (save.music).
 * Звуковой менеджер Phaser общий для всех сцен, поэтому трек не прерывается при смене экранов.
 * Трек меню грузится в Boot (0,5 МБ), треки забега — в фоне из меню, чтобы не задерживать старт.
 */
'use strict';

const MUSIC = {
  menu: 'music_menu',                                         // 13. I am not clumsy
  game: ['music_game_1', 'music_game_2', 'music_game_3'],     // Perilous Dungeon, Boss Battle, Mechanical Complex
  volume: { menu: 0.4, game: 0.3 }
};

const Music = {
  want: null,          // { key, vol } — что должно играть сейчас
  current: null,       // Phaser.Sound
  nextGame: 0,

  /* ogg — без паузы на стыке петли; mp3 — запасной для Safari. Phaser берёт первый поддерживаемый */
  files(key) { return ['Assets/Audio/Music/' + key + '.ogg', 'Assets/Audio/Music/' + key + '.mp3']; },

  /* поставить в загрузку треки, которых ещё нет; в create() загрузчик сцены нужно запускать вручную */
  preload(scene, keys) {
    let n = 0;
    for (const k of keys) {
      if (scene.cache.audio.exists(k)) continue;
      scene.load.audio(k, this.files(k));
      n++;
    }
    if (n && !scene.load.isLoading()) scene.load.start();
    return n;
  },

  enabled() { return save.sound !== false && save.music !== false; },

  menu(scene) { this.play(scene, MUSIC.menu, MUSIC.volume.menu); },

  /* каждый забег — следующий трек из трёх */
  game(scene) {
    const key = MUSIC.game[this.nextGame % MUSIC.game.length];
    this.nextGame++;
    this.play(scene, key, MUSIC.volume.game);
  },

  play(scene, key, vol) {
    this.want = { key: key, vol: vol };
    if (this.current && this.current.key !== key) {
      this.current.stop();
      this.current.destroy();
      this.current = null;
    }
    this.refresh(scene);
  },

  /* привести музыку в соответствие с настройками (вызывать и после переключения звука/музыки) */
  refresh(scene) {
    const w = this.want;
    if (!w) return;
    if (!this.enabled()) {
      if (this.current && this.current.isPlaying) this.current.pause();
      return;
    }
    if (!scene.cache.audio.exists(w.key)) {
      // ещё не загружен: включить, как только загрузится (если к тому времени нужен этот же трек)
      this.preload(scene, [w.key]);
      scene.load.once('filecomplete-audio-' + w.key, () => { if (this.want === w) this.refresh(scene); });
      return;
    }
    if (!this.current) this.current = scene.sound.add(w.key, { loop: true, volume: w.vol });
    if (this.current.isPaused) this.current.resume();
    else if (!this.current.isPlaying) this.current.play();
  },

  /* реклама: по правилам Яндекс Игр звук игры во время показа выключен */
  adStart() { if (this.current && this.current.isPlaying) { this.current.pause(); this.pausedForAd = true; } },
  adEnd() { if (this.pausedForAd) { this.pausedForAd = false; if (this.current && this.enabled()) this.current.resume(); } }
};
