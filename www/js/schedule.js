/* Schedule — the whole point of the app, as a pure function.
 *
 * Everything is derived from four numbers so that changing the leave time moves the
 * nudges with it. Nothing here is hardcoded to 06:50 or 07:10; those are what the
 * defaults happen to produce.
 *
 *   last call  = leaveBy − dressing − budget − buffer
 *   invitation = wakeAlarm + INVITATION_AFTER_WAKE
 *
 * No DOM, no storage, no clock of its own — the caller passes `now`, so every branch
 * is testable without waiting for a Tuesday morning.
 */
var Schedule = (function () {
  'use strict';

  var INVITATION_AFTER_WAKE = 5;     // minutes; long enough to be upright

  /* Friday is part of the weekend here, so the work week is Mon–Thu. */
  var WORK_DAYS = [1, 2, 3, 4];

  function isWorkDay(date) {
    return WORK_DAYS.indexOf(date.getDay()) > -1;
  }

  /**
   * The day's moments, in minutes since midnight.
   * `s` is the settings object; invalid or inverted values yield `valid: false`
   * rather than a plausible-looking wrong number.
   */
  function moments(s) {
    var wake = Utils.parseHM(s.wakeAlarm);
    var leave = Utils.parseHM(s.leaveBy);
    var dress = Number(s.dressMin);
    var budget = Number(s.budgetMin);
    var buffer = Number(s.bufferMin);

    if (wake === null || leave === null ||
        !isFinite(dress) || !isFinite(budget) || !isFinite(buffer)) {
      return { valid: false, reason: 'unreadable settings' };
    }

    var lastCall = leave - dress - budget - buffer;
    var invitation = wake + INVITATION_AFTER_WAKE;

    if (leave <= wake) return { valid: false, reason: 'you leave before you wake' };
    if (lastCall <= wake) {
      // The morning is too short to hold a session at all — say so rather than
      // scheduling a nudge for before the alarm.
      return { valid: false, reason: 'no room for a session between waking and leaving' };
    }

    return {
      valid: true,
      wake: wake,
      invitation: Math.min(invitation, lastCall),   // never after the last call
      lastCall: lastCall,
      leave: leave,
      budget: budget
    };
  }

  /**
   * What the Today screen needs, for a given instant.
   *   phase: 'before' | 'window' | 'lastcall' | 'missed' | 'offday'
   *   minutesLeft: until the last call (negative once past it)
   *   fits: whether a full session still fits before the deadline
   */
  function state(s, now) {
    var m = moments(s);
    if (!m.valid) return { phase: 'invalid', reason: m.reason, moments: m };

    if (!isWorkDay(now)) {
      return { phase: 'offday', moments: m, minutesLeft: null, fits: false };
    }

    var mins = Utils.minutesOfDay(now);
    var minutesLeft = m.lastCall - mins;

    /* Two different deadlines, and conflating them is a bug worth naming.
       The HARD wall is leaving minus dressing: past it a session genuinely cannot
       finish. The ADVISORY deadline — the last call — sits a buffer earlier, and its
       only job is to warn early. The buffer must not shorten the real day, or the app
       starts claiming a session is impossible while six usable minutes remain. */
    var hardFinish = m.leave - Number(s.dressMin);
    var fits = (mins + m.budget) <= hardFinish;

    var phase;
    if (mins < m.invitation) phase = 'before';
    else if (mins < m.lastCall) phase = 'window';
    else if (fits) phase = 'lastcall';
    else phase = 'missed';

    return {
      phase: phase,
      moments: m,
      minutesLeft: minutesLeft,
      fits: fits,
      // How long a session could still be, if a full one no longer fits.
      minutesAvailable: Math.max(0, hardFinish - mins)
    };
  }

  /**
   * The notifications to schedule for a given day, as {at: Date, kind, title, body}.
   * Returns [] when the day isn't a work day or the settings don't allow a session —
   * the caller never has to repeat those rules.
   */
  function nudgesFor(s, date) {
    if (!isWorkDay(date)) return [];
    var m = moments(s);
    if (!m.valid) return [];

    return [
      {
        kind: 'invitation',
        at: Utils.atMinutes(date, m.invitation),
        title: 'Ten minutes now and it is banked',
        body: 'Before breakfast is the easy slot. Last call at ' + Utils.formatHM(m.lastCall) + '.'
      },
      {
        kind: 'lastcall',
        at: Utils.atMinutes(date, m.lastCall),
        title: 'Last call — start now or it will not fit',
        body: m.budget + ' minutes, then dressed and out by ' + Utils.formatHM(m.leave) + '.'
      }
    ];
  }

  /** The next work day at or after `date`, as a Date at midnight. */
  function nextWorkDay(date) {
    var d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    for (var i = 0; i < 8; i++) {
      if (isWorkDay(d)) return d;
      d.setDate(d.getDate() + 1);
    }
    return null;
  }

  return {
    INVITATION_AFTER_WAKE: INVITATION_AFTER_WAKE,
    WORK_DAYS: WORK_DAYS,
    isWorkDay: isWorkDay,
    moments: moments,
    state: state,
    nudgesFor: nudgesFor,
    nextWorkDay: nextWorkDay
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Schedule;
