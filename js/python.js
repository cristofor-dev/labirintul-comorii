// Traduce programul din blocuri în cod Python „adevărat”: fiecare bloc devine instrucțiunea
// care mută personajul pe coordonate (x = coloana, y = rândul; y crește în jos).
(function (root) {
  'use strict';

  var LABELS = {
    up: 'Sus', down: 'Jos', left: 'Stânga', right: 'Dreapta',
    forward: 'Înainte', turnLeft: 'Rotește stânga', turnRight: 'Rotește dreapta',
    repeatUntil: 'Repetă până la comoară'
  };
  var VAGUE = { vSquare: 'un pătrat', vRoof: 'un acoperiș', vDoor: 'o ușă', vHouse: 'o casă cu ușă și soare', vOwl: 'o bufniță' };
  var COND_LABELS = { front: 'în față', left: 'la stânga', right: 'la dreapta' };
  // celula verificată de fiecare condiție, relativ la direcția (dx, dy)
  var COND_CELL = { front: 'harta[y + dy][x + dx]', left: 'harta[y - dx][x + dy]', right: 'harta[y + dx][x - dy]' };
  var DIRS = [
    { v: '0, -1', name: 'în sus' }, { v: '1, 0', name: 'spre dreapta' },
    { v: '0, 1', name: 'în jos' }, { v: '-1, 0', name: 'spre stânga' }
  ];
  var LOOP_VARS = ['i', 'j', 'k', 'm', 'n'];
  var INDENT = '    ';

  // Bucăți de linie: [tip, text] — tip: kw (cuvânt cheie), num, str, com (comentariu), txt
  function T(s) { return ['txt', s]; }
  function K(s) { return ['kw', s]; }
  function N(s) { return ['num', String(s)]; }
  function C(s) { return ['com', '# ' + s]; }

  function add(out, depth, parts, id) { out.push({ indent: depth, parts: parts, id: id || null }); }

  function assign(out, depth, v, expr, id) {
    // „x = x + 1” cu numerele colorate
    var m = expr.match(/^(.*?)([+-]) (\d+)$/);
    if (m) add(out, depth, [T(v + ' = ' + m[1] + m[2] + ' '), N(m[3])], id);
    else add(out, depth, [T(v + ' = ' + expr)], id);
  }

  function body(list, depth, loopDepth, out) {
    if (!list.length) { add(out, depth, [K('pass'), T('  '), C('aici nu e încă nimic')]); return; }
    list.forEach(function (node) { stmt(node, depth, loopDepth, out); });
  }

  function stmt(node, depth, loopDepth, out) {
    var id = node.id;
    switch (node.type) {
      case 'right': add(out, depth, [C(LABELS.right)], id); assign(out, depth, 'x', 'x + 1', id); break;
      case 'left': add(out, depth, [C(LABELS.left)], id); assign(out, depth, 'x', 'x - 1', id); break;
      case 'down': add(out, depth, [C(LABELS.down)], id); assign(out, depth, 'y', 'y + 1', id); break;
      case 'up': add(out, depth, [C(LABELS.up)], id); assign(out, depth, 'y', 'y - 1', id); break;
      case 'forward':
        add(out, depth, [C(LABELS.forward)], id);
        add(out, depth, [T('x = x + dx')], id);
        add(out, depth, [T('y = y + dy')], id);
        break;
      case 'turnLeft':
        add(out, depth, [C(LABELS.turnLeft)], id);
        add(out, depth, [T('dx, dy = dy, -dx')], id);
        break;
      case 'turnRight':
        add(out, depth, [C(LABELS.turnRight)], id);
        add(out, depth, [T('dx, dy = -dy, dx')], id);
        break;
      case 'repeat':
        var v = LOOP_VARS[loopDepth] || 'x' + loopDepth;
        add(out, depth, [C('Repetă ' + node.n + ' ori')], id);
        add(out, depth, [K('for'), T(' ' + v + ' '), K('in'), T(' '), K('range'), T('('), N(node.n), T('):')], id);
        body(node.body, depth + 1, loopDepth + 1, out);
        break;
      case 'repeatUntil':
        add(out, depth, [C(LABELS.repeatUntil)], id);
        add(out, depth, [K('while'), T(' (x, y) != comoara:')], id);
        body(node.body, depth + 1, loopDepth, out);
        break;
      case 'vSquare': case 'vRoof': case 'vDoor': case 'vHouse': case 'vOwl':
        add(out, depth, [C(VAGUE[node.type] + ': robotul nu știe ce înseamnă!')], id);
        add(out, depth, [T('deseneaza('), ['str', '"' + VAGUE[node.type] + '"'], T(')')], id);
        break;
      case 'if':
      case 'ifElse':
        add(out, depth, [C('Dacă e drum ' + COND_LABELS[node.cond])], id);
        add(out, depth, [K('if'), T(' ' + COND_CELL[node.cond] + ' != '), ['str', '"#"'], T(':')], id);
        body(node.body, depth + 1, loopDepth, out);
        if (node.type === 'ifElse') {
          add(out, depth, [K('else'), T(':')], id);
          body(node.else, depth + 1, loopDepth, out);
        }
        break;
    }
  }

  // ctx: { map: rezultatul Engine.parseGrid, grid: rândurile hărții, dir: direcția de start, blocks: blocurile nivelului }
  function generate(program, ctx) {
    var used = Engine.usedTypes(program);
    // direcția (dx, dy) apare dacă nivelul folosește „Înainte” / rotiri, chiar înainte de primul bloc
    var levelBlocks = (ctx && ctx.blocks) || [];
    var relative = used.forward || used.turnLeft || used.turnRight || used.if || used.ifElse ||
      levelBlocks.indexOf('forward') >= 0;
    var out = [];
    if (ctx && ctx.map) {
      var s = ctx.map.start, t = ctx.map.treasure;
      add(out, 0, [C('Start: coloana ' + s.c + ', rândul ' + s.r)]);
      if (ctx.grid && /[IO<>^v]/.test(ctx.grid.join(''))) {
        add(out, 0, [C('Atenție: gheața, portalurile și săgețile magice mută eroul singure;')]);
        add(out, 0, [C('codul de mai jos arată doar pașii pe care îi faci tu.')]);
      }
      add(out, 0, [T('x, y = '), N(s.c), T(', '), N(s.r)]);
      if (relative) {
        var d = DIRS[ctx.dir || 0];
        add(out, 0, [T('dx, dy = ' + d.v + '  '), C('privește ' + d.name)]);
      }
      if (used.repeatUntil) add(out, 0, [T('comoara = ('), N(t.c), T(', '), N(t.r), T(')')]);
      if (used.if || used.ifElse) {
        add(out, 0, [T('harta = [')]);
        ctx.grid.forEach(function (row) { add(out, 1, [['str', '"' + row + '"'], T(',')]); });
        add(out, 0, [T(']')]);
      }
      add(out, 0, []);
    }
    if (!program.length) {
      add(out, 0, [C('Programul tău e gol: adaugă comenzi!')]);
      return out;
    }
    program.forEach(function (node) { stmt(node, 0, 0, out); });
    return out;
  }

  function repeat(s, n) { var r = ''; for (var i = 0; i < n; i++) r += s; return r; }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function toText(program, ctx) {
    return generate(program, ctx).map(function (l) {
      return repeat(INDENT, l.indent) + l.parts.map(function (p) { return p[1]; }).join('');
    }).join('\n');
  }

  function toHtml(program, ctx) {
    return generate(program, ctx).map(function (l) {
      var code = l.parts.map(function (p) {
        return p[0] === 'txt' ? esc(p[1]) : '<span class="py-' + p[0] + '">' + esc(p[1]) + '</span>';
      }).join('');
      return '<span class="py-line"' + (l.id ? ' data-id="' + l.id + '"' : '') + '>' + repeat(INDENT, l.indent) + code + '</span>';
    }).join('');
  }

  var Engine = root.Engine;
  var api = { toText: toText, toHtml: toHtml };
  root.Python = api;
  if (typeof module !== 'undefined' && module.exports) {
    Engine = require('./engine.js');
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
