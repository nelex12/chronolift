/* ХРОНОЛИФТ — Gameplay/Traps.js
 * Ловушки шахты. Параметры берутся из Assets/Prefabs/traps.json (prefab-конфиги),
 * скорость циклов масштабируется сложностью этажа.
 * Опасность показывают сами ловушки, без рамок: жёлтое — скоро ударит, красное — опасно сейчас
 * (рамки зон остались в настройках: «Зоны ловушек», GameScene.drawZones).
 */
'use strict';

// за сколько мс до включения ловушки начинается предупреждение (вспышки ловушки + звук Sfx.warn)
const TRAP_WARN_MS = 1000;

/* доля пройденного предупреждения 0..1; -1 — ловушка сейчас не готовится к удару */
function trapWarnK(tr) {
  if (tr.dangerous || !tr.msToDanger) return -1;
  const ms = tr.msToDanger();
  return (ms > 0 && ms <= TRAP_WARN_MS) ? 1 - ms / TRAP_WARN_MS : -1;
}

/* три вспышки за предупреждение; пики при k = 1/6, 1/2, 5/6 — в такт сигналам (GameScene.updateWarnAudio) */
function trapBlink(k) { return 0.5 - 0.5 * Math.cos(k * Math.PI * 6); }

class LaserTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'laser';
    this.beamY = ledgeY - 150;
    // излучатели спрайта (строка 125 из 256, scale 1.25) — на высоте луча; раньше спрайт стоял
    // на полу этажа, а опасный луч проходил на 150 px выше, в пустоте. Луч — между излучателями
    this.d = scene.add.image(240, this.beamY + 3, 'trap_laser').setScale(1.25).setDepth(5);
    this.beamX1 = 132; this.beamX2 = 346;
    // последний аргумент rectangle — непрозрачность заливки: раньше там стоял 0, и луч не был виден
    // никогда (опасность показывала только рамка). Заливка полная, видимость — через setAlpha
    this.glow = scene.add.rectangle(239, this.beamY, 218, 22, 0xff3b3b, 1).setDepth(6).setAlpha(0);
    this.beam = scene.add.rectangle(239, this.beamY, 214, 9, 0xff5b5b, 1).setDepth(7).setAlpha(0);
    this.aim = scene.add.graphics().setDepth(7);   // прицельный луч перед выстрелом
    this.phase = 'off'; this.t = 0;
    this.durOff = prefab.durOff / diff; this.durTele = prefab.durTele; this.durOn = prefab.durOn / diff;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
  }
  update(dtMs) {
    this.t += dtMs;
    if (this.phase === 'off' && this.t > this.durOff) { this.phase = 'tele'; this.t = 0; }
    else if (this.phase === 'tele' && this.t > this.durTele) { this.phase = 'on'; this.t = 0; this.scene.trapTone(this, 980, 0.1, 'square', 0.05); }
    else if (this.phase === 'on' && this.t > this.durOn) { this.phase = 'off'; this.t = 0; }
    this.dangerous = (this.phase === 'on');
    const tm = this.scene.time.now * 0.02;
    this.aim.clear();
    if (this.phase === 'on') {
      const p = 0.85 + 0.15 * Math.sin(tm * 1.7);
      this.beam.setAlpha(p); this.glow.setAlpha(0.45 * p);
    } else {
      this.beam.setAlpha(0); this.glow.setAlpha(0);
      const k = trapWarnK(this);
      if (k >= 0) {
        // прицельный луч растёт от излучателей к центру и смыкается в момент выстрела
        const b = trapBlink(k), len = (this.beamX2 - this.beamX1) / 2 * k;
        this.aim.lineStyle(2, 0xffc93c, 0.35 + 0.5 * b);
        this.aim.lineBetween(this.beamX1, this.beamY, this.beamX1 + len, this.beamY);
        this.aim.lineBetween(this.beamX2 - len, this.beamY, this.beamX2, this.beamY);
        this.aim.fillStyle(0xffc93c, 0.4 + 0.5 * b);
        this.aim.fillCircle(this.beamX1, this.beamY, 3 + 4 * k);
        this.aim.fillCircle(this.beamX2, this.beamY, 3 + 4 * k);
      }
    }
  }
  rects() {
    if (!this.dangerous) return [];
    return [{ x1: this.beamX1, x2: this.beamX2, y1: this.beamY - 11, y2: this.beamY + 11 }];
  }
  /* сколько мс до включения луча (для жёлтой зоны-предупреждения) и где он будет */
  msToDanger() {
    if (this.phase === 'off') return this.durOff - this.t + this.durTele;
    if (this.phase === 'tele') return this.durTele - this.t;
    return 0;
  }
  warnRects() { return [{ x1: this.beamX1, x2: this.beamX2, y1: this.beamY - 11, y2: this.beamY + 11 }]; }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'off'; this.t = 0; this.beam.setAlpha(0); this.glow.setAlpha(0); this.aim.clear(); this.dangerous = false; }
  destroy() { this.d.destroy(); this.beam.destroy(); this.glow.destroy(); this.aim.destroy(); }
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
  // столкновение — по кругу диска (вписан в rects(): планировщик и тесты считают по квадрату, с запасом)
  hitShapes() { return [{ cx: this.x, cy: this.railY - 14, r: 52 }]; }
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
    this.img = scene.add.image(240, ledgeY + 34, 'trap_spikes').setScale(1.12).setDepth(6).setAlpha(SpikesTrap.GHOST);
    this.imgYOut = ledgeY - 16; this.imgYIn = ledgeY + 34;
    this.dangerous = false;
    this.hadFreezeWhileDanger = false;
    this.done = false;
  }
  update(dtMs) {
    this.t += dtMs;
    if (this.phase === 'hidden' && this.t > this.durHidden) { this.phase = 'warn'; this.t = 0; }
    else if (this.phase === 'warn' && this.t > this.durWarn) { this.phase = 'out'; this.t = 0; this.scene.trapTone(this, 140, 0.15, 'square', 0.07, 90); }
    else if (this.phase === 'out' && this.t > this.durOut) { this.phase = 'hidden'; this.t = 0; }
    this.dangerous = (this.phase === 'out');
    // Спрятанные шипы всё равно торчат над полом (ход всего 50 px), поэтому неопасные — призрачные
    // (GHOST), а за секунду до удара мигают и становятся плотными. Выдвинутые — полностью непрозрачные
    const wk = trapWarnK(this);
    const warnA = wk < 0 ? 0 : wk * (0.55 + 0.45 * trapBlink(wk));
    const G = SpikesTrap.GHOST;
    if (this.phase === 'warn') {
      const k = this.t / this.durWarn;
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, Math.min(1, k * 0.6)));
      this.img.setAlpha(G + (1 - G) * warnA);
    } else if (this.phase === 'out') {
      const k = Math.min(1, this.t / 120);
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, k)).setAlpha(1);
    } else {
      const k = Math.max(0, 1 - this.t / 150);   // втягиваются и гаснут за 150 мс
      this.img.setY(Phaser.Math.Linear(this.imgYIn, this.imgYOut, k)).setAlpha(G + (1 - G) * Math.max(k, warnA));
    }
  }
  rects() {
    if (!this.dangerous) return [];
    // от остриёв (верх спрайта — строка 76 из 256, scale 1.12: img.y − 58) до пола, по ширине шипов.
    // Раньше зона была на 31 px выше остриёв и в полтора раза шире: смерть без касания
    return [{ x1: 116, x2: 364, y1: this.img.y - 58, y2: this.ledgeY - 4 }];
  }
  msToDanger() {
    if (this.phase === 'hidden') return this.durHidden - this.t + this.durWarn;
    if (this.phase === 'warn') return this.durWarn - this.t;
    return 0;
  }
  warnRects() { return [{ x1: 116, x2: 364, y1: this.imgYOut - 58, y2: this.ledgeY - 4 }]; }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'hidden'; this.t = 0; this.dangerous = false; this.img.setY(this.imgYIn); }
  destroy() { this.img.destroy(); this.base.destroy(); }
}

SpikesTrap.GHOST = 0.18;   // непрозрачность неопасных шипов

const TRAP_CLASSES = { laser: LaserTrap, saw: SawTrap, spikes: SpikesTrap };

/* --- Пресс: бьёт сверху вниз. Проскальзывай, пока поднят. --- */
class CrusherTrap {
  constructor(scene, ledgeY, diff, prefab) {
    this.scene = scene; this.ledgeY = ledgeY;
    this.type = 'crusher';
    this.pxPerWorld = 159;                 // при scale 1.1 обеих спрайтов
    // Плита ходит внутри рамы: поднятая висит под поршнем, при ударе ложится на нижнюю опору.
    // Раньше рама стояла на 126 px выше: плита пробивала опору и ложилась под рамой.
    // Положение плиты при ударе (yDown) не менялось — баланс тот же.
    // Спрайт рамы (256 px, scale 1.1): низ поршня — строка 72, верх опоры — строка 216
    this.yDown = ledgeY - 0.55 * this.pxPerWorld;           // низ плиты = ledgeY − 43.5
    this.frame = scene.add.image(240, this.yDown + 44 - 96.8, 'trap_crusher_frame')
      .setScale(1.1).setDepth(5);                            // верх опоры = низ плиты при ударе
    this.yUp = this.frame.y - 61.6 + 44;                     // верх плиты = низ поршня
    this.press = scene.add.image(240, this.yUp, 'trap_crusher_press')
      .setScale(1.1).setDepth(6);
    this.mark = scene.add.graphics().setDepth(5);   // тень на опоре там, куда ляжет плита
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
    else if (this.phase === 'warn' && this.t > this.durWarn) { this.phase = 'slam'; this.t = 0; this.scene.trapTone(this, 120, 0.2, 'square', 0.09, 60); }
    else if (this.phase === 'slam') {
      const k = Math.min(1, this.t / this.slamTime);
      this.press.y = Phaser.Math.Linear(this.yUp, this.yDown, k * k); // ускорение вниз
      if (k >= 1) {
        this.phase = 'hold'; this.t = 0;
        this.scene.cameras.main.shake(120, 0.004);
        this.scene.trapTone(this, 70, 0.25, 'sawtooth', 0.12, 40);
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
    // за секунду до удара: на опоре сгущается тень и мигает жёлтая кромка (плита ещё и дрожит);
    // в ударе плита красноватая
    const k = trapWarnK(this);
    this.mark.clear();
    if (k >= 0) {
      const b = trapBlink(k), yb = this.yDown + 44;
      this.mark.fillStyle(0x000000, 0.15 + 0.35 * k);
      this.mark.fillRect(126, yb - 10, 228, 10);
      this.mark.lineStyle(3, 0xffc93c, 0.3 + 0.7 * b);
      this.mark.lineBetween(126, yb - 1, 354, yb - 1);
    }
    if (this.dangerous) this.press.setTint(0xffb4a8); else this.press.clearTint();
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
  /* до удара; после подъёма — снова через полный цикл (up + warn) */
  msToDanger() {
    if (this.phase === 'up') return this.durUp - this.t + this.durWarn;
    if (this.phase === 'warn') return this.durWarn - this.t;
    if (this.phase === 'rise') return this.durRise - this.t + this.durUp + this.durWarn;
    return 0;
  }
  warnRects() { return [{ x1: 118, x2: 362, y1: this.yDown - 44, y2: this.yDown + 44 }]; }  // куда ляжет плита
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'up'; this.t = 0; this.press.y = this.yUp; this.dangerous = false; this.mark.clear(); this.press.clearTint(); }
  destroy() { this.frame.destroy(); this.press.destroy(); this.mark.destroy(); }
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
    this.arc = scene.add.graphics().setDepth(7);   // и зарядка (контакты, искры, пунктир), и сама дуга
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
      this.scene.trapTone(this, 1600, 0.18, 'sawtooth', 0.08, 300);
    }
    else if (this.phase === 'zap' && this.t > this.durZap) { this.phase = 'idle'; this.t = 0; }
    this.dangerous = (this.phase === 'zap');

    this.arc.clear();
    if (this.phase === 'zap') {
      this.img.setTint(0xd9baff);
      this.drawArc();
      return;
    }
    const k = trapWarnK(this);
    if (k >= 0) {
      this.img.setTint(trapBlink(k) > 0.6 ? 0xd9baff : 0xffffff);
      this.drawCharge(k);
    } else this.img.clearTint();
  }
  /* зарядка: контакты разгораются, по линии будущей дуги — пунктир, навстречу друг другу бегут искры */
  drawCharge(k) {
    const g = this.arc, b = trapBlink(k), y = this.arcY;
    g.fillStyle(0xd9baff, 0.2 + 0.25 * k + 0.4 * b);
    g.fillCircle(this.arcX1, y, 5 + 7 * k);
    g.fillCircle(this.arcX2, y, 5 + 7 * k);
    g.lineStyle(2, 0xd9baff, 0.15 + 0.4 * b);
    for (let x = this.arcX1 + 14; x < this.arcX2 - 14; x += 14) g.lineBetween(x, y, Math.min(x + 6, this.arcX2 - 14), y);
    g.lineStyle(2, 0xf3e8ff, 0.9);
    for (const [x0, dir] of [[this.arcX1, 1], [this.arcX2, -1]]) {
      if (Math.random() > 0.35 + 0.6 * k) continue;
      let x = x0;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0, n = 2 + Math.floor(3 * k); i < n; i++) { x += dir * (6 + 10 * k); g.lineTo(x, y + (Math.random() - 0.5) * 14); }
      g.strokePath();
    }
  }
  /* дуга: широкое свечение + яркая жила по одной ломаной (размах ±13 — как у зоны поражения) */
  drawArc() {
    const g = this.arc, segs = 6, w = this.arcX2 - this.arcX1;
    const pts = [[this.arcX1, this.arcY]];
    for (let i = 1; i <= segs; i++) pts.push([this.arcX1 + (w / segs) * i, this.arcY + (i === segs ? 0 : (Math.random() - 0.5) * 26)]);
    for (const [width, color, alpha] of [[12, 0xb26bff, 0.25], [6, 0xd9baff, 0.45], [3, 0xffffff, 0.95]]) {
      g.lineStyle(width, color, alpha);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.strokePath();
    }
  }
  rects() {
    if (!this.dangerous) return [];
    return [{ x1: this.arcX1, x2: this.arcX2, y1: this.arcY - 13, y2: this.arcY + 13 }];
  }
  msToDanger() {
    if (this.phase === 'idle') return this.durIdle - this.t + this.durCharge;
    if (this.phase === 'charge') return this.durCharge - this.t;
    return 0;
  }
  warnRects() { return [{ x1: this.arcX1, x2: this.arcX2, y1: this.arcY - 13, y2: this.arcY + 13 }]; }
  onFrozen() { if (this.dangerous) this.hadFreezeWhileDanger = true; }
  disarm() { this.phase = 'idle'; this.t = 0; this.dangerous = false; this.arc.clear(); this.img.clearTint(); }
  destroy() { this.img.destroy(); this.arc.destroy(); }
}

TRAP_CLASSES.crusher = CrusherTrap;
TRAP_CLASSES.tesla = TeslaTrap;

/* Опасная зона каждой ловушки по вертикали относительно пола этажа (ledgeY) — объединение
 * всех опасных фаз. По ним FloorPlanner считает гарантированную цену этажа, а
 * test/audit_passability.js проверяет, что rects() из этой зоны не выходят. */
const TRAP_SPANS = {
  laser:   { y1: -161, y2: -139 },   // beamY ± 11
  tesla:   { y1: -163, y2: -137 },   // arcY ± 13
  spikes:  { y1: -74,  y2: -4 },     // от остриёв выдвинутых шипов (imgYOut − 58) до пола
  crusher: { y1: -160, y2: -43 },    // удар не выше ledgeY − 160, плита ложится до yDown + 44
  saw:     { y1: -171, y2: -67 }     // railY − 66 … railY + 38
};
