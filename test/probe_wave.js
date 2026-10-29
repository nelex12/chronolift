// Проверка: волна остановки времени доходит до края экрана, даже если сразу отпустить палец;
// второе нажатие не обрывает первую волну. Снимки: test/wave_*.png
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=9229', `--user-data-dir=${tmp}`, '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) { try { const r = await fetch('http://127.0.0.1:9229/json/version'); if (r.ok) break; } catch (e) {} await sleep(300); }
  const t = await (await fetch('http://127.0.0.1:9229/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const p = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (me, pa) => new Promise((res) => { const id = ++mid; p.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa || {} })); });
  const ev = async (e, aw) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw }); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, name), Buffer.from(r.result.data, 'base64')); };
  const state = () => ev(`(() => { const g = __GAME.scene.getScene('Game'), pp = Shockwave.pipe(g.cameras.main);
    return JSON.stringify({ frozen: g.frozen, waves: (g.shockwaves || []).length, k: pp ? pp.waves.map(w => +w.k.toFixed(2)) : null }); })()`);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8321/index.html' });
  await sleep(4000);
  console.log('WebGL:', await ev('__GAME.renderer.type === Phaser.WEBGL'));
  await ev("save.seenWelcome = true; __GAME.scene.getScenes(true)[0].scene.start('Game')");
  await sleep(2500);
  console.log('сцены:', await ev('__GAME.scene.getScenes(true).map(s => s.scene.key).join()'));
  await shot('wave_0_before.png');

  // короткое нажатие: 80 мс держим и отпускаем
  await ev("const g = __GAME.scene.getScene('Game'); g.setFrozen(true); setTimeout(() => g.setFrozen(false), 80)");
  let prev = 0;
  for (const [ms, name] of [[250, 'wave_1_after_release.png'], [600, 'wave_2_mid.png'], [950, 'wave_3_edge.png']]) {
    await sleep(ms - prev); prev = ms;
    console.log(ms + ' мс:', await state()); await shot(name);
  }
  await sleep(400);
  console.log('1350 мс (волна кончилась):', await state());

  // два нажатия подряд: первая волна не должна оборваться
  await ev("const g2 = __GAME.scene.getScene('Game'); g2.setFrozen(true); setTimeout(() => g2.setFrozen(false), 60); setTimeout(() => g2.setFrozen(true), 300); setTimeout(() => g2.setFrozen(false), 360)");
  await sleep(500);
  console.log('двойное нажатие, 500 мс:', await state()); await shot('wave_4_double.png');
  console.log('ERRORS:', await ev('JSON.stringify(window.__ERRORS||[])'));
  ws.close(); try { chrome.kill(); } catch (e) {} process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
