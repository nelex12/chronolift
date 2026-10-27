/* ХРОНОЛИФТ — Core/Components.js
 * Переиспользуемые UI-компоненты: кнопки, панели, заголовки.
 */
'use strict';

/* Камера сцены показывает мир 480×800 на холсте в RENDER_SCALE раз больше (см. Config.js).
 * Начало координат камеры — левый верхний угол: тогда scroll и объекты со scrollFactor 0
 * остаются в координатах мира, а нажатия Phaser пересчитывает в мир сам.
 * Вызывать первой строкой create() каждой сцены. */
function fitCamera(scene) {
  scene.cameras.main.setOrigin(0, 0).setZoom(RENDER_SCALE);
}

/* Текст рисуется в своей текстуре; без resolution она в масштабе мира и размывается
 * при увеличении камерой. Поэтому все this.add.text получают resolution = RENDER_SCALE */
(function () {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  const addText = factory.text;
  factory.text = function (x, y, text, style) {
    return addText.call(this, x, y, text, Object.assign({ resolution: RENDER_SCALE }, style));
  };
})();

function makeButton(scene, x, y, w, h, label, opts) {
  opts = opts || {};
  const c = opts.color || 0x1d2635;
  const accent = opts.accent || 0x57f2ff;
  const rect = scene.add.rectangle(x, y, w, h, c, 0.96)
    .setStrokeStyle(2, accent, 0.9).setInteractive({ useHandCursor: true });
  const txt = scene.add.text(x, y, label, {
    fontFamily: 'Arial, sans-serif', fontSize: (opts.fontSize || 22) + 'px',
    fontStyle: 'bold', color: '#eaf6ff'
  }).setOrigin(0.5);
  rect.on('pointerover', () => rect.setFillStyle(0x2a3a52, 1));
  rect.on('pointerout', () => rect.setFillStyle(c, 0.96));
  rect.on('pointerdown', () => {
    const s = new Sfx(scene); s.click();
    if (opts.onClick) opts.onClick();
  });
  return { rect, txt };
}

/* Модальная панель с заголовком; возвращает контейнер для наполнения */
function makePanel(scene, y, w, h, title) {
  const container = scene.add.container(240, y || 400).setDepth(50);
  const bg = scene.add.rectangle(0, 0, w || 420, h || 420, 0x101826, 0.97)
    .setStrokeStyle(2, 0x57f2ff, 0.8);
  const head = scene.add.text(0, -(h || 420) / 2 + 34, title || '', {
    fontFamily: 'Arial', fontSize: '24px', fontStyle: 'bold', color: '#57f2ff'
  }).setOrigin(0.5);
  container.add([bg, head]);
  container.headerY = -(h || 420) / 2 + 34;
  return container;
}

function addSceneTitle(scene, text, y, color) {
  return scene.add.text(240, y || 70, text, {
    fontFamily: 'Arial', fontSize: '36px', fontStyle: 'bold',
    color: color || '#57f2ff'
  }).setOrigin(0.5).setShadow(0, 3, '#0a4a55', 6, true, true);
}
