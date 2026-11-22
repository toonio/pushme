/* Settings — the four morning numbers, plus everything else that is a preference
 * rather than a fact. Synchronous, because every screen needs them immediately.
 *
 * The routine lives here too, as an editable copy of the catalogue's days. The owner
 * has a shoulder weakness whose diagnosis this app does not know; if a physiotherapist
 * hands over a different list, it has to be enterable without a code change.
 */
var Settings = (function () {
  'use strict';

  var KEY = 'pushme.settings';

  var DEFAULTS = {
    /* The morning. Everything the app does with time derives from these four. */
    wakeAlarm: '06:45',
    leaveBy: '07:30',
    dressMin: 5,
    budgetMin: 10,
    bufferMin: 5,

    /* The session. */
    restSec: 20,
    sound: true,
    vibrate: true,
    keepAwake: true,

    /* Nudges. */
    notifications: true,
    pauseUntil: null,          // ISO date string; no nudges on or before this day
    requireAlarm: false,       // only nudge if a phone alarm is set before alarmBefore
    alarmBefore: '08:00',

    /* Scoring. */
    weeklyTarget: 3,           // of the four work days

    /* The routine: null means "use the catalogue". */
    days: null
  };

  var cache = null;

  function load() {
    if (cache) return cache;
    var stored = {};
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) stored = JSON.parse(raw) || {};
    } catch (e) { stored = {}; }

    cache = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      cache[k] = (stored[k] === undefined) ? DEFAULTS[k] : stored[k];
    });
    return cache;
  }

  /** Merge a patch and persist. Returns the new settings. */
  function save(patch) {
    var s = load();
    Object.keys(patch || {}).forEach(function (k) { s[k] = patch[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* blocked */ }
    cache = s;
    return s;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing to do */ }
    cache = null;
    return load();
  }

  /**
   * The routine as the user has it — their edit if they made one, the catalogue
   * otherwise. Never returns a half-edited mixture, which would make it impossible to
   * tell whether a missing exercise was deleted or simply never copied.
   */
  function days() {
    var s = load();
    if (s.days && s.days.A && s.days.B) return s.days;
    return Exercises.DAYS;
  }

  function day(key) {
    var d = days();
    return d[key] || d.A;
  }

  /** Take a copy of the catalogue into settings, so it can be edited. */
  function forkRoutine() {
    var copy = JSON.parse(JSON.stringify(Exercises.DAYS));
    save({ days: copy });
    return copy;
  }

  function restoreRoutine() {
    save({ days: null });
    return Exercises.DAYS;
  }

  /** Paused through the end of settings.pauseUntil. */
  function isPaused(now) {
    var s = load();
    if (!s.pauseUntil) return false;
    return Utils.localDayKey(now || new Date()) <= String(s.pauseUntil);
  }

  return {
    DEFAULTS: DEFAULTS,
    load: load, save: save, reset: reset,
    days: days, day: day, forkRoutine: forkRoutine, restoreRoutine: restoreRoutine,
    isPaused: isPaused
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Settings;
