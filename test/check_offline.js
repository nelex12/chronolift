// Проверка без браузера: chronolift-offline.html (игра одним файлом для запуска без интернета) собран
// из текущих файлов игры и ничего не грузит из сети. Если игра изменилась — FAIL с подсказкой пересобрать.
const fs = require('fs');
const { inputsHash, OUT } = require('../tools/build_offline.js');

let fail = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS' : 'FAIL') + ' | ' + msg); if (!ok) fail++; };

check(fs.existsSync(OUT), 'chronolift-offline.html существует');
if (fs.existsSync(OUT)) {
  const html = fs.readFileSync(OUT, 'utf8');
  const m = html.match(/<meta name="chronolift-build" content="([0-9a-f]+)">/);
  const now = inputsHash();
  check(m && m[1] === now, `сборка актуальна (в файле ${m ? m[1] : 'нет отметки'}, сейчас ${now})` +
    (m && m[1] === now ? '' : ' — пересобрать: node tools/build_offline.js'));
  const ext = [...html.matchAll(/<(?:script|link|img|audio)[^>]+(?:src|href)="(https?:[^"]+)"/g)].map(x => x[1]);
  check(!ext.length, 'нет загрузок из интернета' + (ext.length ? ': ' + ext.join(', ') : ''));
  check(/Phaser\.Loader\.LoaderPlugin\.prototype/.test(html) && /window\.__OFFLINE_BUILD/.test(html), 'встроенные ассеты подключены к загрузчику Phaser');
  check(Buffer.byteLength(html) < 15 * 1048576, `размер ${(Buffer.byteLength(html) / 1048576).toFixed(1)} МБ`);
}
console.log(fail ? 'FAIL: ' + fail : 'ALL PASS');
process.exit(fail ? 1 : 0);
