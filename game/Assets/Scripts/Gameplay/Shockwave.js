/* ХРОНОЛИФТ — Gameplay/Shockwave.js
 * Волна при остановке времени: от персонажа расходится кольцо; пиксели под кольцом инвертируются
 * (негатив, как фильтр — только по периметру волны) и слегка преломляются, как в линзе.
 * Это постобработка камеры (WebGL-шейдер). Шейдер подключается только пока есть волны,
 * в остальное время лишнего прохода по экрану нет. При prefers-reduced-motion волны нет.
 * Волна живёт сама по себе: отпустил палец — она всё равно уходит за край экрана.
 * Новое нажатие запускает ещё одну волну, старые не обрываются (одновременно до MAX).
 */
'use strict';

const SHOCKWAVE_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uAspect;     // ширина / высота кадра — чтобы кольцо было круглым
uniform vec4 uWave[4];     // центр (x, y) в координатах текстуры, радиус и полуширина кольца в долях высоты
uniform float uAlpha[4];   // сила волны; 0 — слот свободен
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 offs = vec2(0.0);
  float neg = 0.0;
  for (int i = 0; i < 4; i++) {
    if (uAlpha[i] <= 0.0) continue;   // пустой слот: ширина 0, деление дало бы NaN и чёрный кадр
    vec2 d = uv - uWave[i].xy;
    d.x *= uAspect;
    float dist = length(d);
    float x = (dist - uWave[i].z) / uWave[i].w;                     // -1..1 внутри кольца
    float ring = (1.0 - smoothstep(0.85, 1.0, abs(x))) * uAlpha[i];  // полоса с почти резким краем
    vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
    dir.x /= uAspect;
    offs += dir * sin(x * 3.14159) * 0.03 * ring;                    // преломление по кольцу
    neg = max(neg, ring);              // max, а не сумма: пересечение двух колец не отменяет негатив
  }
  vec4 base = texture2D(uMainSampler, uv - offs);
  vec3 col = mix(base.rgb, vec3(1.0) - base.rgb, neg);             // чистый негатив под кольцом
  gl_FragColor = vec4(col, base.a);
}`;

class ShockwavePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game: game, name: 'ShockwavePipeline', fragShader: SHOCKWAVE_FRAG });
    this.waves = [];   // [{ x, y, k }] — заполняет Shockwave.update
  }
  onPreRender() {
    const aspect = this.renderer.width / this.renderer.height;
    const shape = new Float32Array(16), alpha = new Float32Array(4);
    this.waves.forEach((w, i) => {
      const ease = 1 - Math.pow(1 - w.k, 2);           // быстро стартует, плавно тормозит
      const width = 0.035 + 0.03 * ease;
      // до самого дальнего угла кадра плюс ширина кольца — к концу волна целиком за экраном
      const reach = Math.hypot(Math.max(w.x, 1 - w.x) * aspect, Math.max(w.y, 1 - w.y)) + 0.07;
      shape.set([w.x, w.y, 0.03 + ease * reach, width], i * 4);
      alpha[i] = 1 - Phaser.Math.SmoothStep(w.k, 0.85, 1);   // гаснет, когда кольцо уже у краёв
    });
    this.set1f('uAspect', aspect);
    this.set4fv('uWave', shape);
    this.set1fv('uAlpha', alpha);
  }
}

const Shockwave = {
  DURATION: 1100,
  MAX: 4,            // столько колец умеет шейдер (uWave[4])
  reduced: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),

  /* шейдер волны на камере или null (getPostPipeline в Phaser 3.88 при отсутствии возвращает []) */
  pipe(cam) { return (cam.postPipelines || []).find((p) => p instanceof ShockwavePipeline) || null; },

  /* запустить волну из точки мира (x, y); идущие волны продолжаются, самая старая уступает место */
  start(scene, x, y) {
    if (this.reduced || scene.renderer.type !== Phaser.WEBGL) return;
    const cam = scene.cameras.main;
    if (!this.pipe(cam)) cam.setPostPipeline(ShockwavePipeline);
    scene.shockwaves = (scene.shockwaves || []).slice(-(this.MAX - 1));
    scene.shockwaves.push({ t0: scene.time.now, x: x, y: y });
    this.update(scene);
  },

  /* каждый кадр: прогресс и центр (персонаж движется вместе с камерой) */
  update(scene) {
    if (!scene.shockwaves || !scene.shockwaves.length) return;
    const cam = scene.cameras.main;
    const now = scene.time.now;
    scene.shockwaves = scene.shockwaves.filter((s) => now - s.t0 < this.DURATION);
    const p = this.pipe(cam);
    if (!scene.shockwaves.length || !p) {
      cam.removePostPipeline(ShockwavePipeline);
      scene.shockwaves = [];
      return;
    }
    // точка мира -> доля кадра; камера увеличивает мир от левого верхнего угла (fitCamera)
    p.waves = scene.shockwaves.map((s) => ({
      x: (s.x - cam.scrollX) / CFG.W,
      y: 1 - (s.y - cam.scrollY) / CFG.H,               // текстура кадра перевёрнута по вертикали
      k: (now - s.t0) / this.DURATION
    }));
  }
};
