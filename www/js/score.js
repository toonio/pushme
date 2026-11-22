/* Score — the week, the streak, the month.
 *
 * The unit is the WEEK, not the day. A streak of days makes one missed Tuesday erase
 * two months of work, which is exactly the shape of feedback that makes people stop
 * opening the app. Three mornings out of four is the target; the fourth is allowed to
 * go wrong, and nothing is lost when it does.
 */
var Score = (function () {
  'use strict';

  var FULL = 1;
  var HALF = 0.5;      // a short session is real, and is not a full one

  /* Statuses: nonday, future, open, miss, abandoned, half, full.
     `open` is today with nothing done yet, and it is not a miss. Calling an empty
     Thursday morning a failure at 07:00 would mark the week lost while the week is
     still winnable, which is both wrong and the kind of thing that makes people stop
     opening the app. */
  function dayStatus(sessions, date, today) {
    var key = Utils.localDayKey(date);
    var todayKey = Utils.localDayKey(today || new Date());

    if (!Schedule.isWorkDay(date)) return 'nonday';
    if (key > todayKey) return 'future';

    var onDay = sessions.filter(function (s) {
      return s && Utils.localDayKey(new Date(s.date)) === key;
    });
    if (!onDay.length) return (key === todayKey) ? 'open' : 'miss';

    if (onDay.some(function (s) { return s.completed && s.kind !== 'short'; })) return 'full';
    if (onDay.some(function (s) { return s.completed; })) return 'half';
    return 'abandoned';
  }

  function valueOf(status) {
    if (status === 'full') return FULL;
    if (status === 'half') return HALF;
    return 0;
  }

  /** The Mon–Thu picture for the week containing `date`. */
  function week(sessions, date, target, today) {
    var start = Utils.weekStart(date);
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(start.getTime());
      d.setDate(d.getDate() + i);
      if (!Schedule.isWorkDay(d)) continue;
      days.push({ date: d, status: dayStatus(sessions, d, today) });
    }

    var done = days.reduce(function (sum, d) { return sum + valueOf(d.status); }, 0);
    var remaining = days.filter(function (d) {
      return d.status === 'future' || d.status === 'open';
    }).length;
    var want = target || 3;

    return {
      key: Utils.weekKey(start),
      start: start,
      days: days,
      done: done,
      target: want,
      met: done >= want,
      // Still reachable? The difference between "not yet" and "not this week".
      possible: (done + remaining) >= want,
      remaining: remaining
    };
  }

  /**
   * Consecutive weeks that hit the target, counting back from now.
   *
   * The current week is skipped rather than counted against you while it is still
   * running: on a Monday morning every streak would otherwise read zero, which would
   * be both demoralising and false.
   */
  function streakWeeks(sessions, now, target) {
    var at = Utils.weekStart(now || new Date());
    var count = 0;
    var first = true;

    for (var i = 0; i < 260; i++) {        // five years is plenty
      var w = week(sessions, at, target, now);
      if (w.met) {
        count++;
      } else if (first && w.remaining > 0) {
        // This week is not over; neither a win nor a loss yet.
      } else {
        break;
      }
      first = false;
      at = new Date(at.getTime());
      at.setDate(at.getDate() - 7);
    }
    return count;
  }

  /** Every day of the month containing `date`, in order, with its status. */
  function monthGrid(sessions, date, today) {
    var d = date || new Date();
    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var out = [];
    var cursor = new Date(first.getTime());
    while (cursor.getMonth() === first.getMonth()) {
      out.push({ date: new Date(cursor.getTime()), status: dayStatus(sessions, cursor, today) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { month: first, days: out };
  }

  /** Headline numbers for the Progress screen. */
  function totals(sessions) {
    var completed = (sessions || []).filter(function (s) { return s && s.completed; });
    return {
      sessions: completed.length,
      full: completed.filter(function (s) { return s.kind !== 'short'; }).length,
      short: completed.filter(function (s) { return s.kind === 'short'; }).length,
      minutes: Math.round(completed.reduce(function (sum, s) {
        return sum + (s.durationSec || 0);
      }, 0) / 60)
    };
  }

  return {
    FULL: FULL, HALF: HALF,
    dayStatus: dayStatus, week: week, streakWeeks: streakWeeks,
    monthGrid: monthGrid, totals: totals
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Score;
