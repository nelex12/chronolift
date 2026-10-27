// Проверка без браузера: index.html и test-yandex.html подключают одни и те же скрипты игры.
// Если новый скрипт добавили только в index.html, страница с моком SDK падает на старте
// (так было с MissionService.js после коммита 15.10 — чёрный экран).
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'game');
const scriptsOf = (file) => {
  const html = fs.readFileSync(path.join(GAME, file), 'utf8');
  return [...html.matchAll(/<script src="(Assets\/[^"]+)"/g)].map(m => m[1]);
};

const release = scriptsOf('index.html');
const mock = scriptsOf('test-yandex.html');
let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; };

check(release.length > 0, 'index.html: найдено скриптов ' + release.length);
const missing = release.filter(s => !mock.includes(s));
const extra = mock.filter(s => !release.includes(s));
check(!missing.length, 'test-yandex.html подключает все скрипты релиза' + (missing.length ? ': нет ' + missing.join(', ') : ''));
check(!extra.length, 'в test-yandex.html нет лишних скриптов игры' + (extra.length ? ': ' + extra.join(', ') : ''));
check(JSON.stringify(release) === JSON.stringify(mock), 'порядок подключения совпадает');
for (const s of release) check(fs.existsSync(path.join(GAME, s)), 'файл существует: ' + s);
check(release[release.length - 1].endsWith('Core/Boot.js'), 'Boot.js подключён последним (точка входа)');

console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
process.exit(fail ? 1 : 0);
