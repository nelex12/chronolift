// Полный прогон: реальная скорость, бот играет за человека.
// Скриншоты каждого урока + замер плавности (FPS/jank) + проверка UI.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8321/index.html';
const PORT = 9225;
const OUT = __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitDebugger() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch (e) {}
    await sleep(300);
  }
  return false;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${tmp}`,
    '--window-size=480,800', '--force-device-scale-factor=' + (process.env.CHRONO_DPR || 1), '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (e) {} });
  if (!await waitDebugger()) { console.error('no debugger'); process.exit(1); }

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let mid = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++mid; pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expr, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP });
    if (r.result && r.result.exceptionDetails) return 'EVAL-ERR:' + JSON.stringify(r.result.exceptionDetails).slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const screenshot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.result && r.result.data) fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64'));
  };
  const vpScale = async () => {
    const vp = await evaluate('JSON.stringify({w:window.innerWidth,h:window.innerHeight})');
    const v = JSON.parse(vp || '{"w":480,"h":800}');
    const scale = Math.min(v.w / 480, v.h / 800);
    return { x: (v.w - 480 * scale) / 2, y: (v.h - 800 * scale) / 2, scale };
  };
  const mouse = async (type, gx, gy) => {
    const o = await vpScale();
    await send('Input.dispatchMouseEvent', {
      type, x: o.x + gx * o.scale, y: o.y + gy * o.scale, button: 'left', clickCount: 1
    });
  };
  const click = async (gx, gy) => { await mouse('mousePressed', gx, gy); await sleep(70); await mouse('mouseReleased', gx, gy); };

  await send('Page.enable');
  await send('Runtime.enable');

  // старт FPS-счётчика (будет непрерывно мерить кадры всю игру)
  await evaluate('window.__FR=[];window.__FL=performance.now();(function f(t){window.__FR.push(t-window.__FL);window.__FL=t;requestAnimationFrame(f)})(performance.now())');

  /* --- меню: welcome -> daily -> играть --- */
  await send('Page.navigate', { url: BASE });
  await sleep(1200);
  // старт FPS-счётчика уже В игровой странице
  await evaluate('window.__FR=[];window.__FL=performance.now();(function f(t){window.__FR.push(t-window.__FL);window.__FL=t;requestAnimationFrame(f)})(performance.now())');
  await sleep(2000);
  await click(240, 522);   // играть без входа
  await sleep(1000);
  await click(240, 490);   // забрать ежедневную
  await sleep(1000);
  await click(240, 560);   // ИГРАТЬ

  /* --- бот играет, скриншоты уроков --- */
  const shotLessons = {};
  let held = false, lastFp = 0, dbg = 0, miniTapDone = {}, gameOverHandled = false, startShot = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const st = await evaluate(`(()=>{const s=__GAME.scene.getScene('Game');if(!s||!s.scene.isActive())return JSON.stringify({active:false});
      const near=s.traps.filter(t=>Math.abs(t.ledgeY-s.roofY)<480).map(t=>({type:t.constructor.name.replace('Trap','').toLowerCase(),dy:t.ledgeY-s.roofY,danger:t.dangerous,bladeX:typeof t.x!=='undefined'?t.x:null,phase:t.phase||null}));
      const mg=s.minigames&&s.minigames.active?{type:s.minigames.active.type,marker:s.minigames.active.marker,pos:s.minigames.active.pos,zoneL:s.minigames.active.zoneL,zoneR:s.minigames.active.zoneR,zoneStart:s.minigames.active.zoneStart,zoneEnd:s.minigames.active.zoneEnd}:null;
      return JSON.stringify({active:true,dead:s.dead,fp:s.floorsPassed,frozen:s.frozen,energy:Math.round(s.energy),roofY:Math.round(s.roofY),near:near,mg:mg})})()`);
    if (!st || st.startsWith('EVAL-ERR')) { console.log('STATE-ERR', st); break; }
    const o = JSON.parse(st);

    if (!o.active) {
      const go = await evaluate(`__GAME.scene.isActive('GameOver')`);
      if (go && !gameOverHandled) { gameOverHandled = true; await sleep(600); await screenshot('play_9_gameover.png'); break; }
      await sleep(100); continue;
    }

    if (!startShot) { startShot = true; await screenshot('play_0_start_hand.png'); }

    if (o.dead) {
      if (held) { await mouse('mouseReleased', 240, 500); held = false; }
      const cause = await evaluate(`(()=>{const s=__GAME.scene.getScene('Game');if(!s)return null;
        const tr=s.traps.filter(t=>Math.abs(t.ledgeY-s.roofY)<300).map(t=>({ty:t.constructor.name.replace('Trap','').toLowerCase(),dy:Math.round(t.ledgeY-s.roofY),danger:t.dangerous,ph:t.phase||null,bx:Math.round(typeof t.x==='undefined'?240:t.x)}));
        return JSON.stringify({energy:Math.round(s.energy),overload:s.overload,fp:s.floorsPassed,near:tr})})()`);
      console.log('  DIED:', cause);
      if (!gameOverHandled) {
        await sleep(900);
        await click(240, 512);   // "отказаться" на оффере возрождения
        gameOverHandled = true;
        await sleep(1200);
        await screenshot('play_9_gameover.png');
      }
      break;
    }

    // скриншоты уроков: ближайшая ловушка ВПЕРЕДИ (пройденные не считаем)
    if (o.fp < 5) {
      const ahead = o.near.filter(t => t.dy < -100);
      if (ahead.length) {
        const tgt = ahead[0];
        if (dbg < 12) { dbg++; console.log('  st fp=' + o.fp, 'near=' + JSON.stringify(o.near)); }
        if (tgt.dy > -440 && !shotLessons[tgt.type]) {
          shotLessons[tgt.type] = true;
          await screenshot('play_lesson_' + tgt.type + '.png');
          console.log('  SHOT lesson:', tgt.type, 'dy:', Math.round(tgt.dy));
        }
      }
    }

    /* Бот с геометрией контактов (dy = ledgeY - roofY; контакт — пока зона
       пересекается с игроком roofY-92..roofY+2):
       laser  (+47,+163) опасен только в 'on'     tesla  (+44,+160) только 'zap'
       crusher(-84,+162) только slam/hold         spikes (-88,+107) hidden/warn/out
       saw    (-39,+159) физический диск — паркуем у края и держим весь проход */
    let wantHold = false;
    for (const t of o.near) {
      let inWin = false, need = false;
      if (t.type === 'laser')      { inWin = t.dy > 0    && t.dy < 170; need = t.danger || t.phase === 'tele'; }
      else if (t.type === 'tesla') { inWin = t.dy > 0    && t.dy < 170; need = t.danger || t.phase === 'charge'; }
      else if (t.type === 'crusher'){ inWin = t.dy > -100 && t.dy < 170; need = t.danger || t.phase === 'warn'; }
      else if (t.type === 'spikes'){ inWin = t.dy > -100 && t.dy < 120; need = t.phase !== 'hidden'; }
      else if (t.type === 'saw')   { inWin = t.dy > -85 && t.dy < 170; need = Math.abs((t.bladeX === null ? 240 : t.bladeX) - 240) > 65; }
      if (inWin && need) { wantHold = true; break; }
    }
    if (wantHold && !held) { await mouse('mousePressed', 240, 500); held = true; console.log('  >> PRESS fp=' + o.fp, JSON.stringify(o.near.map(t => t.type + ':' + Math.round(t.dy) + (t.danger ? '!' : '') + (t.phase || '')))); }
    if (!wantHold && held) { await mouse('mouseReleased', 240, 500); held = false; console.log('  << RELEASE fp=' + o.fp, JSON.stringify(o.near.map(t => t.type + ':' + Math.round(t.dy) + (t.danger ? '!' : '') + (t.phase || '')))); }

    // миниигра: короткий тап в зоне
    if (o.mg) {
      let inZone = false;
      if (o.mg.type === 'calibration') {
        let rel = (o.mg.marker - o.mg.zoneStart) % (Math.PI * 2);
        if (rel < 0) rel += Math.PI * 2;
        inZone = rel <= (o.mg.zoneEnd - o.mg.zoneStart) - 0.05;
      } else inZone = o.mg.pos > o.mg.zoneL + 0.04 && o.mg.pos < o.mg.zoneR - 0.04;
      if (inZone && !miniTapDone[o.fp]) {
        miniTapDone[o.fp] = true;
        await screenshot('play_minigame_' + o.mg.type + '.png');
        await click(240, 500);
        console.log('  MINIGAME tap:', o.mg.type, 'fp:', o.fp);
      }
    }

    if (o.fp !== lastFp) { lastFp = o.fp; console.log('  floor passed:', o.fp, 'energy:', o.energy, 'frozen:', o.frozen); }
    if (o.fp >= 9) { await screenshot('play_8_deep.png'); break; }
    await sleep(60);
  }

  if (held) await mouse('mouseReleased', 240, 500);

  /* --- итоги FPS --- */
  const fps = await evaluate(`(()=>{const d=window.__FR.slice(20);if(!d.length)return null;const s=[...d].sort((a,b)=>a-b);
    return JSON.stringify({frames:d.length,avgMs:+(d.reduce((a,b)=>a+b,0)/d.length).toFixed(2),p95Ms:+s[Math.floor(d.length*0.95)].toFixed(1),over50ms:d.filter(x=>x>50).length,over100ms:d.filter(x=>x>100).length})})()`);
  const errors = await evaluate('JSON.stringify(window.__ERRORS||[])');
  console.log('LESSONS-SHOTS:', JSON.stringify(Object.keys(shotLessons)));
  console.log('FPS:', fps);
  console.log('ERRORS:', errors);

  ws.close();
  try { chrome.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
