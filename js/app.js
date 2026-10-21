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
  // numărul afișat al nivelului = poziția lui pe hartă (id-ul rămâne fix pentru progresul salvat)
  function levelNo(l) { return LEVELS.indexOf(l) + 1; }
  // nivelele terminate care mai există în joc
  function doneCount(p) { return LEVELS.filter(function (l) { return p.progress[l.id]; }).length; }

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
    mapWorld = null;
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

  // Harta Academiei: Academia sus, apoi un drum prin toate misiunile din carnet (insignele).
  // Misiunile deschise se pot apăsa; cele închise sau încă nefăcute stau în ceață, cu lacăt.
  var COURSE_MISSIONS = 9;
  var STOP_X = [50, 27, 71, 30, 69, 29, 70, 33, 66, 50]; // poziția pe orizontală (%), Academia prima
  var STOP_Y0 = 105, STOP_STEP = 158, FOG_STEP = 112; // misiunile din ceață stau mai strâns
  var DECOR = ['🌳', '⛰️', '🌲', '🌸', '🏡', '🌲', '🌊', '🌻', '⛰️', '🌳'];
  var mapWorld = null; // misiunea deschisă de pe hartă (null = harta Academiei)

  function worldOpen(w) { return !!w && w.available && (!!preview || Store.isWorldUnlocked(profile, w.id)); }
  function worldLevels(w) { return LEVELS.filter(function (l) { return l.world === w.id; }); }

  // Misiunile deschise de profesor între timp: le aducem de pe server cât timp copilul e pe hartă,
  // ca să nu trebuiască să iasă și să intre din nou.
  var WORLDS_REFRESH_MS = 20000;
  var refreshingWorlds = false;
  function refreshWorlds() {
    if (!Cloud.enabled || !profile || preview || refreshingWorlds) return;
    var p = profile;
    refreshingWorlds = true;
    Cloud.pull(p.name).then(function (remote) {
      refreshingWorlds = false;
      if (p !== profile || !remote || !remote.worlds || !remote.worlds.length) return;
      if (remote.worlds.slice().sort().join() === p.worlds.slice().sort().join()) return;
      p.worlds = remote.worlds.slice();
      save();
      if (!$('screen-map').hidden) renderMap();
    }, function () { refreshingWorlds = false; });
  }
  setInterval(function () {
    if (!document.hidden && !$('screen-map').hidden) refreshWorlds();
  }, WORLDS_REFRESH_MS);

  function showMap() {
    renderMap();
    refreshWorlds();
  }

  function renderMap() {
    stopRun();
    fillKid();
    $('map-stars').textContent = Store.totalStars(profile);
    $('preview-bar').hidden = !preview;
    $('map-change-avatar').hidden = !!preview;
    $('map-logout').textContent = preview ? '← Panoul profesorului' : 'Ieșire';
    var box = $('worlds');
    box.innerHTML = '';
    var w = preview ? worldById(preview.world) : (mapWorld ? worldById(mapWorld) : null);
    if (w && !worldOpen(w)) w = null;
    box.classList.toggle('on-map', !w);
    if (w) renderMission(box, w); else renderAcademyMap(box);
    show('screen-map');
  }

  function openMission(id) {
    mapWorld = id;
    showMap();
    window.scrollTo(0, 0);
  }

  function renderAcademyMap(box) {
    var stops = [{ academy: true }];
    var current = null;
    for (var n = 1; n <= COURSE_MISSIONS; n++) {
      var w = WORLDS.filter(function (x) { return x.number === n; })[0];
      var stop = { number: n, world: worldOpen(w) ? w : null };
      if (stop.world) {
        var levels = worldLevels(w);
        stop.done = levels.filter(function (l) { return profile.progress[l.id]; }).length;
        stop.total = levels.length;
        stop.stars = levels.reduce(function (s, l) { return s + ((profile.progress[l.id] || {}).stars || 0); }, 0);
        if (!current && stop.done < stop.total) current = stop;
      }
      stops.push(stop);
    }
    var open = stops.filter(function (x) { return x.world; });
    if (!current) current = open[open.length - 1] || null;
    var lastOpen = stops.indexOf(open[open.length - 1]);
    var reached = current ? stops.indexOf(current) : 0;

    var y = STOP_Y0 - STOP_STEP;
    var pts = stops.map(function (x, i) {
      y += x.academy || x.world ? STOP_STEP + (i === 1 ? 24 : 0) : FOG_STEP; // după Academie, puțin mai mult loc
      return { x: STOP_X[i], y: y };
    });
    var height = y + 110;
    function curve(from, to) {
      var d = 'M' + pts[from].x + ' ' + pts[from].y;
      for (var i = from + 1; i <= to; i++) {
        var a = pts[i - 1], b = pts[i], my = (a.y + b.y) / 2;
        d += ' C' + a.x + ' ' + my + ' ' + b.x + ' ' + my + ' ' + b.x + ' ' + b.y;
      }
      return d;
    }

    var map = document.createElement('div');
    map.className = 'adv-map';
    map.style.height = height + 'px';
    var fogTop = lastOpen >= 0 ? pts[lastOpen].y + 90 : STOP_Y0;
    map.innerHTML =
      '<svg class="adv-path" viewBox="0 0 100 ' + height + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<path class="road" d="' + curve(0, stops.length - 1) + '"/>' +
        '<path class="road-line" d="' + curve(0, stops.length - 1) + '"/>' +
        (reached ? '<path class="road-done" d="' + curve(0, reached) + '"/>' : '') +
      '</svg>' +
      '<div class="adv-fog" style="top:' + fogTop + 'px" aria-hidden="true"></div>';

    stops.forEach(function (x, i) {
      var p = pts[i];
      // decor pe partea cealaltă a drumului
      var deco = document.createElement('span');
      deco.className = 'adv-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.textContent = DECOR[i % DECOR.length];
      deco.style.left = (p.x < 50 ? Math.min(p.x + 42, 90) : Math.max(p.x - 42, 10)) + '%';
      deco.style.top = (p.y - 30 + (i % 3) * 22) + 'px';
      map.appendChild(deco);

      var el;
      if (x.academy) {
        el = document.createElement('div');
        el.className = 'stop academy';
        el.innerHTML = '<span class="stop-icon"><img src="assets/personaje/bufnita.png" alt=""></span>' +
          '<span class="stop-label"><b>Academia Eroilor Isteți</b><small>Gândește, încearcă, învață!</small></span>';
      } else if (x.world) {
        var w = x.world;
        var complete = x.done === x.total;
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'stop mission' + (complete ? ' complete' : '') + (x === current ? ' current' : '');
        el.style.setProperty('--world', w.color);
        el.innerHTML = '<span class="stop-icon">' + w.icon + (complete ? '<i class="stop-badge" title="Misiune terminată">✓</i>' : '') + '</span>' +
          '<span class="stop-label"><small>' + missionLabel(w) + '</small><b>' + w.name + '</b>' +
          '<span class="stop-stars">★ ' + x.stars + '/' + x.total * 3 + ' · ' + x.done + ' din ' + x.total + '</span></span>';
        if (x === current) {
          var me = document.createElement('img');
          me.className = 'stop-me';
          me.alt = '';
          me.src = avatarSrc(profile);
          el.querySelector('.stop-icon').appendChild(me);
        }
        el.addEventListener('click', function () { openMission(w.id); });
      } else {
        el = document.createElement('div');
        el.className = 'stop fog';
        el.innerHTML = '<span class="stop-icon">🔒</span><span class="stop-label"><small>Misiunea ' + x.number + '</small><b>În curând…</b></span>';
      }
      el.style.left = p.x + '%';
      el.style.top = p.y + 'px';
      map.appendChild(el);
    });
    box.appendChild(map);
  }

  function renderMission(box, w) {
    if (!preview) {
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn btn-ghost mission-back';
      back.textContent = '← Harta Academiei';
      back.addEventListener('click', function () { mapWorld = null; showMap(); });
      box.appendChild(back);
    }
    var levels = worldLevels(w);
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
      b.innerHTML = '<span class="lvl-num">' + (unlocked ? levelNo(l) : '🔒') + '</span>' +
        '<span class="lvl-name">' + l.name + '</span>' +
        (l.icon ? '<span class="lvl-icon" title="Surpriza nivelului">' + l.icon + '</span>' : '') +
        '<span class="lvl-stars">' + starsHtml(prog ? prog.stars : 0) + '</span>' +
        (isNext ? '<span class="lvl-tag">Joacă</span>' : '');
      b.addEventListener('click', function () { openLevel(l); });
      grid.appendChild(b);
    });
    box.appendChild(sec);
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
    // desenul dictat cu runda 1: întâi o singură instrucțiune vagă (până când nivelul e terminat o dată)
    var round = level.round1 && !profile.progress[level.id] && !preview ? 1 : 2;
    game = { level: level, mapIndex: 0, map: null, editor: null, run: null, round: round };
    mapWorld = level.world; // „← Hartă” din joc te duce înapoi la misiunea nivelului
    var world = worldById(level.world);
    $('game-title').textContent = 'Nivelul ' + levelNo(level) + ' · ' + level.name;
    document.documentElement.style.setProperty('--world', world.color);
    var first = LEVELS.filter(function (l) { return l.world === level.world; })[0] === level;
    setGuide((first ? world.intro + ' ' : '') + levelHint());
    $('btn-solution').hidden = !preview;

    setPythonVisible(false); // la fiecare nivel codul Python pornește ascuns
    makeEditor(round === 1 ? [level.round1] : level.blocks, round === 1 ? 1 : level.maxBlocks, round === 1 ? [] : saved);
    show('screen-game'); // întâi afișăm ecranul, ca tabla să-și poată măsura lățimea
    loadMap(0);
  }

  function levelHint() {
    return game.round === 1 || !game.level.hint2 ? game.level.hint : game.level.hint2;
  }

  function makeEditor(blocks, maxBlocks, program) {
    var level = game.level;
    // elemente noi la fiecare nivel, ca să nu se adune ascultătorii editorului anterior
    ['workspace', 'palette'].forEach(function (id) {
      var old = $(id);
      old.parentNode.replaceChild(old.cloneNode(false), old);
    });
    game.editor = Editor.create({
      workspace: $('workspace'),
      palette: $('palette'),
      blocks: blocks,
      maxBlocks: maxBlocks,
      program: clone(program),
      onChange: function (prog) {
        if (game.round !== 1) {
          profile.drafts[level.id] = clone(prog);
          save();
        }
        if (!game.run) resetHero();
      },
      onRender: function (n, max, prog) {
        game.bugId = null; // programul s-a schimbat, marcajul greșelii nu mai e valabil
        updateCount(n, max);
        renderPython(prog);
      },
      onSelect: function (id) {
        game.selId = id;
        markPython('sel', id, true);
      },
      onLimit: function () {
        setGuide('Ai folosit toate blocurile. Poți scrie programul mai scurt?', 'warn');
        var c = $('block-count');
        c.classList.remove('shake');
        void c.offsetWidth;
        c.classList.add('shake');
      }
    });
  }

  // ---------- Codul Python ----------
  function setPythonVisible(on) {
    $('py-panel').hidden = !on;
    $('btn-python').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('btn-python').classList.toggle('on', on);
    document.querySelector('.game').classList.toggle('with-py', on);
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
    markPython('sel', game.selId, false);
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

  function markPythonError(id) { markPython('err', id, true); }

  // marchează în Python liniile unui bloc; o buclă se marchează cu tot cu liniile din interiorul ei
  function markPython(cls, id, scroll) {
    if ($('py-panel').hidden) return;
    qsa('#py-code .py-line.' + cls).forEach(function (l) { l.classList.remove(cls); });
    var node = id && findBlock(game.editor.getProgram(), id);
    if (!node) return;
    var lines = [];
    blockIds(node, []).forEach(function (bid) {
      lines = lines.concat(qsa('#py-code .py-line[data-id="' + bid + '"]'));
    });
    lines.forEach(function (l) { l.classList.add(cls); });
    if (scroll && lines[0]) scrollInside($('py-code').parentNode, lines[0]);
  }

  // derulează doar caseta de cod, nu toată pagina, ca tabla să rămână la vedere
  function scrollInside(box, el) {
    var top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    var bottom = top + el.offsetHeight;
    if (top < box.scrollTop + 8) box.scrollTo({ top: top - 8, behavior: 'smooth' });
    else if (bottom > box.scrollTop + box.clientHeight - 8) box.scrollTo({ top: bottom - box.clientHeight + 8, behavior: 'smooth' });
  }

  // pe ecran lat, cu Python deschis: aducem programul și codul în fereastră când pornește rularea
  function showCodeWhileRunning() {
    if ($('py-panel').hidden || window.innerWidth <= 960) return;
    var panel = $('py-panel').getBoundingClientRect();
    if (panel.bottom <= window.innerHeight) return;
    var head = document.querySelector('.program-box').getBoundingClientRect();
    window.scrollBy({ top: head.top - 78, behavior: 'smooth' });
  }

  function highlightPython(id) {
    if ($('py-panel').hidden) return;
    qsa('#py-code .py-line.running').forEach(function (l) { l.classList.remove('running'); });
    if (!id) return;
    var lines = qsa('#py-code .py-line[data-id="' + id + '"]');
    lines.forEach(function (l) { l.classList.add('running'); });
    if (lines[0]) scrollInside($('py-code').parentNode, lines[0]);
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
  // câte blocuri a folosit copilul și, dacă nivelul are o limită, câte mai are
  function updateCount(n, max) {
    var c = $('block-count');
    c.classList.toggle('almost', !!max && n === max - 1);
    c.classList.toggle('full', !!max && n >= max);
    if (!max) {
      c.innerHTML = 'Blocuri: <b>' + n + '</b>';
      c.title = '';
      return;
    }
    var pips = '';
    for (var i = 0; i < max; i++) pips += '<i' + (i < n ? ' class="used"' : '') + '></i>';
    c.innerHTML = 'Blocuri: <b>' + n + '</b> din ' + max + '<span class="pips" aria-hidden="true">' + pips + '</span>';
    var left = Math.max(max - n, 0);
    c.title = left ? 'Mai poți pune ' + left + (left === 1 ? ' bloc' : ' blocuri') : 'Ai folosit toate blocurile';
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
    game.map.dictation = !!game.level.dictation;
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
  var CELL_CLASS = { P: ' rock', L: ' lava', A: ' water', B: ' bridge', D: ' ink', E: ' ink ink2', Q: ' pot',
    K: ' key', U: ' gate', M: ' coin', O: ' portal', I: ' ice', C: ' crumbly', F: ' treasure fake',
    '>': ' push', '<': ' push', '^': ' push', v: ' push' };
  // ce se vede pe pătrățelele cu surprize
  var TILE_HTML = {
    K: '<span class="tile">🔑</span>', M: '<span class="tile">🪙</span>', O: '<span class="tile">🌀</span>',
    Q: '<span class="tile">🪣</span>', U: '<span class="tile">🔒</span>',
    F: '<img src="assets/comoara.svg" alt="Comoara?"><span class="eyes">👀</span>',
    '>': '<span class="tile arrow" style="--rot:0deg">➜</span>', v: '<span class="tile arrow" style="--rot:90deg">➜</span>',
    '<': '<span class="tile arrow" style="--rot:180deg">➜</span>', '^': '<span class="tile arrow" style="--rot:-90deg">➜</span>'
  };

  function renderBoard() {
    var map = game.map;
    var size = cellSize();
    game.cell = size;
    var board = $('board');
    board.style.setProperty('--cell', size + 'px');
    board.style.gridTemplateColumns = 'repeat(' + map.cols + ', var(--cell))';
    board.innerHTML = '';
    board.classList.toggle('drawing', !!map.drawing);
    var colors = game.level.colors || [];
    board.style.setProperty('--ink1', colors[0] || 'var(--world)');
    board.style.setProperty('--ink2', colors[1] || '#3b82f6');
    for (var r = 0; r < map.rows; r++) {
      for (var c = 0; c < map.cols; c++) {
        var ch = map.cells[r][c];
        var cell = document.createElement('div');
        // la desenul dictat modelul nu se vede pe foaie, doar în plic
        var cls = (ch === 'D' || ch === 'E') && map.dictation ? '' : CELL_CLASS[ch] || '';
        cell.className = 'cell ' + (ch === '#' ? 'wall w' + ((r * 7 + c * 3) % 3) : 'path' + cls);
        cell.dataset.rc = r + ',' + c;
        if (ch === 'L' || ch === 'A') cell.style.setProperty('--d', -((r * 5 + c * 3) % 7) * 0.3 + 's');
        if (ch === 'T') {
          cell.classList.add('treasure');
          cell.innerHTML = '<img src="assets/comoara.svg" alt="Comoara">';
        }
        if (TILE_HTML[ch]) cell.innerHTML = TILE_HTML[ch];
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
    renderEnvelope();
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
    // cheile, monedele, porțile și podurile își revin la începutul fiecărei rulări
    if (game.tilesDirty) { game.tilesDirty = false; renderBoard(); return; }
    clearTimeout(game.fallTimer);
    qsa('#board .trail, #board .bumped, #board .splash, #board .stray, #board .orig, #board .missing, #board .extra').forEach(function (c) {
      c.classList.remove('trail', 'c2', 'bumped', 'splash', 'stray', 'orig', 'missing', 'extra');
    });
    qsa('#board .doodle, #board .robot-say').forEach(function (d) { d.remove(); });
    $('envelope').classList.remove('opened');
    var hero = $('hero');
    if (hero) hero.classList.remove('bump', 'happy', 'fall', 'fall-lava', 'fall-water', 'fall-hole', 'fall-mimic', 'pen2');
    placeHero(game.map.start.r, game.map.start.c, game.dir, true);
    markTrail(game.map.start.r, game.map.start.c);
  }

  function markTrail(r, c, color) {
    var cell = document.querySelector('#board [data-rc="' + r + ',' + c + '"]');
    if (!cell) return;
    cell.classList.add('trail');
    cell.classList.toggle('c2', color === 2); // desenat după găleata de vopsea
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
    game.selId = null;
    game.editor.select(null);
    markPython('sel', null);
    game.editor.markError(null);
    markPythonError(null);
    var st = Engine.newState(game.map, game.dir);
    game.run = { st: st, gen: Engine.run(prog, st), timer: null, auto: false };
    $('hero').style.setProperty('--speed', Math.min(speed() * 0.85, 420) + 'ms');
    setRunning(true);
    showCodeWhileRunning();
    setGuide('Urmărește blocul evidențiat: asta face ' + heroName(profile) + ' acum.');
    return true;
  }

  function stopRun() {
    if (game && game.run) {
      clearTimeout(game.run.timer);
      game.run = null;
      game.editor.highlight(null);
      game.editor.loopLeft(null);
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
    if (ev.kind === 'move' || ev.kind === 'win' || ev.kind === 'slide') {
      placeHero(st.r, st.c, st.dir);
      markTrail(st.r, st.c, st.color);
      tileEffects(ev);
    } else if (ev.kind === 'teleport') {
      teleportHero(ev, st);
    } else if (ev.kind === 'turn') {
      placeHero(st.r, st.c, st.dir);
    } else if (ev.kind === 'check' && ev.left !== undefined) {
      game.editor.loopLeft(ev.id, ev.left); // numărul buclei scade la fiecare repetare
    } else if (ev.kind === 'check' && ev.result !== undefined) {
      game.editor.flash(ev.id, ev.result ? 'check-yes' : 'check-no');
    } else if (ev.kind === 'bump') {
      placeHero(st.r, st.c, st.dir);
      bumpHero(ev);
    } else if (ev.kind === 'fall') {
      placeHero(st.r, st.c, st.dir);
      tileEffects(ev);
      fallHero(ev.hazard, st.r, st.c);
    } else if (ev.kind === 'stray') {
      placeHero(st.r, st.c, st.dir);
      strayHero(st.r, st.c);
    } else if (ev.kind === 'vague') {
      vagueRobot(ev.what);
    }
    if (st.won || st.failed) {
      clearTimeout(run.timer);
      run.timer = setTimeout(finishRun, ev.kind === 'win' ? speed() + 150 : speed());
      return;
    }
    // verificările buclelor trec mai repede decât pașii, ca să nu plictisească; alunecarea e mai rapidă
    var wait = ev.kind === 'slide' ? speed() * 0.6 : ev.kind !== 'check' ? speed() : speed() * (ev.result === undefined ? 0.3 : 0.7);
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
  // surprizele de pe hartă: cheia și moneda dispar, poarta se deschide, podul se prăbușește...
  function tileEffects(ev) {
    var el = cellEl(ev.r, ev.c);
    if (ev.key || ev.coin) {
      game.tilesDirty = true;
      if (el) { el.classList.add('taken'); }
      playDing(ev.coin ? 1320 : 880);
    }
    if (ev.gate) {
      game.tilesDirty = true;
      if (el) el.classList.add('open');
      playDing(660);
    }
    if (ev.crumble) {
      game.tilesDirty = true;
      var old = cellEl(ev.crumble.r, ev.crumble.c);
      if (old) old.classList.add('crumbled');
    }
    if (ev.paint) $('hero').classList.add('pen2');
    if (ev.locked) {
      if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
      setGuide('Comoara e încuiată! 🔒 Mai sunt monede de adunat.', 'warn');
    }
  }

  function teleportHero(ev, st) {
    [cellEl(ev.from.r, ev.from.c), cellEl(ev.r, ev.c)].forEach(function (el) {
      if (!el) return;
      el.classList.remove('zap');
      void el.offsetWidth;
      el.classList.add('zap');
    });
    playDing(990);
    placeHero(st.r, st.c, st.dir, true);
    markTrail(st.r, st.c, st.color);
  }

  function playDing(freq) {
    var ctx = audioCtx();
    if (!ctx) return;
    var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  }

  function fallHero(hazard, r, c) {
    var hero = $('hero');
    clearTimeout(game.fallTimer);
    game.fallTimer = setTimeout(function () {
      if (hazard === 'lava') playSizzle(); else if (hazard === 'water') playSplash(); else playBump();
      hero.classList.add('fall', 'fall-' + hazard);
      var cell = document.querySelector('#board [data-rc="' + r + ',' + c + '"]');
      if (cell) cell.classList.add('splash');
    }, speed() * 0.6);
  }

  // robotul desenator a ieșit din model: mâzgălește hârtia
  function strayHero(r, c) {
    playBump();
    var cell = document.querySelector('#board [data-rc="' + r + ',' + c + '"]');
    if (cell) cell.classList.add('stray');
  }

  // ---------- Robotul desenator (Misiunea 1) ----------
  function cellEl(r, c) { return document.querySelector('#board [data-rc="' + r + ',' + c + '"]'); }

  // pătrățelele modelului (inclusiv startul), ca listă
  function modelCells() {
    var out = [];
    game.map.cells.forEach(function (row, r) { row.forEach(function (ch, c) { if (Engine.INK[ch]) out.push({ r: r, c: c }); }); });
    return out;
  }

  // un desen făcut de robot peste foaie, la (r, c), de mărimea a w × h pătrățele
  function doodle(cls, r, c, html, w, h) {
    var d = document.createElement('div');
    d.className = 'doodle ' + cls;
    d.style.left = 'calc(var(--pad) + ' + c * game.cell + 'px)';
    d.style.top = 'calc(var(--pad) + ' + r * game.cell + 'px)';
    d.style.width = (w || 1) * game.cell + 'px';
    d.style.height = (h || 1) * game.cell + 'px';
    if (html) d.innerHTML = html;
    $('board').appendChild(d);
    return d;
  }

  function robotSay(text, below) {
    var say = doodle('robot-say', game.run ? game.run.st.r : game.map.start.r, game.run ? game.run.st.c : game.map.start.c);
    say.className = 'robot-say' + (below ? ' below' : '');
    say.style.width = say.style.height = '';
    say.textContent = text;
  }

  var VAGUE_OWLS = [ // „o bufniță”: alt mâzgălit de fiecare dată
    ['D...D', 'DDDDD', 'D.D.D', 'DDDDD'],
    ['.DDD.', 'D...D', '.DDD.'],
    ['DD', 'D.', 'DD']
  ];
  var VAGUE_HOUSES = [ // „o casă cu ușă și soare”: de fiecare dată robotul desenează alta
    ['.D.', 'DDD', 'D.D', 'D.D', 'DDD'],
    ['DDDDD', 'D...D', 'DDDDD'],
    ['DD', 'DD'],
    ['..D..', '.DDD.', 'DDDDD', 'D...D', 'D...D', 'DDDDD']
  ];

  // robotul execută ad literam instrucțiunea vagă
  function vagueRobot(what) {
    playBump();
    var cells = modelCells();
    var top = cells.reduce(function (a, b) { return b.r < a.r ? b : a; });
    if (what === 'vSquare') {
      doodle('tiny-square', 1, 1); // un pătrat minuscul, într-un colț
      robotSay('AM DESENAT UN PĂTRAT.');
    } else if (what === 'vRoof') {
      robotSay('CE ESTE UN ACOPERIȘ?');
    } else if (what === 'vDoor') {
      doodle('door', Math.max(top.r - 1, 1), top.c, '🚪'); // ușa... deasupra casei
      robotSay('AM PUS O UȘĂ.', true); // sub robot, ca să se vadă ușa de deasupra
    } else if (what === 'vHouse' || what === 'vOwl') {
      var shapes = what === 'vOwl' ? VAGUE_OWLS : VAGUE_HOUSES;
      var house = shapes[Math.floor(Math.random() * shapes.length)];
      var maxR = game.map.rows - 1 - house.length, maxC = game.map.cols - 1 - house[0].length;
      var r0 = 1 + Math.floor(Math.random() * Math.max(maxR, 1)), c0 = 1 + Math.floor(Math.random() * Math.max(maxC, 1));
      house.forEach(function (row, i) {
        row.split('').forEach(function (ch, j) {
          var el = ch === 'D' && cellEl(r0 + i, c0 + j);
          if (el) el.classList.add('trail');
        });
      });
      if (what === 'vHouse') doodle('sun', 1, game.map.cols - 2, '☀️');
      robotSay(what === 'vOwl' ? 'AM DESENAT O BUFNIȚĂ.' : 'AM DESENAT O CASĂ CU UȘĂ ȘI SOARE.', true);
    }
  }

  function vagueResult(what) {
    if (what === 'vHouse' || what === 'vOwl') {
      var thing = what === 'vOwl' ? 'o bufniță' : 'o casă';
      // runda 1 a desenului dictat: comparăm cu originalul, apoi trecem la runda 2
      setTimeout(function () {
        if (!game || game.run) return;
        modelCells().forEach(function (p) { var el = cellEl(p.r, p.c); if (el) el.classList.add('orig'); });
        $('envelope').classList.add('opened');
        setGuide('Am scos desenul din plic: robotul a desenat ' + thing + ', dar nu pe cea din plic!', 'bad');
        showModal({
          art: '<div class="modal-chest modal-emoji" aria-hidden="true">🤖</div>',
          title: 'Runda 1: alt desen!',
          body: '<p>Ai dat o instrucțiune vagă, iar robotul a desenat ' + thing + ' oarecare. Data viitoare ar desena alta! ' +
            'Ca să iasă exact desenul din plic, trebuie să-i spui pas cu pas.</p>',
          actions: [{ label: 'Runda 2: pas cu pas ▶', cls: 'btn-primary', onClick: startRound2 }]
        });
      }, 900);
      return;
    }
    var why = {
      vSquare: 'Robotul a desenat un pătrat minuscul, într-un colț. Nu i-ai spus cât de mare e pătratul și unde să-l deseneze!',
      vRoof: 'Robotul nu știe ce e un acoperiș. El înțelege doar săgețile.',
      vDoor: 'Robotul a pus ușa... deasupra casei! Nu i-ai spus unde.'
    }[what];
    setGuide('🤖 Robotul face exact ce îi spui, nu ce ai vrut să spui. Folosește instrucțiuni precise!', 'bad');
    var level = game.level;
    setTimeout(function () {
      if (!game || game.run || game.level !== level) return;
      var p = document.createElement('p');
      p.textContent = why;
      showModal({
        art: '<div class="modal-chest modal-emoji" aria-hidden="true">🤖</div>',
        title: 'Exact ce i-ai spus!',
        body: p.outerHTML + '<p class="bug-hint">Dă-i robotului instrucțiuni precise, pas cu pas.</p>',
        actions: [{ label: 'Bine', cls: 'btn-primary' }]
      });
    }, 1200);
  }

  function startRound2() {
    if (!game) return;
    game.round = 2;
    var saved = profile.drafts[game.level.id] || [];
    makeEditor(game.level.blocks, game.level.maxBlocks, saved);
    resetHero();
    setGuide(levelHint());
  }

  // desenul dictat: originalul din plic peste desenul robotului (ce lipsește și ce e în plus)
  function revealOriginal(st) {
    $('envelope').classList.add('opened');
    modelCells().forEach(function (p) { var el = cellEl(p.r, p.c); if (el) el.classList.add('orig'); });
    (st.missing || []).forEach(function (p) { var el = cellEl(p.r, p.c); if (el) el.classList.add('missing'); });
    (st.extraCells || []).forEach(function (p) { var el = cellEl(p.r, p.c); if (el) el.classList.add('extra'); });
  }

  function mismatchText(st) {
    var parts = [];
    var m = (st.missing || []).length, x = (st.extraCells || []).length;
    if (m) parts.push(m === 1 ? 'lipsește un pătrățel' : 'lipsesc ' + m + ' pătrățele');
    if (x) parts.push(x === 1 ? 'un pătrățel e în plus' : m ? x + ' sunt în plus' : x + ' pătrățele sunt în plus');
    return parts.join(', iar ');
  }

  // plicul cu desenul secret (doar la desenul dictat)
  function renderEnvelope() {
    var env = $('envelope');
    env.hidden = !game.map.dictation;
    var colors = game.level.colors || [];
    env.style.setProperty('--ink1', colors[0] || 'var(--world)');
    env.style.setProperty('--ink2', colors[1] || '#3b82f6');
    if (env.hidden) return;
    var map = game.map;
    var mini = env.querySelector('.env-grid');
    mini.style.gridTemplateColumns = 'repeat(' + (map.cols - 2) + ', 1fr)';
    mini.innerHTML = '';
    for (var r = 1; r < map.rows - 1; r++) {
      for (var c = 1; c < map.cols - 1; c++) {
        var i = document.createElement('i');
        if (map.cells[r][c] === 'D') i.className = 'on';
        if (map.cells[r][c] === 'E') i.className = 'on on2';
        if (map.cells[r][c] === 'Q') i.className = 'pot';
        if (map.cells[r][c] === 'P') i.className = 'blot';
        if (r === map.start.r && c === map.start.c) i.className = 'on start';
        mini.appendChild(i);
      }
    }
  }

  function finishRun() {
    var run = game.run;
    if (!run) return;
    var st = run.st;
    game.run = null;
    setRunning(false);
    if (game.map.dictation && !st.failed && !st.won) {
      Engine.judge(st);
      revealOriginal(st); // scoatem originalul din plic și îl punem peste desenul robotului
    }
    game.editor.highlight(null);
    game.editor.loopLeft(null);
    highlightPython(null);

    if (st.won) {
      // lăsăm programul să se încheie (fără alți pași), ca să aflăm dacă mai avea ceva de făcut
      while (!run.gen.next().done) { /* doar marchează st.extra */ }
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
      levelWon(st);
      return;
    }
    // în Misiunea 2 copilul urmărește personajul și își dă seama singur unde a greșit;
    // de la Misiunea 3 încolo, programele sunt mai lungi, așa că „Caut greșeala” îl duce la bloc.
    // În Misiunea 3 arătăm doar bucla în care e greșeala; pasul exact îl găsește copilul.
    var mission = worldById(game.level.world).number;
    var bugId = mission >= 3 ? run.lastId : null;
    if (mission === 3 && bugId) bugId = innerLoop(game.editor.getProgram(), bugId) || bugId;
    var why;
    if (st.failed === 'vague') {
      vagueResult(st.vague);
      return;
    }
    if (st.failed === 'bump') {
      var what = st.bumped === 'P' ? (game.map.drawing ? 'o pată de cerneală' : 'un bolovan') : st.bumped === 'U' ? 'poarta încuiată' : 'zid';
      why = heroName(profile) + ' s-a lovit de ' + what + '.';
      setGuide('Au! ' + heroName(profile) + ' s-a lovit de ' + what + '. Schimbă programul și încearcă din nou.', 'bad');
    } else if (st.failed === 'hazard' && st.hazard === 'mimic') {
      why = 'Comoara falsă l-a mușcat pe ' + heroName(profile) + '!';
      setGuide('Hap! Comoara era falsă! 👀 Cea adevărată nu are ochi. Încearcă din nou.', 'bad');
    } else if (st.failed === 'hazard' && st.hazard === 'hole') {
      why = heroName(profile) + ' a călcat pe un pod prăbușit.';
      setGuide('Trosc! Podul se prăbușise deja. Pe un pod șubred poți trece o singură dată.', 'bad');
    } else if (st.failed === 'hazard') {
      var where = st.hazard === 'lava' ? 'în lavă' : 'în apă';
      why = heroName(profile) + ' a călcat ' + where + '.';
      setGuide((st.hazard === 'lava' ? 'Au, frige! ' : 'Pleosc! ') + heroName(profile) + ' a călcat ' + where +
        '. Găsește un drum care ocolește obstacolele.', 'bad');
    } else if (st.failed === 'stray' && st.wrongColor) {
      why = heroName(profile) + ' a desenat linia cu altă culoare.';
      setGuide('Hopa! Linia asta trebuia desenată cu cealaltă culoare. Gândește-te când trece robotul prin găleata de vopsea.', 'bad');
    } else if (st.failed === 'stray') {
      why = heroName(profile) + ' a desenat în afara modelului.';
      setGuide('Hopa! ' + heroName(profile) + ' a ieșit din linia punctată și a stricat desenul. Robotul face exact ce îi spui!', 'bad');
    } else if (st.failed === 'limit') {
      why = 'Programul nu se mai termina, așa că l-am oprit.';
      setGuide('Programul pare că nu se mai termină, așa că l-am oprit. Verifică ce se întâmplă în bucle.', 'bad');
    } else if (game.map.dictation) {
      why = 'Desenul robotului nu seamănă cu cel din plic: ' + mismatchText(st) + '.';
      setGuide('Am scos desenul din plic și l-am pus peste desenul robotului. Uite unde diferă! Schimbă programul și încearcă din nou.', 'bad');
    } else if (game.map.drawing) {
      why = 'Programul s-a terminat, dar desenul nu e gata.';
      setGuide('Programul s-a terminat, dar desenul nu e gata. Mai adaugă comenzi!', 'warn');
    } else if (st.coinsLeft > 0 && st.r === game.map.treasure.r && st.c === game.map.treasure.c) {
      why = 'Comoara e încuiată: mai sunt monede de adunat.';
      setGuide('Comoara e încuiată! 🔒 Adună toate monedele, apoi vino înapoi.', 'warn');
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

  function levelWon(st) {
    var level = game.level;
    var prog = game.editor.getProgram();
    var blocks = Engine.countBlocks(prog);
    var stars = blocks <= level.optimal ? 3 : (blocks <= level.optimal + 2 ? 2 : 1);
    // programul mai avea pași după final (repetări sau blocuri în plus): nu e perfect
    var extra = !!(st && st.extra);
    if (extra) stars = Math.min(stars, 2);
    var wasDone = !!profile.progress[level.id];
    Store.recordWin(profile, level.id, stars, blocks, clone(prog));
    save();
    syncProfile();
    var drawing = !!game.map.drawing;
    setGuide(game.map.dictation ? 'Desenul robotului e identic cu cel din plic! 🎨' : drawing ? 'Desenul e gata! 🎨' : 'Ai găsit comoara! 🎉', 'good');
    if (game.map.dictation) revealOriginal(st);

    var idx = LEVELS.indexOf(level);
    var next = LEVELS[idx + 1];
    var body = '<div class="big-stars">' + starsHtml(stars) + '</div>';
    if (extra) {
      body += '<p>Ai ajuns, dar programul mai avea pași de făcut după aceea (repetări sau blocuri în plus). ' +
        'Poți lua 3 stele cu un program care se oprește exact la final. Încerci?</p>';
    } else if (stars < 3) {
      body += '<p>Ai folosit ' + blocks + ' blocuri. Poți lua 3 stele cu un program mai scurt. Încerci?</p>';
    } else {
      body += '<p>Program perfect, cu doar ' + blocks + ' blocuri!</p>';
    }
    var actions = [{ label: 'Mai încerc', cls: 'btn-ghost', onClick: resetHero },
      { label: 'Nivele', cls: 'btn-ghost', onClick: showMap }];

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
      art: drawing ? '<div class="modal-chest modal-emoji" aria-hidden="true">🎨</div>' : '<img src="assets/comoara.svg" alt="" class="modal-chest">',
      title: wasDone ? 'Bravo, din nou!' : (drawing ? 'Desenul e gata!' : 'Comoara e a ta!'),
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
    setGuide(levelHint());
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
  var teacherAuth = null; // { user, pw } online, ținute doar cât e deschis panoul
  var teacherData = {};
  var LOCAL_STAFF = { role: 'local', name: '', classes: [], teachers: [] };
  var staff = LOCAL_STAFF; // rolul (admin | teacher | local), clasele și profesorii
  var KEY_USER = 'labirint.teacherUser';
  var KEY_CLASS = 'labirint.classFilter';
  var classFilter = (function () { try { return localStorage.getItem(KEY_CLASS) || 'all'; } catch (e) { return 'all'; } })();
  var selected = {}; // copiii bifați pentru mutarea în clasă

  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // De unde vin datele: online (toate calculatoarele) sau doar din acest browser.
  var Teacher = Cloud.enabled ? {
    list: function () {
      return Cloud.teacher.overview(teacherAuth).then(function (o) {
        staff = { role: o.role, name: o.name, classes: o.classes || [], teachers: o.teachers || [] };
        return o.students || {};
      });
    },
    setWorld: function (name, worldId, open, classId) { return Cloud.teacher.setWorld(teacherAuth, name, worldId, open, classId); },
    remove: function (name) {
      Store.deleteProfile(name); // altfel s-ar trimite din nou de pe acest calculator
      return Cloud.teacher.remove(teacherAuth, name);
    },
    saveClass: function (id, name) { return Cloud.teacher.saveClass(teacherAuth, id, name); },
    deleteClass: function (id) { return Cloud.teacher.deleteClass(teacherAuth, id); },
    saveTeacher: function (id, name, pw) { return Cloud.teacher.saveTeacher(teacherAuth, id, name, pw); },
    deleteTeacher: function (id) { return Cloud.teacher.deleteTeacher(teacherAuth, id); },
    setClassTeachers: function (classId, ids) { return Cloud.teacher.setClassTeachers(teacherAuth, classId, ids); },
    setStudentClass: function (names, classId) { return Cloud.teacher.setStudentClass(teacherAuth, names, classId); },
    addStudents: function (names, classId) { return Cloud.teacher.addStudents(teacherAuth, names, classId); }
  } : {
    list: function () { staff = LOCAL_STAFF; return Promise.resolve(Store.loadAll()); },
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
    teacherAuth = null;
    staff = LOCAL_STAFF;
    selected = {};
    teacherMsg('');
    $('screen-teacher').dataset.role = 'local';
    pinMode = Cloud.enabled || Store.hasPin() ? 'enter' : 'setup';
    preparePin();
    $('teacher-content').hidden = true;
    $('t-change-pin').textContent = Cloud.enabled ? 'Schimbă parola' : 'Schimbă PIN';
    $('t-refresh').hidden = !Cloud.enabled;
    $('teacher-note').textContent = Cloud.enabled
      ? 'Rezultatele sunt centralizate online, de pe toate calculatoarele. Pozele încărcate de copii rămân doar pe calculatorul lor.'
      : 'Datele sunt salvate doar în acest browser, pe acest calculator. Folosește „Backup JSON” și „Import JSON” ca să aduni progresul de pe mai multe calculatoare.';
    show('screen-teacher');
    ($('pin-user').hidden ? $('pin-1') : $('pin-user').value ? $('pin-1') : $('pin-user')).focus();
  }

  function leaveTeacher() {
    teacherAuth = null;
    teacherData = {};
    staff = LOCAL_STAFF;
    selected = {};
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
    $('pin-user').hidden = !Cloud.enabled || setup;
    if (!$('pin-user').hidden) { try { $('pin-user').value = localStorage.getItem(KEY_USER) || ''; } catch (e) { /* gol */ } }
    if (Cloud.enabled) {
      $('pin-1').placeholder = 'Parola';
      $('pin-2').placeholder = 'Repetă parola';
      $('pin-title').textContent = setup ? 'Parolă nouă' : 'Autentificare';
      $('pin-help').textContent = setup
        ? 'Cel puțin 8 caractere. Va fi noua ta parolă pe toate calculatoarele.'
        : 'Scrie utilizatorul (admin sau numele tău de profesor) și parola, ca să vezi rezultatele claselor tale.';
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
      var user = $('pin-user').value.trim();
      teacherAuth = { user: user, pw: p1 };
      try { localStorage.setItem(KEY_USER, user); } catch (e) { /* nu-l reținem */ }
      setPinBusy(true);
      loadTeacher().then(function () { setPinBusy(false); });
      return;
    }
    if (p1.length < 8) { $('pin-error').textContent = 'Parola trebuie să aibă cel puțin 8 caractere.'; return; }
    if (p1 !== p2) { $('pin-error').textContent = 'Cele două parole nu sunt la fel.'; return; }
    setPinBusy(true);
    Cloud.teacher.changePassword(teacherAuth, p1).then(function () {
      setPinBusy(false);
      teacherAuth.pw = p1;
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
      $('screen-teacher').dataset.role = staff.role;
      $('pin-form').hidden = true;
      $('teacher-content').hidden = false;
      renderTeacher();
    }, function (err) {
      if (Cloud.isWrongPassword(err)) {
        teacherAuth = null;
        pinMode = 'enter';
        preparePin();
        $('teacher-content').hidden = true;
        $('pin-error').textContent = 'Utilizator sau parolă greșită.';
        $('pin-1').focus();
      } else if ($('teacher-content').hidden) {
        $('pin-error').textContent = OFFLINE_MSG;
      } else {
        teacherMsg(OFFLINE_MSG);
      }
    });
  }

  // rulează o schimbare, apoi reîncarcă tabelul
  function actionError(err) { return err && err.code ? err.message : OFFLINE_MSG; }

  function teacherAction(promise, okMsg) {
    return promise.then(function () {
      teacherMsg(okMsg);
      return loadTeacher();
    }, function (err) { teacherMsg(actionError(err)); });
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
      var allOpen = Store.alwaysOpen(w.id) || (names.length > 0 && openFor === names.length);
      var card = document.createElement('div');
      card.className = 'mission-card';
      card.style.setProperty('--world', w.color);
      card.innerHTML =
        '<span class="world-icon">' + w.icon + '</span>' +
        '<div class="mission-info"><span class="eyebrow">' + missionLabel(w) + '</span><h4></h4>' +
        '<p class="mission-status"></p></div><div class="mission-actions"></div>';
      card.querySelector('h4').textContent = w.name;
      card.querySelector('.mission-status').textContent = levels.length + ' nivele · ' + (Store.alwaysOpen(w.id)
        ? 'deschisă pentru toți'
        : (allOpen ? 'deschisă pentru toți' : (openFor ? 'deschisă pentru ' + openFor + ' din ' + names.length + ' copii' : 'închisă')));
      card.classList.toggle('open', allOpen);
      var actions = card.querySelector('.mission-actions');
      actions.appendChild(teacherButton('👁 Previzualizează', 'btn-ghost', function () { startPreview(w.id); }));
      if (!Store.alwaysOpen(w.id)) {
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
  var SORT_DEFAULT_DIR = { name: 1, class: 1, level: -1, stars: -1, worlds: -1, date: -1 };
  var teacherSort = (function () {
    try {
      var s = JSON.parse(localStorage.getItem(SORT_KEY));
      if (s && SORT_DEFAULT_DIR[s.by] && (s.dir === 1 || s.dir === -1)) return s;
    } catch (e) { /* ordinea implicită */ }
    return { by: 'date', dir: -1 };
  })();

  function sortValue(p, n, by) {
    if (by === 'name') return n;
    if (by === 'class') return className(p.classId) || '\uffff';
    if (by === 'level') { var best = highestLevel(p); return (best ? levelNo(best) : 0) * 1000 + doneCount(p); }
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

  // ---------- Clase ----------
  function className(id) {
    if (id == null) return '';
    var c = staff.classes.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '';
  }

  function inFilter(p) {
    if (classFilter === 'all') return true;
    if (classFilter === 'none') return p.classId == null;
    return p.classId === Number(classFilter);
  }

  // ce trimitem serverului pentru acțiunile pe grup: null = toate clasele vizibile, -1 = fără clasă
  function filterClassId() {
    return classFilter === 'all' ? null : classFilter === 'none' ? -1 : Number(classFilter);
  }

  function classOptions(withNone) {
    return staff.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') +
      (withNone ? '<option value="none">Fără clasă</option>' : '');
  }

  function renderFilter() {
    var isAdmin = staff.role === 'admin';
    var opts = [];
    if (isAdmin || staff.classes.length > 1) opts.push('<option value="all">' + (isAdmin ? 'Toate clasele' : 'Toate clasele mele') + '</option>');
    opts.push(classOptions(isAdmin));
    var sel = $('class-filter');
    sel.innerHTML = opts.join('');
    if (!qsa('#class-filter option').some(function (o) { return o.value === classFilter; })) {
      classFilter = sel.options.length ? sel.options[0].value : 'all';
    }
    sel.value = classFilter;
    $('who-label').textContent = isAdmin ? '👑 Administrator' : '👩‍🏫 ' + staff.name;
  }

  $('class-filter').addEventListener('change', function () {
    classFilter = $('class-filter').value;
    try { localStorage.setItem(KEY_CLASS, classFilter); } catch (e) { /* doar pentru sesiunea curentă */ }
    selected = {};
    renderTeacher();
  });

  // Clase și profesori (doar administrator)
  function renderManage() {
    if (staff.role !== 'admin') return;
    var counts = {};
    Object.keys(teacherData).forEach(function (n) {
      var id = teacherData[n].classId;
      if (id != null) counts[id] = (counts[id] || 0) + 1;
    });

    var cl = $('class-list');
    cl.innerHTML = '';
    if (!staff.classes.length) cl.innerHTML = '<li class="m-empty">Nicio clasă încă.</li>';
    staff.classes.forEach(function (c) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="m-name"></span><span class="m-sub"></span>';
      li.querySelector('.m-name').textContent = c.name;
      li.querySelector('.m-sub').textContent = (counts[c.id] || 0) + ' elevi · ' + (c.teachers.length ? c.teachers.join(', ') : 'fără profesor');
      li.appendChild(teacherButton('Profesori', 'btn-ghost', function () { editClassTeachers(c); }));
      li.appendChild(teacherButton('Redenumește', 'btn-ghost', function () { renameClass(c); }));
      li.appendChild(teacherButton('🗑', 'btn-ghost', function () {
        showModal({
          title: 'Ștergi clasa ' + c.name + '?',
          body: '<p>Copiii din clasă nu se șterg, doar rămân fără clasă.</p>',
          actions: [{ label: 'Nu', cls: 'btn-ghost' }, { label: 'Da, șterge', cls: 'btn-danger', onClick: function () {
            teacherAction(Teacher.deleteClass(c.id), 'Clasa ' + c.name + ' a fost ștearsă.');
          } }]
        });
      }));
      cl.appendChild(li);
    });

    var tl = $('teacher-list');
    tl.innerHTML = '';
    if (!staff.teachers.length) tl.innerHTML = '<li class="m-empty">Niciun profesor încă.</li>';
    staff.teachers.forEach(function (t) {
      var mine = staff.classes.filter(function (c) { return c.teacherIds.indexOf(t.id) >= 0; }).map(function (c) { return c.name; });
      var li = document.createElement('li');
      li.innerHTML = '<span class="m-name"></span><span class="m-sub"></span>';
      li.querySelector('.m-name').textContent = t.name;
      li.querySelector('.m-sub').textContent = mine.length ? 'Clase: ' + mine.join(', ') : 'fără clasă';
      li.appendChild(teacherButton('Editează', 'btn-ghost', function () { editTeacher(t); }));
      li.appendChild(teacherButton('🗑', 'btn-ghost', function () {
        showModal({
          title: 'Ștergi profesorul ' + t.name + '?',
          body: '<p>Contul lui dispare. Clasele și rezultatele copiilor rămân.</p>',
          actions: [{ label: 'Nu', cls: 'btn-ghost' }, { label: 'Da, șterge', cls: 'btn-danger', onClick: function () {
            teacherAction(Teacher.deleteTeacher(t.id), 'Profesorul ' + t.name + ' a fost șters.');
          } }]
        });
      }));
      tl.appendChild(li);
    });
  }

  // fereastră cu formular; onSubmit întoarce un text (eroare), o promisiune sau nimic
  function formModal(o) {
    showModal({ title: o.title, body: o.body, actions: [{ label: 'Anulează', cls: 'btn-ghost' }] });
    var body = $('modal-body');
    var err = document.createElement('p');
    err.className = 'error';
    err.setAttribute('role', 'alert');
    body.appendChild(err);
    var ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = o.submit;
    ok.addEventListener('click', function () {
      var r = o.onSubmit(body);
      if (typeof r === 'string') { err.textContent = r; return; }
      ok.disabled = true;
      Promise.resolve(r).then(function () { $('modal').hidden = true; }, function (e) {
        ok.disabled = false;
        err.textContent = actionError(e);
      });
    });
    $('modal-actions').appendChild(ok);
    var first = body.querySelector('input:not([type=checkbox]), textarea, select');
    if (first) first.focus();
  }

  function renameClass(c) {
    formModal({
      title: 'Redenumește clasa', submit: 'Salvează',
      body: '<div class="modal-form"><label>Numele clasei<input id="f-name" maxlength="40" value="' + esc(c.name) + '"></label></div>',
      onSubmit: function (b) {
        var name = b.querySelector('#f-name').value.trim();
        if (!name) return 'Scrie numele clasei.';
        return Teacher.saveClass(c.id, name).then(function () { teacherMsg('Clasa a fost redenumită.'); loadTeacher(); });
      }
    });
  }

  function editClassTeachers(c) {
    if (!staff.teachers.length) {
      showModal({ title: 'Mai întâi adaugă profesori', body: '<p>Creează profesorii din lista „Profesori”, apoi îi poți alege pentru clasă.</p>' });
      return;
    }
    var boxes = staff.teachers.map(function (t) {
      return '<label class="check"><input type="checkbox" value="' + t.id + '"' + (c.teacherIds.indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + esc(t.name) + '</label>';
    }).join('');
    formModal({
      title: 'Profesorii clasei ' + c.name, submit: 'Salvează',
      body: '<div class="modal-form">' + boxes + '</div>',
      onSubmit: function (b) {
        var ids = qsa('#modal-body input[type=checkbox]').filter(function (x) { return x.checked; }).map(function (x) { return Number(x.value); });
        return Teacher.setClassTeachers(c.id, ids).then(function () { teacherMsg('Profesorii clasei ' + c.name + ' au fost salvați.'); loadTeacher(); });
      }
    });
  }

  function editTeacher(t) {
    formModal({
      title: 'Profesor', submit: 'Salvează',
      body: '<div class="modal-form"><label>Nume<input id="f-name" maxlength="40" value="' + esc(t.name) + '"></label>' +
        '<label>Parolă nouă (lasă gol ca să rămână cea veche)<input id="f-pass" type="password" maxlength="64" autocomplete="new-password"></label></div>',
      onSubmit: function (b) {
        var name = b.querySelector('#f-name').value.trim(), pw = b.querySelector('#f-pass').value;
        if (!name) return 'Scrie numele profesorului.';
        if (pw && pw.length < 8) return 'Parola trebuie să aibă cel puțin 8 caractere.';
        return Teacher.saveTeacher(t.id, name, pw).then(function () { teacherMsg('Profesorul ' + name + ' a fost salvat.'); loadTeacher(); });
      }
    });
  }

  $('class-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('class-name').value.trim();
    if (!name) return;
    teacherAction(Teacher.saveClass(null, name), 'Clasa ' + name + ' a fost adăugată.').then(function () { $('class-name').value = ''; });
  });

  $('teacher-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('teacher-name').value.trim(), pw = $('teacher-pass').value;
    if (!name) return;
    if (pw.length < 8) { teacherMsg('Parola profesorului trebuie să aibă cel puțin 8 caractere.'); return; }
    teacherAction(Teacher.saveTeacher(null, name, pw), 'Profesorul ' + name + ' a fost adăugat.').then(function () {
      $('teacher-name').value = '';
      $('teacher-pass').value = '';
    });
  });

  $('t-add-students').addEventListener('click', function () {
    var preset = /^\d+$/.test(classFilter) ? classFilter : '';
    formModal({
      title: 'Adaugă elevi', submit: 'Adaugă',
      body: '<div class="modal-form"><label>Elevii (unul pe rând, ex. Ana.P)<textarea id="f-names" spellcheck="false"></textarea></label>' +
        '<label>În clasa<select id="f-class"><option value="">Fără clasă</option>' + classOptions(false) + '</select></label></div>',
      onSubmit: function (b) {
        var parts = b.querySelector('#f-names').value.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        var names = [], bad = [];
        parts.forEach(function (x) {
          var n = Store.normalizeName(x);
          if (!n) bad.push(x); else if (names.indexOf(n) < 0) names.push(n);
        });
        if (bad.length) return 'Format greșit: ' + bad.join(', ') + '. Folosește prenume, punct și inițiala (ex. Ana.P).';
        if (!names.length) return 'Scrie cel puțin un nume.';
        var cid = b.querySelector('#f-class').value;
        return Teacher.addStudents(names, cid ? Number(cid) : null).then(function () {
          teacherMsg(names.length + ' elevi adăugați' + (cid ? ' în clasa ' + className(Number(cid)) : '') + '.');
          loadTeacher();
        });
      }
    });
    if (preset) $('f-class').value = preset;
  });

  function updateBulkBar() {
    var n = Object.keys(selected).length;
    $('bulk-bar').hidden = !n;
    $('bulk-count').textContent = n + (n === 1 ? ' copil selectat' : ' copii selectați');
  }

  $('bulk-move').addEventListener('click', function () {
    var names = Object.keys(selected);
    var v = $('bulk-class').value;
    var cid = v === 'none' ? null : Number(v);
    selected = {};
    teacherAction(Teacher.setStudentClass(names, cid),
      names.length + ' copii mutați ' + (cid == null ? 'fără clasă' : 'în clasa ' + className(cid)) + '.');
  });

  $('select-all').addEventListener('change', function () {
    var on = $('select-all').checked;
    qsa('#kids-body input.pick').forEach(function (cb) {
      cb.checked = on;
      if (on) selected[cb.dataset.name] = true; else delete selected[cb.dataset.name];
    });
    updateBulkBar();
  });

  function renderTeacher() {
    var all = teacherData;
    var isCloud = Cloud.enabled;
    if (isCloud) renderFilter();
    var names = sortedNames(all).filter(function (n) { return !isCloud || inFilter(all[n]); });
    Object.keys(selected).forEach(function (n) { if (names.indexOf(n) < 0) delete selected[n]; });
    renderSortHeaders();
    renderManage();
    if (staff.role === 'admin') {
      $('bulk-class').innerHTML = classOptions(true);
      $('select-all').checked = false;
      updateBulkBar();
    }

    var multiWorld = WORLDS.filter(function (w) { return w.available; }).length > 1;
    $('kids-table').classList.toggle('single-world', !multiWorld);
    renderMissions(names);

    var body = $('kids-body');
    body.innerHTML = '';
    if (!names.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">' + (Cloud.enabled
        ? (staff.role === 'teacher' && !staff.classes.length ? 'Nu ai nicio clasă încă. Cere administratorului să te adauge la o clasă.'
          : classFilter === 'all' ? 'Încă nu a intrat niciun copil.' : 'Niciun copil în această clasă.')
        : 'Încă nu a intrat niciun copil pe acest calculator.') + '</td></tr>';
      return;
    }
    names.forEach(function (n) {
      var p = all[n];
      var best = highestLevel(p);
      var done = doneCount(p);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="col-select admin-only"><input class="pick" type="checkbox"></td>' +
        '<td><div class="kid-cell"><img alt=""><span></span></div></td>' +
        '<td class="col-class cloud-only"></td>' +
        '<td>' + (best ? 'Nivelul ' + levelNo(best) + ' <small>(' + missionLabel(worldById(best.world)) + ', ' + done + ' terminate)</small>' : '—') + '</td>' +
        '<td>' + Store.totalStars(p) + '</td>' +
        '<td class="col-worlds"><div class="world-toggles"></div></td>' +
        '<td>' + formatDate(p.lastSeen) + '</td>' +
        '<td><button type="button" class="btn btn-ghost btn-sm del-kid" aria-label="Șterge profilul">🗑</button></td>';
      tr.querySelector('img').src = avatarSrc(p);
      tr.querySelector('.kid-cell span').textContent = n;
      var pick = tr.querySelector('.pick');
      pick.dataset.name = n;
      pick.checked = !!selected[n];
      pick.setAttribute('aria-label', 'Selectează ' + n);
      pick.addEventListener('change', function () {
        if (pick.checked) selected[n] = true; else delete selected[n];
        updateBulkBar();
      });
      var classCell = tr.querySelector('.col-class');
      if (staff.role === 'admin') {
        var sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Clasa lui ' + n);
        sel.innerHTML = '<option value="none">Fără clasă</option>' + classOptions(false);
        sel.value = p.classId == null ? 'none' : String(p.classId);
        sel.addEventListener('change', function () {
          var cid = sel.value === 'none' ? null : Number(sel.value);
          teacherAction(Teacher.setStudentClass([n], cid), n + (cid == null ? ' a rămas fără clasă.' : ' a fost mutat în clasa ' + className(cid) + '.'));
        });
        classCell.appendChild(sel);
      } else {
        classCell.textContent = className(p.classId) || '—';
      }
      var toggles = tr.querySelector('.world-toggles');
      WORLDS.filter(function (w) { return w.available; }).forEach(function (w) {
        var on = Store.isWorldUnlocked(p, w.id);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'wt' + (on ? ' on' : '');
        b.style.setProperty('--world', w.color);
        b.textContent = (on ? '🔓 ' : '🔒 ') + w.number;
        b.title = (on ? 'Închide' : 'Deschide') + ' ' + missionLabel(w) + ' pentru ' + n;
        b.disabled = Store.alwaysOpen(w.id);
        b.addEventListener('click', function () {
          teacherAction(Teacher.setWorld(n, w.id, !on, null),
            missionLabel(w) + ' a fost ' + (on ? 'închisă' : 'deschisă') + ' pentru ' + n + '.');
        });
        toggles.appendChild(b);
      });
      if (staff.role === 'teacher') tr.querySelector('.del-kid').remove();
      else tr.querySelector('.del-kid').addEventListener('click', function () {
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
    var count = sortedNames(teacherData).filter(function (n) { return !Cloud.enabled || inFilter(teacherData[n]); }).length;
    teacherAction(Teacher.setWorld(null, worldId, unlocked, Cloud.enabled ? filterClassId() : null),
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
    var rows = [['Copil', 'Clasa', 'Nivel atins', 'Nivele terminate', 'Stele', 'Misiuni deschise', 'Ultima activitate']];
    sortedNames(all).filter(function (n) { return !Cloud.enabled || inFilter(all[n]); }).forEach(function (n) {
      var p = all[n];
      var best = highestLevel(p);
      rows.push([n, className(p.classId), best ? levelNo(best) : 0, doneCount(p), Store.totalStars(p),
        p.worlds.map(function (id) { var w = worldById(id); return w ? w.number : id; }).join(' '), formatDate(p.lastSeen)]);
    });
    var csv = '﻿' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n');
    download('labirint-progres-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
  });

  $('t-export-json').addEventListener('click', function () {
    var shown = {};
    Object.keys(teacherData).forEach(function (n) { if (!Cloud.enabled || inFilter(teacherData[n])) shown[n] = teacherData[n]; });
    download('labirint-backup-' + new Date().toISOString().slice(0, 10) + '.json', Store.exportJSON(shown), 'application/json');
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
  $('t-logout').addEventListener('click', showLogin); // showLogin() uită utilizatorul și parola din memorie

  window.addEventListener('hashchange', function () {
    if (location.hash === TEACHER_HASH) showTeacher();
    else if (!$('screen-teacher').hidden) showLogin();
  });

  // ================= Pornire =================
  var openTeacher = location.hash === TEACHER_HASH; // showLogin() șterge #profesor din adresă
  showLogin();
  if (openTeacher) showTeacher();
})();
