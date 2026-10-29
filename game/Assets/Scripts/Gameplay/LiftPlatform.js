/* ХРОНОЛИФТ — Gameplay/LiftPlatform.js
 * Лифт под персонажем: плита со срезанными нижними углами и часы под ней.
 * Картинка — Art/Sprites/lift_platform.png (рисует tools/make_lift_sprite.py, размеры те же),
 * стрелки рисуются здесь: идут быстро и замирают, пока время остановлено (tick не вызывают).
 * Точка (x, y) — середина верхней кромки плиты: на ней стоят ноги персонажа.
 * Лифт — только картинка, в столкновениях не участвует.
 */
'use strict';

class LiftPlatform {
  constructor(scene, x, y, depth) {
    this.c = scene.add.container(x, y).setDepth(depth);
    const plate = scene.add.image(0, 0, 'lift_platform')
      .setScale(1 / LiftPlatform.TEX).setOrigin(0.5, LiftPlatform.MARGIN / LiftPlatform.IMG_H);
    this.hands = scene.add.graphics();
    this.c.add([plate, this.hands]);
    this.t = 0;
    this.draw();
  }
  setPosition(x, y) { this.c.setPosition(x, y); return this; }
  tick(dtMs) { this.t += dtMs; this.draw(); }
  draw() {
    const g = this.hands, y = LiftPlatform.DIAL_Y;
    const turn = this.t / LiftPlatform.LAP_MS * Math.PI * 2;
    const hour = turn / 12, minute = turn;
    g.clear();
    g.lineStyle(2.4, 0x57f2ff, 1);
    g.lineBetween(0, y, Math.sin(hour) * 6, y - Math.cos(hour) * 6);
    g.lineStyle(1.6, 0xeaf6ff, 1);
    g.lineBetween(0, y, Math.sin(minute) * 9.5, y - Math.cos(minute) * 9.5);
    g.fillStyle(0xeaf6ff, 1);
    g.fillCircle(0, y, 1.6);
  }
}
LiftPlatform.TEX = 3;          // пикселей текстуры на пиксель мира (как TEX в make_lift_sprite.py)
LiftPlatform.MARGIN = 2;       // прозрачный край картинки
LiftPlatform.IMG_H = 44;       // высота картинки в пикселях мира: DIAL_Y + радиус 15 + 2 края
LiftPlatform.DIAL_Y = 25;      // центр циферблата ниже верха плиты
LiftPlatform.BOTTOM = 40;      // низ циферблата — под ним свечение двигателя
LiftPlatform.LAP_MS = 1500;    // оборот минутной стрелки
