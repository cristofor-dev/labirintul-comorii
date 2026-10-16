// Interpretorul programelor: rulează blocurile pas cu pas pe o hartă.
(function (root) {
  'use strict';

  // 0 = sus (N), 1 = dreapta (E), 2 = jos (S), 3 = stânga (W)
  var DR = [-1, 0, 1, 0];
  var DC = [0, 1, 0, -1];
  var STEP_LIMIT = 600;

  var ABS_DIR = { up: 0, right: 1, down: 2, left: 3 };
  var CONTAINERS = { repeat: 1, repeatUntil: 1, if: 1, ifElse: 1 };

  // Obstacole: 'P' bolovan (te lovești de el, ca de zid); 'L' lavă și 'A' apă (cazi în ele).
  // 'B' e un pod: se poate merge pe el.
  var BLOCKED = { '#': 1, P: 1 };
  var HAZARDS = { L: 'lava', A: 'water' };
  var KEEP = { '#': 1, T: 1, P: 1, L: 1, A: 1, B: 1 };

  function parseGrid(rows) {
    var start = null, treasure = null;
    var cells = rows.map(function (line, r) {
      return line.split('').map(function (ch, c) {
        if (ch === 'S') start = { r: r, c: c };
        if (ch === 'T') treasure = { r: r, c: c };
        return KEEP[ch] ? ch : '.';
      });
    });
    return { cells: cells, rows: cells.length, cols: cells[0].length, start: start, treasure: treasure };
  }

  function inside(map, r, c) {
    return r >= 0 && c >= 0 && r < map.rows && c < map.cols;
  }

  function isOpen(map, r, c) {
    return inside(map, r, c) && !BLOCKED[map.cells[r][c]];
  }

  function hazardAt(map, r, c) {
    return inside(map, r, c) ? HAZARDS[map.cells[r][c]] || null : null;
  }

  function newState(map, dir) {
    return { map: map, r: map.start.r, c: map.start.c, dir: dir || 0, won: false, failed: null, steps: 0 };
  }

  function lookDir(st, cond) {
    if (cond === 'left') return (st.dir + 3) % 4;
    if (cond === 'right') return (st.dir + 1) % 4;
    return st.dir;
  }

  function pathAhead(st, cond) {
    var d = lookDir(st, cond);
    var r = st.r + DR[d], c = st.c + DC[d];
    return isOpen(st.map, r, c) && !hazardAt(st.map, r, c);
  }

  function tick(st) {
    st.steps++;
    if (st.steps > STEP_LIMIT) {
      st.failed = 'limit';
      return false;
    }
    return true;
  }

  function move(st, node) {
    var nr = st.r + DR[st.dir], nc = st.c + DC[st.dir];
    if (!isOpen(st.map, nr, nc)) {
      st.failed = 'bump';
      st.bumped = inside(st.map, nr, nc) ? st.map.cells[nr][nc] : '#'; // '#' zid sau 'P' bolovan
      return { id: node.id, kind: 'bump', r: nr, c: nc };
    }
    st.r = nr;
    st.c = nc;
    var hazard = hazardAt(st.map, nr, nc);
    if (hazard) {
      st.failed = 'hazard';
      st.hazard = hazard;
      return { id: node.id, kind: 'fall', hazard: hazard };
    }
    if (st.map.cells[nr][nc] === 'T') st.won = true;
    return { id: node.id, kind: st.won ? 'win' : 'move' };
  }

  // Generator: produce câte un eveniment pentru fiecare pas (mișcare, rotire, verificare).
  function* runList(list, st) {
    for (var i = 0; i < list.length; i++) {
      if (st.won || st.failed) return;
      yield* runNode(list[i], st);
    }
  }

  function* runNode(node, st) {
    if (!tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
    switch (node.type) {
      case 'forward':
        yield move(st, node);
        break;
      case 'up': case 'down': case 'left': case 'right':
        st.dir = ABS_DIR[node.type];
        yield move(st, node);
        break;
      case 'turnLeft':
        st.dir = (st.dir + 3) % 4;
        yield { id: node.id, kind: 'turn' };
        break;
      case 'turnRight':
        st.dir = (st.dir + 1) % 4;
        yield { id: node.id, kind: 'turn' };
        break;
      case 'repeat':
        for (var k = 0; k < node.n; k++) {
          if (st.won || st.failed) return;
          if (k > 0 && !tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
          yield { id: node.id, kind: 'check' };
          yield* runList(node.body, st);
        }
        break;
      case 'repeatUntil':
        while (!st.won && !st.failed) {
          yield { id: node.id, kind: 'check' };
          yield* runList(node.body, st);
          if (!st.won && !st.failed && !tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
        }
        break;
      case 'if':
        yield { id: node.id, kind: 'check', result: pathAhead(st, node.cond) };
        if (pathAhead(st, node.cond)) yield* runList(node.body, st);
        break;
      case 'ifElse':
        var ok = pathAhead(st, node.cond);
        yield { id: node.id, kind: 'check', result: ok };
        yield* runList(ok ? node.body : node.else, st);
        break;
    }
  }

  function countBlocks(list) {
    var n = 0;
    list.forEach(function (node) {
      n++;
      if (node.body) n += countBlocks(node.body);
      if (node.else) n += countBlocks(node.else);
    });
    return n;
  }

  function usedTypes(list, acc) {
    acc = acc || {};
    list.forEach(function (node) {
      acc[node.type] = true;
      if (node.body) usedTypes(node.body, acc);
      if (node.else) usedTypes(node.else, acc);
    });
    return acc;
  }

  var idSeq = 0;
  function newId() {
    idSeq++;
    return 'b' + Date.now().toString(36) + idSeq;
  }

  function makeNode(type) {
    var node = { id: newId(), type: type };
    if (type === 'repeat') { node.n = 3; node.body = []; }
    if (type === 'repeatUntil') node.body = [];
    if (type === 'if') { node.cond = 'front'; node.body = []; }
    if (type === 'ifElse') { node.cond = 'front'; node.body = []; node.else = []; }
    return node;
  }

  // Format compact folosit pentru soluțiile de referință din levels.js:
  // ['forward'], ['repeat', 3, [...]], ['repeatUntil', [...]], ['if', 'left', [...]], ['ifElse', 'front', [...], [...]]
  function fromCompact(list) {
    return list.map(function (item) {
      var node = makeNode(item[0]);
      if (item[0] === 'repeat') { node.n = item[1]; node.body = fromCompact(item[2]); }
      if (item[0] === 'repeatUntil') node.body = fromCompact(item[1]);
      if (item[0] === 'if') { node.cond = item[1]; node.body = fromCompact(item[2]); }
      if (item[0] === 'ifElse') { node.cond = item[1]; node.body = fromCompact(item[2]); node.else = fromCompact(item[3]); }
      return node;
    });
  }

  // Rulează programul complet (fără animație) și întoarce rezultatul.
  function runToEnd(program, map, dir) {
    var st = newState(map, dir);
    var gen = runList(program, st);
    while (!gen.next().done) { /* consumă pașii */ }
    return { won: st.won, failed: st.failed || (st.won ? null : 'ended'), hazard: st.hazard || null, bumped: st.bumped || null, r: st.r, c: st.c, steps: st.steps };
  }

  var api = {
    DR: DR, DC: DC, CONTAINERS: CONTAINERS, STEP_LIMIT: STEP_LIMIT,
    parseGrid: parseGrid, isOpen: isOpen, hazardAt: hazardAt, newState: newState, run: runList,
    countBlocks: countBlocks, usedTypes: usedTypes, makeNode: makeNode,
    fromCompact: fromCompact, runToEnd: runToEnd
  };
  root.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
