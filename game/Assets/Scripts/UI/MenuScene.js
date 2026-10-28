/* ХРОНОЛИФТ — UI/MenuScene.js
 * Главное меню: быстрый старт (1 клик), welcome/авторизация, ежедневная награда,
 * лидерборд, вход в скины/магазин/достижения.
 */
'use strict';

class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    Music.menu(this);
    Music.preload(this, MUSIC.game);
    this.add.tileSprite(240, 400, 480, 800, 'bg_wall_panel')
      .setAlpha(0.25).setTint(0x39445a).setScale(1.35);

    addSceneTitle(this, 'ХРОНОЛИФТ', 108);
    this.add.text(240, 156, 'ЗАЖМИ ЭКРАН — И ОСТАНОВИ ВРЕМЯ', {
      fontFamily: 'Arial', fontSize: '16px', color: '#9fb4c8'
    }).setOrigin(0.5);
    this.add.text(240, 192, 'РЕКОРД: ' + save.best.floors + ' этажей · ' + save.best.score + ' очков', {
      fontFamily: 'Arial', fontSize: '17px', color: '#ffc93c'
    }).setOrigin(0.5);

    // парящий герой (хроно-привод держит в воздухе)
    this.heroSprite = this.add.image(240, 400, 'player_' + (save.selectedSkin || 'orange')).setScale(0.62).setDepth(5);
    const halo = this.add.ellipse(240, 486, 110, 26, 0x57f2ff, 0.25).setDepth(4);
    this.tweens.add({ targets: [this.heroSprite, halo], y: '+=14', duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.tweens.add({ targets: halo, alpha: 0.12, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // баланс монет — шапка
    this.add.image(330, 32, 'coin').setScale(0.16);
    this.coinLabel = this.add.text(344, 32, '× ' + save.coins, {
      fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#ffc93c'
    }).setOrigin(0, 0.5);

    makeButton(this, 240, 560, 280, 68, 'ИГРАТЬ', {
      fontSize: 30, color: 0x123a2e, accent: 0x2fd6a3,
      onClick: () => { AnalyticsService.track('menu_play', {}); this.scene.start('Game'); }
    });
    makeButton(this, 130, 646, 250, 52, 'МИССИИ', {
      accent: 0xffc93c,
      onClick: () => { AnalyticsService.track('menu_missions', {}); this.scene.start('Missions'); }
    });
    makeButton(this, 350, 646, 250, 52, 'СКИНЫ', { onClick: () => this.scene.start('Skins') });
    makeButton(this, 130, 712, 250, 52, 'МАГАЗИН', { onClick: () => this.scene.start('Shop') });
    makeButton(this, 350, 712, 250, 52, 'ДОСТИЖЕНИЯ', { onClick: () => this.scene.start('Achievements') });
    makeButton(this, 240, 768, 220, 40, 'НАСТРОЙКИ', { fontSize: 17, onClick: () => this.scene.start('Settings') });

    // бейдж «есть невыбранные награды» на кнопке МИССИИ (soft CTA)
    const claimN = MissionService.claimableCount();
    if (claimN > 0) {
      this.add.circle(252, 624, 13, 0xff3b3b, 1).setDepth(8);
      this.add.text(252, 624, String(claimN), {
        fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#fff'
      }).setOrigin(0.5).setDepth(9);
    }

    // лидерборд — иконка слева под строкой входа (справочный раздел, не CTA)
    this.add.text(26, 74, '🏆', {
      fontFamily: 'Arial', fontSize: '22px', color: '#cfe3f5'
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.toggleBoard());

    // звук
    const snd = this.add.text(438, 32, save.sound ? '♪' : '✕', {
      fontFamily: 'Arial', fontSize: '30px', color: save.sound ? '#57f2ff' : '#5a6a7d'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    snd.on('pointerdown', () => {
      save.sound = !save.sound; saveNow();
      Music.refresh(this);
      snd.setText(save.sound ? '♪' : '✕').setColor(save.sound ? '#57f2ff' : '#5a6a7d');
    });

    // профиль / авторизация
    this.authLabel = this.add.text(24, 32, '', {
      fontFamily: 'Arial', fontSize: '15px', color: YandexClient.isAuthorized() ? '#2fd6a3' : '#5a6a7d'
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    this.refreshAuthLabel();
    this.authLabel.on('pointerdown', async () => {
      if (YandexClient.isAuthorized()) return;
      this.authLabel.setText('Авторизация…').setColor('#ffc93c');
      const ok = await YandexClient.auth();
      if (ok) {
        await resolveSaveFromCloud();  // подтянуть облачный прогресс
        this.scene.restart();
      } else {
        this.refreshAuthLabel();
      }
    });

    // панель лидерборда
    this.boardPanel = makePanel(this, 400, 420, 380, 'ТОП ИГРОКОВ');
    this.boardText = this.add.text(0, 20, '', {
      fontFamily: 'Arial', fontSize: '17px', color: '#cfe3f5', align: 'center', lineSpacing: 10
    }).setOrigin(0.5);
    this.boardPanel.add(this.boardText);
    this.boardPanel.setVisible(false);
    this.boardOpen = false;

    if (!save.seenWelcome) this.showWelcome();
    else this.maybeShowDaily();
  }

  refreshAuthLabel() {
    this.authLabel.setText(YandexClient.isAuthorized()
      ? '● ' + YandexClient.getName()
      : '○ войти через Яндекс');
  }

  /* FTUE: экран приветствия с авторизацией */
  showWelcome() {
    const c = this.add.container(240, 400).setDepth(60);
    const dim = this.add.rectangle(0, 0, 480, 800, 0x05080e, 0.9);
    // логотип над историей: текст растёт вниз от y=-210 и заканчивается над кнопкой входа
    const logo = this.add.text(0, -262, 'ХРОНОЛИФТ', {
      fontFamily: 'Arial', fontSize: '48px', fontStyle: 'bold', color: '#57f2ff'
    }).setOrigin(0.5).setShadow(0, 4, '#0a4a55', 8, true, true);
    const story = this.add.text(0, -210,
      'Ты — пилот испытательного лифта\nс хроно-приводом.\n\nШахта полна ловушек.\nЗАЖМИ экран, чтобы остановить время,\nи проскользни мимо них.\n\nНе дай энергии закончиться!', {
      fontFamily: 'Arial', fontSize: '19px', color: '#cfe3f5', align: 'center', lineSpacing: 8
    }).setOrigin(0.5, 0);
    const btnAuthR = this.add.rectangle(0, 60, 320, 58, 0x123a2e, 0.98)
      .setStrokeStyle(2, 0x2fd6a3).setInteractive({ useHandCursor: true });
    const btnAuthT = this.add.text(0, 60, 'ВОЙТИ ЧЕРЕЗ ЯНДЕКС', {
      fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#eaf6ff'
    }).setOrigin(0.5);
    const skipT = this.add.text(0, 122, 'играть без входа', {
      fontFamily: 'Arial', fontSize: '16px', color: '#5a6a7d'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add([dim, logo, story, btnAuthR, btnAuthT, skipT]);
    // уже вошёл (например, в Яндекс Играх под своим аккаунтом) — не предлагать вход ещё раз
    const authorized = YandexClient.isAuthorized();
    if (authorized) { btnAuthT.setText('ИГРАТЬ'); skipT.setVisible(false); }

    const close = () => {
      save.seenWelcome = true; saveNow();
      c.destroy();
      this.maybeShowDaily();
    };
    btnAuthR.on('pointerdown', async () => {
      if (authorized) { close(); return; }
      btnAuthT.setText('Авторизация…');
      btnAuthR.disableInteractive();
      const ok = await YandexClient.auth();
      if (ok) {
        AnalyticsService.track('auth_success', {});
        await resolveSaveFromCloud();
        this.scene.restart();
      } else close();
    });
    skipT.on('pointerdown', close);
  }

  /* Ежедневная награда / серия входов */
  maybeShowDaily() {
    const p = DailyService.pending();
    if (!p) return;
    const c = this.add.container(240, 400).setDepth(55);
    const dim = this.add.rectangle(0, 0, 480, 800, 0x05080e, 0.7);
    const panel = this.add.rectangle(0, 0, 360, 300, 0x101826, 0.97)
      .setStrokeStyle(2, 0xffc93c, 0.9);
    const head = this.add.text(0, -110, 'ЕЖЕДНЕВНАЯ НАГРАДА', {
      fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffc93c'
    }).setOrigin(0.5);
    const streakT = this.add.text(0, -70, 'серия: ' + p.streak + ' дн. 🔥', {
      fontFamily: 'Arial', fontSize: '17px', color: '#9fb4c8'
    }).setOrigin(0.5);
    const coin = this.add.image(-40, 0, 'coin').setScale(0.4);
    const rw = this.add.text(10, 0, '+' + p.reward, {
      fontFamily: 'Arial', fontSize: '34px', fontStyle: 'bold', color: '#ffe89b'
    }).setOrigin(0, 0.5);
    const btnR = this.add.rectangle(0, 90, 240, 58, 0x3a2e10, 0.98)
      .setStrokeStyle(2, 0xffc93c).setInteractive({ useHandCursor: true });
    const btnT = this.add.text(0, 90, 'ЗАБРАТЬ', {
      fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#ffe89b'
    }).setOrigin(0.5);
    c.add([dim, panel, head, streakT, coin, rw, btnR, btnT]);
    btnR.on('pointerdown', () => {
      DailyService.claim();
      this.sfx.reward();
      this.coinLabel.setText('× ' + save.coins);
      c.destroy();
      const cm = MissionService.claimableCount();
      this.hudToast('+' + p.reward + ' монет! Возвращайся завтра' +
        (cm ? ' · миссии ждут награды' : ''), '#ffc93c');
    });
  }

  hudToast(msg, color) {
    const t = this.add.text(240, 238, msg, {
      fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: color,
      backgroundColor: '#101826dd', padding: { x: 12, y: 8 },
      align: 'center', wordWrap: { width: 430 }   // «…Возвращайся завтра · миссии ждут награды» шире экрана
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, alpha: 0, y: 160, delay: 1500, duration: 600, onComplete: () => t.destroy() });
  }

  async toggleBoard() {
    this.boardOpen = !this.boardOpen;
    this.boardPanel.setVisible(this.boardOpen);
    if (!this.boardOpen) return;
    this.boardText.setText('Загрузка…');
    const top = await LeaderboardService.top(5);
    if (!top) {
      this.boardText.setText('Онлайн-лидерборд появится\nпосле публикации в Яндекс Играх.\n\nЛокальный рекорд: ' +
        save.best.floors + ' этажей');
      return;
    }
    let s = '';
    top.entries.forEach((e) => {
      s += (e.me ? '→ ' : '   ') + e.rank + '. ' + e.name + ' — ' + e.score + ' этаж.\n';
    });
    if (top.mine) s += '\nТы: ' + top.mine.rank + ' место (' + top.mine.score + ' этаж.)';
    this.boardText.setText(s.trim());
  }
}
