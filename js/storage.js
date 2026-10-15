// Profilurile copiilor și setările profesorului, salvate în localStorage.
(function (root) {
  'use strict';

  var KEY_PROFILES = 'labirint.profiles';
  var KEY_CURRENT = 'labirint.current';
  var KEY_PIN = 'labirint.teacherPin';

  var memory = {}; // rezervă dacă localStorage nu e disponibil

  function read(key) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? memory[key] || null : v;
    } catch (e) {
      return memory[key] || null;
    }
  }

  function write(key, value) {
    memory[key] = value;
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    try { localStorage.removeItem(key); } catch (e) { /* ignorăm */ }
  }

  // „ana.p” -> „Ana.P”, „ana-maria.p” -> „Ana-Maria.P”. Întoarce null dacă formatul nu e bun.
  function normalizeName(raw) {
    var s = (raw || '').trim().replace(/\s+/g, '');
    var m = s.match(/^([A-Za-zĂÂÎȘȚăâîșțŞŢşţ]+(?:-[A-Za-zĂÂÎȘȚăâîșțŞŢşţ]+)*)\.([A-Za-zĂÂÎȘȚăâîșțŞŢşţ])\.?$/);
    if (!m) return null;
    var first = m[1].split('-').map(function (part) {
      return part.charAt(0).toLocaleUpperCase('ro') + part.slice(1).toLocaleLowerCase('ro');
    }).join('-');
    return first + '.' + m[2].toLocaleUpperCase('ro');
  }

  function loadAll() {
    try {
      return JSON.parse(read(KEY_PROFILES)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAll(profiles) {
    return write(KEY_PROFILES, JSON.stringify(profiles));
  }

  function newProfile(name) {
    var now = new Date().toISOString();
    return { name: name, avatar: null, progress: {}, drafts: {}, worlds: [1], created: now, lastSeen: now };
  }

  function getProfile(name) {
    return loadAll()[name] || null;
  }

  function saveProfile(profile) {
    var all = loadAll();
    profile.lastSeen = new Date().toISOString();
    all[profile.name] = profile;
    return saveAll(all);
  }

  function getOrCreate(name) {
    return getProfile(name) || newProfile(name);
  }

  function deleteProfile(name) {
    var all = loadAll();
    delete all[name];
    saveAll(all);
    if (getCurrent() === name) setCurrent(null);
  }

  function getCurrent() { return read(KEY_CURRENT); }
  function setCurrent(name) { if (name) write(KEY_CURRENT, name); else remove(KEY_CURRENT); }

  // ---------- Progres ----------
  function recordWin(profile, levelId, stars, blocks, program) {
    var prev = profile.progress[levelId] || {};
    profile.progress[levelId] = {
      stars: Math.max(prev.stars || 0, stars),
      blocks: prev.blocks ? Math.min(prev.blocks, blocks) : blocks,
      program: program,
      done: prev.done || new Date().toISOString()
    };
  }

  function totalStars(profile) {
    return Object.keys(profile.progress).reduce(function (s, k) { return s + (profile.progress[k].stars || 0); }, 0);
  }

  function isWorldUnlocked(profile, worldId) {
    return profile.worlds.indexOf(worldId) >= 0;
  }

  function setWorld(profile, worldId, unlocked) {
    var has = isWorldUnlocked(profile, worldId);
    if (unlocked && !has) profile.worlds.push(worldId);
    if (!unlocked && has && worldId !== 1) profile.worlds = profile.worlds.filter(function (w) { return w !== worldId; });
    profile.worlds.sort();
  }

  // ---------- PIN profesor ----------
  function hashPin(pin) {
    var h = 5381;
    var s = 'labirint:' + pin;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function hasPin() { return !!read(KEY_PIN); }
  function setPin(pin) { write(KEY_PIN, hashPin(pin)); }
  function checkPin(pin) { return read(KEY_PIN) === hashPin(pin); }

  // ---------- Export / import ----------
  function exportJSON(profiles) {
    return JSON.stringify({ app: 'labirintul-comorii', version: 1, exported: new Date().toISOString(), profiles: profiles || loadAll() }, null, 2);
  }

  // Adaugă în dst progresul din src: păstrează cele mai multe stele și toate lumile deblocate.
  function mergeProfile(dst, src) {
    Object.keys(src.progress || {}).forEach(function (lvl) {
      var a = dst.progress[lvl], b = src.progress[lvl];
      if (!a || (b.stars || 0) > (a.stars || 0)) dst.progress[lvl] = b;
    });
    (src.worlds || []).forEach(function (w) { setWorld(dst, w, true); });
    if (!dst.avatar && src.avatar && (src.avatar.type !== 'upload' || src.avatar.data)) dst.avatar = src.avatar;
    if ((src.lastSeen || '') > (dst.lastSeen || '')) dst.lastSeen = src.lastSeen;
    return dst;
  }

  // Unește profilurile importate cu cele existente.
  function importJSON(text) {
    var data = JSON.parse(text);
    var incoming = data && data.profiles;
    if (!incoming || typeof incoming !== 'object') throw new Error('Fișierul nu conține profiluri.');
    var all = loadAll();
    var added = 0, merged = 0, names = [];
    Object.keys(incoming).forEach(function (name) {
      var src = incoming[name];
      if (!src || !src.progress || normalizeName(name) !== name) return;
      names.push(name);
      var dst = all[name];
      if (!dst) {
        all[name] = Object.assign(newProfile(name), src);
        added++;
        return;
      }
      merged++;
      mergeProfile(dst, src);
    });
    if (!saveAll(all)) throw new Error('Nu mai e loc în memoria browserului.');
    return { added: added, merged: merged, names: names };
  }

  var api = {
    normalizeName: normalizeName, loadAll: loadAll, getProfile: getProfile, getOrCreate: getOrCreate,
    saveProfile: saveProfile, deleteProfile: deleteProfile, getCurrent: getCurrent, setCurrent: setCurrent,
    recordWin: recordWin, totalStars: totalStars, isWorldUnlocked: isWorldUnlocked, setWorld: setWorld,
    hasPin: hasPin, setPin: setPin, checkPin: checkPin, exportJSON: exportJSON, importJSON: importJSON,
    mergeProfile: mergeProfile
  };
  root.Store = api;
})(window);
