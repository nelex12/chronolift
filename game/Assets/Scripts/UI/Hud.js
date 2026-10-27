/* ХРОНОЛИФТ — UI/Hud.js
 * Игровой HUD: энергия, счёт, этаж, монеты, тосты, оверлей заморозки.
 */
'use strict';

class Hud {
  constructor(scene) {
    this.scene = scene;
    const hud = scene.add.container(0, 0).setScrollFactor(0).setDepth(30);

    this.energyBg = scene.add.rectangle(16, 18, 190, 20, 0x101826, 0.9).setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x57f2ff, 0.7);
    this.energyFill = scene.add.rectangle(18, 18, 186, 14, 0x2fd6a3, 1).setOrigin(0, 0.5);
    this.energyLabel = scene.add.text(20, 40, 'ХРОНО-ЭНЕРГИЯ', {
      fontFamily: 'Arial', fontSize: '12px', color: '#7fd8e8'
    }).setOrigin(0, 0.5);
    this.overloadText = scene.add.text(112, 18, 'ПЕРЕГРУЗКА!', {
      fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#ff5b5b'
    }).setOrigin(0.5).setVisible(false);

    this.scoreText = scene.add.text(464, 16, '0', {
      fontFamily: 'Arial', fontSize: '26px', fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(1, 0.5);
    this.floorText = scene.add.text(464, 42, 'ЭТАЖ 0', {
      fontFamily: 'Arial', fontSize: '15px', color: '#9fb4c8'
    }).setOrigin(1, 0.5);
    const coinIcon = scene.add.image(310, 70, 'coin').setScale(0.14);
    this.coinText = scene.add.text(324, 70, '× 0', {
      fontFamily: 'Arial', fontSize: '17px', color: '#ffc93c'
    }).setOrigin(0, 0.5);

    hud.add([this.energyBg, this.energyFill, this.energyLabel, this.overloadText,
      this.scoreText, this.floorText, coinIcon, this.coinText]);
    this.container = hud;
    this.toasts = [];
  }

  toast(msg, color) {
    // очередь: новый тост встаёт НАД предыдущими, наложений нет. Длинный текст переносится
    // (раньше «МИССИЯ ВЫПОЛНЕНА: … — награда в меню» вылезал за края экрана 480 px)
    // считаем от верхнего края самого высокого из живых тостов: они уплывают вверх
    const top = this.toasts.reduce((y, x) => Math.min(y, x.obj.y - x.obj.height), 447);
    const t = this.scene.add.text(240, Math.min(441, top - 6), msg, {   // низ первого — как раньше (центр 420)
      fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: color || '#ffffff',
      backgroundColor: '#101826dd', padding: { x: 12, y: 8 },
      align: 'center', wordWrap: { width: 430 }
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(40);
    this.toasts.push({ obj: t, life: 1400 });
  }

  update(gs, dtMs, time) {
    const e = Math.max(0, gs.energy / gs.energyMax);
    this.energyFill.width = 186 * e;
    this.energyFill.setFillStyle(gs.overload ? 0xff5b5b : (e < 0.3 ? 0xffc93c : 0x2fd6a3));
    this.scoreText.setText(String(gs.score + gs.floorsPassed * 10));
    this.floorText.setText('ЭТАЖ ' + gs.floorsPassed);
    this.coinText.setText('× ' + gs.coinsRun);
    this.overloadText.setVisible(gs.overload);
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.obj.y -= dtMs * 0.02;
      t.life -= dtMs;
      if (t.life < 400) t.obj.setAlpha(Math.max(0, t.life / 400));
      if (t.life <= 0) { t.obj.destroy(); this.toasts.splice(i, 1); }
    }
  }
}
