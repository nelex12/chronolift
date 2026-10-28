/* ХРОНОЛИФТ — Gameplay/Traps.js
 * Ловушки шахты. Параметры берутся из Assets/Prefabs/traps.json (prefab-конфиги),
 * скорость циклов масштабируется сложностью этажа.
 */
'use strict';

class LaserTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'laser';
    this.beamY = ledgeY - 150;
    // излучатели спрайта (строка 125 из 256, scale 1.25) — на высоте луча; раньше спрайт стоял
    // на полу этажа, а опасный луч проходил на 150 px выше, в пустоте. Луч — между излучателями
    this.d = scene.add.image(240, this.beamY + 3, 'trap_laser').setScale(1.25).setDepth(5);
    this.beamX1 = 132; this.beamX2 = 346;
    this.glow = scene.add.rectangle(239, this.beamY, 218, 22, 0xff3b3b, 0).setDepth(6);
    this.beam = scene.add.rectangle(239, this.beamY, 214, 9, 0xff5b5b, 0).setDepth(7);
    this.phase = 'off'; this.t = 0;
    this.durOff = prefab.durOff / diff; this.durTele = prefab.durTele; this.durOn = prefab.durOn / diff;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
  }
  update(dtMs) {
    this.t += dtMs;
    if (this.phase === 'off' && this.t > this.durOff) { this.phase = 'tele'; this.t = 0; }
    else if (this.phase === 'tele' && this.t > this.durTele) { this.phase = 'on'; this.t = 0; this.scene.sfx.tone(980, 0.1, 'square', 0.05); }
    else if (this.phase === 'on' && this.t > this.durOn) { this.phase = 'off'; this.t = 0; }
    const tm = this.scene.time.now * 0.02;
    if (this.phase === 'tele') {
      const a = 0.25 + 0.2 * Math.sin(tm);
      this.beam.setAlpha(a); this.glow.setAlpha(a * 0.5); this.beam.height = 5;
    } else if (this.phase === 'on') {
      const p = 0.85 + 0.15 * Math.sin(tm * 1.7);
      this.beam.setAlpha(p); this.glow.setAlpha(0.45 * p); this.beam.height = 9;
    } else {
      this.beam.setAlpha(0); this.glow.setAlpha(0);
    }
    this.dangerous = (this.phase === 'on');
  }
  rects() {
    if (!this.dangerous) return [];
    return [{ x1: this.beamX1, x2: this.beamX2, y1: this.beamY - 11, y2: this.beamY + 11 }];
  }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'off'; this.t = 0; this.beam.setAlpha(0); this.glow.setAlpha(0); this.dangerous = false; }
  destroy() { this.d.destroy(); this.beam.destroy(); this.glow.destroy(); }
}

class SawTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'saw';
    this.railY = ledgeY - 105;
    this.prefab = prefab;
    this.diff = diff;
    this.t = Math.random() * 1000;
    this.rail = scene.add.rectangle(240, this.railY + 78, 460, 8, 0x39445a).setDepth(4);
    this.img = scene.add.image(240, this.railY, 'trap_saw').setScale(0.72).setDepth(6);
    this.dangerous = true;
    this.hadFreezeWhileDanger = false;
    this.done = false;
    this.x = 240;
  }
  update(dtMs) {
    this.t += dtMs * (0.9 + this.diff * 0.15);
    this.x = 240 + Math.sin(this.t * 0.0016 * this.prefab.speed) * this.prefab.amplitude;
    this.img.setX(this.x);
    this.img.rotation -= 0.12;
  }
  // центр диска на спрайте выше центра картинки (ступица — строка 109 из 256, scale 0.72): −14 px
  rects() { return [{ x1: this.x - 52, x2: this.x + 52, y1: this.railY - 66, y2: this.railY + 38 }]; }
  onFrozen() { this.hadFreezeWhileDanger = true; }
  disarm() {}
  destroy() { this.img.destroy(); this.rail.destroy(); }
}

class SpikesTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'spikes';
    this.t = 0;
    this.phase = 'hidden';
    this.durHidden = prefab.durHidden / diff; this.durWarn = prefab.durWarn; this.durOut = prefab.durOut / diff;
    this.base = scene.add.rectangle(240, ledgeY - 4, 460, 12, 0x2b3442).setDepth(4);
    this.img = scene.add.image(240, ledgeY + 34, 'trap_spikes').setScale(1.12).setDepth(6);
    this.imgYOut = ledgeY - 16; this.imgYIn = ledgeY + 34;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
  }
  update(dtMs) {
    this.t += dtMs;
    if (this.phase === 'hidden' && this.t > this.durHidden) { this.phase = 'warn'; this.t = 0; }
    else if (this.phase === 'warn' && this.t > this.durWarn) { this.phase = 'out'; this.t = 0; this.scene.sfx.tone(140, 0.15, 'square', 0.07, 90); }
    else if (this.phase === 'out' && this.t > this.durOut) { this.phase = 'hidden'; this.t = 0; }
    if (this.phase === 'warn') {
      const k = this.t / this.durWarn;
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, Math.min(1, k * 0.6)));
      this.img.setAlpha(0.6 + 0.4 * Math.sin(this.scene.time.now * 0.03));
    } else if (this.phase === 'out') {
      const k = Math.min(1, this.t / 120);
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, k)).setAlpha(1);
    } else {
      const k = Math.max(0, 1 - this.t / 150);
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, k)).setAlpha(1);
    }
    this.dangerous = (this.phase === 'out');
  }
  rects() {
    if (!this.dangerous) return [];
    // от остриёв (верх спрайта — строка 76 из 256, scale 1.12: img.y − 58) до пола, по ширине шипов.
    // Раньше зона была на 31 px выше остриёв и в полтора раза шире: смерть без касания
    return [{ x1: 116, x2: 364, y1: this.img.y - 58, y2: this.ledgeY - 4 }];
  }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'hidden'; this.t = 0; this.dangerous = false; this.img.setY(this.imgYIn); }
  destroy() { this.img.destroy(); this.base.destroy(); }
}

const TRAP_CLASSES = { laser: LaserTrap, saw: SawTrap, spikes: SpikesTrap };

/* --- Пресс: бьёт сверху вниз. Проскальзывай, пока поднят. --- */
class CrusherTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'crusher';
    this.pxPerWorld = 159;                 // при scale 1.1 обеих спрайтов
    this.frame = scene.add.image(240, ledgeY - 1.675 * this.pxPerWorld, 'trap_crusher_frame')
      .setScale(1.1).setDepth(5);
    this.press = scene.add.image(240, ledgeY - 2.05 * this.pxPerWorld, 'trap_crusher_press')
      .setScale(1.1).setDepth(6);
    this.yUp = ledgeY - 2.05 * this.pxPerWorld;
    this.yDown = ledgeY - 0.55 * this.pxPerWorld;
    this.phase = 'up'; this.t = 0;
    this.durUp = prefab.durUp / diff; this.durWarn = prefab.durWarn;
    this.slamTime = prefab.slamTime; this.durHold = prefab.durHold / diff; this.durRise = prefab.durRise;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
  }
  update(dtMs) {
    this.t += dtMs;
    if (this.phase === 'up' && this.t > this.durUp) { this.phase = 'warn'; this.t = 0; this.shakeT = 0; }
    else if (this.phase === 'warn' && this.t > this.durWarn) { this.phase = 'slam'; this.t = 0; this.scene.sfx.tone(120, 0.2, 'square', 0.09, 60); }
    else if (this.phase === 'slam') {
      const k = Math.min(1, this.t / this.slamTime);
      this.press.y = Phaser.Math.Linear(this.yUp, this.yDown, k * k); // ускорение вниз
      if (k >= 1) {
        this.phase = 'hold'; this.t = 0;
        this.scene.cameras.main.shake(120, 0.004);
        this.scene.sfx.tone(70, 0.25, 'sawtooth', 0.12, 40);
      }
    }
    else if (this.phase === 'hold' && this.t > this.durHold) { this.phase = 'rise'; this.t = 0; }
    else if (this.phase === 'rise') {
      const k = Math.min(1, this.t / this.durRise);
      this.press.y = Phaser.Math.Linear(this.yDown, this.yUp, k);
      if (k >= 1) { this.phase = 'up'; this.t = 0; }
    }
    if (this.phase === 'warn') {
      this.shakeT += dtMs;
      this.press.x = 240 + Math.sin(this.shakeT * 0.09) * 4;
    } else if (this.phase !== 'slam') {
      this.press.x = 240;
    }
    this.dangerous = (this.phase === 'slam' || this.phase === 'hold');
  }
  rects() {
    if (!this.dangerous) return [];
    // по самой плите пресса (строки 88–168 из 256, scale 1.1: ±44 px от центра), и во время удара тоже.
    // Раньше зона доходила до ledgeY − 8 — на 35 px ниже плиты, смерть без касания.
    // Верх зоны не выше ledgeY − 160, как в исходном балансе: лифт проходит сквозь раму, а плита
    // пролетает верх рамы за доли удара (120 мс) — иначе удар убивал почти проехавшего пресс игрока
    const y1 = Math.max(this.press.y - 44, this.ledgeY - 160), y2 = this.press.y + 44;
    if (y2 <= y1) return [];
    return [{ x1: 118, x2: 362, y1: y1, y2: y2 }];
  }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'up'; this.t = 0; this.press.y = this.yUp; this.dangerous = false; }
  destroy() { this.frame.destroy(); this.press.destroy(); }
}

/* --- Тесла: заряжается и бьёт дугой через весь проём. --- */
class TeslaTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'tesla';
    this.arcY = ledgeY - 150;
    // шары-контакты спрайта (центры x 44 и 213, y 67 из 256, scale 1) — на высоте разряда, низ — у пола.
    // Раньше катушки были уменьшены до 0.45 в центре, а разряд шёл через всю шахту выше контактов
    this.img = scene.add.image(240, this.arcY + 61, 'trap_tesla').setDepth(5);
    this.arcX1 = 156; this.arcX2 = 325;
    this.glow = scene.add.rectangle(240, this.arcY, this.arcX2 - this.arcX1, 26, 0xb26bff, 0).setDepth(6);
    this.arc = scene.add.graphics().setDepth(7);
    this.phase = 'idle'; this.t = 0;
    this.durIdle = prefab.durIdle / diff; this.durCharge = prefab.durCharge; this.durZap = prefab.durZap / diff;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
    this.arcT = 0;
  }
  update(dtMs) {
    this.t += dtMs;
    this.arcT += dtMs;
    if (this.phase === 'idle' && this.t > this.durIdle) { this.phase = 'charge'; this.t = 0; }
    else if (this.phase === 'charge' && this.t > this.durCharge) {
      this.phase = 'zap'; this.t = 0;
      this.scene.sfx.tone(1600, 0.18, 'sawtooth', 0.08, 300);
    }
    else if (this.phase === 'zap' && this.t > this.durZap) { this.phase = 'idle'; this.t = 0; this.arc.clear(); this.glow.setAlpha(0); }

    if (this.phase === 'charge') {
      const k = this.t / this.durCharge;
      const pulse = 0.5 + 0.5 * Math.sin(this.arcT * 0.05);
      this.img.setTint(pulse * k > 0.55 ? 0xd9baff : 0xffffff);
      this.glow.setAlpha(0.08 + 0.12 * k * pulse);
    } else if (this.phase === 'zap') {
      this.glow.setAlpha(0.35 + 0.15 * Math.sin(this.arcT * 0.06));
      this.drawArc();
    } else {
      this.img.clearTint();
    }
    this.dangerous = (this.phase === 'zap');
  }
  drawArc() {
    const g = this.arc;
    g.clear();
    g.lineStyle(3, 0xd9baff, 0.95);
    const segs = 6;
    const w = this.arcX2 - this.arcX1;
    let px = this.arcX1, py = this.arcY;
    g.beginPath();
    g.moveTo(px, py);
    for (let i = 1; i <= segs; i++) {
      const nx = this.arcX1 + (w / segs) * i;
      const ny = this.arcY + (i === segs ? 0 : (Math.random() - 0.5) * 26);
      g.lineTo(nx, ny);
      px = nx; py = ny;
    }
    g.strokePath();
  }
  rects() {
    if (!this.dangerous) return [];
    return [{ x1: this.arcX1, x2: this.arcX2, y1: this.arcY - 13, y2: this.arcY + 13 }];
  }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'idle'; this.t = 0; this.dangerous = false; this.arc.clear(); this.glow.setAlpha(0); }
  destroy() { this.img.destroy(); this.glow.destroy(); this.arc.destroy(); }
}

TRAP_CLASSES.crusher = CrusherTrap;
TRAP_CLASSES.tesla = TeslaTrap;
