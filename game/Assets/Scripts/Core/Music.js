/* ХРОНОЛИФТ — Core/Music.js
 * Фоновая музыка: в меню — один трек, в забеге — три по очереди (каждый новый забег — следующий).
 * Все треки зациклены. Музыка — HydroGene, «High Quality 8-bit / Chiptune Musics», CC0
 * (Assets/Audio/Music/CREDITS.md). Играет, только если включены звук (save.sound) и музыка (save.music).
 * Звуковой менеджер Phaser общий для всех сцен, поэтому трек не прерывается при смене экранов.
 * Трек меню грузится в Boot (0,5 МБ), треки забега — в фоне сценой MusicLoader, которая работает всю
 * игру: загрузчик обычной сцены обрывается, когда сцена закрывается (меню -> забег), и по сети треки
 * не успевали загрузиться.
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

  loader: null,         // сцена MusicLoader — её загрузчик не обрывается при смене экранов
  queued: {},           // трек -> загрузчик, в который он уже поставлен

  /* поставить в загрузку треки, которых ещё нет (в фоне, через MusicLoader, если она уже запущена) */
  preload(scene, keys) {
    const ld = this.loader || scene;
    let n = 0;
    for (const k of keys) {
      if (ld.cache.audio.exists(k) || this.queued[k] === ld.load) continue;
      this.queued[k] = ld.load;
      ld.load.audio(k, this.files(k));
      n++;
    }
    if (n && !ld.load.isLoading()) ld.load.start();
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
      if (this.current && this.current.isPaused) this.current.resume();
      // ещё не загружен: включить, как только загрузится (если к тому времени нужен этот же трек)
      this.preload(scene, [w.key]);
      (this.loader || scene).load.once('filecomplete-audio-' + w.key, () => { if (this.want === w) this.refresh(this.loader || scene); });
      return;
    }
    // старый трек играет, пока новый не загрузится — без тишины при медленной сети
    if (this.current && this.current.key !== w.key) { this.current.stop(); this.current.destroy(); this.current = null; }
    if (!this.current) this.current = scene.sound.add(w.key, { loop: true, volume: w.vol });
    if (this.current.isPaused) this.current.resume();
    else if (!this.current.isPlaying) this.current.play();
  },

  /* реклама: по правилам Яндекс Игр звук игры во время показа выключен */
  adStart() { if (this.current && this.current.isPlaying) { this.current.pause(); this.pausedForAd = true; } },
  adEnd() { if (this.pausedForAd) { this.pausedForAd = false; if (this.current && this.enabled()) this.current.resume(); } }
};

/* фоновая сцена без изображения: запускается из Boot и работает всю игру, грузит треки забега */
class MusicLoaderScene extends Phaser.Scene {
  constructor() { super('MusicLoader'); }
  create() {
    Music.loader = this;
    this.load.maxParallelDownloads = 1;   // по одному: первый трек забега готов раньше всех
    Music.preload(this, MUSIC.game);
  }
}
