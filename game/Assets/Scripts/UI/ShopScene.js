/* ХРОНОЛИФТ — UI/ShopScene.js
 * Внутриигровой магазин: 3 товара, покупки через платёжный SDK Яндекса,
 * восстановление покупок, облачная синхронизация владения (player.setData).
 */
'use strict';

class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    addSceneTitle(this, 'МАГАЗИН', 70);
    this.add.text(240, 112, 'Покупки сохраняются в облаке и восстанавливаются на любом устройстве', {
      fontFamily: 'Arial', fontSize: '13px', color: '#9fb4c8'
    }).setOrigin(0.5);

    this.renderCatalog();

    makeButton(this, 240, 620, 300, 50, 'ВОССТАНОВИТЬ ПОКУПКИ', {
      fontSize: 18, accent: 0xffc93c, color: 0x3a2e10,
      onClick: async () => { await this.restore(); }
    });
    makeButton(this, 240, 690, 220, 54, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }

  renderCatalog() {
    if (this.cards) this.cards.forEach((o) => o.destroy());
    this.cards = [];
    const items = ShopService.catalog();
    items.forEach((p, i) => {
      const y = 195 + i * 128;
      const card = this.add.rectangle(240, y, 420, 112, 0x101826, 0.95)
        .setStrokeStyle(2, p.owned ? 0x2fd6a3 : 0x57f2ff, p.owned ? 1 : 0.6);
      this.cards.push(card);
      const name = this.add.text(40, y - 32, p.name, {
        fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#eaf6ff'
      }).setOrigin(0, 0.5);
      const desc = this.add.text(40, y + 2, p.desc, {
        fontFamily: 'Arial', fontSize: '14px', color: '#9fb4c8', wordWrap: { width: 250 }
      }).setOrigin(0, 0.5);
      this.cards.push(name, desc);

      if (p.owned) {
        const owned = this.add.text(410, y, 'КУПЛЕНО ✓', {
          fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: '#2fd6a3'
        }).setOrigin(1, 0.5);
        this.cards.push(owned);
      } else {
        const price = this.add.text(410, y - 16, p.price, {
          fontFamily: 'Arial', fontSize: '19px', fontStyle: 'bold', color: '#ffe89b'
        }).setOrigin(1, 0.5);
        const buy = makeButton(this, 352, y + 22, 116, 40, 'КУПИТЬ', {
          fontSize: 15, color: 0x3a2e10, accent: 0xffc93c,
          onClick: () => this.buy(p.id)
        });
        this.cards.push(price, buy.rect, buy.txt);
      }
    });
  }

  async buy(id) {
    AnalyticsService.track('purchase_click', { id: id });
    const ok = await ShopService.buy(id);
    if (ok) {
      this.sfx.reward();
      this.renderCatalog();
      const p = PRODUCTS.find((x) => x.id === id);
      this.toast(p.name + ' — приобретено!', '#2fd6a3');
    } else {
      this.toast('Покупка отменена', '#ff5b5b');
    }
  }

  async restore() {
    const n = await ShopService.restore();
    this.renderCatalog();
    this.toast(n > 0 ? 'Восстановлено покупок: ' + n : 'Новых покупок не найдено', '#57f2ff');
  }

  toast(msg, color) {
    const t = this.add.text(240, 560, msg, {
      fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold', color: color,
      backgroundColor: '#101826dd', padding: { x: 12, y: 8 }
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
  }
}
