/* ХРОНОЛИФТ — UI/SettingsScene.js
 * Настройки (минимальное меню по требованиям курса: «Играть», «Настройки»):
 * звук, музыка, рамки зон ловушек, повтор обучения, сброс прогресса с подтверждением. Покупки при сбросе
 * не теряются — это деньги игрока (и getPurchases всё равно вернул бы их).
 */
'use strict';

class SettingsScene extends Phaser.Scene {
  constructor() { super('Settings'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    addSceneTitle(this, 'НАСТРОЙКИ', 70);
    this.add.text(240, 112, YandexClient.isAuthorized()
      ? 'Прогресс сохраняется в облаке Яндекса'
      : 'Прогресс сохраняется на этом устройстве', {
      fontFamily: 'Arial', fontSize: '15px', color: '#9fb4c8'
    }).setOrigin(0.5);

    // звук: то же, что значок ♪ в меню
    const sound = makeButton(this, 240, 210, 340, 58, this.soundLabel(), {
      onClick: () => {
        save.sound = !save.sound; saveNow();
        sound.txt.setText(this.soundLabel());
        Music.refresh(this);
        AnalyticsService.track('settings_sound', { on: save.sound });
      }
    });

    // музыка отдельно от звуков (при выключенном звуке молчит и она)
    const music = makeButton(this, 240, 280, 340, 58, this.musicLabel(), {
      onClick: () => {
        save.music = !save.music; saveNow();
        music.txt.setText(this.musicLabel());
        Music.refresh(this);
        AnalyticsService.track('settings_music', { on: save.music });
      }
    });

    // рамки зон ловушек: без них опасность показывают сами ловушки (Traps.js)
    const zones = makeButton(this, 240, 350, 340, 58, this.zonesLabel(), {
      fontSize: 20,
      onClick: () => {
        save.showZones = !save.showZones; saveNow();
        zones.txt.setText(this.zonesLabel());
        AnalyticsService.track('settings_zones', { on: save.showZones });
      }
    });

    // обучение заново: 5 обучающих этажей и интро ловушек
    const tut = makeButton(this, 240, 420, 340, 58, 'ПРОЙТИ ОБУЧЕНИЕ ЗАНОВО', {
      fontSize: 20,
      onClick: () => {
        save.tutorialDone = false;
        save.seenTraps = {};
        saveNow();
        tut.txt.setText('ОБУЧЕНИЕ — В СЛЕДУЮЩЕМ ЗАБЕГЕ');
        AnalyticsService.track('settings_tutorial', {});
      }
    });

    // сброс прогресса: первое нажатие спрашивает, второе (в течение 3 с) сбрасывает
    let armed = false;
    const reset = makeButton(this, 240, 490, 340, 58, 'СБРОСИТЬ ПРОГРЕСС', {
      fontSize: 20, accent: 0xff5a5a,
      onClick: () => {
        if (!armed) {
          armed = true;
          reset.txt.setText('ТОЧНО? НАЖМИ ЕЩЁ РАЗ').setColor('#ff9a9a');
          this.time.delayedCall(3000, () => {
            if (!armed) return;
            armed = false;
            reset.txt.setText('СБРОСИТЬ ПРОГРЕСС').setColor('#eaf6ff');
          });
          return;
        }
        armed = false;
        this.resetProgress();
        reset.txt.setText('ПРОГРЕСС СБРОШЕН').setColor('#eaf6ff');
      }
    });
    this.add.text(240, 532, 'сбросятся монеты, рекорды, достижения, серия входов и миссии;\nпокупки и настройки звука и музыки останутся', {
      fontFamily: 'Arial', fontSize: '13px', color: '#5a6a7d', align: 'center'
    }).setOrigin(0.5, 0);

    makeButton(this, 240, 730, 220, 52, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }

  soundLabel() { return 'ЗВУК: ' + (save.sound ? 'ВКЛ ♪' : 'ВЫКЛ ✕'); }
  musicLabel() { return 'МУЗЫКА: ' + (save.music !== false ? 'ВКЛ ♫' : 'ВЫКЛ ✕'); }
  zonesLabel() { return 'ЗОНЫ ЛОВУШЕК: ' + (save.showZones ? 'ВКЛ' : 'ВЫКЛ'); }

  resetProgress() {
    const keep = { purchases: save.purchases, sound: save.sound, music: save.music, showZones: save.showZones, seenWelcome: save.seenWelcome };
    save = Object.assign(defaultSave(), keep);
    MissionService.rolloverIfNeeded();  // сразу выдать миссии дня, иначе меню покажет пустые
    saveNow();
    AnalyticsService.track('settings_reset', {});
  }
}
