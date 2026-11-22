/* Storage — sessions in IndexedDB, settings and the in-flight draft in localStorage.
 *
 * Two stores on purpose. Settings are tiny, read by every screen, and needed before
 * the first paint; sessions grow without bound and are only ever read in bulk. Making
 * settings async would mean waiting on a transaction to learn what time you leave the
 * house, and every view would have to handle "not known yet".
 */
var DB = (function () {
  'use strict';

  var NAME = 'pushme';
  var VERSION = 1;
  var DRAFT_KEY = 'pushme.draft';
  var opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB here')); return; }
      var req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('sessions')) {
          var store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('date', 'date');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return opening;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('sessions', mode);
        var store = t.objectStore('sessions');
        var result;
        try { result = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(result && result.__req ? result.__req.result : result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  /** Every session, oldest first. The whole history is a few hundred rows at most. */
  function allSessions() {
    return tx('readonly', function (store) {
      var req = store.getAll();
      return { __req: req };
    }).then(function (rows) {
      rows = rows || [];
      rows.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      return rows;
    }).catch(function () { return []; });
  }

  function putSession(session) {
    return tx('readwrite', function (store) { store.put(session); return session; });
  }

  function removeSession(id) {
    return tx('readwrite', function (store) { store.delete(id); return id; });
  }

  function clearSessions() {
    return tx('readwrite', function (store) { store.clear(); return true; });
  }

  /* ------------------------------ the draft ------------------------------- */
  /* A session in progress, written on every step. Ten minutes is short enough that
     losing one is survivable, but a phone that kills the app mid-plank should not
     also erase the eight exercises already done. */

  function saveDraft(draft) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (e) { /* full or blocked */ }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* nothing to do */ }
  }

  /* ----------------------------- export/import ---------------------------- */

  function exportJSON() {
    return allSessions().then(function (sessions) {
      return JSON.stringify({
        app: 'pushme', version: 1, exportedAt: new Date().toISOString(),
        settings: (typeof Settings !== 'undefined') ? Settings.load() : null,
        sessions: sessions
      }, null, 2);
    });
  }

  /**
   * Import, merging by id. Existing rows with the same id are overwritten; nothing is
   * deleted. Returns a count so the caller can report what actually happened rather
   * than claiming success.
   */
  function importJSON(text, opts) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return Promise.reject(new Error('not valid JSON')); }
    if (!data || !Array.isArray(data.sessions)) return Promise.reject(new Error('no sessions in that file'));

    var good = data.sessions.filter(function (s) {
      return s && s.id && s.date && Array.isArray(s.exercises);
    });

    return tx('readwrite', function (store) {
      good.forEach(function (s) { store.put(s); });
      return good.length;
    }).then(function (n) {
      if (opts && opts.withSettings && data.settings && typeof Settings !== 'undefined') {
        Settings.save(data.settings);
      }
      return { imported: n, skipped: data.sessions.length - n };
    });
  }

  return {
    allSessions: allSessions, putSession: putSession,
    removeSession: removeSession, clearSessions: clearSessions,
    saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft,
    exportJSON: exportJSON, importJSON: importJSON
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DB;
