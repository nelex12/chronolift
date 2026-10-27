/* ХРОНОЛИФТ — UI/MissionsScene.js
 * Ежедневные миссии: 3 карточки с прогрессом и кнопкой «ЗАБРАТЬ»,
 * тикер до сброса (00:00). Ретеншн-контракт дня (см. docs/RETENTION.md).
 */
'use strict';

class MissionsScene extends Phaser.Scene {
  constructor() { super('Missions'); }
  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.cameras.main.setBackgroundColor('#0b0f17');
    this.add.tileSprite(240, 400, 480, 800, 'bg_wall_panel')
      .setAlpha(0.18).setTint(0x39445a).setScale(1.5);

    addSceneTitle(this, 'МИССИИ ДНЯ', 70);
    const ms = MissionService.todayMissions();
    const done = ms.filter((m) => MissionService.isDone(m)).length;
    this.sub = this.add.text(240, 112, 'Выполнено ' + done + '/' + ms.length +
      ' · сброс в ' + this.untilReset(), {
      fontFamily: 'Arial', fontSize: '15px', color: '#9fb4c8'
    }).setOrigin(0.5);

    ms.forEach((m, i) => {
      const y = 210 + i * 155;
      const isDone = MissionService.isDone(m);
      const cur = Math.min(m.progress, m.value);

      this.add.rectangle(240, y, 430, 125, 0x101826, 0.95)
        .setStrokeStyle(2, m.claimed ? 0x3a4556 : (isDone ? 0xffc93c : 0x3a4556),
          m.claimed ? 0.5 : 0.9);
      this.add.text(46, y - 36, (m.claimed ? '✓ ' : (isDone ? '★ ' : '🎯 ')) + m.name, {
        fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold',
        color: m.claimed ? '#9fb4c8' : (isDone ? '#ffc93c' : '#eaf6ff')
      }).setOrigin(0, 0.5);
      this.add.text(46, y - 6, m.desc, {
        fontFamily: 'Arial', fontSize: '14px', color: '#9fb4c8'
      }).setOrigin(0, 0.5);

      // полоса прогресса
      const w = 190, x0 = 46;
      this.add.rectangle(x0, y + 34, w, 10, 0x1a2333, 1).setOrigin(0, 0.5);
      this.add.rectangle(x0, y + 34, w * (cur / m.value), 10,
        isDone ? 0xffc93c : 0x57f2ff, 1).setOrigin(0, 0.5);
      this.add.text(x0 + w + 10, y + 34, cur + '/' + m.value, {
        fontFamily: 'Arial', fontSize: '14px', fontStyle: 'bold', color: '#cfe3f5'
      }).setOrigin(0, 0.5);

      // награда / кнопка забрать
      if (isDone && !m.claimed) {
        const btn = this.add.rectangle(382, y + 34, 130, 46, 0x3a2e10, 0.98)
          .setStrokeStyle(2, 0xffc93c).setInteractive({ useHandCursor: true });
        const bt = this.add.text(382, y + 34, 'ЗАБРАТЬ +' + m.reward, {
          fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#ffe89b'
        }).setOrigin(0.5);
        btn.on('pointerdown', () => {
          const got = MissionService.claim(m.id);
          if (got) {
            this.sfx.reward();
            this.scene.restart();
          }
        });
        // мягкое мигание — «сделано, заберите» (variable reward в UI)
        this.tweens.add({ targets: [btn, bt], alpha: 0.7, duration: 500, yoyo: true, repeat: -1 });
      } else {
        this.add.text(382, y + 34, m.claimed ? 'ЗАБРАНО ✓' : '+' + m.reward, {
          fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold',
          color: m.claimed ? '#5a6a7d' : '#ffc93c'
        }).setOrigin(0.5);
      }
    });

    makeButton(this, 240, 735, 220, 52, 'НАЗАД', {
      onClick: () => this.scene.start('Menu')
    });
  }

  /* до сброса миссий — локальная полуночь (показ, а не гейт) */
  untilReset() {
    const now = new Date();
    const next = new Date(now); next.setHours(24, 0, 0, 0);
    const h = Math.floor((next - now) / 3600000);
    const min = Math.floor(((next - now) % 3600000) / 60000);
    return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
  }
}