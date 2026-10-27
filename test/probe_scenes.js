// Быстрый пробник: открывает каждую сцену напрямую и ловит ошибки со стеком.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9224;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch (e) {}
    await sleep(300);
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const id = ++mid; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable');
  await send('Page.navigate', { url: BASE + '?autotest=1' });
  await sleep(4000);

  const scenes = ['Skins', 'Shop', 'Achievements', 'Menu', 'GameOver'];
  for (const s of scenes) {
    await evaluate(`window.__ERRORS.length = 0; window.__GAME.scene.start('${s}', {score:10,floors:2,coins:3,perfects:1,isBest:false,unlocks:[]}); 'ok'`);
    await sleep(1200);
    const errs = await evaluate('JSON.stringify(window.__ERRORS||[])');
    console.log(s, '→', errs);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) fs.writeFileSync(path.join(__dirname, 'probe_scene.png'), Buffer.from(shot.result.data, 'base64'));
  ws.close(); try { chrome.kill(); } catch (e) {}
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
