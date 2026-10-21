// Interpretorul programelor: rulează blocurile pas cu pas pe o hartă.
(function (root) {
  'use strict';

  // 0 = sus (N), 1 = dreapta (E), 2 = jos (S), 3 = stânga (W)
  var DR = [-1, 0, 1, 0];
  var DC = [0, 1, 0, -1];
  var STEP_LIMIT = 600;

  var ABS_DIR = { up: 0, right: 1, down: 2, left: 3 };
  var CONTAINERS = { repeat: 1, repeatUntil: 1, if: 1, ifElse: 1 };
  // Instrucțiunile vagi ale robotului desenator (Misiunea 1): robotul le ia ad literam și strică desenul.
  var VAGUE = { vSquare: 1, vRoof: 1, vDoor: 1, vHouse: 1, vOwl: 1 };

  // Hartă: '#' zid, 'P' bolovan (te lovești de ele); 'L' lavă, 'A' apă, 'F' comoară falsă (cazi / te mușcă);
  // 'B' pod. Surprizele nivelelor:
  //   'K' cheie și 'U' poartă (poarta se deschide doar cu o cheie, iar cheia se consumă),
  //   'M' monedă (comoara 'T' rămâne încuiată până aduni toate monedele),
  //   'O' portal (două pe hartă: intri într-unul, ieși din celălalt),
  //   'I' gheață (aluneci în aceeași direcție până dai de altceva),
  //   'C' pod șubred (se prăbușește după ce treci de el; a doua oară cazi),
  //   '>' '<' '^' 'v' săgeți magice (te împing un pătrățel în direcția lor).
  // Desen (Misiunea 1, fără comoară): 'D' linia modelului, 'E' linia de a doua culoare, 'Q' găleată de
  // vopsea (după ea creionul desenează cu a doua culoare). Eroul desenează pe unde trece, iar desenul e
  // gata când a trecut pe toate pătrățelele modelului, cu culoarea bună. La desenul dictat
  // (map.dictation = true), modelul e ascuns: robotul desenează oriunde, iar la final se compară (judge).
  var BLOCKED = { '#': 1, P: 1 };
  var HAZARDS = { L: 'lava', A: 'water', F: 'mimic' };
  var PUSH = { '^': 0, '>': 1, v: 2, '<': 3 };
  var KEEP = { '#': 1, T: 1, P: 1, L: 1, A: 1, B: 1, D: 1, E: 1, Q: 1, K: 1, U: 1, M: 1, O: 1, I: 1, C: 1, F: 1, '>': 1, '<': 1, '^': 1, v: 1 };
  var INK = { D: 1, E: 2 }; // culoarea cerută de fiecare linie a modelului

  function parseGrid(rows) {
    var start = null, treasure = null, ink = 0, coins = 0, portals = [];
    var cells = rows.map(function (line, r) {
      return line.split('').map(function (ch, c) {
        if (ch === 'S') start = { r: r, c: c };
        if (ch === 'T') treasure = { r: r, c: c };
        if (INK[ch]) ink++;
        if (ch === 'M') coins++;
        if (ch === 'O') portals.push({ r: r, c: c });
        return KEEP[ch] ? ch : '.';
      });
    });
    // la desen, startul face parte din model: eroul pune creionul pe hârtie acolo
    if (ink && start) { cells[start.r][start.c] = 'D'; ink++; }
    return { cells: cells, rows: cells.length, cols: cells[0].length, start: start, treasure: treasure,
      drawing: ink, coins: coins, portals: portals };
  }

  function inside(map, r, c) {
    return r >= 0 && c >= 0 && r < map.rows && c < map.cols;
  }

  // ce e acum într-o celulă, după ce eroul a luat chei/monede și a deschis porți în rularea curentă
  function cellAt(st, r, c) {
    if (!inside(st.map, r, c)) return '#';
    var ch = st.map.cells[r][c], k = r + ',' + c;
    if (st.used && st.used[k]) return '.';
    if (ch === 'C' && st.crumbled && st.crumbled[k]) return 'hole';
    return ch;
  }

  function isOpen(map, r, c) {
    return inside(map, r, c) && !BLOCKED[map.cells[r][c]] && map.cells[r][c] !== 'U';
  }

  function hazardAt(map, r, c) {
    return inside(map, r, c) ? HAZARDS[map.cells[r][c]] || null : null;
  }

  function newState(map, dir) {
    var st = { map: map, r: map.start.r, c: map.start.c, dir: dir || 0, won: false, failed: null, steps: 0,
      keys: 0, used: {}, crumbled: {}, coinsLeft: map.coins || 0, color: 1 };
    if (map.drawing) { st.drawn = {}; st.drawn[st.r + ',' + st.c] = 1; st.drawnCount = 1; }
    return st;
  }

  function lookDir(st, cond) {
    if (cond === 'left') return (st.dir + 3) % 4;
    if (cond === 'right') return (st.dir + 1) % 4;
    return st.dir;
  }

  function pathAhead(st, cond) {
    var d = lookDir(st, cond);
    var r = st.r + DR[d], c = st.c + DC[d], ch = cellAt(st, r, c);
    return !BLOCKED[ch] && ch !== 'U' && !HAZARDS[ch] && ch !== 'hole';
  }

  function tick(st) {
    st.steps++;
    if (st.steps > STEP_LIMIT) {
      st.failed = 'limit';
      return false;
    }
    return true;
  }

  // Un pas în direcția st.dir, cu tot ce urmează singur: alunecare pe gheață, săgeți magice, portal.
  // Produce un eveniment pentru fiecare pătrățel (kind: move, slide, win, bump, fall, stray, teleport...).
  function* move(st, node) {
    var d = st.dir, forced = false;
    for (;;) {
      var fr = st.r, fc = st.c;
      var nr = fr + DR[d], nc = fc + DC[d], k = nr + ',' + nc;
      var ch = cellAt(st, nr, nc);
      if (BLOCKED[ch] || (ch === 'U' && !st.keys)) {
        if (forced) return; // alunecarea / împingerea se oprește la obstacol
        st.failed = 'bump';
        st.bumped = ch; // '#' zid, 'P' bolovan, 'U' poartă încuiată
        yield { id: node.id, kind: 'bump', r: nr, c: nc };
        return;
      }
      var ev = { id: node.id, kind: forced ? 'slide' : 'move', r: nr, c: nc };
      if (ch === 'U') { st.keys--; st.used[k] = 1; ev.gate = true; } // cheia descuie poarta
      if (st.map.cells[fr][fc] === 'C') { st.crumbled[fr + ',' + fc] = 1; ev.crumble = { r: fr, c: fc }; }
      st.r = nr;
      st.c = nc;
      var hazard = ch === 'hole' ? 'hole' : HAZARDS[ch];
      if (hazard) {
        st.failed = 'hazard';
        st.hazard = hazard;
        ev.kind = 'fall';
        ev.hazard = hazard;
        yield ev;
        return;
      }
      if (st.map.drawing) {
        if (ch === 'Q') { st.color = 2; ev.paint = 2; }
        if (st.map.dictation) {
          if (!st.drawn[k]) st.drawnCount++;
          st.drawn[k] = st.color;
        } else if (INK[ch]) {
          if (INK[ch] !== st.color) {
            st.failed = 'stray'; // linia asta trebuia desenată cu cealaltă culoare
            st.wrongColor = true;
            ev.kind = 'stray';
            yield ev;
            return;
          }
          if (!st.drawn[k]) { st.drawn[k] = st.color; st.drawnCount++; }
          if (st.drawnCount === st.map.drawing) st.won = true;
        } else if (ch !== 'Q') {
          st.failed = 'stray'; // a desenat în afara modelului
          ev.kind = 'stray';
          yield ev;
          return;
        }
      }
      if (ch === 'K') { st.keys++; st.used[k] = 1; ev.key = true; }
      if (ch === 'M') { st.coinsLeft--; st.used[k] = 1; ev.coin = true; }
      if (ch === 'T') {
        if (st.coinsLeft > 0) ev.locked = true; // comoara e încuiată până aduni toate monedele
        else st.won = true;
      }
      if (st.won) ev.kind = 'win';
      yield ev;
      if (st.won) return;
      if (ch === 'O' && st.map.portals.length === 2) {
        var other = st.map.portals[0].r === nr && st.map.portals[0].c === nc ? st.map.portals[1] : st.map.portals[0];
        st.r = other.r;
        st.c = other.c;
        yield { id: node.id, kind: 'teleport', from: { r: nr, c: nc }, r: other.r, c: other.c };
        return;
      }
      if (ch === 'I') { forced = true; } // pe gheață aluneci mai departe, în aceeași direcție
      else if (PUSH[ch] !== undefined) { forced = true; d = PUSH[ch]; st.dir = d; } // săgeata magică te împinge
      else return;
      if (!tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
    }
  }

  // Generator: produce câte un eveniment pentru fiecare pas (mișcare, rotire, verificare).
  // st.extra = programul mai avea ceva de făcut când eroul a câștigat (blocuri sau repetări în plus)
  function* runList(list, st) {
    for (var i = 0; i < list.length; i++) {
      if (st.won) st.extra = true;
      if (st.won || st.failed) return;
      yield* runNode(list[i], st);
    }
  }

  function* runNode(node, st) {
    if (!tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
    if (VAGUE[node.type]) {
      st.failed = 'vague';
      st.vague = node.type;
      yield { id: node.id, kind: 'vague', what: node.type };
      return;
    }
    switch (node.type) {
      case 'forward':
        yield* move(st, node);
        break;
      case 'up': case 'down': case 'left': case 'right':
        st.dir = ABS_DIR[node.type];
        yield* move(st, node);
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
          if (st.won) st.extra = true;
          if (st.won || st.failed) return;
          if (k > 0 && !tick(st)) { yield { id: node.id, kind: 'limit' }; return; }
          yield { id: node.id, kind: 'check', left: node.n - k }; // câte repetări mai sunt, cu aceasta
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

  // Desenul dictat, la final: ce pătrățele ale modelului lipsesc și ce e desenat în plus.
  // Dacă desenul e identic, nivelul e câștigat.
  function judge(st) {
    var map = st.map, missing = [], extra = [];
    for (var r = 0; r < map.rows; r++) {
      for (var c = 0; c < map.cols; c++) {
        var want = INK[map.cells[r][c]] || 0, got = st.drawn[r + ',' + c] || 0;
        if (want && got !== want) missing.push({ r: r, c: c }); // lipsă sau cu altă culoare
        if (got && !want && map.cells[r][c] !== 'Q') extra.push({ r: r, c: c });
      }
    }
    if (!st.failed && !missing.length && !extra.length) st.won = true;
    st.missing = missing;
    st.extraCells = extra;
    return { missing: missing, extra: extra };
  }

  // Rulează programul complet (fără animație) și întoarce rezultatul.
  function runToEnd(program, map, dir) {
    var st = newState(map, dir);
    var gen = runList(program, st);
    while (!gen.next().done) { /* consumă pașii */ }
    if (map.dictation && !st.failed) judge(st);
    return { won: st.won, extra: !!st.extra, vague: st.vague || null, coinsLeft: st.coinsLeft,
      missing: st.missing ? st.missing.length : 0, extraCells: st.extraCells ? st.extraCells.length : 0, failed: st.failed || (st.won ? null : 'ended'), hazard: st.hazard || null, bumped: st.bumped || null, r: st.r, c: st.c, steps: st.steps };
  }

  var api = {
    DR: DR, DC: DC, CONTAINERS: CONTAINERS, VAGUE: VAGUE, STEP_LIMIT: STEP_LIMIT, judge: judge,
    parseGrid: parseGrid, isOpen: isOpen, cellAt: cellAt, INK: INK, hazardAt: hazardAt, newState: newState, run: runList,
    countBlocks: countBlocks, usedTypes: usedTypes, makeNode: makeNode,
    fromCompact: fromCompact, runToEnd: runToEnd
  };
  root.Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
