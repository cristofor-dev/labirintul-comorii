// Trimite rezultatele în Supabase și le citește pentru panoul profesorului.
// Fără configurare (js/config.js), totul rămâne doar în browser.
(function (root) {
  'use strict';

  var cfg = root.LABIRINT_CONFIG || {};
  var url = (cfg.supabaseUrl || '').replace(/\/+$/, '');
  var key = cfg.supabaseKey || '';
  var enabled = !!(url && key);

  var KEY_PENDING = 'labirint.pendingSync'; // copiii ale căror rezultate încă nu au ajuns online
  var KEY_MIGRATED = 'labirint.cloudMigrated';
  var RETRY_MS = 30000;
  var PULL_TIMEOUT_MS = 4000;

  function rpc(fn, args) {
    var headers = { 'Content-Type': 'application/json', apikey: key };
    // cheile noi „sb_publishable_…” nu se trimit ca Bearer; cheia veche „anon” (JWT) da
    if (!/^sb_/.test(key)) headers.Authorization = 'Bearer ' + key;
    return fetch(url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { /* răspuns care nu e JSON */ }
          if (!res.ok) {
            var err = new Error((data && data.message) || 'Eroare ' + res.status);
            err.code = data && data.code;
            throw err;
          }
          return data;
        });
      });
  }

  function isWrongPassword(err) { return !!err && err.code === '28P01'; }

  // ---------- Coada de trimis ----------
  function pending() {
    try { return JSON.parse(localStorage.getItem(KEY_PENDING)) || []; } catch (e) { return []; }
  }
  function setPending(names) {
    try { localStorage.setItem(KEY_PENDING, JSON.stringify(names)); } catch (e) { /* încercăm data viitoare */ }
  }

  // Pozele încărcate de copii rămân doar pe calculator; online trimitem doar personajele din joc.
  function publicAvatar(a) {
    if (!a) return null;
    return a.type === 'preset' ? { type: 'preset', id: a.id } : { type: 'upload' };
  }

  function payload(p) {
    var progress = {};
    Object.keys(p.progress || {}).forEach(function (id) {
      var x = p.progress[id];
      progress[id] = { stars: x.stars || 0, blocks: x.blocks || 0, program: x.program || null, done: x.done || null };
    });
    return { p_name: p.name, p_avatar: publicAvatar(p.avatar), p_progress: progress };
  }

  var running = null;
  var retryTimer = null;

  // Adaugă copiii în coadă și o trimite. Promisiunea se rezolvă când coada s-a golit.
  function queue(names) {
    if (!enabled) return Promise.resolve();
    var list = pending();
    [].concat(names).forEach(function (n) { if (list.indexOf(n) < 0) list.push(n); });
    setPending(list);
    return flush();
  }

  function flush() {
    if (!enabled) return Promise.resolve();
    if (!running) {
      var done = function () { running = null; };
      running = drain();
      running.then(done, done);
    }
    return running;
  }

  function drop(name) { setPending(pending().filter(function (n) { return n !== name; })); }

  function drain() {
    var name = pending()[0];
    if (!name) return Promise.resolve();
    var p = Store.getProfile(name);
    if (!p) { drop(name); return drain(); }
    return rpc('sync_student', payload(p)).then(function () {
      drop(name);
      return drain();
    }, function (err) {
      // date respinse de server (ex. nume invalid): renunțăm la ele, altfel blochează coada
      if (err && /^(22|23|P0)/.test(err.code || '')) { drop(name); return drain(); }
      clearTimeout(retryTimer);
      retryTimer = setTimeout(flush, RETRY_MS);
      throw err;
    });
  }

  // Profilul copilului salvat online (de pe alt calculator), sau null. Nu așteaptă mai mult de câteva secunde.
  function pull(name) {
    if (!enabled) return Promise.resolve(null);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, PULL_TIMEOUT_MS); });
    return Promise.race([rpc('get_student', { p_name: name }).catch(function () { return null; }), timeout]);
  }

  // ---------- Profesor ----------
  var teacher = {
    list: function (pw) { return rpc('teacher_students', { p_password: pw }).then(function (d) { return d || {}; }); },
    setWorld: function (pw, name, world, open) {
      return rpc('teacher_set_world', { p_password: pw, p_name: name, p_world: world, p_open: open });
    },
    remove: function (pw, name) { return rpc('teacher_delete_student', { p_password: pw, p_name: name }); },
    changePassword: function (pw, next) { return rpc('teacher_change_password', { p_password: pw, p_new: next }); }
  };

  if (enabled) {
    // prima dată când site-ul are Supabase, trimitem și progresul strâns până acum pe acest calculator
    try {
      if (!localStorage.getItem(KEY_MIGRATED)) {
        localStorage.setItem(KEY_MIGRATED, '1');
        setPending(pending().concat(Object.keys(Store.loadAll()).filter(function (n) { return pending().indexOf(n) < 0; })));
      }
    } catch (e) { /* fără localStorage nu avem ce trimite */ }
    flush().catch(function () { /* reîncearcă singur */ });
    root.addEventListener('online', function () { flush().catch(function () {}); });
  }

  root.Cloud = { enabled: enabled, queue: queue, pull: pull, teacher: teacher, isWrongPassword: isWrongPassword };
})(window);
