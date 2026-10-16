// Editorul de blocuri: paletă de comenzi -> program.
// Click (sau atingere) pe un bloc din paletă îl adaugă în zona activă; blocurile se pot și trage cu mouse-ul / degetul.
(function (root) {
  'use strict';

  var META = {
    up:          { icon: '⬆️', label: 'Sus', cat: 'move' },
    down:        { icon: '⬇️', label: 'Jos', cat: 'move' },
    left:        { icon: '⬅️', label: 'Stânga', cat: 'move' },
    right:       { icon: '➡️', label: 'Dreapta', cat: 'move' },
    forward:     { icon: '👣', label: 'Înainte', cat: 'move' },
    turnLeft:    { icon: '↺', label: 'Rotește stânga', cat: 'turn' },
    turnRight:   { icon: '↻', label: 'Rotește dreapta', cat: 'turn' },
    repeat:      { icon: '🔁', label: 'Repetă', cat: 'loop' },
    repeatUntil: { icon: '💎', label: 'Repetă până la comoară', cat: 'loop' },
    if:          { icon: '❓', label: 'Dacă e drum', cat: 'cond' },
    ifElse:      { icon: '❓', label: 'Dacă e drum … altfel', cat: 'cond' }
  };
  var CONDS = { front: 'în față', left: 'la stânga', right: 'la dreapta' };
  var MIN_N = 1, MAX_N = 12;
  var DRAG_THRESHOLD = 6;

  function h(tag, cls, html) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function condSelect(value) {
    return '<select class="cond" aria-label="Condiție">' + Object.keys(CONDS).map(function (k) {
      return '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + CONDS[k] + '</option>';
    }).join('') + '</select>';
  }

  function create(opts) {
    var program = opts.program || [];
    var maxBlocks = opts.maxBlocks || null;
    var activeSlot = 'root';
    var enabled = true;
    var drag = null;

    var ws = opts.workspace;
    var pal = opts.palette;

    // ---------- Model ----------
    function slotArray(key, list) {
      list = list || program;
      if (key === 'root') return program;
      var parts = key.split(':');
      var node = findNode(parts[0], list);
      return node ? node[parts[1]] : null;
    }

    function findNode(id, list) {
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (n.id === id) return n;
        var inner = (n.body && findNode(id, n.body)) || (n.else && findNode(id, n.else));
        if (inner) return inner;
      }
      return null;
    }

    function findParent(id, list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return { arr: list, index: i };
        var n = list[i];
        var inner = (n.body && findParent(id, n.body)) || (n.else && findParent(id, n.else));
        if (inner) return inner;
      }
      return null;
    }

    function count() { return Engine.countBlocks(program); }

    function changed() {
      render();
      if (opts.onChange) opts.onChange(program);
    }

    function canAdd() {
      if (maxBlocks && count() >= maxBlocks) {
        if (opts.onLimit) opts.onLimit();
        return false;
      }
      return true;
    }

    function addNode(type, slotKey, index) {
      if (!canAdd()) return;
      var arr = slotArray(slotKey) || program;
      var node = Engine.makeNode(type);
      if (index === undefined || index > arr.length) index = arr.length;
      arr.splice(index, 0, node);
      // după un bloc „container”, următoarele blocuri intră înăuntrul lui
      if (node.body) activeSlot = node.id + ':body';
      changed();
    }

    function removeNode(id) {
      var p = findParent(id, program);
      if (!p) return;
      p.arr.splice(p.index, 1);
      if (!slotArray(activeSlot)) activeSlot = 'root';
      changed();
    }

    // ---------- Desenare ----------
    function blockEl(node, inPalette) {
      var m = META[node.type];
      var el = h('div', 'blk cat-' + m.cat + ' t-' + node.type);
      if (inPalette) el.dataset.type = node.type; else el.dataset.id = node.id;
      var del = inPalette ? '' : '<button class="del" type="button" aria-label="Șterge blocul">✕</button>';

      if (!node.body) {
        el.innerHTML = '<span class="ico">' + m.icon + '</span><span class="lbl">' + m.label + '</span>' + del;
        return el;
      }

      el.classList.add('container');
      var head;
      if (node.type === 'repeat') {
        head = inPalette
          ? 'Repetă <span class="num"><b>3</b></span> ori'
          : 'Repetă <span class="num"><button class="nb" type="button" data-d="-1" aria-label="Mai puțin">−</button><b>' + node.n +
            '</b><button class="nb" type="button" data-d="1" aria-label="Mai mult">+</button></span> ori';
      } else if (node.type === 'repeatUntil') {
        head = 'Repetă până la comoară';
      } else {
        head = 'Dacă e drum ' + (inPalette ? '<span class="cond-ph">în față ▾</span>' + (node.type === 'ifElse' ? ' … altfel' : '') : condSelect(node.cond));
      }
      el.appendChild(h('div', 'blk-head', '<span class="ico">' + m.icon + '</span><span class="lbl">' + head + '</span>' + del));
      if (inPalette) return el; // în paletă arătăm doar capul blocului, ca să încapă
      el.appendChild(slotEl(node.body, node.id + ':body'));
      if (node.type === 'ifElse') {
        el.appendChild(h('div', 'blk-mid', 'altfel'));
        el.appendChild(slotEl(node.else, node.id + ':else'));
      }
      el.appendChild(h('div', 'blk-foot'));
      return el;
    }

    function slotEl(list, key) {
      var slot = h('div', 'slot');
      slot.dataset.slot = key;
      if (key === activeSlot) slot.classList.add('active');
      if (!list.length) slot.appendChild(h('div', 'slot-empty', key === 'root' ? 'Pune aici comenzile programului' : 'pune blocuri aici'));
      list.forEach(function (n) { slot.appendChild(blockEl(n, false)); });
      return slot;
    }

    function render() {
      if (!slotArray(activeSlot)) activeSlot = 'root';
      ws.innerHTML = '';
      ws.appendChild(slotEl(program, 'root'));
      var full = maxBlocks && count() >= maxBlocks;
      pal.classList.toggle('full', !!full);
      if (opts.onRender) opts.onRender(count(), maxBlocks, program);
    }

    function renderPalette() {
      pal.innerHTML = '';
      opts.blocks.forEach(function (type) {
        pal.appendChild(blockEl(Engine.makeNode(type), true));
      });
    }

    // ---------- Click / atingere ----------
    ws.addEventListener('click', function (e) {
      if (!enabled) return;
      var del = e.target.closest('.del');
      if (del) { removeNode(del.closest('.blk').dataset.id); return; }
      var nb = e.target.closest('.nb');
      if (nb) {
        var node = findNode(nb.closest('.blk').dataset.id, program);
        node.n = Math.max(MIN_N, Math.min(MAX_N, node.n + Number(nb.dataset.d)));
        changed();
      }
    });

    ws.addEventListener('change', function (e) {
      if (!enabled || !e.target.classList.contains('cond')) return;
      findNode(e.target.closest('.blk').dataset.id, program).cond = e.target.value;
      changed();
    });

    function tapWorkspace(target) {
      var head = target.closest('.blk-head');
      if (head) {
        activeSlot = head.parentNode.dataset.id + ':body';
      } else {
        var slot = target.closest('.slot');
        activeSlot = slot ? slot.dataset.slot : 'root';
      }
      render();
    }

    // ---------- Tragere (mouse și touch prin pointer events) ----------
    function onDown(e) {
      if (!enabled || e.button > 0) return;
      if (e.target.closest('button, select')) return;
      var blk = e.target.closest('.blk');
      var inPal = pal.contains(e.target);
      if (!blk && inPal) return;
      drag = {
        el: blk, fromPalette: inPal, x: e.clientX, y: e.clientY, started: false,
        type: blk && blk.dataset.type, id: blk && blk.dataset.id, target: e.target
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onCancel);
    }

    function startDrag() {
      drag.started = true;
      var r = drag.el.getBoundingClientRect();
      drag.dx = drag.x - r.left;
      drag.dy = drag.y - r.top;
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost');
      drag.ghost.style.width = r.width + 'px';
      document.body.appendChild(drag.ghost);
      if (!drag.fromPalette) drag.el.classList.add('dragging');
      drag.marker = h('div', 'drop-marker');
      document.body.classList.add('is-dragging');
    }

    function dropTarget(x, y) {
      var el = document.elementFromPoint(x, y);
      var slot = el && el.closest('.slot');
      if (!slot || !ws.contains(slot)) return null;
      if (!drag.fromPalette && drag.el.contains(slot)) return null;
      var kids = Array.prototype.filter.call(slot.children, function (c) {
        return c.classList.contains('blk') && !c.classList.contains('dragging');
      });
      var index = 0;
      kids.forEach(function (c) {
        var r = c.getBoundingClientRect();
        if (r.top + r.height / 2 < y) index++;
      });
      return { slot: slot, key: slot.dataset.slot, index: index, before: kids[index] || null };
    }

    function onMove(e) {
      if (!drag) return;
      if (!drag.started) {
        if (!drag.el || Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < DRAG_THRESHOLD) return;
        startDrag();
      }
      e.preventDefault();
      drag.ghost.style.transform = 'translate(' + (e.clientX - drag.dx) + 'px,' + (e.clientY - drag.dy) + 'px)';
      var t = dropTarget(e.clientX, e.clientY);
      drag.drop = t;
      if (drag.marker.parentNode) drag.marker.parentNode.removeChild(drag.marker);
      if (t) {
        var empty = t.slot.querySelector(':scope > .slot-empty');
        if (empty) empty.style.display = 'none';
        t.slot.insertBefore(drag.marker, t.before);
      }
      var outside = !drag.fromPalette && !ws.contains(document.elementFromPoint(e.clientX, e.clientY));
      drag.ghost.classList.toggle('to-trash', outside);
    }

    function cleanup() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.body.classList.remove('is-dragging');
      if (drag && drag.ghost) drag.ghost.remove();
      if (drag && drag.marker) drag.marker.remove();
    }

    function onCancel() { cleanup(); drag = null; render(); }

    function onUp(e) {
      var d = drag;
      cleanup();
      drag = null;
      if (!d) return;
      if (!d.started) {
        if (d.fromPalette) addNode(d.type, activeSlot);
        else tapWorkspace(d.target);
        return;
      }
      var t = d.drop;
      if (d.fromPalette) {
        if (t) addNode(d.type, t.key, t.index); else render();
        return;
      }
      var p = findParent(d.id, program);
      if (!t) {
        var under = document.elementFromPoint(e.clientX, e.clientY);
        if (!ws.contains(under)) removeNode(d.id); else render();
        return;
      }
      var node = p.arr.splice(p.index, 1)[0];
      var arr = slotArray(t.key);
      arr.splice(Math.min(t.index, arr.length), 0, node);
      changed();
    }

    ws.addEventListener('pointerdown', onDown);
    pal.addEventListener('pointerdown', onDown);

    renderPalette();
    render();

    return {
      getProgram: function () { return program; },
      setProgram: function (p) { program = p; activeSlot = 'root'; changed(); },
      clear: function () { program.length = 0; activeSlot = 'root'; changed(); },
      count: count,
      setEnabled: function (on) {
        enabled = on;
        ws.classList.toggle('locked', !on);
        pal.classList.toggle('locked', !on);
      },
      highlight: function (id) {
        var prev = ws.querySelectorAll('.running');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('running');
        if (!id) return;
        var el = ws.querySelector('[data-id="' + id + '"]');
        if (el) {
          el.classList.add('running');
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      },
      // marchează blocul unde a apărut greșeala și îl aduce în fața ochilor
      markError: function (id) {
        var prev = ws.querySelectorAll('.err');
        for (var i = 0; i < prev.length; i++) prev[i].classList.remove('err');
        var el = id && ws.querySelector('[data-id="' + id + '"]');
        if (!el) return;
        void el.offsetWidth;
        el.classList.add('err');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      flash: function (id, cls) {
        var el = ws.querySelector('[data-id="' + id + '"]');
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
      }
    };
  }

  root.Editor = { create: create, META: META };
})(window);
