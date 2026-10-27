// Проверка: sleep/wake игрового цикла + одиночный вызов rewarded.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=9228', `--user-data-dir=${tmp}`, '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  for (let i = 0; i < 50; i++) { try { const r = await fetch('http://127.0.0.1:9228/json/version'); if (r.ok) break; } catch (e) {} await sleep(300); }
  const t = await (await fetch('http://127.0.0.1:9228/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let mid = 0; const p = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
  const send = (me, pa) => new Promise((res) => { const id = ++mid; p.set(id, res); ws.send(JSON.stringify({ id, method: me, params: pa || {} })); });
  const ev = async (e, aw) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: !!aw }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8321/test-yandex.html' });
  await sleep(4000);
  console.log('isRunning до паузы:', await ev('window.__GAME.loop.running'));
  await ev("__triggerYandex('game_api_pause')");
  await sleep(500);
  console.log('isRunning на паузе:', await ev('window.__GAME.loop.running'), '| fps:', await ev('window.__GAME.loop.actualFps'));
  await ev("__triggerYandex('game_api_resume')");
  await sleep(500);
  console.log('isRunning после:', await ev('window.__GAME.loop.running'), '| fps:', await ev('window.__GAME.loop.actualFps'));
  await ev('window.__YANDEX_CALLS.length = 0');
  console.log('rewarded:', await ev("(async()=>{const g=await AdsService.showRewarded('t2');return 'granted='+g})()", true));
  console.log('calls:', await ev('JSON.stringify(window.__YANDEX_CALLS)'));
  console.log('ERRORS:', await ev('JSON.stringify(window.__ERRORS||[])'));
  ws.close(); try { chrome.kill(); } catch (e) {} process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
