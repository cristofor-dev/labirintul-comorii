// Verifică faptul că codul Python generat pentru soluțiile nivelelor e valid și face aceiași pași.
// Rulare: node test/test-python.js (necesită python3)
'use strict';
var execFileSync = require('child_process').execFileSync;
var Engine = require('../js/engine.js');
var Levels = require('../js/levels.js');
var Python = require('../js/python.js');

// Simulează în Python aceeași lume ca motorul jocului, pe harta nivelului.
function harness(level, code) {
  var m = level.maps[0];
  return [
    'import sys',
    'G = ' + JSON.stringify(m.grid),
    'r, c = [(y, x) for y, row in enumerate(G) for x, ch in enumerate(row) if ch == "S"][0]',
    'd = ' + m.dir,
    'DR, DC = [-1, 0, 1, 0], [0, 1, 0, -1]',
    'def deschis(y, x): return 0 <= y < len(G) and 0 <= x < len(G[0]) and G[y][x] != "#"',
    'class Gata(Exception): pass',
    'def pas():',
    '    global r, c',
    '    if not deschis(r + DR[d], c + DC[d]): print("ZID"); sys.exit(0)',
    '    r, c = r + DR[d], c + DC[d]',
    '    if G[r][c] == "T": raise Gata()',
    'def inainte(): pas()',
    'def roteste_stanga():\n    global d\n    d = (d + 3) % 4',
    'def roteste_dreapta():\n    global d\n    d = (d + 1) % 4',
    'def _abs(x):\n    global d\n    d = x\n    pas()',
    'def sus(): _abs(0)', 'def dreapta(): _abs(1)', 'def jos(): _abs(2)', 'def stanga(): _abs(3)',
    'def la_comoara(): return G[r][c] == "T"',
    'def _vede(k): dd = (d + k) % 4; return deschis(r + DR[dd], c + DC[dd])',
    'def drum_in_fata(): return _vede(0)', 'def drum_la_stanga(): return _vede(3)', 'def drum_la_dreapta(): return _vede(1)',
    'try:',
    code.split('\n').map(function (l) { return '    ' + l; }).join('\n'),
    '    print("TERMINAT")',
    'except Gata:',
    '    print("COMOARA")'
  ].join('\n');
}

var failures = 0;
Levels.LEVELS.forEach(function (level) {
  var code = Python.toText(Engine.fromCompact(level.solution));
  var out;
  try {
    out = execFileSync('python3', ['-I', '-c', harness(level, code)], { encoding: 'utf8' }).trim();
  } catch (e) {
    out = 'EROARE: ' + (e.stderr || e.message);
  }
  if (out !== 'COMOARA') { failures++; console.log('  ✗ Nivelul ' + level.id + ': ' + out + '\n' + code); }
});

var empty = Python.toText([]);
if (empty.indexOf('gol') < 0) { failures++; console.log('  ✗ programul gol'); }
var emptyLoop = Python.toText(Engine.fromCompact([['repeat', 3, []]]));
if (emptyLoop.indexOf('pass') < 0) { failures++; console.log('  ✗ bucla goală fără pass'); }

if (failures) { console.log('\n' + failures + ' probleme.'); process.exit(1); }
console.log('Codul Python e valid și ajunge la comoară pe toate cele ' + Levels.LEVELS.length + ' nivele. ✓');
console.log('\nExemplu (nivelul 15):\n' + Python.toText(Engine.fromCompact(Levels.LEVELS[14].solution)));
