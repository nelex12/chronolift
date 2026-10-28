/* Сборка игры в один HTML-файл для запуска без интернета и без сервера: chronolift-offline.html.
 *
 * Зачем: обычный game/index.html двойным щелчком не запускается — браузер не даёт странице,
 * открытой как файл (file://), загружать картинки, данные и музыку. Здесь всё лежит внутри файла:
 * скрипты — как есть, ассеты — в base64; при запуске они превращаются в blob:-адреса, и загрузчик
 * Phaser получает их вместо путей Assets/... (такие адреса браузер с file:// разрешает).
 *
 * Основа — game/test-yandex.html (с имитацией Яндекс SDK: вход, облако, лидерборд, покупки работают).
 * Настоящий SDK с yandex.ru не подключается: при плохом интернете страница ждала бы его загрузки.
 * Музыка — только .ogg (Chrome, Edge, Яндекс Браузер, Firefox); в Safari игра будет без музыки.
 *
 * Запуск: node tools/build_offline.js   Проверка актуальности: node test/check_offline.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'game');
const OUT = path.join(ROOT, 'chronolift-offline.html');
const PAGE = 'test-yandex.html';

const MIME = { png: 'image/png', json: 'application/json', ogg: 'audio/ogg' };
function assetList() {
  const list = [];
  const add = (dir, ext) => fs.readdirSync(path.join(GAME, dir)).filter(f => f.endsWith('.' + ext)).sort()
    .forEach(f => list.push(dir + '/' + f));
  add('Assets/Art/Sprites', 'png');
  add('Assets/Prefabs', 'json');
  add('Assets/Audio/Music', 'ogg');
  return list;
}

function pageScripts(html) {
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
}

/* отпечаток всех входных файлов: если игра изменилась, а сборка нет — test/check_offline.js это поймает */
function inputsHash() {
  const html = fs.readFileSync(path.join(GAME, PAGE), 'utf8');
  const files = [PAGE].concat(pageScripts(html).filter(s => !/^https?:/.test(s)), assetList(),
    [path.relative(GAME, __filename).replace(/\\/g, '/')]);
  const h = crypto.createHash('sha1');
  for (const f of files) { h.update(f); h.update(fs.readFileSync(path.join(GAME, f))); }
  return h.digest('hex').slice(0, 16);
}

function build() {
  let html = fs.readFileSync(path.join(GAME, PAGE), 'utf8');
  const hash = inputsHash();
  const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

  const assets = assetList();
  const table = assets.map(a => {
    const ext = a.split('.').pop();
    return JSON.stringify(a) + ':[' + JSON.stringify(MIME[ext]) + ',' + JSON.stringify(fs.readFileSync(path.join(GAME, a)).toString('base64')) + ']';
  }).join(',\n');
  const assetScript = `<script>
/* встроенные ассеты: путь -> blob:-адрес; загрузчик Phaser получает его вместо пути (tools/build_offline.js) */
(function () {
  var RAW = {
${table}
  };
  var URLS = {};
  Object.keys(RAW).forEach(function (p) {
    var bin = atob(RAW[p][1]), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    URLS[p] = URL.createObjectURL(new Blob([bytes], { type: RAW[p][0] }));
  });
  RAW = null;
  var proto = Phaser.Loader.LoaderPlugin.prototype, addFile = proto.addFile;
  proto.addFile = function (file) {
    (Array.isArray(file) ? file : [file]).forEach(function (f) {
      if (f && typeof f.url === 'string' && URLS[f.url]) f.url = URLS[f.url];
    });
    return addFile.apply(this, arguments);
  };
  window.__OFFLINE_BUILD = ${JSON.stringify(hash)};
})();
</script>`;

  html = html.replace('<script src="https://yandex.ru/games/sdk/v2"></script>',
    '<!-- Яндекс SDK не подключается: офлайн-сборка, вместо него имитация (test/mock-yandex.js) -->');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const js = safe(fs.readFileSync(path.join(GAME, src), 'utf8'));
    const tag = '<script>/* ' + src + ' */\n' + js + '\n</script>';
    return src === 'lib/phaser.min.js' ? tag + '\n' + assetScript : tag;
  });
  html = html.replace('<title>ХРОНОЛИФТ — останови время</title>',
    '<title>ХРОНОЛИФТ — офлайн</title>\n<meta name="chronolift-build" content="' + hash + '">');
  html = html.replace('<html lang="ru">', '<html lang="ru">\n<!-- ХРОНОЛИФТ: офлайн-сборка в один файл, не редактировать вручную.\n' +
    '     Пересобрать: node tools/build_offline.js (из game/' + PAGE + ' и game/Assets). Сборка ' + hash + ' -->');
  fs.writeFileSync(OUT, html);
  return { out: OUT, hash, bytes: Buffer.byteLength(html), assets: assets.length };
}

module.exports = { inputsHash, OUT };

if (require.main === module) {
  const r = build();
  console.log(`собрано: ${path.relative(ROOT, r.out)} — ${(r.bytes / 1048576).toFixed(1)} МБ, ассетов ${r.assets}, сборка ${r.hash}`);
}
