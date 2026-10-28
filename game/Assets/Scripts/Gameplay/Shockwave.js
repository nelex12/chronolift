/* ХРОНОЛИФТ — Gameplay/Shockwave.js
 * Волна при остановке времени: от персонажа расходится кольцо; пиксели под кольцом инвертируются
 * (негатив, как фильтр — только по периметру волны) и слегка преломляются, как в линзе.
 * Это постобработка камеры (WebGL-шейдер). Шейдер подключается только на время волны (0,8 с),
 * в остальное время лишнего прохода по экрану нет. При prefers-reduced-motion волны нет.
 */
'use strict';

const SHOCKWAVE_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uCenter;      // центр волны в координатах текстуры (0..1)
uniform float uAspect;     // ширина / высота кадра — чтобы кольцо было круглым
uniform float uRadius;     // радиус кольца в долях высоты кадра
uniform float uWidth;      // полуширина кольца
uniform float uStrength;   // сила преломления
uniform float uAlpha;      // затухание к концу волны
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec2 d = uv - uCenter;
  d.x *= uAspect;
  float dist = length(d);
  float x = (dist - uRadius) / uWidth;               // -1..1 внутри кольца
  float ring = 1.0 - smoothstep(0.85, 1.0, abs(x));   // полоса с почти резким краем
  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
  dir.x /= uAspect;
  vec2 offs = dir * sin(x * 3.14159) * uStrength * ring * uAlpha;   // преломление по кольцу
  vec4 base = texture2D(uMainSampler, uv - offs);
  vec3 col = mix(base.rgb, vec3(1.0) - base.rgb, ring * uAlpha);     // чистый негатив под кольцом
  gl_FragColor = vec4(col, base.a);
}`;

class ShockwavePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game) {
    super({ game: game, name: 'ShockwavePipeline', fragShader: SHOCKWAVE_FRAG });
    this.wave = { x: 0.5, y: 0.5, k: 0 };
  }
  onPreRender() {
    const k = this.wave.k;
    const ease = 1 - Math.pow(1 - k, 2);                // быстро стартует, плавно тормозит
    this.set2f('uCenter', this.wave.x, this.wave.y);
    this.set1f('uAspect', this.renderer.width / this.renderer.height);
    this.set1f('uRadius', 0.03 + ease * 0.75);          // к концу — примерно до краёв экрана
    this.set1f('uWidth', 0.035 + 0.03 * ease);
    this.set1f('uStrength', 0.03);
    this.set1f('uAlpha', 1 - Math.pow(k, 3));           // негатив полный почти до конца, потом гаснет
  }
}

const Shockwave = {
  DURATION: 800,
  reduced: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),

  /* шейдер волны на камере или null (getPostPipeline в Phaser 3.88 при отсутствии возвращает []) */
  pipe(cam) { return (cam.postPipelines || []).find((p) => p instanceof ShockwavePipeline) || null; },

  /* запустить волну из точки мира (x, y); повторный запуск перезапускает её */
  start(scene, x, y) {
    if (this.reduced || scene.renderer.type !== Phaser.WEBGL) return;
    const cam = scene.cameras.main;
    if (!this.pipe(cam)) cam.setPostPipeline(ShockwavePipeline);
    scene.shockwave = { t0: scene.time.now, x: x, y: y };
    this.update(scene);
  },

  /* каждый кадр: прогресс и центр (персонаж движется вместе с камерой) */
  update(scene) {
    const s = scene.shockwave;
    if (!s) return;
    const cam = scene.cameras.main;
    const k = (scene.time.now - s.t0) / this.DURATION;
    const p = this.pipe(cam);
    if (k >= 1 || !p) {
      cam.removePostPipeline(ShockwavePipeline);
      scene.shockwave = null;
      return;
    }
    // точка мира -> доля кадра; камера увеличивает мир от левого верхнего угла (fitCamera)
    p.wave.x = (s.x - cam.scrollX) / CFG.W;
    p.wave.y = 1 - (s.y - cam.scrollY) / CFG.H;          // текстура кадра перевёрнута по вертикали
    p.wave.k = k;
  }
};
