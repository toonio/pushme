/* Alarms — "do not wake me on a day I am not working".
 *
 * Android will tell any app the time of the next alarm clock set on the phone, through
 * AlarmManager.getNextAlarmClock(). It needs no permission. It also gives NOTHING but a
 * timestamp: no label, no repeat rule, no owning app. So the app cannot know that an
 * alarm is "the work alarm" — it can only know that an alarm exists, and when.
 *
 * The heuristic, stated plainly because a heuristic you cannot see is a bug waiting to
 * be blamed on something else: an alarm before a cut-off time (08:00 by default) is
 * treated as a work alarm. No alarm before then means a day off, and the nudges for
 * that day are not armed.
 *
 * Two limits, both deliberate:
 *
 *   Only the NEXT work day is ever gated. Beyond the immediate next alarm the phone
 *   tells us nothing, and an app that silently stops nudging for a fortnight because
 *   one evening had no alarm set has quietly deleted itself. Erring toward nudging is
 *   the recoverable mistake.
 *
 *   The check runs when the app is opened. If it is not opened the evening before, the
 *   nudges stand. The manual pause in Settings is the reliable control; this is the
 *   convenience on top of it.
 */
var Alarms = (function () {
  'use strict';

  function plugin() {
    var cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.NextAlarm) || null;
  }

  function available() { return !!plugin(); }

  /** The next alarm on the phone, as a Date, or null if there is none. */
  function next() {
    var p = plugin();
    if (!p) return Promise.resolve(undefined);      // undefined = "cannot tell", not "none"
    return p.next()
      .then(function (r) { return (r && r.found) ? new Date(r.triggerTime) : null; })
      .catch(function () { return undefined; });
  }

  /**
   * What to make of it. Pure, so every branch is testable without a phone.
   *   alarm: Date (an alarm), null (none set), undefined (cannot tell)
   * Returns { gate: 'go' | 'hold' | 'unknown', dayKey, reason }.
   */
  function verdict(alarm, settings, now) {
    if (!settings.requireAlarm) {
      return { gate: 'unknown', reason: 'alarm checking is switched off' };
    }
    if (alarm === undefined) {
      return { gate: 'unknown', reason: 'this build cannot read the phone’s alarms' };
    }

    var target = Schedule.nextWorkDay(now);
    if (!target) return { gate: 'unknown', reason: 'no work day ahead' };
    var targetKey = Utils.localDayKey(target);

    /* The next work day may be today — but if its window has already gone, the alarm
       that matters is the one for the day after. */
    if (targetKey === Utils.localDayKey(now)) {
      var st = Schedule.state(settings, now);
      if (st.phase === 'missed') {
        var after = Schedule.nextWorkDay(new Date(now.getTime() + 86400000));
        if (after) { target = after; targetKey = Utils.localDayKey(after); }
      }
    }

    if (alarm === null) {
      return { gate: 'hold', dayKey: targetKey,
               reason: 'no alarm is set at all, so ' + targetKey + ' looks like a day off' };
    }

    var alarmKey = Utils.localDayKey(alarm);

    /* An alarm for a later day says nothing good about the next work day: the days in
       between have no alarm on them. */
    if (alarmKey > targetKey) {
      return { gate: 'hold', dayKey: targetKey,
               reason: 'the next alarm is not until ' + alarmKey };
    }
    if (alarmKey < targetKey) {
      return { gate: 'unknown', dayKey: targetKey,
               reason: 'the next alarm is before the next work day, so it says nothing about it' };
    }

    var mins = Utils.minutesOfDay(alarm);
    var cutoff = Utils.parseHM(settings.alarmBefore);
    if (cutoff === null) return { gate: 'unknown', dayKey: targetKey, reason: 'unreadable cut-off time' };

    if (mins < cutoff) {
      return { gate: 'go', dayKey: targetKey,
               reason: 'an alarm at ' + Utils.formatHM(mins) + ' looks like a work alarm' };
    }
    return { gate: 'hold', dayKey: targetKey,
             reason: 'the alarm is at ' + Utils.formatHM(mins) + ', after ' + settings.alarmBefore };
  }

  /** The day keys whose nudges should not be armed. At most one. */
  function heldDayKeys(alarm, settings, now) {
    var v = verdict(alarm, settings, now);
    return (v.gate === 'hold' && v.dayKey) ? [v.dayKey] : [];
  }

  return {
    available: available, next: next, verdict: verdict, heldDayKeys: heldDayKeys
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Alarms;
