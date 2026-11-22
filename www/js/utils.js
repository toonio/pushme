/* Utils — pure helpers. No DOM, no storage, so the maths can be tested on its own. */
var Utils = (function () {
  'use strict';

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var hex = [];
    for (var i = 0; i < 16; i++) hex.push(((Math.random() * 256) | 0 + 0x100).toString(16).slice(-2));
    return hex.join('');
  }

  /* --------------------------- clock arithmetic -------------------------- */

  /** "06:45" -> minutes since midnight. Returns null on anything unparseable. */
  function parseHM(text) {
    var m = String(text == null ? '' : text).trim().match(/^(\d{1,2})\s*[:h.]\s*(\d{1,2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
    return h * 60 + min;
  }

  /** Minutes since midnight -> "06:45". Wraps within the day. */
  function formatHM(minutes) {
    var m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }

  /** Minutes since midnight for a Date, in local time. */
  function minutesOfDay(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  /** A Date today at the given minutes-since-midnight. */
  function atMinutes(date, minutes) {
    var d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    d.setMinutes(minutes);
    return d;
  }

  /** "1:07:32" past an hour, "7:32" below it. */
  function formatDuration(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    sec = Math.round(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? h + ':' + pad2(m) + ':' + pad2(s) : m + ':' + pad2(s);
  }

  /** Always mm:ss — used by the hold countdowns. */
  function formatClock(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + pad2(sec % 60);
  }

  function localDayKey(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  /** Monday 00:00 of the week containing d. */
  function weekStart(d) {
    var dt = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return dt;
  }

  function weekKey(d) {
    return localDayKey(weekStart(d));
  }

  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  return {
    pad2: pad2, clamp: clamp, uuid: uuid,
    parseHM: parseHM, formatHM: formatHM, minutesOfDay: minutesOfDay, atMinutes: atMinutes,
    formatDuration: formatDuration, formatClock: formatClock,
    localDayKey: localDayKey, weekStart: weekStart, weekKey: weekKey,
    DAY_NAMES: DAY_NAMES, MONTHS: MONTHS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Utils;
