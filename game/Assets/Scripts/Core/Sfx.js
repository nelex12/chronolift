/* ХРОНОЛИФТ — Core/Sfx.js
 * Звук синтезируется через WebAudio (WebAudioContext Phaser) — без внешних файлов,
 * важно для лимита 15 МБ загрузки на Яндекс Играх.
 */
'use strict';

class Sfx {
  constructor(scene) {
    this.scene = scene;
    this.ctx = null;
  }
  ensure() {
    if (typeof save !== 'undefined' && !save.sound) return false;
    try {
      if (!this.ctx && this.scene.sound && this.scene.sound.context) this.ctx = this.scene.sound.context;
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { return false; }
    return !!this.ctx;
  }
  tone(freq, dur, type, vol, slideTo, delay) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  freeze()    { this.tone(760, 0.22, 'sine', 0.14, 190); }
  unfreeze()  { this.tone(190, 0.14, 'sine', 0.10, 620); }
  coin()      { this.tone(1240, 0.07, 'square', 0.06); this.tone(1650, 0.1, 'square', 0.06, null, 0.06); }
  perfect()   { this.tone(880, 0.08, 'triangle', 0.12); this.tone(1108, 0.08, 'triangle', 0.12, null, 0.07); this.tone(1318, 0.14, 'triangle', 0.12, null, 0.14); }
  death()     { this.tone(200, 0.55, 'sawtooth', 0.18, 45); this.tone(90, 0.4, 'square', 0.1, 30, 0.05); }
  alarm()     { this.tone(520, 0.12, 'square', 0.1); this.tone(392, 0.16, 'square', 0.1, null, 0.13); }
  click()     { this.tone(640, 0.05, 'square', 0.05); }
  /* сигнал жёлтой зоны: n = 1..3 (каждый следующий выше), gain — громкость по расстоянию.
   * Тембр под ловушку: лазер — писк, тесла — жужжание с подъёмом, шипы — короткий стук,
   * пресс — низкий удар с призвуком */
  warn(type, n, gain) {
    const up = 1 + 0.12 * (n - 1), v = gain;
    if (type === 'laser') this.tone(1320 * up, 0.07, 'square', 0.05 * v);
    else if (type === 'tesla') this.tone(700 * up, 0.1, 'sawtooth', 0.05 * v, 1050 * up);
    else if (type === 'spikes') { this.tone(520 * up, 0.06, 'triangle', 0.11 * v, 360 * up); this.tone(1040 * up, 0.03, 'square', 0.025 * v); }
    else if (type === 'crusher') { this.tone(150 * up, 0.13, 'square', 0.07 * v, 110 * up); this.tone(300 * up, 0.08, 'sine', 0.07 * v); }
    else this.tone(900 * up, 0.07, 'triangle', 0.08 * v);
  }
  /* Непрерывный звук ловушки, пока она работает: kind — 'saw' (визг диска), 'laser' (гул луча),
   * 'tesla' (треск дуги). Возвращает { set(gain), stop() } или null без звука. Громкость задаёт
   * GameScene.updateTrapLoops каждый кадр — по расстоянию до ловушки; при паузе платформы
   * звуковой контекст останавливается целиком, и эти звуки тоже */
  loop(kind) {
    if (!this.ensure()) return null;
    const ctx = this.ctx, out = ctx.createGain(), nodes = [];
    out.gain.value = 0;
    out.connect(ctx.destination);
    const osc = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; nodes.push(o); return o; };
    const lfo = (freq, depth, target) => {          // дрожание громкости
      const o = osc('sine', freq), g = ctx.createGain();
      g.gain.value = depth; o.connect(g).connect(target);
    };
    if (kind === 'saw') {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
      const body = ctx.createGain(); body.gain.value = 0.7;
      osc('sawtooth', 118).connect(bp); osc('sawtooth', 181).connect(bp);
      bp.connect(body).connect(out);
      lfo(11, 0.3, body.gain);
    } else if (kind === 'laser') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const body = ctx.createGain(); body.gain.value = 0.8;
      osc('sine', 330).connect(lp); osc('square', 660).connect(lp);
      lp.connect(body).connect(out);
      lfo(28, 0.2, body.gain);
    } else {                                        // tesla: треск — шум с редкими вспышками + низкое гудение
      const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let env = 0;
      for (let i = 0; i < len; i++) { if (Math.random() < 0.0015) env = 1; env *= 0.997; d[i] = (Math.random() * 2 - 1) * (0.15 + env); }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; nodes.push(src);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      src.connect(hp).connect(out);
      const hum = ctx.createGain(); hum.gain.value = 0.35;
      osc('sawtooth', 100).connect(hum).connect(out);
    }
    nodes.forEach((n) => n.start());
    return {
      set(v) { out.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.03); },
      stop() {
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        nodes.forEach((n) => { try { n.stop(ctx.currentTime + 0.15); } catch (e) {} });
      }
    };
  }
  unlock()    { this.tone(523, 0.1, 'triangle', 0.12); this.tone(659, 0.1, 'triangle', 0.12, null, 0.09); this.tone(784, 0.1, 'triangle', 0.12, null, 0.18); this.tone(1047, 0.22, 'triangle', 0.12, null, 0.27); }
  reward()    { this.tone(659, 0.1, 'sine', 0.11); this.tone(880, 0.12, 'sine', 0.11, null, 0.09); this.tone(1318, 0.2, 'sine', 0.11, null, 0.18); }
}
