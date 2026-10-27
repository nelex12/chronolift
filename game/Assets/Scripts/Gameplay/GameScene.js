/* ХРОНОЛИФТ — Gameplay/GameScene.js
 * Основная сцена: лифт с хроно-приводом поднимается сквозь шахту.
 * ЗАЖМИ — время останавливается: ловушки замирают (безопасны), лифт продолжает движение.
 * Энергия ограничена: пустая батарея = перегрузка и форс-резюм времени.
 */
'use strict';

class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    fitCamera(this);
    this.sfx = new Sfx(this);
    this.hud = new Hud(this);
    this.skin = SKINS.find(s => s.id === (save.selectedSkin || 'orange')) || SKINS[0];

    this.energyMax = Math.round(CFG.energyMax * this.skin.energyMul);
    this.energy = this.energyMax;
    this.frozen = false; this.held = false; this.overload = false;
    this.roofY = 700;
    this.floorsPassed = 0; this.score = 0;
    this.coinsRun = 0; this.perfectsRun = 0; this.combo = 0;
    this.reviveUsed = false; this.dead = false; this.invincible = 0;
    this.runTime = 0;
    this.missionsDone = [];   // миссии, выполненные в этом забеге (для GameOver)
    this.frozenAcc = 0;       // накопитель секунд заморозки для миссии frozen_secs

    this.traps = []; this.coinObjs = []; this.ledges = []; this.hints = [];
    this.nextFloorY = 700 - CFG.floorH;
    this.floorIdx = 0;
    this.prefabs = this.cache.json.get('trap_prefabs');

    // фон шахты
    this.add.rectangle(240, 400, 480, 800, 0x0b0f17, 1).setScrollFactor(0).setDepth(-11);
    this.bgFar = this.add.tileSprite(240, 400, 480, 820, 'bg_wall_panel')
      .setScrollFactor(0).setAlpha(0.22).setTint(0x2e3a4e).setScale(1.7).setDepth(-10);
    this.ledgeLayer = this.add.container().setDepth(2);
    this.hazardGlow = this.add.rectangle(240, 400, 480, 800, 0xff3b3b, 0)
      .setScrollFactor(0).setDepth(20);

    this.player = this.add.image(240, 0, this.skin.sprite).setScale(0.54).setDepth(11);
    // ховер-подсветка под персонажем (хроно-привод)
    this.jetGlow = this.add.ellipse(240, 0, 70, 22, 0x57f2ff, 0.30).setDepth(10);

    // визуализация хитбоксов: игрок (контур) и зоны поражения (заливка)
    this.hitGfx = this.add.graphics().setDepth(14);

    this.freezeOverlay = this.add.rectangle(240, 400, 480, 800, 0x2fd6ff, 0)
      .setScrollFactor(0).setDepth(15);
    this.freezeLines = this.add.tileSprite(240, 400, 480, 800, 'bg_wall_panel')
      .setScrollFactor(0).setTint(0x57f2ff).setAlpha(0).setScale(1.7).setDepth(15);

    this.freezeFx = this.add.particles(0, 0, 'dot_cyan', {
      speed: { min: 10, max: 60 }, lifespan: 600, scale: { start: 0.5, end: 0 },
      alpha: { start: 0.8, end: 0 }, emitting: false
    }).setDepth(16);

    this.bindInput();

    this.minigames = new MinigameManager(this);
    this.minigameHintShown = false;
    this.hasFrozenOnce = false;
    this.buildTutorialHand();

    this.addLedge(760, true);
    this.ensureFloors();

    AnalyticsService.track('run_start', { skin: this.skin.id });
  }

  bindInput() {
    this.input.on('pointerdown', () => { this.held = true; this.pressT = this.time.now; this.sfx.ensure(); });
    this.input.on('pointerup', () => {
      this.held = false;
      // короткий тап = попытка в миниигре (удержание — заморозка времени)
      if (this.pressT && this.time.now - this.pressT < 250) this.minigames.tap();
      this.pressT = 0;
    });
    const kb = this.input.keyboard;
    if (kb) {
      kb.on('keydown-SPACE', () => { this.held = true; this.pressT = this.time.now; this.sfx.ensure(); });
      kb.on('keyup-SPACE', () => {
        this.held = false;
        if (this.pressT && this.time.now - this.pressT < 250) this.minigames.tap();
        this.pressT = 0;
      });
    }
  }

  /* Рука-подсказка для обучения: пульсирует «ЗАЖМИ!», пока игрок не заморозил время */
  buildTutorialHand() {
    this.hand = this.add.container(240, 690).setScrollFactor(0).setDepth(31).setVisible(false);
    const circle = this.add.circle(0, 0, 46, 0x2fd6a3, 0.25).setStrokeStyle(3, 0x2fd6a3, 0.9);
    const label = this.add.text(0, 0, 'ЗАЖМИ!', {
      fontFamily: 'Arial', fontSize: '22px', fontStyle: 'bold', color: '#eaf6ff'
    }).setOrigin(0.5);
    this.hand.add([circle, label]);
    this.tweens.add({ targets: circle, scale: 1.25, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });
  }

  /* ---------- генерация этажей ---------- */
  addLedge(y) {
    const t = this.add.tileSprite(240, y, 480, 36, 'bg_floor_ledge');
    t.tileScaleX = 1.75; t.tileScaleY = 0.42;
    t.setDepth(2);
    this.ledges.push({ y: y, spr: t });
  }

  spawnFloor(ledgeY) {
    this.floorIdx++;
    const i = this.floorIdx;
    this.addLedge(ledgeY);

    const tutorialActive = !save.tutorialDone;
    const diff = tutorialActive && i <= 5
      ? 0.62                                   // обучающие этажи — медленные циклы
      : 1 + Math.min(2.2, i * 0.09);

    // 5 уроков обучения, дальше — случайный набор из 5 ловушек
    const LESSONS = ['laser', 'saw', 'spikes', 'crusher', 'tesla'];
    let types;
    if (tutorialActive && i <= 5) types = [LESSONS[i - 1]];
    else {
      const r = Math.random();
      const combo = i >= 6 && Math.random() < Math.min(0.45, 0.12 + i * 0.02);
      const pool5 = ['spikes', 'saw', 'laser', 'crusher', 'tesla'];
      if (combo) {
        const a = pool5[Math.floor(Math.random() * pool5.length)];
        let b = pool5[Math.floor(Math.random() * pool5.length)];
        if (b === a) b = pool5[(pool5.indexOf(a) + 1) % pool5.length];
        types = [a, b];
      } else types = [pool5[Math.floor(r * pool5.length)]];
    }

    for (const t of types) {
      const trap = new TRAP_CLASSES[t](this, ledgeY, diff, this.prefabs[t]);
      this.traps.push(trap);
      // одноразовое интро новой угрозы (и после обучения тоже). Этажи создаются заранее,
      // поэтому интро показывается, когда этаж подъезжает (showTrapIntros), а не при создании —
      // иначе на старте обучения всплывали все 5 надписей разом
      save.seenTraps = save.seenTraps || {};
      this.introQueued = this.introQueued || {};
      if (!save.seenTraps[t] && !this.introQueued[t]) {
        this.introQueued[t] = true;
        trap.introType = t;
      }
    }

    if (i >= 1 && Math.random() < 0.75) {
      const n = 2 + Math.floor(Math.random() * 2);
      const cx = 120 + Math.random() * 240;
      for (let k = 0; k < n; k++) {
        const c = this.add.image(cx, ledgeY - 170 - k * 52, 'coin').setScale(0.5).setDepth(3);
        c.phase = Math.random() * 6.28;
        this.coinObjs.push({ img: c, taken: false });
      }
    }

    // обучение: подсказки на первых 5 этажах
    if (i <= 5 && tutorialActive) {
      const msgs = {
        1: '⚠ ЛАЗЕР ВПЕРЕДИ!\nЗАЖМИ ЭКРАН — время остановится',
        2: 'ПИЛА НЕ ОСТАНОВИТСЯ САМА\nЗамри и проскользни мимо',
        3: 'ШИПЫ СТРЕМЯТСЯ ВНИЗ\nСледи за энергией слева',
        4: 'ПРЕСС БЬЁТ СВЕРХУ\nПроскальзывай, пока он поднят',
        5: 'ТЕСЛА ЗАРЯЖАЕТСЯ И БЬЁТ ДУГОЙ\nЗамри во время разряда'
      };
      const t = this.add.text(240, 320, msgs[i], {
        fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#ffe89b',
        align: 'center', backgroundColor: '#101826cc', padding: { x: 14, y: 10 }
      }).setOrigin(0.5).setScrollFactor(0).setDepth(31).setVisible(false);
      this.hints.push({ floor: i, obj: t, y: ledgeY });
    }
  }

  /* Показываем урок ловушки, которую игрок встретит СЛЕДУЮЩЕЙ:
     берём первую непройденную ловушку и включаем её подсказку. */
  updateHintVisibility() {
    const next = this.traps.find(t => !t.done);
    for (const h of this.hints) h.obj.setVisible(!!next && Math.abs(h.y - next.ledgeY) < 1);
  }

  ensureFloors() {
    while (this.nextFloorY > this.roofY - 2400) {
      this.spawnFloor(this.nextFloorY);
      this.nextFloorY -= CFG.floorH;
    }
  }

  cleanup() {
    const bottom = this.roofY + 500;
    this.traps = this.traps.filter(tr => (tr.ledgeY > bottom) ? (tr.destroy(), false) : true);
    this.coinObjs = this.coinObjs.filter(c => (c.img.y > bottom) ? (c.img.destroy(), false) : true);
    this.ledges = this.ledges.filter(l => (l.y > bottom) ? (l.spr.destroy(), false) : true);
    this.hints = this.hints.filter(h => (h.y > bottom) ? (h.obj.destroy(), false) : true);
  }

  setFrozen(f) {
    if (f === this.frozen) return;
    this.frozen = f;
    if (f) { this.hasFrozenOnce = true; this.sfx.freeze(); } else this.sfx.unfreeze();
  }

  update(time, delta) {
    if (this.dead) return;
    const dt = Math.min(delta, 50) / 1000;
    const dtMs = dt * 1000;
    this.runTime += dt;
    if (this.invincible > 0) this.invincible -= dt;

    let wantHold = this.held;
    if (window.__AUTOTEST) wantHold = this.autoHold();

    this.minigames.update(dtMs);
    if (window.__AUTOTEST) this.minigames.autoSolve();

    if (wantHold && !this.frozen && !this.overload && this.energy > 1) this.setFrozen(true);
    if ((!wantHold || this.overload) && this.frozen) this.setFrozen(false);

    const speedMul = window.__AUTOTEST ? 10 : 1;
    const speed = Math.min(CFG.maxSpeed, CFG.baseSpeed + this.floorsPassed * CFG.speedPerFloor) * speedMul;
    this.roofY -= speed * dt;

    if (this.frozen) {
      this.frozenAcc += dt;
      if (this.frozenAcc >= 1) { const s = Math.floor(this.frozenAcc); this.frozenAcc -= s; this.trackMission('frozen_secs', s); }
      this.energy -= CFG.drainRate * dt;
      if (this.energy <= 0) {
        this.energy = 0;
        this.setFrozen(false);
        this.overload = true;
        this.sfx.alarm();
        this.hud.toast('ПЕРЕГРУЗКА ХРОНОПРИВОДА!', '#ff5b5b');
      }
    } else {
      this.energy = Math.min(this.energyMax, this.energy + CFG.regenRate * this.skin.regenMul * dt);
      if (this.overload && this.energy >= CFG.overloadRegen) this.overload = false;
    }

    if (!this.frozen) {
      for (const tr of this.traps) {
        tr.update(dtMs);
        if (!tr.done && this.roofY < tr.ledgeY - 150) { tr.done = true; this.onFloorPassed(tr); }
      }
    } else {
      for (const tr of this.traps) {
        if (Math.abs(tr.ledgeY - this.roofY) < 320) tr.onFrozen();
        if (!tr.done && this.roofY < tr.ledgeY - 150) { tr.done = true; this.onFloorPassed(tr); }
      }
    }

    this.showTrapIntros();
    this.checkDanger();
    this.collectCoins();
    this.updateVisuals(dtMs, time);
    this.hud.update(this, dtMs, time);
    this.cleanup();
    this.ensureFloors();

    // рука-подсказка на старте: пока ни один этаж не пройден и игрок ни разу не заморозил время
    this.hand.setVisible(!save.tutorialDone && this.floorsPassed === 0 && !this.hasFrozenOnce && !this.frozen);
    this.updateHintVisibility();

    if (this.floorsPassed >= 5 && !save.tutorialDone) { save.tutorialDone = true; saveNow(); }
  }

  showTrapIntros() {
    const names = { laser: 'ЛАЗЕРНАЯ СЕТЬ', saw: 'ПИЛА', spikes: 'ШИПЫ', crusher: 'ГИДРАВЛИЧЕСКИЙ ПРЕСС', tesla: 'ТЕСЛА-ДУГА' };
    for (const tr of this.traps) {
      if (!tr.introType || Math.abs(tr.ledgeY - this.roofY) > 420) continue;  // этаж ещё за кадром
      save.seenTraps[tr.introType] = true;
      this.hud.toast('НОВАЯ УГРОЗА: ' + names[tr.introType], '#ffe89b');
      tr.introType = null;
    }
  }

  autoHold() {
    for (const tr of this.traps) {
      if (Math.abs(tr.ledgeY - this.roofY) < 300 && tr.dangerous) return true;
    }
    return false;
  }

  onFloorPassed(trap) {
    this.floorsPassed++;
    if (this.floorsPassed % 10 === 0) {
      AnalyticsService.track('run_milestone', { floors: this.floorsPassed });
    }
    this.trackMission('floors', 1);
    this.trackMission('floor_run', this.floorsPassed, 'max');
    if (trap.hadFreezeWhileDanger) {
      this.perfectsRun++;
      this.combo++;
      const bonus = 2 + Math.min(6, this.combo);
      this.coinsRun += bonus;
      this.score += 5;
      this.sfx.perfect();
      this.hud.toast('ИДЕАЛЬНО! +' + bonus + ' монет' + (this.combo > 1 ? '  x' + this.combo : ''), '#57f2ff');
      this.trackMission('perfects', 1);
      this.trackMission('combo', this.combo, 'max');
      this.trackMission('coins', bonus);
    } else {
      this.combo = 0;
    }

    // миниигра каждые 4 этажа после 4-го
    this.minigames.maybeStart(this.floorsPassed);
    if (this.minigames.active && !this.minigameHintShown) {
      this.minigameHintShown = true;
      this.hud.toast('Нажми КОРОТКО в зелёной зоне!', '#57f2ff');
    }
  }

  playerRects() {
    return [{ x1: 240 - 22, x2: 240 + 22, y1: this.roofY - 92, y2: this.roofY + 2 }];
  }

  checkDanger() {
    if (this.frozen || this.invincible > 0 || this.dead) return;
    const pr = this.playerRects()[0];
    for (const tr of this.traps) {
      if (Math.abs(tr.ledgeY - this.roofY) > 320) continue;
      for (const r of tr.rects()) {
        if (pr.x1 < r.x2 && pr.x2 > r.x1 && pr.y1 < r.y2 && pr.y2 > r.y1) {
          this.die(tr.type);
          return;
        }
      }
    }
  }

  collectCoins() {
    for (const c of this.coinObjs) {
      if (c.taken) continue;
      if (Math.abs(c.img.y - (this.roofY - 55)) < 80 && Math.abs(c.img.x - 240) < 80) {
        c.taken = true;
        c.img.destroy();
        this.coinsRun++;
        this.trackMission('coins', 1);
        this.score += 2;
        this.sfx.coin();
      }
    }
  }

  updateVisuals(dtMs, time) {
    this.player.setPosition(240, this.roofY - 46);
    this.jetGlow.setPosition(240, this.roofY + 6);
    this.jetGlow.setAlpha(0.20 + 0.12 * Math.sin(time * 0.008));
    this.cameras.main.setScroll(0, this.roofY - 600);
    this.bgFar.tilePositionY = (this.roofY - 600) * 0.35;

    this.drawHitboxes();

    for (const c of this.coinObjs) {
      if (!c.taken) c.img.setScale(0.5 * (0.75 + 0.25 * Math.sin(time * 0.004 + c.phase)));
    }

    const targetA = this.frozen ? 0.16 : 0;
    this.freezeOverlay.setAlpha(Phaser.Math.Linear(this.freezeOverlay.alpha, targetA, 0.2));
    this.freezeLines.setAlpha(this.frozen ? 0.10 : 0);
    if (this.frozen) {
      this.freezeLines.tilePositionY = (this.roofY - 600) * 0.8;
      if (Math.random() < 0.5) {
        this.freezeFx.emitParticleAt(240 + (Math.random() - 0.5) * 300, this.roofY - 30 + (Math.random() - 0.5) * 120, 1);
      }
    }

    let nearDanger = false;
    if (!this.frozen) {
      for (const tr of this.traps) {
        if (Math.abs(tr.ledgeY - this.roofY) < 300 && tr.dangerous) { nearDanger = true; break; }
      }
    }
    this.hazardGlow.setAlpha(nearDanger ? 0.10 + 0.08 * Math.sin(time * 0.012) : 0);

    this.player.setAlpha(this.invincible > 0 ? (Math.sin(time * 0.03) > 0 ? 1 : 0.3) : 1);
  }

  /* Честные хитбоксы: зона игрока — зелёный контур,
   * зоны поражения ловушек — красная заливка (ярче, когда опасно). */
  drawHitboxes() {
    const g = this.hitGfx;
    g.clear();
    const pr = this.playerRects()[0];
    g.lineStyle(2, 0x2fd6a3, 0.85);
    g.strokeRect(pr.x1, pr.y1, pr.x2 - pr.x1, pr.y2 - pr.y1);
    const pulse = 0.5 + 0.5 * Math.sin(this.runTime * 0.012);
    for (const tr of this.traps) {
      if (Math.abs(tr.ledgeY - this.roofY) > 420) continue;
      for (const r of tr.rects()) {
        const danger = tr.dangerous;
        g.fillStyle(danger ? 0xff3b3b : 0xffc93c, danger ? 0.14 + 0.10 * pulse : 0.07);
        g.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
        g.lineStyle(1.5, danger ? 0xff3b3b : 0xffc93c, danger ? 0.55 : 0.25);
        g.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      }
    }
  }

  /* Прогресс ежедневных миссий: счётчик + тост о выполнении (награду забирают в меню) */
  trackMission(type, amount, mode) {
    const fresh = MissionService.progress(type, amount, mode);
    for (const m of fresh) {
      if (this.missionsDone.some((x) => x.id === m.id)) continue;
      this.missionsDone.push(m);
      this.hud.toast('🎯 МИССИЯ ВЫПОЛНЕНА: ' + m.name + ' — награда в меню', '#ffc93c');
      this.sfx.reward();
    }
  }

  /* ---------- смерть ---------- */
  die(cause) {
    if (this.dead || this.invincible > 0) return;
    this.dead = true;
    this.setFrozen(false);
    this.sfx.death();
    this.cameras.main.shake(350, 0.012);
    AnalyticsService.track('run_death', { cause: cause, floor: this.floorsPassed });

    const boom = this.add.particles(240, this.roofY - 40, 'dot', {
      speed: { min: 80, max: 320 }, lifespan: 700, scale: { start: 1.1, end: 0 },
      tint: [0xff5b5b, 0xffc93c, 0xffffff], emitting: false
    }).setDepth(25);
    boom.emitParticleAt(240, this.roofY - 40, 26);
    this.player.setVisible(false);

    this.time.delayedCall(650, () => {
      if (window.__AUTOTEST && !this.reviveUsed) { this.revive(); return; }
      if (!this.reviveUsed) this.showReviveOffer();
      else this.gameOver();
    });
  }

  /* Оффер возрождения: rewarded-реклама ИЛИ 100 монет (sink экономики) */
  showReviveOffer() {
    const c = this.add.container(240, 400).setScrollFactor(0).setDepth(50);
    const dim = this.add.rectangle(0, 0, 480, 800, 0x05080e, 0.82);
    const title = this.add.text(0, -160, 'ХРОНОСБОЙ!', {
      fontFamily: 'Arial', fontSize: '40px', fontStyle: 'bold', color: '#ff5b5b'
    }).setOrigin(0.5);
    const sub = this.add.text(0, -118, 'Починить лифт можно один раз за забег', {
      fontFamily: 'Arial', fontSize: '18px', color: '#9fb4c8'
    }).setOrigin(0.5);

    const btnAdR = this.add.rectangle(0, -40, 320, 62, 0x123a2e, 0.98)
      .setStrokeStyle(2, 0x2fd6a3).setInteractive({ useHandCursor: true });
    const btnAdT = this.add.text(0, -40, '▶ ВОЗРОДИТЬСЯ БЕСПЛАТНО (реклама)', {
      fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold', color: '#eaf6ff'
    }).setOrigin(0.5);

    const canPay = EconomyService.balance() >= CFG.reviveCostCoins;
    const btnCoinR = this.add.rectangle(0, 40, 320, 62, canPay ? 0x3a2e10 : 0x1a1f2a, 0.98)
      .setStrokeStyle(2, canPay ? 0xffc93c : 0x3a4556)
      .setInteractive({ useHandCursor: true });
    const btnCoinT = this.add.text(0, 40, 'ВОЗРОДИТЬСЯ ЗА ' + CFG.reviveCostCoins + ' МОНЕТ' +
      (canPay ? '' : ' (не хватает: ' + EconomyService.balance() + ')'), {
      fontFamily: 'Arial', fontSize: '18px', fontStyle: 'bold',
      color: canPay ? '#ffe89b' : '#5a6a7d'
    }).setOrigin(0.5);

    const noT = this.add.text(0, 112, 'отказаться', {
      fontFamily: 'Arial', fontSize: '17px', color: '#5a6a7d'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    c.add([dim, title, sub, btnAdR, btnAdT, btnCoinR, btnCoinT, noT]);

    btnAdR.on('pointerdown', async () => {
      btnAdT.setText('Загрузка рекламы…');
      btnAdR.disableInteractive();
      const ok = await AdsService.showRewarded('revive');
      if (ok) { c.destroy(); this.revive(); AnalyticsService.track('revive', { method: 'ad' }); }
      else { btnAdT.setText('▶ ВОЗРОДИТЬСЯ БЕСПЛАТНО (реклама)'); btnAdR.setInteractive({ useHandCursor: true }); }
    });
    btnCoinR.on('pointerdown', () => {
      if (!canPay) return;
      if (EconomyService.spend(CFG.reviveCostCoins, 'revive')) {
        c.destroy(); this.revive();
        AnalyticsService.track('revive', { method: 'coins' });
      }
    });
    noT.on('pointerdown', () => { c.destroy(); this.gameOver(); });
  }

  revive() {
    this.reviveUsed = true;
    this.trackMission('revives', 1);
    this.dead = false;
    this.energy = Math.round(this.energyMax * 0.6);
    this.overload = false;
    this.invincible = 1.6;
    this.player.setVisible(true);
    for (const tr of this.traps) if (Math.abs(tr.ledgeY - this.roofY) < 340) tr.disarm();
    this.hud.toast('ХРОНОПРИВОД ПЕРЕЗАПУЩЕН', '#2fd6a3');
  }

  gameOver() {
    const totalScore = this.score + this.floorsPassed * 10;
    const isBest = totalScore > save.best.score;
    if (isBest) save.best = { score: totalScore, floors: Math.max(save.best.floors, this.floorsPassed) };
    else if (this.floorsPassed > save.best.floors) save.best.floors = this.floorsPassed;
    save.bestCoinsRun = Math.max(save.bestCoinsRun || 0, this.coinsRun);

    EconomyService.grant(this.coinsRun, 'run_coins');
    save.perfects += this.perfectsRun;
    save.games++;
    this.trackMission('runs', 1);
    saveNow();

    const unlocks = AchievementService.check();
    LeaderboardService.submit(save.best.floors);
    AdsService.onGameOver();
    AnalyticsService.track('run_end', { floors: this.floorsPassed, score: totalScore, coins: this.coinsRun });

    this.scene.start('GameOver', {
      score: totalScore, floors: this.floorsPassed, coins: this.coinsRun,
      perfects: this.perfectsRun, isBest: isBest, unlocks: unlocks,
      missionsDone: this.missionsDone
    });
  }
}
