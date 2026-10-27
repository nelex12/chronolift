/* ХРОНОЛИФТ — UI/SkinsScene.js
 * Скины: 3 за достижения + золотой из магазина. Каждый даёт пассивный бонус.
 */
'use strict';

class SkinsScene extends Phaser.Scene {
  constructor() { super('Skins'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    addSceneTitle(this, 'ВЫБОР СКИНА', 70);
    this.add.text(240, 112, 'Скины дают пассивные бонусы и открываются за достижения', {
      fontFamily: 'Arial', fontSize: '15px', color: '#9fb4c8'
    }).setOrigin(0.5);

    const xs = [70, 187, 303, 420];
    SKINS.forEach((s, i) => {
      const x = xs[i];
      let unlocked;
      if (!s.unlock) unlocked = true;                                    // стартовый скин
      else if (s.unlock.type === 'purchase') unlocked = ShopService.owns(s.unlock.value);
      else unlocked = !!save.unlocks[s.id];                              // за достижение
      const selected = (save.selectedSkin || 'orange') === s.id;

      this.add.rectangle(x, 350, 112, 330, 0x101826, 0.95)
        .setStrokeStyle(2, selected ? 0x2fd6a3 : (unlocked ? 0x57f2ff : 0x3a4556), selected ? 1.4 : 0.7);

      this.add.image(x, 242, s.sprite).setScale(unlocked ? 0.42 : 0.38)
        .setAlpha(unlocked ? 1 : 0.35).setTint(unlocked ? 0xffffff : 0x555f6e);

      this.add.text(x, 328, s.name, {
        fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold',
        color: unlocked ? '#eaf6ff' : '#5a6a7d', align: 'center', wordWrap: { width: 106 }
      }).setOrigin(0.5);

      this.add.text(x, 366, s.bonus, {
        fontFamily: 'Arial', fontSize: '11px',
        color: unlocked ? '#2fd6a3' : '#4a5568', align: 'center', wordWrap: { width: 106 }
      }).setOrigin(0.5);

      if (!unlocked) {
        let lockText, progText;
        if (s.unlock && s.unlock.type === 'purchase') {
          lockText = '🔒 Эксклюзив магазина';
          progText = '';
        } else {
          const cur = (s.unlock.type === 'floors') ? save.best.floors : save.perfects;
          lockText = '🔒 ' + s.unlock.text;
          progText = (s.unlock.type === 'floors' ? 'Рекорд: ' : 'Идеальных: ') + cur + '/' + s.unlock.value;
        }
        this.add.text(x, 415, lockText + (progText ? '\n' + progText : ''), {
          fontFamily: 'Arial', fontSize: '10px', color: '#ffc93c',
          align: 'center', wordWrap: { width: 108 }, lineSpacing: 4
        }).setOrigin(0.5);
      } else {
        const b = makeButton(this, x, 462, 96, 38, selected ? 'ВЫБРАН' : 'ВЗЯТЬ', {
          fontSize: 14, color: selected ? 0x123a2e : 0x1d2635,
          accent: selected ? 0x2fd6a3 : 0x57f2ff,
          onClick: () => { save.selectedSkin = s.id; saveNow(); this.scene.restart(); }
        });
        if (selected) b.rect.disableInteractive();
      }
    });

    makeButton(this, 240, 600, 220, 56, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }
}
