/* Progression — what to ask of you today, from what you actually did before.
 *
 * Rules, in order:
 *   1. No history for an exercise -> the catalogue opener, flagged as calibration.
 *      The first completed run overwrites it with reality, so my invented numbers
 *      never survive contact.
 *   2. Otherwise -> last achievement + a step (1 rep, or 5 seconds).
 *   3. Two consecutive misses -> back off to what was actually managed, and stop
 *      climbing until it is met again. A target you keep failing is a target you
 *      stop attempting.
 *
 * "Eased off" sessions (the too-hard-today button) record the real number but are
 * never counted as misses: the point of that button is to keep a bad morning from
 * resetting progress, and punishing its use would defeat it.
 */
var Progression = (function () {
  'use strict';

  var REP_STEP = 1;
  var HOLD_STEP = 5;          // seconds
  var MISSES_BEFORE_BACKOFF = 2;
  var MISS_TOLERANCE = 0.9;   // within 10% of target counts as met, not missed

  function stepFor(type) { return type === 'hold' ? HOLD_STEP : REP_STEP; }

  /**
   * Every recorded attempt at one exercise, newest first.
   * Only completed sessions count — an abandoned session says nothing about capacity.
   */
  function historyFor(sessions, exerciseKey) {
    var out = [];
    (sessions || []).forEach(function (s) {
      if (!s || !s.completed) return;
      (s.exercises || []).forEach(function (e) {
        if (e.key !== exerciseKey) return;
        out.push({
          date: s.date, target: e.target, achieved: e.achieved,
          easedOff: !!e.easedOff, kind: s.kind || 'full'
        });
      });
    });
    out.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return out;
  }

  function met(attempt) {
    return attempt.achieved >= attempt.target * MISS_TOLERANCE;
  }

  /**
   * Today's target for one exercise.
   * Returns { target, basis, calibrating, backedOff }.
   */
  function targetFor(sessions, item, exercise) {
    var opener = item.target;
    var history = historyFor(sessions, item.key);

    if (!history.length) {
      return { target: opener, basis: 'opener', calibrating: true, backedOff: false };
    }

    var last = history[0];
    var step = stepFor(exercise.type);

    /* The first completed run IS the calibration, so it sets the baseline whether or
       not it met the opener. Treating it as an ordinary attempt would let an invented
       number survive as a target that is simply failed every morning — which is the
       opposite of what the opener is for. An eased-off or short first run is not a
       calibration, so it does not get this treatment. */
    if (history.length === 1 && !last.easedOff && last.kind !== 'short') {
      return { target: Math.max(1, last.achieved + step), basis: 'calibrated from your first run',
               calibrating: false, backedOff: false };
    }

    // Count consecutive recent misses, ignoring eased-off and short sessions: neither
    // is evidence that the target is too high.
    var misses = 0;
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (h.easedOff || h.kind === 'short') continue;
      if (met(h)) break;
      misses++;
      if (misses >= MISSES_BEFORE_BACKOFF) break;
    }

    if (misses >= MISSES_BEFORE_BACKOFF) {
      // Sit at what was actually managed rather than climbing away from it.
      var floor = Math.max(1, history[0].achieved);
      return { target: floor, basis: 'backed off after ' + misses + ' misses',
               calibrating: false, backedOff: true };
    }

    if (last.easedOff || last.kind === 'short') {
      // Hold station: an easy day neither advances nor sets you back.
      var holdAt = Math.max(last.target, 1);
      return { target: holdAt, basis: 'held after an easy day', calibrating: false, backedOff: false };
    }

    if (met(last)) {
      return { target: Math.max(1, last.achieved + step), basis: 'last + ' + step,
               calibrating: false, backedOff: false };
    }

    return { target: Math.max(1, last.target), basis: 'repeat', calibrating: false, backedOff: false };
  }

  /** Today's whole plan for a day key. */
  function planFor(sessions, dayKey) {
    var day = Exercises.day(dayKey);
    return {
      day: day.key,
      name: day.name,
      focus: day.focus,
      items: day.items.map(function (item) {
        var ex = Exercises.get(item.key);
        var t = targetFor(sessions, item, ex);
        return {
          key: item.key, name: ex.name, type: ex.type, unit: ex.unit,
          perSide: !!ex.perSide, sets: item.sets || 1,
          target: t.target, basis: t.basis, calibrating: t.calibrating, backedOff: t.backedOff
        };
      })
    };
  }

  /**
   * Which day comes next. A/B alternate, advancing only on COMPLETED sessions, so
   * skipping a morning does not flip you onto the other day and quietly halve one
   * side of the routine.
   */
  function nextDayKey(sessions) {
    var done = (sessions || []).filter(function (s) { return s && s.completed; });
    if (!done.length) return 'A';
    done.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return done[0].day === 'A' ? 'B' : 'A';
  }

  /** Headline change per exercise: where you started, where you are. */
  function progressSummary(sessions) {
    var keys = {};
    (sessions || []).forEach(function (s) {
      if (!s || !s.completed) return;
      (s.exercises || []).forEach(function (e) { keys[e.key] = true; });
    });

    return Object.keys(keys).map(function (key) {
      var ex = Exercises.get(key);
      var history = historyFor(sessions, key);         // newest first
      var first = history[history.length - 1];
      var best = history.reduce(function (acc, h) {
        return (!acc || h.achieved > acc.achieved) ? h : acc;
      }, null);
      return {
        key: key,
        name: ex ? ex.name : key,
        type: ex ? ex.type : 'reps',
        unit: ex ? ex.unit : '',
        first: first ? first.achieved : 0,
        latest: history[0] ? history[0].achieved : 0,
        best: best ? best.achieved : 0,
        delta: (history[0] ? history[0].achieved : 0) - (first ? first.achieved : 0),
        sessions: history.length,
        series: history.slice().reverse().map(function (h) {
          return { date: h.date, value: h.achieved };
        })
      };
    }).sort(function (a, b) { return b.sessions - a.sessions; });
  }

  return {
    REP_STEP: REP_STEP, HOLD_STEP: HOLD_STEP,
    MISSES_BEFORE_BACKOFF: MISSES_BEFORE_BACKOFF, MISS_TOLERANCE: MISS_TOLERANCE,
    historyFor: historyFor, targetFor: targetFor, planFor: planFor,
    nextDayKey: nextDayKey, progressSummary: progressSummary
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Progression;
