/* ХРОНОЛИФТ — UI/SettingsScene.js
 * Настройки (минимальное меню по требованиям курса: «Играть», «Настройки»):
 * звук, повтор обучения, сброс прогресса с подтверждением. Покупки при сбросе
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
    const sound = makeButton(this, 240, 220, 340, 60, this.soundLabel(), {
      onClick: () => {
        save.sound = !save.sound; saveNow();
        sound.txt.setText(this.soundLabel());
        AnalyticsService.track('settings_sound', { on: save.sound });
      }
    });

    // обучение заново: 5 обучающих этажей и интро ловушек
    const tut = makeButton(this, 240, 300, 340, 60, 'ПРОЙТИ ОБУЧЕНИЕ ЗАНОВО', {
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
    const reset = makeButton(this, 240, 380, 340, 60, 'СБРОСИТЬ ПРОГРЕСС', {
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
    this.add.text(240, 426, 'монеты, рекорды, достижения, серия входов и миссии;\nпокупки и настройка звука останутся', {
      fontFamily: 'Arial', fontSize: '13px', color: '#5a6a7d', align: 'center'
    }).setOrigin(0.5, 0);

    makeButton(this, 240, 730, 220, 52, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }

  soundLabel() { return 'ЗВУК: ' + (save.sound ? 'ВКЛ ♪' : 'ВЫКЛ ✕'); }

  resetProgress() {
    const keep = { purchases: save.purchases, sound: save.sound, seenWelcome: save.seenWelcome };
    save = Object.assign(defaultSave(), keep);
    MissionService.rolloverIfNeeded();  // сразу выдать миссии дня, иначе меню покажет пустые
    saveNow();
    AnalyticsService.track('settings_reset', {});
  }
}
