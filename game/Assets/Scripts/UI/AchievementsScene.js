/* ХРОНОЛИФТ — UI/AchievementsScene.js
 * Список достижений: прогресс, награды, состояние (открыто/закрыто).
 */
'use strict';

class AchievementsScene extends Phaser.Scene {
  constructor() { super('Achievements'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    addSceneTitle(this, 'ДОСТИЖЕНИЯ', 70);
    this.add.text(240, 112, 'Награды — монеты. Прогресс: ' +
      save.achievements.length + ' / ' + ACHIEVEMENTS.length, {
      fontFamily: 'Arial', fontSize: '15px', color: '#9fb4c8'
    }).setOrigin(0.5);

    ACHIEVEMENTS.forEach((a, i) => {
      const y = 175 + i * 76;
      const unlocked = AchievementService.isUnlocked(a.id);
      const cur = Math.min(AchievementService.progressOf(a), a.value);

      this.add.rectangle(240, y, 420, 64, 0x101826, 0.95)
        .setStrokeStyle(2, unlocked ? 0x2fd6a3 : 0x3a4556, unlocked ? 0.9 : 0.5);

      this.add.text(52, y - 14, (unlocked ? '🏆 ' : '🔒 ') + a.name, {
        fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold',
        color: unlocked ? '#2fd6a3' : '#eaf6ff'
      }).setOrigin(0, 0.5);
      this.add.text(52, y + 12, a.desc, {
        fontFamily: 'Arial', fontSize: '12px', color: unlocked ? '#9fb4c8' : '#5a6a7d'
      }).setOrigin(0, 0.5);

      // полоса прогресса
      const w = 120;
      this.add.rectangle(330 - w / 2, y + 12, w, 8, 0x1a2333, 1).setOrigin(0, 0.5);
      this.add.rectangle(330 - w / 2, y + 12, w * (cur / a.value), 8,
        unlocked ? 0x2fd6a3 : 0x57f2ff, 1).setOrigin(0, 0.5);
      this.add.text(330, y - 14, cur + '/' + a.value, {
        fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#cfe3f5'
      }).setOrigin(0.5);

      this.add.text(428, y, '+' + a.reward, {
        fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#ffc93c'
      }).setOrigin(1, 0.5);
    });

    makeButton(this, 240, 730, 220, 52, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }
}
