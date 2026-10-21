// Verifică faptul că codul Python generat pentru soluțiile nivelelor e valid, nu trece prin ziduri
// și duce personajul la comoară (sau, la desene, trece pe tot desenul fără să iasă din el). Rulare: node test/test-python.js (necesită python3)
'use strict';
var execFileSync = require('child_process').execFileSync;
var Engine = require('../js/engine.js');
var Levels = require('../js/levels.js');
var Python = require('../js/python.js');

// Rulează codul și, după fiecare linie, verifică dacă personajul a ajuns într-un zid.
var RUNNER = [
  'import sys',
  'grid, code = sys.argv[1].split("\\n"), sys.stdin.read()',
  'T = [(xx, yy) for yy, row in enumerate(grid) for xx, ch in enumerate(row) if ch == "T"]',
  'ink = set((xx, yy) for yy, row in enumerate(grid) for xx, ch in enumerate(row) if ch in "DESQ")',
  'drawn = set()',
  'g = {}',
  'def check(frame, event, arg):',
  '    if event in ("line", "return") and "x" in g and "y" in g:',
  '        x, y = g["x"], g["y"]',
  '        if not (0 <= y < len(grid) and 0 <= x < len(grid[0])) or grid[y][x] == "#":',
  '            print("ZID la", x, y); sys.exit(0)',
  '        if not T:',
  '            if (x, y) not in ink: print("IESIT DIN DESEN la", x, y); sys.exit(0)',
  '            drawn.add((x, y))',
  '    return check',
  'sys.settrace(check)',
  'exec(compile(code, "program.py", "exec"), g)',
  'sys.settrace(None)',
  'if T: print("COMOARA" if (g["x"], g["y"]) == T[0] else "TERMINAT la %s,%s" % (g["x"], g["y"]))',
  'else: print("COMOARA" if drawn == ink else "DESEN NETERMINAT")'
].join('\n');

var failures = 0;
Levels.LEVELS.forEach(function (level) {
  level.maps.forEach(function (m, i) {
    // gheața, portalurile și săgețile magice mută eroul singure; codul Python arată doar pașii programului
    if (/[IO<>^v]/.test(m.grid.join(''))) return;
    var ctx = { map: Engine.parseGrid(m.grid), grid: m.grid, dir: m.dir };
    var code = Python.toText(Engine.fromCompact(level.solution), ctx);
    var out;
    try {
      out = execFileSync('python3', ['-I', '-c', RUNNER, m.grid.join('\n')], { input: code, encoding: 'utf8' }).trim();
    } catch (e) {
      out = 'EROARE: ' + (e.stderr || e.message);
    }
    if (out !== 'COMOARA') { failures++; console.log('  ✗ Nivelul ' + level.id + ' harta ' + (i + 1) + ': ' + out + '\n' + code); }
  });
});

var empty = Python.toText([], null);
if (empty.indexOf('gol') < 0) { failures++; console.log('  ✗ programul gol'); }
var emptyLoop = Python.toText(Engine.fromCompact([['repeat', 3, []]]), null);
if (emptyLoop.indexOf('pass') < 0) { failures++; console.log('  ✗ bucla goală fără pass'); }

if (failures) { console.log('\n' + failures + ' probleme.'); process.exit(1); }
console.log('Codul Python e valid, ocolește zidurile și ajunge la comoară pe toate nivelele. ✓');
var l3 = Levels.LEVELS.filter(function (l) { return l.id === 3; })[0];
console.log('\nExemplu (nivelul 3):\n' + Python.toText(Engine.fromCompact(l3.solution).slice(0, 4),
  { map: Engine.parseGrid(l3.maps[0].grid), grid: l3.maps[0].grid, dir: l3.maps[0].dir }));
