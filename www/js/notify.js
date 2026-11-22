/* Notify — the nudges, and the honest admission that a web page cannot deliver them.
 *
 * In a browser this module does nothing but report that it can do nothing. That is
 * deliberate: a static page has no way to wake you at 06:50 — web push needs a server,
 * and periodic background sync is engagement-driven with no time-of-day guarantee — so
 * pretending otherwise would leave the app's one job silently unperformed. The web
 * build stays fully usable for everything else, and the Today screen says which build
 * you are on.
 *
 * Under Capacitor the same calls schedule real local notifications.
 */
var Notify = (function () {
  'use strict';

  var DAYS_AHEAD = 14;     // re-armed on every launch, so this is only a safety margin

  function plugin() {
    var cap = window.Capacitor;
    if (!cap || !cap.Plugins || !cap.Plugins.LocalNotifications) return null;
    return cap.Plugins.LocalNotifications;
  }

  function available() { return !!plugin(); }

  function requestPermission() {
    var p = plugin();
    if (!p) return Promise.resolve('unavailable');
    return p.requestPermissions()
      .then(function (r) { return r && r.display; })
      .catch(function () { return 'denied'; });
  }

  /* A stable id per nudge, so re-arming replaces rather than duplicates. Month, day and
     kind fit comfortably in the 32-bit id Android expects, and the pattern only repeats
     a year later, by which time the notification is long gone. */
  function idFor(date, kindIndex) {
    return (date.getMonth() + 1) * 1000 + date.getDate() * 10 + kindIndex;
  }

  var KIND_INDEX = { invitation: 1, lastcall: 2 };

  /**
   * What should be scheduled for the next fortnight, given settings and a start date.
   * Pure — no plugin, no clock of its own — so the decision of what to send can be
   * tested without a device, which is the half of this module most likely to be wrong.
   */
  function planNudges(settings, from, daysAhead) {
    if (!settings.notifications) return [];
    var out = [];
    var start = from || new Date();
    var base = new Date(start.getTime());
    base.setHours(0, 0, 0, 0);

    for (var i = 0; i < (daysAhead || DAYS_AHEAD); i++) {
      var day = new Date(base.getTime());
      day.setDate(day.getDate() + i);

      /* A pause is a whole-day veto, checked per day rather than once, so a pause that
         ends on Wednesday still leaves Thursday's nudges armed. */
      if (settings.pauseUntil && Utils.localDayKey(day) <= String(settings.pauseUntil)) continue;

      Schedule.nudgesFor(settings, day).forEach(function (n) {
        if (n.at <= start) return;          // never schedule something already past
        out.push({
          id: idFor(n.at, KIND_INDEX[n.kind] || 9),
          kind: n.kind, at: n.at, title: n.title, body: n.body
        });
      });
    }
    return out;
  }

  /** Cancel everything previously set, then arm the next fortnight. */
  function arm(settings, now) {
    var p = plugin();
    if (!p) return Promise.resolve({ armed: 0, available: false });

    var wanted = planNudges(settings, now || new Date(), DAYS_AHEAD);

    return cancelAll().then(function () {
      if (!wanted.length) return { armed: 0, available: true };
      return p.schedule({
        notifications: wanted.map(function (n) {
          return {
            id: n.id,
            title: n.title,
            body: n.body,
            schedule: { at: n.at, allowWhileIdle: true },
            extra: { kind: n.kind }
          };
        })
      }).then(function () { return { armed: wanted.length, available: true }; });
    });
  }

  function cancelAll() {
    var p = plugin();
    if (!p) return Promise.resolve(0);
    return p.getPending().then(function (pending) {
      var existing = (pending && pending.notifications) || [];
      if (!existing.length) return 0;
      return p.cancel({ notifications: existing.map(function (n) { return { id: n.id }; }) })
        .then(function () { return existing.length; });
    }).catch(function () { return 0; });
  }

  return {
    DAYS_AHEAD: DAYS_AHEAD,
    available: available, requestPermission: requestPermission,
    planNudges: planNudges, arm: arm, cancelAll: cancelAll, idFor: idFor
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Notify;
