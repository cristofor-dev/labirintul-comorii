// Traduce programul din blocuri în cod Python, cu colorare simplă a sintaxei.
(function (root) {
  'use strict';

  var CALLS = {
    forward: 'inainte', turnLeft: 'roteste_stanga', turnRight: 'roteste_dreapta',
    up: 'sus', down: 'jos', left: 'stanga', right: 'dreapta'
  };
  var CONDS = { front: 'drum_in_fata', left: 'drum_la_stanga', right: 'drum_la_dreapta' };
  var LOOP_VARS = ['i', 'j', 'k', 'm', 'n'];
  var INDENT = '    ';

  // Fiecare linie: { indent, parts: [[tip, text], ...], id } — tip: kw, fn, num, com, txt
  function lines(list, depth, loopDepth, out) {
    if (!list.length) {
      out.push({ indent: depth, parts: [['kw', 'pass']], id: null });
      return out;
    }
    list.forEach(function (node) {
      if (CALLS[node.type]) {
        out.push({ indent: depth, parts: [['fn', CALLS[node.type]], ['txt', '()']], id: node.id });
      } else if (node.type === 'repeat') {
        var v = LOOP_VARS[loopDepth] || 'x' + loopDepth;
        out.push({ indent: depth, id: node.id, parts: [['kw', 'for'], ['txt', ' ' + v + ' '], ['kw', 'in'], ['txt', ' '],
          ['fn', 'range'], ['txt', '('], ['num', String(node.n)], ['txt', '):']] });
        lines(node.body, depth + 1, loopDepth + 1, out);
      } else if (node.type === 'repeatUntil') {
        out.push({ indent: depth, id: node.id, parts: [['kw', 'while'], ['txt', ' '], ['kw', 'not'], ['txt', ' '],
          ['fn', 'la_comoara'], ['txt', '():']] });
        lines(node.body, depth + 1, loopDepth, out);
      } else if (node.type === 'if' || node.type === 'ifElse') {
        out.push({ indent: depth, id: node.id, parts: [['kw', 'if'], ['txt', ' '], ['fn', CONDS[node.cond]], ['txt', '():']] });
        lines(node.body, depth + 1, loopDepth, out);
        if (node.type === 'ifElse') {
          out.push({ indent: depth, id: node.id, parts: [['kw', 'else'], ['txt', ':']] });
          lines(node.else, depth + 1, loopDepth, out);
        }
      }
    });
    return out;
  }

  function generate(program) {
    var header = { indent: 0, id: null, parts: [['com', '# Programul tău, scris în Python']] };
    if (!program.length) {
      return [header, { indent: 0, id: null, parts: [['com', '# Încă e gol: adaugă comenzi și codul apare aici.']] }];
    }
    return [header].concat(lines(program, 0, 0, []));
  }

  function toText(program) {
    return generate(program).map(function (l) {
      return repeat(INDENT, l.indent) + l.parts.map(function (p) { return p[1]; }).join('');
    }).join('\n');
  }

  function repeat(s, n) { var r = ''; for (var i = 0; i < n; i++) r += s; return r; }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function toHtml(program) {
    return generate(program).map(function (l) {
      var code = l.parts.map(function (p) {
        return p[0] === 'txt' ? esc(p[1]) : '<span class="py-' + p[0] + '">' + esc(p[1]) + '</span>';
      }).join('');
      return '<span class="py-line"' + (l.id ? ' data-id="' + l.id + '"' : '') + '>' + repeat(INDENT, l.indent) + code + '</span>';
    }).join('');
  }

  var api = { toText: toText, toHtml: toHtml };
  root.Python = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
