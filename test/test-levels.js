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
    map.dictation = !!level.dictation;
    if (level.dictation && !map.drawing) fail(level, 'desenul dictat fără model');
    if (level.round1 && !Engine.VAGUE[level.round1]) fail(level, 'runda 1 fără instrucțiune vagă');
    var width = m.grid[0].length;
    m.grid.forEach(function (row) { if (row.length !== width) fail(level, 'harta ' + (i + 1) + ' are rânduri inegale'); });
    if (!map.start || !(map.treasure || map.drawing)) { fail(level, 'harta ' + (i + 1) + ' fără S sau T/D'); return; }
    if (map.treasure && map.drawing) fail(level, 'harta ' + (i + 1) + ' are și comoară, și desen');
    var res = Engine.runToEnd(program, map, m.dir);
    if (!res.won) fail(level, 'harta ' + (i + 1) + ': soluția nu termină nivelul (' + res.failed + ' la ' + res.r + ',' + res.c + ')');
    else if (res.extra && !level.maps[1]) fail(level, 'soluția are pași în plus după ce câștigă');
  });
});

// Programe greșite trebuie să eșueze corect.
var lvl1 = Levels.LEVELS.filter(function (l) { return l.id === 1; })[0];
var map1 = Engine.parseGrid(lvl1.maps[0].grid);
var bump = Engine.runToEnd(Engine.fromCompact([['up']]), map1, 1);
if (bump.failed !== 'bump') { failures++; console.log('  ✗ lovirea de zid nu e detectată'); }
var short = Engine.runToEnd(Engine.fromCompact([['right']]), map1, 1);
if (short.failed !== 'ended') { failures++; console.log('  ✗ programul scurt nu e detectat'); }
var loop = Engine.runToEnd(Engine.fromCompact([['repeatUntil', [['if', 'up', [['up']]]]]]), map1, 1);
if (loop.failed !== 'limit') { failures++; console.log('  ✗ bucla infinită nu e oprită'); }
var empty = Engine.runToEnd(Engine.fromCompact([['repeatUntil', []]]), map1, 1);
if (empty.failed !== 'limit') { failures++; console.log('  ✗ bucla goală nu e oprită'); }

// Obstacolele: în lavă/apă cazi, de bolovan te lovești, pe pod treci.
var field = Engine.parseGrid(['#####', '#SLT#', '#PB.#', '#####']);
var lava = Engine.runToEnd(Engine.fromCompact([['right']]), field, 1);
if (lava.failed !== 'hazard' || lava.hazard !== 'lava') { failures++; console.log('  ✗ căderea în lavă nu e detectată'); }
var rock = Engine.runToEnd(Engine.fromCompact([['down']]), field, 1);
if (rock.failed !== 'bump' || rock.bumped !== 'P') { failures++; console.log('  ✗ lovirea de bolovan nu e detectată'); }
var bridge = Engine.runToEnd(Engine.fromCompact([['right'], ['down'], ['right'], ['up']]),
  Engine.parseGrid(['#####', '#SAT#', '#.B.#', '#####']), 1);
if (bridge.failed !== 'hazard') { failures++; console.log('  ✗ apa nu e detectată'); }
var cross = Engine.runToEnd(Engine.fromCompact([['down'], ['right'], ['right'], ['up']]),
  Engine.parseGrid(['#####', '#SAT#', '#.B.#', '#####']), 1);
if (!cross.won) { failures++; console.log('  ✗ podul nu se poate traversa'); }

// Desenul: ieșirea din model e greșeală, trecerea din nou pe linie e voie, desenul neterminat nu câștigă.
var art = Engine.parseGrid(['#####', '#SDD#', '#.D.#', '#####']);
var stray = Engine.runToEnd(Engine.fromCompact([['down']]), art, 1);
if (stray.failed !== 'stray') { failures++; console.log('  ✗ ieșirea din desen nu e detectată'); }
var half = Engine.runToEnd(Engine.fromCompact([['right'], ['right']]), art, 1);
if (half.failed !== 'ended') { failures++; console.log('  ✗ desenul neterminat nu e detectat'); }
var redo = Engine.runToEnd(Engine.fromCompact([['right'], ['down'], ['up'], ['right']]), art, 1);
if (!redo.won) { failures++; console.log('  ✗ trecerea din nou pe desen nu e permisă'); }

// Repetările sau blocurile în plus după comoară sunt observate (nu mai iei 3 stele pe ele).
var line = Engine.parseGrid(['#####', '#S.T#', '#####']);
var exact = Engine.runToEnd(Engine.fromCompact([['repeat', 2, [['right']]]]), line, 1);
if (!exact.won || exact.extra) { failures++; console.log('  ✗ bucla exactă e marcată ca având pași în plus'); }
var tooMany = Engine.runToEnd(Engine.fromCompact([['repeat', 9, [['right']]]]), line, 1);
if (!tooMany.won || !tooMany.extra) { failures++; console.log('  ✗ repetările în plus nu sunt observate'); }
var tail = Engine.runToEnd(Engine.fromCompact([['right'], ['right'], ['up']]), line, 1);
if (!tail.won || !tail.extra) { failures++; console.log('  ✗ blocul în plus de după comoară nu e observat'); }
var nested = Engine.runToEnd(Engine.fromCompact([['repeat', 2, [['repeat', 1, [['right']]]]]]), line, 1);
if (!nested.won || nested.extra) { failures++; console.log('  ✗ buclele una în alta exacte sunt marcate greșit'); }

// Instrucțiunile vagi strică desenul; la desenul dictat contează doar desenul de la final.
var vague = Engine.runToEnd(Engine.fromCompact([['right'], ['vSquare']]), art, 1);
if (vague.failed !== 'vague' || vague.vague !== 'vSquare') { failures++; console.log('  ✗ instrucțiunea vagă nu e detectată'); }
var secret = Engine.parseGrid(['######', '#SDD.#', '#....#', '######']);
secret.dictation = true;
var good = Engine.runToEnd(Engine.fromCompact([['right'], ['right']]), secret, 1);
if (!good.won) { failures++; console.log('  ✗ desenul dictat corect nu câștigă'); }
var off = Engine.runToEnd(Engine.fromCompact([['down'], ['up'], ['right'], ['right']]), secret, 1);
if (off.won || off.extraCells !== 1 || off.failed !== 'ended') { failures++; console.log('  ✗ pătrățelul în plus din desenul dictat nu e găsit'); }
var shortDraw = Engine.runToEnd(Engine.fromCompact([['right']]), secret, 1);
if (shortDraw.won || shortDraw.missing !== 1) { failures++; console.log('  ✗ pătrățelul lipsă din desenul dictat nu e găsit'); }

// Surprizele: poartă, monede, portal, gheață, pod șubred, săgeți magice, comoara falsă, culori.
function check(name, grid, prog, want) {
  var res = Engine.runToEnd(Engine.fromCompact(prog), Engine.parseGrid(grid), 1);
  var ok = Object.keys(want).every(function (k) { return res[k] === want[k]; });
  if (!ok) { failures++; console.log('  ✗ ' + name + ': ' + JSON.stringify(res)); }
}
check('poarta fără cheie', ['#####', '#SUT#', '#####'], [['right']], { failed: 'bump', bumped: 'U' });
check('poarta cu cheie', ['######', '#SKUT#', '######'], [['repeat', 3, [['right']]]], { won: true });
check('cheia se consumă', ['#######', '#SKUUT#', '#######'], [['repeat', 4, [['right']]]], { failed: 'bump' });
check('comoara încuiată', ['#######', '#.STM.#', '#######'], [['right']], { won: false, coinsLeft: 1 });
check('monedele descuie comoara', ['#######', '#.MST.#', '#######'], [['left'], ['right'], ['right']], { won: true });
check('portalul', ['########', '#S.O#OT#', '########'], [['right'], ['right'], ['right']], { won: true });
check('gheața', ['#######', '#SIIIT#', '#######'], [['right']], { won: true });
check('gheața se oprește la zid', ['#######', '#SIII.#', '#.####T'.slice(0, 7), '#######'], [['right']], { r: 1, c: 5 });
check('podul șubred', ['######', '#SC.T#', '######'], [['right'], ['right'], ['left'], ['left']], { failed: 'hazard', hazard: 'hole' });
check('săgeata magică', ['######', '#S>.T#', '######'], [['right']], { r: 1, c: 3 });
check('comoara falsă', ['#####', '#SFT#', '#####'], [['right']], { failed: 'hazard', hazard: 'mimic' });
check('culoarea greșită', ['######', '#SDE.#', '######'], [['right'], ['right']], { failed: 'stray' });
check('găleata de vopsea', ['######', '#SQE.#', '######'], [['right'], ['right']], { won: true });

// „Dacă e drum”: zidul, apa, lava și comoara falsă nu sunt drum; poarta e drum doar cu cheia.
function look(grid, cond, want, keys) {
  var st = Engine.newState(Engine.parseGrid(grid), 1);
  st.keys = keys || 0;
  if (Engine.pathAhead(st, cond) !== want) { failures++; console.log('  ✗ Dacă e drum ' + cond + ' pe ' + grid.join('/') + ' ≠ ' + want); }
}
look(['###', '#S.', '###'], 'right', true);
look(['###', '#S#', '###'], 'right', false);
look(['#.#', '#S#', '###'], 'up', true);
look(['###', '#S#', '#A#'], 'down', false);
look(['###', 'LS#', '###'], 'left', false);
look(['###', '#SF', '###'], 'right', false);
look(['###', '#SM', '###'], 'right', true);
look(['###', '#SU', '###'], 'right', false);
look(['###', '#SU', '###'], 'right', true, 1);

// Dosarele detectivului: fiecare sarcină are exact răspunsul pe care îl așteaptă jocul.
function nodeAt(list, path) {
  var node = list[path[0]];
  for (var i = 1; i < path.length; i += 2) node = node[path[i]][path[i + 1]];
  return node;
}
// prog: în format compact sau deja ca blocuri
function wins(prog, grid, dictation) {
  var map = Engine.parseGrid(grid);
  map.dictation = !!dictation;
  return Engine.runToEnd(Array.isArray(prog[0]) ? Engine.fromCompact(prog) : prog, map, 1);
}
function frame(rows) {
  var w = rows[0].length + 2, edge = new Array(w + 1).join('#');
  return [edge].concat(rows.map(function (r) { return '#' + r + '#'; }), [edge]);
}
var levelIds = Levels.LEVELS.map(function (l) { return l.id; });
Levels.CHALLENGES.forEach(function (ch) {
  function bad(i, msg) { failures++; console.log('  ✗ ' + ch.name + ', sarcina ' + (i + 1) + ': ' + msg); }
  if (levelIds.indexOf(ch.id) >= 0) bad(-1, 'id-ul e folosit și de un nivel');
  var after = Levels.LEVELS.filter(function (l) { return l.id === ch.after; })[0];
  if (!after || after.world !== ch.world) bad(-1, 'nivelul dinainte nu e în misiune');
  ch.tasks.forEach(function (t, i) {
    if (t.type === 'pick') {
      t.options.forEach(function (o, k) {
        var won = wins(t.program, frame(o), true).won;
        if (won !== (k === t.answer)) bad(i, 'desenul ' + (k + 1) + (won ? ' iese și el' : ' nu iese'));
      });
    } else if (t.type === 'bug') {
      if (wins(t.program, t.grid).won) bad(i, 'programul cu bug ajunge la comoară');
      t.fix.options.forEach(function (v) {
        var p = Engine.fromCompact(t.program);
        nodeAt(p, t.wrong)[t.fix.field] = v;
        var won = wins(p, t.grid).won;
        if (won !== (v === t.fix.answer)) bad(i, 'reparația ' + v + (won ? ' merge și ea' : ' nu merge'));
      });
    } else if (t.type === 'order') {
      if (!wins(t.solution, t.grid).won) bad(i, 'ordinea bună nu ajunge la comoară');
      if (wins(t.cards, t.grid).won) bad(i, 'cartonașele sunt deja în ordine');
      if (JSON.stringify(t.cards.map(String).sort()) !== JSON.stringify(t.solution.map(String).sort())) bad(i, 'alte cartonașe decât soluția');
    } else if (t.type === 'where') {
      var res = wins(t.program, t.grid);
      if (res.failed !== 'ended') bad(i, 'programul nu se termină liniștit (' + res.failed + ')');
    } else if (t.type === 'build') {
      var sol = Engine.fromCompact(t.solution);
      if (!wins(t.solution, t.grid, t.dictation).won) bad(i, 'soluția nu merge');
      if (Engine.countBlocks(sol) > t.maxBlocks) bad(i, 'soluția are prea multe blocuri');
      Object.keys(Engine.usedTypes(sol)).forEach(function (x) { if (t.blocks.indexOf(x) < 0) bad(i, 'bloc nepermis ' + x); });
      if (t.show && !wins(t.show, t.grid).won) bad(i, 'programul lung nu merge');
      if (t.show && t.show.length <= t.maxBlocks) bad(i, 'programul lung încape deja');
    } else bad(i, 'tip necunoscut ' + t.type);
  });
});

if (failures) {
  console.log('\n' + failures + ' probleme.');
  process.exit(1);
}
console.log('Toate cele ' + Levels.LEVELS.length + ' nivele și ' + Levels.CHALLENGES.length + ' dosare au soluție validă. ✓');
