/* ХРОНОЛИФТ — Gameplay/Tutorial.js
 * Обучение — отдельный режим забега (GameScene.tutorial), пока не стоит save.tutorialDone.
 *
 * Шаги: 1) что такое лифт и остановка времени; 2) зажать экран и увидеть, как тратится энергия;
 * 3–7) пять ловушек по одной. Перед каждой ловушкой лифт ОСТАНАВЛИВАЕТСЯ: карточка объясняет, как она
 * предупреждает и бьёт, а сама ловушка тем временем проходит свой цикл у игрока на глазах. Закрыть
 * карточку можно, только когда ловушка показала удар (и текст успели прочитать). Дальше игрок проезжает
 * её сам, а подсказка под лифтом говорит, когда зажать и когда отпустить.
 *
 * Умереть нельзя: при касании время отматывается назад к точке остановки, карточка объясняет, что
 * пошло не так, и попытка повторяется. Пока открыта карточка, лифт стоит, а нажатие закрывает карточку
 * и время не останавливает. Монет, очков, миссий и мини-игр в обучении нет. В конце — карточка
 * «Обучение пройдено» и обычный забег (сцена перезапускается). «Пропустить» — в правом верхнем углу.
 */
'use strict';

const TUTORIAL_TRAPS = ['laser', 'saw', 'spikes', 'crusher', 'tesla'];

const TUTORIAL_TEXT = {
  laser: {
    name: 'ЛАЗЕР',
    watch: 'От излучателей тянется жёлтый прицел, и через секунду между ними загорается луч. ' +
      'Пока время стоит, луч не опасен.',
    pass: 'ЛАЗЕР: держи, пока луч горит рядом с тобой',
    hit: 'Луч загорается сразу после жёлтого прицела. Зажми, когда прицел сомкнётся, ' +
      'и держи, пока не проедешь луч.'
  },
  saw: {
    name: 'ПИЛА',
    watch: 'Ездит по рельсу туда-сюда и никогда не останавливается сама. Переждать её нельзя — ' +
      'только остановить время, пока проезжаешь.',
    pass: 'ПИЛА: держи всё время, пока проезжаешь её рельс',
    hit: 'Пила не ждёт. Зажми перед ней и не отпускай, пока лифт не поднимется выше диска.'
  },
  spikes: {
    name: 'ШИПЫ',
    watch: 'Бледный силуэт показывает, где выскочат шипы. Перед ударом он мигает, а контур краснеет — ' +
      'и шипы бьют вверх рывком.',
    pass: 'ШИПЫ: держи, пока проезжаешь над мигающим силуэтом',
    hit: 'Шипы выскочили, когда лифт был над ними. Если силуэт мигает — зажми и держи, пока не проедешь.'
  },
  crusher: {
    name: 'ПРЕСС',
    watch: 'Перед ударом плита дрожит, на опоре сгущается тень и мигает жёлтая кромка. ' +
      'Удар — сверху вниз, плита полежит и поднимется.',
    pass: 'ПРЕСС: держи, пока проезжаешь под плитой',
    hit: 'Пресс ударил, когда лифт был под ним. Зажми, когда плита задрожит, и держи, пока не проедешь.'
  },
  tesla: {
    name: 'ТЕСЛА',
    watch: 'Контакты разгораются, между ними бегут искры, и через секунду бьёт дуга.',
    pass: 'ТЕСЛА: держи, пока рядом бьёт дуга',
    hit: 'Дуга бьёт сразу после искр. Зажми, когда тесла заискрит, и держи, пока не проедешь.'
  }
};

class Tutorial {
  constructor(scene) {
    this.s = scene;
    // автотест (?autotest=1) проходит обучение сам: карточки читаются быстрее и закрываются сами
    this.fast = window.__AUTOTEST ? 0.25 : 1;
    this.stage = 'card';
    this.idx = -1;                 // какая ловушка сейчас (индекс в TUTORIAL_TRAPS)
    this.floors = [];              // [{ type, ledgeY, stopY, trap }]
    this.card = null;
    this.frozenFor = 0;
    this.outroT = 0;
    this.hits = 0;                 // сколько раз задело (для аналитики и теста)
    this.buildUi();
    AnalyticsService.track('tutorial_start', {});
    this.showCard({
      step: 1,
      title: 'ОБУЧЕНИЕ',
      body: 'Лифт сам едет вверх, остановить его нельзя. Зато можно остановить ВРЕМЯ — ' +
        'тогда замирают все ловушки шахты.\n\nЗдесь проиграть нельзя: ошибёшься — время отмотается назад.',
      minRead: 2.2
    }, () => this.startHold());
  }

  /* ---------- этажи ---------- */

  /* все пять этажей сразу: по одной ловушке, 440 px друг от друга; первый — чуть выше старта.
   * Лифт останавливается так, чтобы верх игрока был на 70 px ниже зоны ловушки (у пресса — на 150:
   * его рама высокая и иначе уходит под карточку) */
  spawnFloors() {
    if (this.floors.length) return;
    TUTORIAL_TRAPS.forEach((type, k) => {
      const ledgeY = this.s.roofY - 360 - k * 440;
      this.s.spawnFloor(ledgeY, [type]);
      const margin = type === 'crusher' ? 150 : 70;
      this.floors.push({
        type, ledgeY,
        stopY: ledgeY + TRAP_SPANS[type].y2 + PLAN.playerH + margin,
        trap: this.s.traps[this.s.traps.length - 1]
      });
    });
  }

  cur() { return this.floors[this.idx] || null; }

  /* ---------- что можно GameScene ---------- */

  /* множитель скорости лифта: едет только к ловушке и мимо неё */
  speedK() { return (this.stage === 'approach' || this.stage === 'pass' || this.stage === 'outro') ? 1 : 0; }
  /* ловушки стоят, пока идёт «стоп-кадр» удара и перемотка */
  holdTraps() { return this.stage === 'hit' || this.stage === 'rewind'; }
  /* стрелки часов лифта: при перемотке идут назад */
  clockRate() { return this.stage === 'rewind' ? -4 : this.stage === 'hit' ? 0 : 1; }
  /* можно ли сейчас останавливать время */
  filterHold(want) { return (this.stage === 'hold' || this.stage === 'approach' || this.stage === 'pass') && want; }
  /* касание проверяется только когда игрок сам едет мимо ловушки */
  canHit() { return this.stage === 'approach' || this.stage === 'pass' || this.stage === 'outro'; }

  /* нажатие: если открыта карточка — закрыть её (когда уже можно) и время не останавливать */
  onPress() {
    if (!this.card) return false;
    if (this.card.ready) this.closeCard();
    return true;
  }

  /* автопилот самопроверки */
  autoHold() {
    if (this.stage === 'hold') return true;
    if (this.card) return false;
    return this.s.autoHold();
  }

  /* нужно ли держать: опасная зона (или та, что включится за look с) заденет игрока за look с пути.
   * Пилу считаем опасной по всей ширине: она движется быстрее, чем человек успевает среагировать.
   * По этой функции рисуется подсказка «ЗАЖМИ!» / «ОТПУСТИ» — test/probe_tutorial.js проверяет,
   * что, следуя ей, ловушки проходятся без касаний */
  needHold(look) {
    const f = this.cur();
    if (!f) return false;
    const s = this.s, tr = f.trap, pr = s.playerRects()[0];
    const y1 = pr.y1 - s.liftSpeed() * look - 4;
    let rs = [];
    if (tr.type === 'saw') rs = tr.rects().map(r => ({ x1: 0, x2: 480, y1: r.y1, y2: r.y2 }));
    else if (tr.dangerous) rs = tr.rects();
    else if (tr.msToDanger() <= look * 1000) rs = tr.warnRects();
    return rs.some(r => y1 < r.y2 && pr.y2 > r.y1);
  }

  /* ---------- шаги ---------- */

  startHold() {
    this.stage = 'hold';
    this.frozenFor = 0;
    this.setProgress(2);
    this.setBanner('ЗАЖМИ экран (или пробел) и подержи');
  }

  startApproach(i) {
    this.idx = i;
    this.stage = 'approach';
    this.setProgress(3 + i);
    this.setBanner(i === 0 ? 'Лифт поехал. Впереди — первая ловушка' : 'Дальше — ' + TUTORIAL_TEXT[this.cur().type].name.toLowerCase());
  }

  /* лифт встал перед ловушкой: карточка, пока ловушка показывает свой цикл */
  startWatch() {
    const f = this.cur(), t = TUTORIAL_TEXT[f.type];
    save.seenTraps = save.seenTraps || {};
    save.seenTraps[f.type] = true;
    f.trap.introType = null;
    const tr = f.trap;
    let seen = f.type === 'saw', elapsed = 0;          // пила опасна всегда — смотреть на неё 3 с
    this.showCard({
      title: t.name, body: t.watch, color: '#ffc93c', minRead: f.type === 'saw' ? 3 : 2,
      waitFoot: 'смотри, как она работает…',
      foot: '▶ нажми — и проезжай её сам',
      // закрыть можно, когда ловушка показала удар и снова затихла (или через 8 с — на всякий случай)
      until: (dt) => {
        elapsed += dt;
        if (tr.dangerous) seen = true;
        return window.__AUTOTEST || (seen && (f.type === 'saw' || !tr.dangerous)) || elapsed > 8;
      }
    }, () => this.startPass());
  }

  startPass() {
    this.stage = 'pass';
    this.syncTrap();
    this.setBanner(TUTORIAL_TEXT[this.cur().type].pass);
  }

  /* Ловушка бьёт ровно тогда, когда лифт в её зоне: иначе её можно проехать в тихой фазе, ничего не
   * нажав, и урок пройдёт мимо игрока. Удар — через 0,3–0,4 с после входа в зону (пила — пересекает
   * середину шахты посередине прохода), жёлтое предупреждение начинается сразу после карточки */
  syncTrap() {
    const f = this.cur(), tr = f.trap, sp = TRAP_SPANS[f.type], v = this.s.liftSpeed();
    const arrive = (f.stopY + 2 - PLAN.playerH - (f.ledgeY + sp.y2)) / v * 1000;   // мс до входа в зону
    const contact = (sp.y2 - sp.y1 + PLAN.playerH) / v * 1000;                      // мс в зоне
    if (f.type === 'saw') {
      const w = 0.0016 * tr.prefab.speed, k = 0.9 + tr.diff * 0.15;                 // как в SawTrap.update
      tr.t = (Math.PI - w * k * (arrive + contact / 2)) / w;
      return;
    }
    const ms = arrive + Math.min(400, contact * 0.3);
    tr.disarm();
    if (f.type === 'laser') tr.t = tr.durOff + tr.durTele - ms;
    else if (f.type === 'tesla') tr.t = tr.durIdle + tr.durCharge - ms;
    else if (f.type === 'crusher') tr.t = tr.durUp + tr.durWarn - ms;
    // у шипов начало тихой фазы — анимация ухода вниз (RETRACT_MS), его не трогаем
    else if (f.type === 'spikes') tr.t = Math.max(SpikesTrap.RETRACT_MS, tr.durHidden + tr.durWarn - ms);
  }

  passed() {
    const f = this.cur();
    this.s.sfx.perfect();
    this.s.hud.toast(f.trap.hadFreezeWhileDanger ? 'ОТЛИЧНО! Время остановлено вовремя' : 'ПРОЙДЕНО!', '#57f2ff');
    AnalyticsService.track('tutorial_step', { trap: f.type, hits: this.hits });
    if (this.idx + 1 < this.floors.length) this.startApproach(this.idx + 1);
    else { this.stage = 'outro'; this.outroT = 0.9; this.setBanner(''); }
  }

  /* касание ловушки: стоп-кадр, перемотка к точке остановки, карточка с разбором ошибки */
  onHit(tr) {
    if (!this.canHit()) return;
    const s = this.s, f = this.cur();
    const noEnergy = s.overload || s.energy < 3;
    this.hits++;
    this.stage = 'hit';
    s.setFrozen(false);
    s.held = false;
    s.invincible = 99;                       // мигание игрока; касания сейчас не проверяются
    s.sfx.alarm();
    s.cameras.main.shake(220, 0.008);
    this.flash.setFillStyle(0xff3b3b).setAlpha(0.28);
    this.setBanner('');
    s.time.delayedCall(450 * this.fast, () => {
      if (!f) return;
      this.stage = 'rewind';
      this.flash.setFillStyle(0x57f2ff).setAlpha(0.14);
      this.rewindText.setVisible(true);
      s.sfx.tone(700, 0.7 * this.fast, 'sawtooth', 0.04, 180);
      const o = { y: s.roofY };
      s.tweens.add({
        targets: o, y: f.stopY, duration: 900 * this.fast, ease: 'Sine.easeInOut',
        onUpdate: () => { s.roofY = o.y; },
        onComplete: () => {
          s.roofY = f.stopY;
          tr.disarm();
          tr.done = false;
          s.energy = s.energyMax; s.overload = false; s.invincible = 0;
          this.flash.setAlpha(0);
          this.rewindText.setVisible(false);
          this.showCard({
            title: 'ЗАДЕЛО!', color: '#ff7a7a', minRead: 1.6,
            body: noEnergy
              ? 'Энергия кончилась, и время пошло само. Зажимай прямо перед ловушкой и отпускай, как только проедешь — ' +
                'подсказка под лифтом покажет когда.'
              : TUTORIAL_TEXT[f.type].hit + '\n\nПодсказка под лифтом покажет, когда зажать.',
            foot: '▶ нажми — ещё раз'
          }, () => this.startPass());
        }
      });
    });
  }

  finish() {
    save.tutorialDone = true;
    saveNow();
    AnalyticsService.track('tutorial_done', { hits: this.hits });
    this.s.scene.restart();
  }

  skip() {
    save.tutorialDone = true;
    saveNow();
    AnalyticsService.track('tutorial_skip', { step: this.idx + 3 });
    this.s.scene.restart();
  }

  /* ---------- кадр ---------- */

  update(dt) {
    const s = this.s, f = this.cur();
    if (this.card) {
      const c = this.card;
      c.t += dt;
      const ok = c.until ? c.until(dt) : true;
      if (!c.ready && ok && c.t >= c.minRead * this.fast) this.setReady();
      if (c.ready && window.__AUTOTEST) this.closeCard();
    } else if (this.stage === 'hold') {
      if (s.frozen) this.frozenFor += dt;
      if (this.frozenFor >= 1.2 * this.fast) {
        this.showCard({
          step: 2, title: 'ХРОНО-ЭНЕРГИЯ', arrow: true, minRead: 2.5,
          body: 'Часы на лифте встали — время стоит. За это платишь энергией: полоса слева вверху. ' +
            'Отпустишь — она восстановится сама. Кончится — время пойдёт само.'
        }, () => this.startApproach(0));
      }
    } else if (this.stage === 'approach' && s.roofY <= f.stopY) {
      s.roofY = f.stopY;
      this.stage = 'card';
      this.startWatch();
    } else if (this.stage === 'pass' && s.roofY + 2 < f.ledgeY + TRAP_SPANS[f.type].y1) {
      this.passed();
    } else if (this.stage === 'outro') {
      this.outroT -= dt;
      if (this.outroT <= 0) {
        this.stage = 'card';
        this.showCard({
          step: 7, title: 'ОБУЧЕНИЕ ПРОЙДЕНО!', color: '#2fd6a3', minRead: 2.5,
          body: 'Дальше — настоящая шахта: ловушки идут сериями, лифт разгоняется, бывает по две ловушки сразу. ' +
            'Между сериями — передышки с мини-играми за бонусы.\n\nЗдесь ошибка уже стоит забега.',
          foot: '▶ нажми, чтобы начать забег'
        }, () => this.finish());
      }
    }
    this.updateHand();
  }

  /* подсказка под лифтом: «ЗАЖМИ!», пока надо держать, и «ОТПУСТИ», когда держать уже незачем */
  updateHand() {
    const s = this.s;
    let label = null;
    if (this.stage === 'hold') label = s.frozen ? 'ДЕРЖИ…' : 'ЗАЖМИ!';
    else if (this.stage === 'pass' || this.stage === 'approach') {
      if (!s.frozen && this.needHold(0.4)) label = 'ЗАЖМИ!';
      else if (s.frozen && !this.needHold(0.6)) label = 'ОТПУСТИ';
    }
    this.hand.setVisible(!!label && !this.card);
    if (label && this.handLabel.text !== label) {
      this.handLabel.setText(label);
      const c = label === 'ОТПУСТИ' ? 0x57f2ff : 0x2fd6a3;
      this.handCircle.setFillStyle(c, 0.25).setStrokeStyle(3, c, 0.9);
    }
  }

  /* ---------- интерфейс ---------- */

  buildUi() {
    const s = this.s;
    s.hud.setTutorial(true);
    this.progress = s.add.text(464, 16, '', {
      fontFamily: 'Arial', fontSize: '17px', fontStyle: 'bold', color: '#ffe89b'
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(46);
    // «пропустить»: GameScene не считает это нажатие остановкой времени (bindInput: over)
    this.skipBtn = s.add.text(464, 44, 'пропустить ›', {
      fontFamily: 'Arial', fontSize: '15px', color: '#7f93a8', padding: { x: 6, y: 4 }
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(46).setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', () => this.skip());

    this.banner = s.add.text(240, 80, '', {
      fontFamily: 'Arial', fontSize: '17px', fontStyle: 'bold', color: '#ffe89b', align: 'center',
      backgroundColor: '#101826cc', padding: { x: 12, y: 8 }, wordWrap: { width: 420 }
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(44).setVisible(false);

    // ниже часов лифта (низ циферблата — 642 на экране), круг пульсирует до радиуса 58
    this.hand = s.add.container(240, 722).setScrollFactor(0).setDepth(31).setVisible(false);
    this.handCircle = s.add.circle(0, 0, 46, 0x2fd6a3, 0.25).setStrokeStyle(3, 0x2fd6a3, 0.9);
    this.handLabel = s.add.text(0, 0, 'ЗАЖМИ!', {
      fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#eaf6ff'
    }).setOrigin(0.5);
    this.hand.add([this.handCircle, this.handLabel]);
    s.tweens.add({ targets: this.handCircle, scale: 1.25, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });

    this.flash = s.add.rectangle(240, 400, 480, 800, 0xff3b3b, 0).setScrollFactor(0).setDepth(21);
    this.rewindText = s.add.text(240, 330, '◀◀  ПЕРЕМОТКА ВРЕМЕНИ', {
      fontFamily: 'Arial', fontSize: '28px', fontStyle: 'bold', color: '#57f2ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(44).setVisible(false).setShadow(0, 3, '#0a4a55', 6, true, true);
    s.tweens.add({ targets: this.rewindText, alpha: 0.45, duration: 260, yoyo: true, repeat: -1 });
  }

  setProgress(n) { this.progress.setText('ОБУЧЕНИЕ ' + n + '/7'); }

  setBanner(text) {
    this.bannerText = text;
    this.banner.setText(text).setVisible(!!text && !this.card);
  }

  /* карточка вверху экрана; лифт стоит, пока она открыта. o: { title, body, color, minRead (с),
   * until(dt) — доп. условие, waitFoot — подпись, пока закрывать рано, foot, arrow — стрелка к энергии } */
  showCard(o, onContinue) {
    const s = this.s;
    if (this.card) this.card.c.destroy();
    if (o.step) this.setProgress(o.step);
    s.held = false;
    const c = s.add.container(0, 0).setScrollFactor(0).setDepth(45);
    const top = 78, pad = 16;
    const title = s.add.text(240, top + pad, o.title, {
      fontFamily: 'Arial', fontSize: '25px', fontStyle: 'bold', color: o.color || '#57f2ff'
    }).setOrigin(0.5, 0);
    const body = s.add.text(240, title.y + title.height + 8, o.body, {
      fontFamily: 'Arial', fontSize: '18px', color: '#cfe3f5', align: 'center', lineSpacing: 4,
      wordWrap: { width: 404 }
    }).setOrigin(0.5, 0);
    const foot = s.add.text(240, body.y + body.height + 14, o.waitFoot || '', {
      fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: '#7fd8e8'
    }).setOrigin(0.5, 0);
    const h = foot.y + 20 + pad - top;
    const panel = s.add.rectangle(240, top, 448, h, 0x101826, 0.95).setOrigin(0.5, 0)
      .setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(o.color || '#57f2ff').color, 0.9);
    c.add([panel, title, body, foot]);
    if (o.arrow) {
      // стрелка к полосе энергии (Hud: 16…206 по x, 18 по y)
      const a = s.add.text(110, top - 4, '▲', { fontFamily: 'Arial', fontSize: '24px', color: '#ffe89b' }).setOrigin(0.5, 1);
      c.add(a);
      s.tweens.add({ targets: a, y: top - 12, duration: 380, yoyo: true, repeat: -1 });
    }
    this.card = { c, foot, footText: o.foot || '▶ нажми, чтобы продолжить', t: 0, minRead: o.minRead || 1.5,
      until: o.until, ready: false, onContinue };
    this.banner.setVisible(false);
  }

  setReady() {
    const c = this.card;
    c.ready = true;
    c.foot.setText(c.footText).setColor('#eaf6ff');
    this.s.tweens.add({ targets: c.foot, alpha: 0.45, duration: 500, yoyo: true, repeat: -1 });
  }

  closeCard() {
    const c = this.card;
    this.card = null;
    c.c.destroy();
    this.s.sfx.click();
    c.onContinue();
    if (!this.card) this.banner.setText(this.bannerText || '').setVisible(!!this.bannerText);
  }
}
