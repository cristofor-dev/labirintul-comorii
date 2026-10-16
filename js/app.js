// Navigarea între ecrane și legătura dintre editor, motor și salvare.
(function () {
  'use strict';

  var LEVELS = Levels.LEVELS;
  var WORLDS = Levels.WORLDS;

  var PRESETS = [
    { id: 'bufnita', name: 'Bufnița Eroică', src: 'assets/personaje/bufnita.png' },
    { id: 'robot', name: 'Robotul Bip', src: 'assets/personaje/robot.svg' },
    { id: 'pisica', name: 'Pisica Mia', src: 'assets/personaje/pisica.svg' },
    { id: 'dino', name: 'Dino', src: 'assets/personaje/dino.svg' },
    { id: 'albina', name: 'Albinuța Zumzi', src: 'assets/personaje/albina.svg' }
  ];
  var AVATAR_PX = 192;

  var profile = null;
  var game = null; // { level, mapIndex, map, editor, run }
  var preview = null; // { world } cât timp profesorul previzualizează o misiune

  function missionLabel(w) { return 'Misiunea ' + w.number; }
  function worldById(id) { return WORLDS.filter(function (w) { return w.id === id; })[0]; }

  function $(id) { return document.getElementById(id); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // ================= Utilitare =================
  function show(screenId) {
    qsa('.screen').forEach(function (s) { s.hidden = s.id !== screenId; });
    window.scrollTo(0, 0);
  }

  function avatarSrc(p) {
    var a = p && p.avatar;
    if (!a) return PRESETS[0].src;
    if (a.type === 'upload') return a.data || PRESETS[0].src; // pozele nu se trimit online
    var preset = PRESETS.filter(function (x) { return x.id === a.id; })[0];
    return (preset || PRESETS[0]).src;
  }

  function heroName(p) {
    var a = p && p.avatar;
    if (a && a.type === 'preset') {
      var preset = PRESETS.filter(function (x) { return x.id === a.id; })[0];
      if (preset) return preset.name;
    }
    return 'Eroul tău';
  }

  function fillKid() {
    qsa('.kid-name').forEach(function (el) { el.textContent = profile.name; });
    qsa('.kid-avatar').forEach(function (el) { el.src = avatarSrc(profile); });
  }

  function save() {
    if (preview) return; // previzualizarea profesorului nu se salvează
    if (!Store.saveProfile(profile)) {
      setGuide('Atenție: memoria browserului e plină, progresul nu s-a putut salva. Anunță profesorul.');
    }
  }

  // trimite progresul copilului online; dacă nu e internet, Cloud reîncearcă singur
  function syncProfile() {
    if (preview) return;
    Cloud.queue(profile.name).catch(function () {});
  }

  function starsHtml(n, total) {
    var s = '';
    for (var i = 0; i < (total || 3); i++) s += '<span class="star' + (i < n ? ' on' : '') + '">★</span>';
    return s;
  }

  function download(name, text, type) {
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) + ', ' +
      d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  }

  // ================= Fereastră mesaje =================
  function showModal(o) {
    $('modal').querySelector('.modal-card').className = 'modal-card' + (o.cls ? ' ' + o.cls : '');
    $('modal-art').innerHTML = o.art || '';
    $('modal-title').textContent = o.title || '';
    $('modal-body').innerHTML = o.body || '';
    var actions = $('modal-actions');
    actions.innerHTML = '';
    (o.actions || [{ label: 'Bine' }]).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.cls || 'btn-primary');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        $('modal').hidden = true;
        if (a.onClick) a.onClick();
      });
      actions.appendChild(b);
    });
    $('modal').hidden = false;
    actions.lastChild.focus();
  }

  // ================= Autentificare =================
  function showLogin() {
    stopRun();
    leaveTeacher();
    profile = null;
    Store.setCurrent(null);
    $('login-name').value = '';
    $('login-error').textContent = '';
    var all = Store.loadAll();
    var names = Object.keys(all).sort(function (a, b) {
      return (all[b].lastSeen || '').localeCompare(all[a].lastSeen || '');
    });
    var list = $('known-list');
    list.innerHTML = '';
    names.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'known';
      var img = document.createElement('img');
      img.src = avatarSrc(all[n]);
      img.alt = '';
      var span = document.createElement('span');
      span.textContent = n;
      b.appendChild(img);
      b.appendChild(span);
      b.addEventListener('click', function () { login(n); });
      list.appendChild(b);
    });
    $('known-wrap').hidden = !names.length;
    show('screen-login');
  }

  var loggingIn = false;

  function login(name) {
    if (loggingIn) return;
    profile = Store.getOrCreate(name);
    if (!Cloud.enabled) { enterGame(); return; }
    // aducem și progresul de pe alte calculatoare
    setLoggingIn(true);
    Cloud.pull(name).then(function (remote) {
      setLoggingIn(false);
      if (remote) {
        Store.mergeProfile(profile, remote);
        if (remote.worlds && remote.worlds.length) profile.worlds = remote.worlds.slice(); // lumile le deschide profesorul
      }
      enterGame();
    });
  }

  function setLoggingIn(on) {
    loggingIn = on;
    var btn = $('login-form').querySelector('button[type="submit"]');
    btn.disabled = on;
    btn.textContent = on ? 'Se încarcă…' : 'Intră în joc ▶';
  }

  function enterGame() {
    save();
    Store.setCurrent(profile.name);
    syncProfile();
    fillKid();
    if (!profile.avatar) showAvatar(); else showMap();
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = Store.normalizeName($('login-name').value);
    if (!name) {
      $('login-error').textContent = 'Scrie prenumele, un punct și prima literă a numelui de familie, de exemplu Ana.P';
      return;
    }
    login(name);
  });

  // ================= Alege personajul =================
  var pendingAvatar = null;

  function showAvatar() {
    pendingAvatar = profile.avatar;
    $('avatar-error').textContent = '';
    renderAvatarGrid();
    show('screen-avatar');
  }

  function renderAvatarGrid() {
    var grid = $('avatar-grid');
    grid.innerHTML = '';
    PRESETS.forEach(function (p) {
      grid.appendChild(avatarTile(p.src, p.name, pendingAvatar && pendingAvatar.type === 'preset' && pendingAvatar.id === p.id, function () {
        pendingAvatar = { type: 'preset', id: p.id };
        renderAvatarGrid();
      }));
    });
    var hasUpload = pendingAvatar && pendingAvatar.type === 'upload';
    var up = avatarTile(hasUpload ? pendingAvatar.data : null, hasUpload ? 'Poza mea (schimbă)' : 'Încarcă o poză', hasUpload, function () {
      $('avatar-file').click();
    });
    up.classList.add('upload');
    grid.appendChild(up);
    $('avatar-done').disabled = !pendingAvatar;
  }

  function avatarTile(src, label, selected, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'avatar-tile' + (selected ? ' selected' : '');
    var pic = document.createElement('div');
    pic.className = 'pic';
    if (src) {
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      pic.appendChild(img);
    } else {
      pic.textContent = '📷';
    }
    var cap = document.createElement('span');
    cap.textContent = label;
    b.appendChild(pic);
    b.appendChild(cap);
    b.addEventListener('click', onClick);
    return b;
  }

  // Micșorează imaginea în browser ca să încapă în localStorage.
  function resizeImage(file, done, fail) {
    var reader = new FileReader();
    reader.onerror = fail;
    reader.onload = function () {
      var img = new Image();
      img.onerror = fail;
      img.onload = function () {
        var scale = Math.min(AVATAR_PX / img.width, AVATAR_PX / img.height, 1);
        var w = Math.round(img.width * scale), hgt = Math.round(img.height * scale);
        var c = document.createElement('canvas');
        c.width = w;
        c.height = hgt;
        c.getContext('2d').drawImage(img, 0, 0, w, hgt);
        var data = c.toDataURL('image/webp', 0.85);
        if (data.indexOf('data:image/webp') !== 0) data = c.toDataURL('image/png');
        done(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  $('avatar-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      $('avatar-error').textContent = 'Alege o imagine (poză sau desen).';
      return;
    }
    $('avatar-error').textContent = '';
    resizeImage(file, function (data) {
      pendingAvatar = { type: 'upload', data: data };
      renderAvatarGrid();
    }, function () {
      $('avatar-error').textContent = 'Imaginea nu s-a putut deschide. Încearcă alta.';
    });
  });

  $('avatar-done').addEventListener('click', function () {
    profile.avatar = pendingAvatar;
    save();
    syncProfile();
    fillKid();
    showMap();
  });

  // ================= Harta nivelelor =================
  function worldAvailable(id) { return !!worldById(id).available; }

  function levelUnlocked(level) {
    if (!worldAvailable(level.world)) return false;
    if (preview) return true; // profesorul vede toate nivelele
    if (!Store.isWorldUnlocked(profile, level.world)) return false;
    var idx = LEVELS.indexOf(level);
    var prev = LEVELS[idx - 1];
    if (!prev || prev.world !== level.world) return true;
    return !!profile.progress[prev.id];
  }

  function showMap() {
    stopRun();
    fillKid();
    $('map-stars').textContent = Store.totalStars(profile);
    $('preview-bar').hidden = !preview;
    $('map-change-avatar').hidden = !!preview;
    $('map-logout').textContent = preview ? '← Panoul profesorului' : 'Ieșire';
    var box = $('worlds');
    box.innerHTML = '';
    WORLDS.forEach(function (w) {
      var levels = LEVELS.filter(function (l) { return l.world === w.id; });
      if (!w.available) return; // misiunile încă în lucru nu apar deloc pe hartă
      if (preview && w.id !== preview.world) return;
      if (!preview && !Store.isWorldUnlocked(profile, w.id)) return; // misiunile închise nu se văd până le deschide profesorul
      var done = levels.filter(function (l) { return profile.progress[l.id]; }).length;
      var stars = levels.reduce(function (s, l) { return s + ((profile.progress[l.id] || {}).stars || 0); }, 0);
      var sec = document.createElement('section');
      sec.className = 'world';
      sec.style.setProperty('--world', w.color);
      sec.innerHTML =
        '<div class="world-head"><span class="world-icon">' + w.icon + '</span>' +
        '<div class="world-title"><span class="eyebrow">' + missionLabel(w) + '</span><h2>' + w.name + '</h2><p>' + w.intro + '</p></div>' +
        '<div class="world-progress"><div class="wp-top"><span>' + done + ' din ' + levels.length + ' nivele</span>' +
        '<span class="wp-stars">★ ' + stars + '/' + levels.length * 3 + '</span></div>' +
        '<div class="bar"><span style="width:' + Math.round(done / levels.length * 100) + '%"></span></div></div></div>' +
        '<div class="level-grid"></div>';
      var grid = sec.querySelector('.level-grid');
      var current = true;
      levels.forEach(function (l) {
        var unlocked = levelUnlocked(l);
        var prog = profile.progress[l.id];
        var isNext = unlocked && !prog && current;
        if (isNext) current = false;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'level-btn' + (prog ? ' done' : '') + (unlocked ? '' : ' locked') + (isNext ? ' next' : '');
        b.disabled = !unlocked;
        b.innerHTML = '<span class="lvl-num">' + (unlocked ? l.id : '🔒') + '</span>' +
          '<span class="lvl-name">' + l.name + '</span>' +
          '<span class="lvl-stars">' + starsHtml(prog ? prog.stars : 0) + '</span>' +
          (isNext ? '<span class="lvl-tag">Joacă</span>' : '');
        b.addEventListener('click', function () { openLevel(l); });
        grid.appendChild(b);
      });
      box.appendChild(sec);
    });
    show('screen-map');
  }

  $('map-change-avatar').addEventListener('click', showAvatar);
  $('map-logout').addEventListener('click', function () {
    if (preview) exitPreview(); else showLogin();
  });

  // ================= Sunete =================
  // Generate direct în browser (Web Audio), fără fișiere audio.
  var audio = null;
  function audioCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audio) audio = new AC();
    if (audio.state === 'suspended') audio.resume();
    return audio;
  }

  // „Bonk” scurt: un ton grav care coboară, plus un mic zgomot de impact.
  function playBump() {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;

    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.22);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);

    var len = Math.floor(ctx.sampleRate * 0.08);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var noise = ctx.createBufferSource();
    var lp = ctx.createBiquadFilter();
    var ng = ctx.createGain();
    noise.buffer = buf;
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    ng.gain.value = 0.35;
    noise.connect(lp).connect(ng).connect(ctx.destination);
    noise.start(t);
  }

  function noiseBurst(ctx, t, dur, type, from, to, vol) {
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    var f = ctx.createBiquadFilter();
    var g = ctx.createGain();
    src.buffer = buf;
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }

  // „Ssss” de lavă: zgomot înalt care se stinge încet.
  function playSizzle() {
    var ctx = audioCtx();
    if (!ctx) return;
    noiseBurst(ctx, ctx.currentTime, 0.9, 'highpass', 2500, 5000, 0.25);
  }

  // „Pleosc” în apă: un bloop care urcă, plus stropi.
  function playSplash() {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.15);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
    noiseBurst(ctx, t + 0.05, 0.5, 'bandpass', 1800, 600, 0.3);
  }

  // Sirenă scurtă „ni-no, ni-no” pentru BUG DETECTAT.
  function playSiren() {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'square';
    for (var i = 0; i < 4; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t + i * 0.28);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    g.gain.setValueAtTime(0.12, t + 1.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.12);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.15);
  }

  // ================= Joc =================
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function setGuide(text, mood) {
    var g = $('guide-text');
    g.textContent = text;
    g.className = 'bubble' + (mood ? ' ' + mood : '');
  }

  function openLevel(level) {
    stopRun();
    var saved = profile.drafts[level.id] || (profile.progress[level.id] || {}).program || [];
    // programele salvate cu blocuri care nu mai sunt în nivel (de ex. rotirile scoase) nu se mai încarcă
    if (Object.keys(Engine.usedTypes(saved)).some(function (t) { return level.blocks.indexOf(t) < 0; })) saved = [];
    game = { level: level, mapIndex: 0, map: null, editor: null, run: null };
    var world = worldById(level.world);
    $('game-title').textContent = 'Nivelul ' + level.id + ' · ' + level.name;
    document.documentElement.style.setProperty('--world', world.color);
    var first = LEVELS.filter(function (l) { return l.world === level.world; })[0] === level;
    setGuide((first ? world.intro + ' ' : '') + level.hint);
    $('btn-solution').hidden = !preview;

    setPythonVisible(pythonVisible());
    // elemente noi la fiecare nivel, ca să nu se adune ascultătorii editorului anterior
    ['workspace', 'palette'].forEach(function (id) {
      var old = $(id);
      old.parentNode.replaceChild(old.cloneNode(false), old);
    });
    game.editor = Editor.create({
      workspace: $('workspace'),
      palette: $('palette'),
      blocks: level.blocks,
      maxBlocks: level.maxBlocks,
      program: clone(saved),
      onChange: function (prog) {
        profile.drafts[level.id] = clone(prog);
        save();
        if (!game.run) resetHero();
      },
      onRender: function (n, max, prog) {
        game.bugId = null; // programul s-a schimbat, marcajul greșelii nu mai e valabil
        updateCount(n);
        renderPython(prog);
      },
      onLimit: function () {
        setGuide('Ai folosit toate blocurile. Poți scrie programul mai scurt, cu o buclă?', 'warn');
        var c = $('block-count');
        c.classList.remove('shake');
        void c.offsetWidth;
        c.classList.add('shake');
      }
    });
    show('screen-game'); // întâi afișăm ecranul, ca tabla să-și poată măsura lățimea
    loadMap(0);
  }

  // ---------- Codul Python ----------
  var PY_KEY = 'labirint.showPython';

  function pythonVisible() {
    try { return localStorage.getItem(PY_KEY) === '1'; } catch (e) { return false; }
  }

  function setPythonVisible(on) {
    try { localStorage.setItem(PY_KEY, on ? '1' : '0'); } catch (e) { /* doar pentru sesiunea curentă */ }
    $('py-panel').hidden = !on;
    $('btn-python').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('btn-python').classList.toggle('on', on);
    if (on && game && game.editor) renderPython(game.editor.getProgram());
  }

  // harta curentă: de unde pornește personajul, încotro privește, unde e comoara
  function pythonContext() {
    if (!game || !game.map) return null;
    return { map: game.map, grid: game.level.maps[game.mapIndex].grid, dir: game.dir, blocks: game.level.blocks };
  }

  function renderPython(prog) {
    if ($('py-panel').hidden || !game || !game.map) return;
    $('py-code').innerHTML = Python.toHtml(prog, pythonContext());
    markPythonError(game.bugId);
  }

  // blocul cu id-ul dat, căutat și în interiorul buclelor
  function findBlock(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
      var n = list[i];
      if (n.id === id) return n;
      var inner = findBlock(n.body, id) || findBlock(n.else, id);
      if (inner) return inner;
    }
    return null;
  }

  // cea mai apropiată buclă care conține blocul dat; blocul însuși dacă nu e într-o buclă
  function innerLoop(list, id, loopId) {
    for (var i = 0; i < (list || []).length; i++) {
      var n = list[i];
      if (n.id === id) return loopId || id;
      if (!n.body) continue;
      var found = innerLoop(n.body, id, n.id) || innerLoop(n.else, id, n.id);
      if (found) return found;
    }
    return null;
  }

  function blockIds(node, out) {
    out.push(node.id);
    (node.body || []).concat(node.else || []).forEach(function (n) { blockIds(n, out); });
    return out;
  }

  function markPythonError(id) {
    if ($('py-panel').hidden) return;
    qsa('#py-code .py-line.err').forEach(function (l) { l.classList.remove('err'); });
    var node = id && findBlock(game.editor.getProgram(), id);
    if (!node) return;
    // o buclă se marchează cu tot cu liniile din interiorul ei
    var lines = [];
    blockIds(node, []).forEach(function (bid) {
      lines = lines.concat(qsa('#py-code .py-line[data-id="' + bid + '"]'));
    });
    lines.forEach(function (l) { l.classList.add('err'); });
    if (lines[0]) lines[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function highlightPython(id) {
    if ($('py-panel').hidden) return;
    qsa('#py-code .py-line.running').forEach(function (l) { l.classList.remove('running'); });
    if (!id) return;
    var lines = qsa('#py-code .py-line[data-id="' + id + '"]');
    lines.forEach(function (l) { l.classList.add('running'); });
    if (lines[0]) lines[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  $('btn-python').addEventListener('click', function () { setPythonVisible($('py-panel').hidden); });

  $('py-copy').addEventListener('click', function () {
    var btn = $('py-copy');
    var text = Python.toText(game.editor.getProgram(), pythonContext());
    var done = function () { btn.textContent = 'Copiat ✓'; setTimeout(function () { btn.textContent = 'Copiază'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = 'Nu s-a putut copia'; });
    }
  });

  // arătăm doar câte blocuri are programul, fără limită sau țintă, ca să nu dăm soluția
  function updateCount(n) {
    $('block-count').innerHTML = 'Blocuri: <b>' + n + '</b>';
  }

  function renderMapTabs() {
    var tabs = $('map-tabs');
    var maps = game.level.maps;
    tabs.hidden = maps.length < 2;
    tabs.innerHTML = maps.map(function (m, i) {
      return '<span class="map-tab' + (i === game.mapIndex ? ' on' : '') + '">Harta ' + (i + 1) + '</span>';
    }).join('');
  }

  function loadMap(i) {
    game.mapIndex = i;
    var m = game.level.maps[i];
    game.map = Engine.parseGrid(m.grid);
    game.dir = m.dir;
    renderMapTabs();
    renderBoard();
    if (game.editor) renderPython(game.editor.getProgram());
  }

  function cellSize() {
    var wrap = $('board-wrap');
    var w = wrap.clientWidth - 20; // minus marginea interioară a tablei
    var maxH = Math.max(220, window.innerHeight * 0.52);
    return Math.max(24, Math.floor(Math.min(w / game.map.cols, maxH / game.map.rows, 68)));
  }

  // obstacolele de pe hartă (vezi levels.js)
  var CELL_CLASS = { P: ' rock', L: ' lava', A: ' water', B: ' bridge' };

  function renderBoard() {
    var map = game.map;
    var size = cellSize();
    game.cell = size;
    var board = $('board');
    board.style.setProperty('--cell', size + 'px');
    board.style.gridTemplateColumns = 'repeat(' + map.cols + ', var(--cell))';
    board.innerHTML = '';
    for (var r = 0; r < map.rows; r++) {
      for (var c = 0; c < map.cols; c++) {
        var ch = map.cells[r][c];
        var cell = document.createElement('div');
        cell.className = 'cell ' + (ch === '#' ? 'wall w' + ((r * 7 + c * 3) % 3) : 'path' + (CELL_CLASS[ch] || ''));
        cell.dataset.rc = r + ',' + c;
        if (ch === 'L' || ch === 'A') cell.style.setProperty('--d', -((r * 5 + c * 3) % 7) * 0.3 + 's');
        if (ch === 'T') {
          cell.classList.add('treasure');
          cell.innerHTML = '<img src="assets/comoara.svg" alt="Comoara">';
        }
        if (r === map.start.r && c === map.start.c) cell.classList.add('start');
        board.appendChild(cell);
      }
    }
    var hero = document.createElement('div');
    hero.id = 'hero';
    hero.className = 'hero';
    hero.innerHTML = '<div class="hero-arrow"></div><div class="hero-body"><img alt=""></div>';
    hero.querySelector('img').src = avatarSrc(profile);
    board.appendChild(hero);
    resetHero();
  }

  function placeHero(r, c, dir, instant) {
    var hero = $('hero');
    if (!hero) return;
    if (instant) hero.style.transition = 'none';
    hero.style.transform = 'translate(' + c * game.cell + 'px,' + r * game.cell + 'px)';
    hero.querySelector('.hero-arrow').style.transform = 'rotate(' + dir * 90 + 'deg)';
    hero.classList.toggle('face-left', dir === 3);
    if (instant) { void hero.offsetWidth; hero.style.transition = ''; }
    game.heroDir = dir;
  }

  function resetHero() {
    clearTimeout(game.fallTimer);
    qsa('#board .trail, #board .bumped, #board .splash').forEach(function (c) { c.classList.remove('trail', 'bumped', 'splash'); });
    var hero = $('hero');
    if (hero) hero.classList.remove('bump', 'happy', 'fall', 'fall-lava', 'fall-water');
    placeHero(game.map.start.r, game.map.start.c, game.dir, true);
    markTrail(game.map.start.r, game.map.start.c);
  }

  function markTrail(r, c) {
    var cell = document.querySelector('#board [data-rc="' + r + ',' + c + '"]');
    if (cell) cell.classList.add('trail');
  }

  function speed() {
    var on = document.querySelector('#speed .on');
    return Number(on ? on.dataset.ms : 380);
  }

  function setRunning(on) {
    game.editor.setEnabled(!on);
    $('btn-clear').disabled = on;
    document.querySelector('.game').classList.toggle('running', on);
  }

  function startRun() {
    var prog = game.editor.getProgram();
    if (!prog.length) {
      setGuide('Programul e gol. Atinge comenzile din stânga ca să le pui în program.', 'warn');
      return false;
    }
    resetHero();
    game.bugId = null;
    game.editor.markError(null);
    markPythonError(null);
    var st = Engine.newState(game.map, game.dir);
    game.run = { st: st, gen: Engine.run(prog, st), timer: null, auto: false };
    $('hero').style.setProperty('--speed', Math.min(speed() * 0.85, 420) + 'ms');
    setRunning(true);
    setGuide('Urmărește blocul evidențiat: asta face ' + heroName(profile) + ' acum.');
    return true;
  }

  function stopRun() {
    if (game && game.run) {
      clearTimeout(game.run.timer);
      game.run = null;
      game.editor.highlight(null);
      highlightPython(null);
      setRunning(false);
    }
  }

  function stepOnce() {
    var run = game.run;
    if (!run) return;
    var res = run.gen.next();
    if (res.done) { finishRun(); return; }
    var ev = res.value;
    var st = run.st;
    run.lastId = ev.id;
    game.editor.highlight(ev.id);
    highlightPython(ev.id);
    if (ev.kind === 'move' || ev.kind === 'win') {
      placeHero(st.r, st.c, st.dir);
      markTrail(st.r, st.c);
    } else if (ev.kind === 'turn') {
      placeHero(st.r, st.c, st.dir);
    } else if (ev.kind === 'check' && ev.result !== undefined) {
      game.editor.flash(ev.id, ev.result ? 'check-yes' : 'check-no');
    } else if (ev.kind === 'bump') {
      placeHero(st.r, st.c, st.dir);
      bumpHero(ev);
    } else if (ev.kind === 'fall') {
      placeHero(st.r, st.c, st.dir);
      fallHero(ev.hazard, st.r, st.c);
    }
    if (st.won || st.failed) {
      clearTimeout(run.timer);
      run.timer = setTimeout(finishRun, ev.kind === 'win' ? speed() + 150 : speed());
      return;
    }
    // verificările buclelor trec mai repede decât pașii, ca să nu plictisească
    var wait = ev.kind !== 'check' ? speed() : speed() * (ev.result === undefined ? 0.3 : 0.7);
    if (run.auto) run.timer = setTimeout(stepOnce, wait);
  }

  function bumpHero(ev) {
    playBump();
    var hero = $('hero');
    hero.style.setProperty('--bx', Engine.DC[game.run.st.dir] * game.cell * 0.28 + 'px');
    hero.style.setProperty('--by', Engine.DR[game.run.st.dir] * game.cell * 0.28 + 'px');
    hero.classList.remove('bump');
    void hero.offsetWidth;
    hero.classList.add('bump');
    var cell = document.querySelector('#board [data-rc="' + ev.r + ',' + ev.c + '"]');
    if (cell) cell.classList.add('bumped');
  }

  // eroul calcă în lavă sau în apă: se scufundă, cu sfârâit sau plescăit
  function fallHero(hazard, r, c) {
    var hero = $('hero');
    clearTimeout(game.fallTimer);
    game.fallTimer = setTimeout(function () {
      if (hazard === 'lava') playSizzle(); else playSplash();
      hero.classList.add('fall', 'fall-' + hazard);
      var cell = document.querySelector('#board [data-rc="' + r + ',' + c + '"]');
      if (cell) cell.classList.add('splash');
    }, speed() * 0.6);
  }

  function finishRun() {
    var run = game.run;
    if (!run) return;
    var st = run.st;
    game.run = null;
    setRunning(false);
    game.editor.highlight(null);
    highlightPython(null);

    if (st.won) {
      $('hero').classList.add('happy');
      if (game.mapIndex < game.level.maps.length - 1) {
        setGuide('Bravo! Acum încercăm același program pe harta ' + (game.mapIndex + 2) + '...', 'good');
        setTimeout(function () {
          if (!game || game.run) return;
          loadMap(game.mapIndex + 1);
          if (startRun()) { game.run.auto = true; stepOnce(); }
        }, 1100);
        return;
      }
      levelWon();
      return;
    }
    // în Misiunea 2 copilul urmărește personajul și își dă seama singur unde a greșit;
    // de la Misiunea 3 încolo, programele sunt mai lungi, așa că „Caut greșeala” îl duce la bloc.
    // În Misiunea 3 arătăm doar bucla în care e greșeala; pasul exact îl găsește copilul.
    var mission = worldById(game.level.world).number;
    var bugId = mission >= 3 ? run.lastId : null;
    if (mission === 3 && bugId) bugId = innerLoop(game.editor.getProgram(), bugId) || bugId;
    var why;
    if (st.failed === 'bump') {
      var what = st.bumped === 'P' ? 'un bolovan' : 'zid';
      why = heroName(profile) + ' s-a lovit de ' + what + '.';
      setGuide('Au! ' + heroName(profile) + ' s-a lovit de ' + what + '. Schimbă programul și încearcă din nou.', 'bad');
    } else if (st.failed === 'hazard') {
      var where = st.hazard === 'lava' ? 'în lavă' : 'în apă';
      why = heroName(profile) + ' a călcat ' + where + '.';
      setGuide((st.hazard === 'lava' ? 'Au, frige! ' : 'Pleosc! ') + heroName(profile) + ' a călcat ' + where +
        '. Găsește un drum care ocolește obstacolele.', 'bad');
    } else if (st.failed === 'limit') {
      why = 'Programul nu se mai termina, așa că l-am oprit.';
      setGuide('Programul pare că nu se mai termină, așa că l-am oprit. Verifică ce se întâmplă în bucle.', 'bad');
    } else {
      why = 'Programul s-a terminat, dar ' + heroName(profile) + ' n-a ajuns la comoară.';
      setGuide('Programul s-a terminat, dar comoara e încă departe. Mai adaugă comenzi!', 'warn');
    }
    // lăsăm întâi copilul să vadă unde s-a oprit personajul, apoi pornește girofarul
    var level = game.level;
    setTimeout(function () {
      if (!game || game.run || game.level !== level) return;
      showBug(why, bugId);
    }, st.failed === 'hazard' ? 1100 : 500);
  }

  function showBug(why, bugId) {
    playSiren();
    var p = document.createElement('p');
    p.textContent = why;
    showModal({
      cls: 'modal-bug',
      art: '<div class="beacon" aria-hidden="true"><div class="beacon-beam"></div>' +
        '<div class="beacon-dome"></div><div class="beacon-base"></div></div>',
      title: 'BUG DETECTAT!',
      body: p.outerHTML + '<p class="bug-hint">Caută greșeala în program și repar-o!</p>',
      actions: [{ label: 'Caut greșeala 🔍', cls: 'btn-danger', onClick: function () {
        if (!bugId || !game) return;
        game.bugId = bugId;
        game.editor.markError(bugId);
        markPythonError(bugId);
      } }]
    });
  }

  function levelWon() {
    var level = game.level;
    var prog = game.editor.getProgram();
    var blocks = Engine.countBlocks(prog);
    var stars = blocks <= level.optimal ? 3 : (blocks <= level.optimal + 2 ? 2 : 1);
    var wasDone = !!profile.progress[level.id];
    Store.recordWin(profile, level.id, stars, blocks, clone(prog));
    save();
    syncProfile();
    setGuide('Ai găsit comoara! 🎉', 'good');

    var idx = LEVELS.indexOf(level);
    var next = LEVELS[idx + 1];
    var body = '<div class="big-stars">' + starsHtml(stars) + '</div>';
    if (stars < 3) {
      body += '<p>Ai folosit ' + blocks + ' blocuri. Poți lua 3 stele cu un program mai scurt. Încerci?</p>';
    } else {
      body += '<p>Program perfect, cu doar ' + blocks + ' blocuri!</p>';
    }
    var actions = [{ label: 'Mai încerc', cls: 'btn-ghost', onClick: resetHero },
      { label: 'Harta', cls: 'btn-ghost', onClick: showMap }];

    var mission = missionLabel(worldById(level.world));
    if (next && next.world !== level.world &&
        (preview || !worldAvailable(next.world) || !Store.isWorldUnlocked(profile, next.world))) {
      body += '<p class="world-done">Ai terminat ' + mission + '! Ești un adevărat Erou Isteț! 🏆</p>';
    } else if (next) {
      actions.push({ label: 'Nivelul următor ▶', cls: 'btn-primary', onClick: function () { openLevel(next); } });
    } else {
      body += '<p class="world-done">Ai terminat toate nivelele! Ești un adevărat Erou Isteț! 🏆</p>';
    }
    showModal({
      art: '<img src="assets/comoara.svg" alt="" class="modal-chest">',
      title: wasDone ? 'Bravo, din nou!' : 'Comoara e a ta!',
      body: body,
      actions: actions
    });
  }

  $('btn-run').addEventListener('click', function () {
    audioCtx(); // pornește sunetul la click, altfel unele browsere (Safari) îl blochează
    if (!game.run && !startRun()) return;
    game.run.auto = true;
    clearTimeout(game.run.timer);
    stepOnce();
  });

  $('btn-step').addEventListener('click', function () {
    audioCtx();
    if (!game.run) {
      if (!startRun()) return;
    } else {
      game.run.auto = false;
      clearTimeout(game.run.timer);
    }
    stepOnce();
  });

  $('btn-reset').addEventListener('click', function () {
    stopRun();
    if (game.mapIndex !== 0) loadMap(0); else resetHero();
    setGuide(game.level.hint);
  });

  // doar în previzualizare: profesorul vede o soluție scurtă (cu cele mai puține blocuri)
  $('btn-solution').addEventListener('click', function () {
    stopRun();
    game.editor.setProgram(Engine.fromCompact(game.level.solution));
    setGuide('O soluție cu ' + game.level.optimal + ' blocuri (3 stele). Apasă „Pornește” ca s-o vezi.', 'good');
  });

  $('btn-clear').addEventListener('click', function () {
    if (!game.editor.count()) return;
    showModal({
      title: 'Ștergi tot programul?',
      actions: [{ label: 'Nu', cls: 'btn-ghost' }, { label: 'Da, șterge', cls: 'btn-danger', onClick: function () { game.editor.clear(); } }]
    });
  });

  $('speed').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    qsa('#speed button').forEach(function (x) {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
    var hero = $('hero');
    if (hero) hero.style.setProperty('--speed', Math.min(speed() * 0.85, 420) + 'ms');
  });

  $('game-back').addEventListener('click', showMap);

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!game || $('screen-game').hidden) return;
      var size = cellSize();
      if (size === game.cell) return;
      game.cell = size;
      $('board').style.setProperty('--cell', size + 'px');
      var st = game.run ? game.run.st : null;
      if (st) placeHero(st.r, st.c, st.dir, true);
      else resetHero();
    }, 150);
  });

  // ================= Panou profesor =================
  // Se deschide doar din adresa site-ului cu #profesor la final; pe ecranul copiilor nu există buton.
  var TEACHER_HASH = '#profesor';
  var pinMode = 'enter'; // enter | setup | change
  var teacherPw = null;  // parola online, ținută doar cât e deschis panoul
  var teacherData = {};

  // De unde vin datele: online (toate calculatoarele) sau doar din acest browser.
  var Teacher = Cloud.enabled ? {
    list: function () { return Cloud.teacher.list(teacherPw); },
    setWorld: function (name, worldId, open) { return Cloud.teacher.setWorld(teacherPw, name, worldId, open); },
    remove: function (name) {
      Store.deleteProfile(name); // altfel s-ar trimite din nou de pe acest calculator
      return Cloud.teacher.remove(teacherPw, name);
    }
  } : {
    list: function () { return Promise.resolve(Store.loadAll()); },
    setWorld: function (name, worldId, open) {
      (name ? [name] : Object.keys(Store.loadAll())).forEach(function (n) {
        var prof = Store.getProfile(n);
        Store.setWorld(prof, worldId, open);
        Store.saveProfile(prof);
      });
      return Promise.resolve();
    },
    remove: function (name) { Store.deleteProfile(name); return Promise.resolve(); }
  };

  function showTeacher() {
    stopRun();
    teacherPw = null;
    pinMode = Cloud.enabled || Store.hasPin() ? 'enter' : 'setup';
    preparePin();
    $('teacher-content').hidden = true;
    $('t-change-pin').textContent = Cloud.enabled ? 'Schimbă parola' : 'Schimbă PIN';
    $('t-refresh').hidden = !Cloud.enabled;
    $('teacher-note').textContent = Cloud.enabled
      ? 'Rezultatele sunt centralizate online, de pe toate calculatoarele. Pozele încărcate de copii rămân doar pe calculatorul lor.'
      : 'Datele sunt salvate doar în acest browser, pe acest calculator. Folosește „Backup JSON” și „Import JSON” ca să aduni progresul de pe mai multe calculatoare.';
    show('screen-teacher');
    $('pin-1').focus();
  }

  function leaveTeacher() {
    teacherPw = null;
    teacherData = {};
    if (location.hash === TEACHER_HASH) history.replaceState(null, '', location.pathname + location.search);
  }

  function preparePin() {
    $('pin-form').hidden = false;
    $('pin-error').textContent = '';
    var setup = pinMode !== 'enter';
    ['pin-1', 'pin-2'].forEach(function (id) {
      var input = $(id);
      input.value = '';
      if (Cloud.enabled) {
        input.removeAttribute('inputmode');
        input.removeAttribute('pattern');
        input.maxLength = 64;
      }
    });
    $('pin-2').hidden = !setup;
    if (Cloud.enabled) {
      $('pin-1').placeholder = 'Parola';
      $('pin-2').placeholder = 'Repetă parola';
      $('pin-title').textContent = setup ? 'Parolă nouă' : 'Parola profesorului';
      $('pin-help').textContent = setup
        ? 'Cel puțin 8 caractere. Va fi noua parolă pe toate calculatoarele.'
        : 'Scrie parola ca să vezi rezultatele tuturor copiilor.';
      return;
    }
    $('pin-title').textContent = pinMode === 'change' ? 'PIN nou' : (setup ? 'Alege un PIN de profesor' : 'PIN profesor');
    $('pin-help').textContent = setup
      ? 'Alege un PIN de 4–8 cifre. Îl vei folosi ca să intri în acest panou pe acest calculator.'
      : 'Scrie PIN-ul ca să vezi progresul copiilor.';
  }

  function setPinBusy(on) {
    var btn = $('pin-form').querySelector('button[type="submit"]');
    btn.disabled = on;
    btn.textContent = on ? 'Se încarcă…' : 'Continuă';
  }

  $('pin-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var p1 = $('pin-1').value.trim(), p2 = $('pin-2').value.trim();
    if (Cloud.enabled) { submitPassword(p1, p2); return; }
    if (pinMode === 'enter') {
      if (!Store.checkPin(p1)) { $('pin-error').textContent = 'PIN greșit.'; $('pin-1').value = ''; return; }
    } else {
      if (!/^\d{4,8}$/.test(p1)) { $('pin-error').textContent = 'PIN-ul trebuie să aibă 4–8 cifre.'; return; }
      if (p1 !== p2) { $('pin-error').textContent = 'Cele două PIN-uri nu sunt la fel.'; return; }
      Store.setPin(p1);
      if (pinMode === 'change') teacherMsg('PIN-ul a fost schimbat.');
    }
    loadTeacher();
  });

  function submitPassword(p1, p2) {
    if (pinMode !== 'change') {
      if (!p1) return;
      teacherPw = p1;
      setPinBusy(true);
      loadTeacher().then(function () { setPinBusy(false); });
      return;
    }
    if (p1.length < 8) { $('pin-error').textContent = 'Parola trebuie să aibă cel puțin 8 caractere.'; return; }
    if (p1 !== p2) { $('pin-error').textContent = 'Cele două parole nu sunt la fel.'; return; }
    setPinBusy(true);
    Cloud.teacher.changePassword(teacherPw, p1).then(function () {
      setPinBusy(false);
      teacherPw = p1;
      teacherMsg('Parola a fost schimbată.');
      loadTeacher();
    }, function (err) {
      setPinBusy(false);
      $('pin-error').textContent = 'Parola nu s-a putut schimba: ' + err.message;
    });
  }

  var OFFLINE_MSG = 'Nu mă pot conecta la baza de date. Verifică internetul și încearcă din nou.';

  // Citește copiii și afișează tabelul; dacă parola e greșită, revine la formular.
  function loadTeacher() {
    return Teacher.list().then(function (data) {
      teacherData = data || {};
      $('pin-form').hidden = true;
      $('teacher-content').hidden = false;
      renderTeacher();
    }, function (err) {
      if (Cloud.isWrongPassword(err)) {
        teacherPw = null;
        pinMode = 'enter';
        preparePin();
        $('teacher-content').hidden = true;
        $('pin-error').textContent = 'Parolă greșită.';
        $('pin-1').focus();
      } else if ($('teacher-content').hidden) {
        $('pin-error').textContent = OFFLINE_MSG;
      } else {
        teacherMsg(OFFLINE_MSG);
      }
    });
  }

  // rulează o schimbare, apoi reîncarcă tabelul
  function teacherAction(promise, okMsg) {
    promise.then(function () {
      teacherMsg(okMsg);
      loadTeacher();
    }, function () { teacherMsg(OFFLINE_MSG); });
  }

  function teacherMsg(text) { $('teacher-msg').textContent = text; }

  function highestLevel(p) {
    var best = null;
    LEVELS.forEach(function (l) { if (p.progress[l.id]) best = l; });
    return best;
  }

  // Misiunile: profesorul poate previzualiza fiecare misiune și o poate deschide pentru toată clasa.
  function renderMissions(names) {
    var box = $('missions');
    box.innerHTML = '';
    WORLDS.filter(function (w) { return w.available; }).forEach(function (w) {
      var levels = LEVELS.filter(function (l) { return l.world === w.id; });
      var openFor = names.filter(function (n) { return Store.isWorldUnlocked(teacherData[n], w.id); }).length;
      var allOpen = w.id === 1 || (names.length > 0 && openFor === names.length);
      var card = document.createElement('div');
      card.className = 'mission-card';
      card.style.setProperty('--world', w.color);
      card.innerHTML =
        '<span class="world-icon">' + w.icon + '</span>' +
        '<div class="mission-info"><span class="eyebrow">' + missionLabel(w) + '</span><h4></h4>' +
        '<p class="mission-status"></p></div><div class="mission-actions"></div>';
      card.querySelector('h4').textContent = w.name;
      card.querySelector('.mission-status').textContent = levels.length + ' nivele · ' + (w.id === 1
        ? 'deschisă pentru toți'
        : (allOpen ? 'deschisă pentru toți' : (openFor ? 'deschisă pentru ' + openFor + ' din ' + names.length + ' copii' : 'închisă')));
      card.classList.toggle('open', allOpen);
      var actions = card.querySelector('.mission-actions');
      actions.appendChild(teacherButton('👁 Previzualizează', 'btn-ghost', function () { startPreview(w.id); }));
      if (w.id !== 1) {
        actions.appendChild(allOpen
          ? teacherButton('🔒 Închide pentru toți', 'btn-ghost', function () { bulkWorld(w.id, false); })
          : teacherButton('🔓 Deblochează pentru toți', 'btn-primary', function () { bulkWorld(w.id, true); }));
      }
      box.appendChild(card);
    });
    // următoarea misiune încă nu e gata: o arătăm doar ca să se știe că urmează
    var nextUp = WORLDS.filter(function (w) { return !w.available; })[0];
    if (nextUp) {
      var soon = document.createElement('div');
      soon.className = 'mission-card soon';
      soon.innerHTML = '<span class="world-icon">🔒</span><div class="mission-info"><span class="eyebrow">' +
        missionLabel(nextUp) + '</span><h4>În pregătire</h4>' +
        '<p class="mission-status">Când e gata, o poți previzualiza și debloca de aici.</p></div>';
      box.appendChild(soon);
    }
  }

  function teacherButton(label, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // Ordinea din tabel: implicit după ultima dată (cei mai recenți sus); un clic pe antet schimbă criteriul,
  // al doilea clic pe același antet inversează ordinea.
  var SORT_KEY = 'labirint.teacherSort';
  var SORT_DEFAULT_DIR = { name: 1, level: -1, stars: -1, worlds: -1, date: -1 };
  var teacherSort = (function () {
    try {
      var s = JSON.parse(localStorage.getItem(SORT_KEY));
      if (s && SORT_DEFAULT_DIR[s.by] && (s.dir === 1 || s.dir === -1)) return s;
    } catch (e) { /* ordinea implicită */ }
    return { by: 'date', dir: -1 };
  })();

  function sortValue(p, n, by) {
    if (by === 'name') return n;
    if (by === 'level') { var best = highestLevel(p); return (best ? best.id : 0) * 1000 + Object.keys(p.progress).length; }
    if (by === 'stars') return Store.totalStars(p);
    if (by === 'worlds') return p.worlds.length;
    return p.lastSeen || '';
  }

  function sortedNames(all) {
    var by = teacherSort.by, dir = teacherSort.dir;
    return Object.keys(all).sort(function (a, b) {
      var va = sortValue(all[a], a, by), vb = sortValue(all[b], b, by);
      var c = typeof va === 'string' ? va.localeCompare(vb, 'ro') : va - vb;
      return c * dir || a.localeCompare(b, 'ro');
    });
  }

  function renderSortHeaders() {
    qsa('#kids-table th[data-sort]').forEach(function (th) {
      var on = th.dataset.sort === teacherSort.by;
      th.classList.toggle('sorted', on);
      th.setAttribute('aria-sort', on ? (teacherSort.dir === 1 ? 'ascending' : 'descending') : 'none');
      th.querySelector('.th-sort').dataset.arrow = on ? (teacherSort.dir === 1 ? '▲' : '▼') : '';
    });
  }

  qsa('#kids-table th[data-sort] .th-sort').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var by = btn.parentNode.dataset.sort;
      teacherSort = by === teacherSort.by ? { by: by, dir: -teacherSort.dir } : { by: by, dir: SORT_DEFAULT_DIR[by] };
      try { localStorage.setItem(SORT_KEY, JSON.stringify(teacherSort)); } catch (e) { /* doar pentru sesiunea curentă */ }
      renderTeacher();
    });
  });

  function renderTeacher() {
    var all = teacherData;
    var names = sortedNames(all);
    renderSortHeaders();

    var multiWorld = WORLDS.filter(function (w) { return w.available; }).length > 1;
    $('kids-table').classList.toggle('single-world', !multiWorld);
    renderMissions(names);

    var body = $('kids-body');
    body.innerHTML = '';
    if (!names.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">' +
        (Cloud.enabled ? 'Încă nu a intrat niciun copil.' : 'Încă nu a intrat niciun copil pe acest calculator.') + '</td></tr>';
      return;
    }
    names.forEach(function (n) {
      var p = all[n];
      var best = highestLevel(p);
      var done = Object.keys(p.progress).length;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="kid-cell"><img alt=""><span></span></div></td>' +
        '<td>' + (best ? 'Nivelul ' + best.id + ' <small>(' + missionLabel(worldById(best.world)) + ', ' + done + ' terminate)</small>' : '—') + '</td>' +
        '<td>' + Store.totalStars(p) + '</td>' +
        '<td><div class="world-toggles"></div></td>' +
        '<td>' + formatDate(p.lastSeen) + '</td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm del-kid" aria-label="Șterge profilul">🗑</button></td>';
      tr.querySelector('img').src = avatarSrc(p);
      tr.querySelector('.kid-cell span').textContent = n;
      var toggles = tr.querySelector('.world-toggles');
      WORLDS.filter(function (w) { return w.available; }).forEach(function (w) {
        var on = Store.isWorldUnlocked(p, w.id);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wt' + (on ? ' on' : '');
        b.style.setProperty('--world', w.color);
        b.textContent = (on ? '🔓 ' : '🔒 ') + w.number;
        b.title = (on ? 'Închide' : 'Deschide') + ' ' + missionLabel(w) + ' pentru ' + n;
        b.disabled = w.id === 1;
        b.addEventListener('click', function () {
          teacherAction(Teacher.setWorld(n, w.id, !on),
            missionLabel(w) + ' a fost ' + (on ? 'închisă' : 'deschisă') + ' pentru ' + n + '.');
        });
        toggles.appendChild(b);
      });
      tr.querySelector('.del-kid').addEventListener('click', function () {
        showModal({
          title: 'Ștergi profilul ' + n + '?',
          body: Cloud.enabled
            ? '<p>Se pierd toate rezultatele acestui copil, de pe toate calculatoarele.</p>'
            : '<p>Se pierd personajul și progresul acestui copil de pe acest calculator.</p>',
          actions: [{ label: 'Nu', cls: 'btn-ghost' }, { label: 'Da, șterge', cls: 'btn-danger', onClick: function () {
            teacherAction(Teacher.remove(n), 'Profilul ' + n + ' a fost șters.');
          } }]
        });
      });
      body.appendChild(tr);
    });
  }

  function bulkWorld(worldId, unlocked) {
    var count = Object.keys(teacherData).length;
    teacherAction(Teacher.setWorld(null, worldId, unlocked),
      missionLabel(worldById(worldId)) + ' a fost ' + (unlocked ? 'deschisă' : 'închisă') + ' pentru ' + count + ' copii.');
  }

  // ---------- Previzualizare ----------
  // Profesorul joacă misiunea ca un copil, cu toate nivelele deschise; nimic nu se salvează sau trimite online.
  function startPreview(worldId) {
    preview = { world: worldId };
    profile = {
      name: 'Profesor', avatar: { type: 'preset', id: 'bufnita' }, progress: {}, drafts: {},
      worlds: WORLDS.map(function (w) { return w.id; })
    };
    showMap();
  }

  function exitPreview() {
    stopRun();
    preview = null;
    profile = null;
    game = null;
    show('screen-teacher');
  }

  function csvCell(v) {
    var s = String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  $('t-export-csv').addEventListener('click', function () {
    var all = teacherData;
    var rows = [['Copil', 'Nivel atins', 'Nivele terminate', 'Stele', 'Misiuni deschise', 'Ultima activitate']];
    sortedNames(all).forEach(function (n) {
      var p = all[n];
      var best = highestLevel(p);
      rows.push([n, best ? best.id : 0, Object.keys(p.progress).length, Store.totalStars(p),
        p.worlds.map(function (id) { var w = worldById(id); return w ? w.number : id; }).join(' '), formatDate(p.lastSeen)]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    download('labirint-progres-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
  });

  $('t-export-json').addEventListener('click', function () {
    download('labirint-backup-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJSON(teacherData), 'application/json');
  });

  $('t-import').addEventListener('click', function () { $('t-import-file').click(); });
  $('t-import-file').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var r;
      try {
        r = Store.importJSON(reader.result);
      } catch (err) {
        teacherMsg('Importul nu a reușit: ' + err.message);
        return;
      }
      var msg = 'Import reușit: ' + r.added + ' copii noi, ' + r.merged + ' actualizați.';
      // online: profilurile importate pleacă din acest browser spre baza de date
      teacherAction(Cloud.queue(r.names), msg);
    };
    reader.readAsText(file);
  });

  $('t-refresh').addEventListener('click', function () {
    teacherMsg('');
    loadTeacher();
  });

  $('t-change-pin').addEventListener('click', function () {
    pinMode = 'change';
    preparePin();
    $('teacher-content').hidden = true;
    $('pin-1').focus();
  });

  $('teacher-back').addEventListener('click', showLogin);

  window.addEventListener('hashchange', function () {
    if (location.hash === TEACHER_HASH) showTeacher();
    else if (!$('screen-teacher').hidden) showLogin();
  });

  // ================= Pornire =================
  var openTeacher = location.hash === TEACHER_HASH; // showLogin() șterge #profesor din adresă
  showLogin();
  if (openTeacher) showTeacher();
})();
