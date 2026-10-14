// Verifică faptul că fiecare nivel are soluție în limita de blocuri.
// Rulare: node test/test-levels.js
'use strict';
var Engine = require('../js/engine.js');
var Levels = require('../js/levels.js');

var failures = 0;
function fail(level, msg) {
  failures++;
  console.log('  ✗ Nivelul ' + level.id + ' (' + level.name + '): ' + msg);
}

Levels.LEVELS.forEach(function (level) {
  var program = Engine.fromCompact(level.solution);
  var blocks = Engine.countBlocks(program);
  if (blocks > level.optimal) fail(level, 'soluția are ' + blocks + ' blocuri, optim ' + level.optimal);
  if (level.maxBlocks && level.optimal > level.maxBlocks) fail(level, 'optim > maxBlocks');

  Object.keys(Engine.usedTypes(program)).forEach(function (t) {
    if (level.blocks.indexOf(t) < 0) fail(level, 'soluția folosește blocul nepermis ' + t);
  });

  level.maps.forEach(function (m, i) {
    var map = Engine.parseGrid(m.grid);
    var width = m.grid[0].length;
    m.grid.forEach(function (row) { if (row.length !== width) fail(level, 'harta ' + (i + 1) + ' are rânduri inegale'); });
    if (!map.start || !map.treasure) { fail(level, 'harta ' + (i + 1) + ' fără S sau T'); return; }
    var res = Engine.runToEnd(program, map, m.dir);
    if (!res.won) fail(level, 'harta ' + (i + 1) + ': soluția nu ajunge la comoară (' + res.failed + ' la ' + res.r + ',' + res.c + ')');
  });
});

// Programe greșite trebuie să eșueze corect.
var lvl1 = Levels.LEVELS[0];
var map1 = Engine.parseGrid(lvl1.maps[0].grid);
var bump = Engine.runToEnd(Engine.fromCompact([['up']]), map1, 1);
if (bump.failed !== 'bump') { failures++; console.log('  ✗ lovirea de zid nu e detectată'); }
var short = Engine.runToEnd(Engine.fromCompact([['right']]), map1, 1);
if (short.failed !== 'ended') { failures++; console.log('  ✗ programul scurt nu e detectat'); }
var loop = Engine.runToEnd(Engine.fromCompact([['repeatUntil', [['turnLeft']]]]), map1, 1);
if (loop.failed !== 'limit') { failures++; console.log('  ✗ bucla infinită nu e oprită'); }
var empty = Engine.runToEnd(Engine.fromCompact([['repeatUntil', []]]), map1, 1);
if (empty.failed !== 'limit') { failures++; console.log('  ✗ bucla goală nu e oprită'); }

if (failures) {
  console.log('\n' + failures + ' probleme.');
  process.exit(1);
}
console.log('Toate cele ' + Levels.LEVELS.length + ' nivele au soluție validă. ✓');
