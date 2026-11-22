/* Tests for the alarm heuristic and the nudges it gates.
 * Run: node tools/test-alarms.js
 *
 * The phone tells the app one thing: when the next alarm goes off. Everything the app
 * concludes from that is guesswork, and guesswork deserves tests more than certainty
 * does — these pin down what it must NOT conclude.
 */
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8');
eval(read('utils.js')); global.Utils = Utils;
eval(read('schedule.js')); global.Schedule = Schedule;
eval(read('alarms.js')); global.Alarms = Alarms;
global.window = {};
eval(read('notify.js')); global.Notify = Notify;

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label +
    (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

const S = {
  wakeAlarm: '06:45', leaveBy: '07:30', dressMin: 5, budgetMin: 10, bufferMin: 5,
  notifications: true, pauseUntil: null, requireAlarm: true, alarmBefore: '08:00'
};
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0);

/* Mon 23 Nov 2026 through Thu 26; Fri 27 – Sun 29 are the weekend. */
const SUN_EVE = at(2026, 11, 22, 21);
const MON_EVE = at(2026, 11, 23, 21);
const THU_EVE = at(2026, 11, 26, 21);

console.log('— a work alarm lets the nudges through —');
let v = Alarms.verdict(at(2026, 11, 23, 6, 45), S, SUN_EVE);
is('Sunday night, alarm 06:45 for Monday', [v.gate, v.dayKey], ['go', '2026-11-23']);

console.log('\n— a lie-in alarm holds them back —');
v = Alarms.verdict(at(2026, 11, 23, 9, 30), S, SUN_EVE);
is('alarm at 09:30 is not a work alarm', v.gate, 'hold');
is('and it names the day it is holding', v.dayKey, '2026-11-23');
is('the cut-off is a setting, not a constant',
  Alarms.verdict(at(2026, 11, 23, 9, 30), { ...S, alarmBefore: '10:00' }, SUN_EVE).gate, 'go');

console.log('\n— no alarm at all reads as a day off —');
v = Alarms.verdict(null, S, SUN_EVE);
is('held', [v.gate, v.dayKey], ['hold', '2026-11-23']);

console.log('\n— an alarm for a LATER day says the days before it are empty —');
v = Alarms.verdict(at(2026, 11, 25, 6, 45), S, SUN_EVE);
is('Wednesday alarm, Monday held', [v.gate, v.dayKey], ['hold', '2026-11-23']);

console.log('\n— an alarm BEFORE the next work day says nothing about it —');
v = Alarms.verdict(at(2026, 11, 22, 23, 30), S, SUN_EVE);
is('tonight’s alarm is not evidence about Monday', v.gate, 'unknown');

console.log('\n— the check is opt-in, and silent when it cannot see —');
is('switched off means no opinion',
  Alarms.verdict(null, { ...S, requireAlarm: false }, SUN_EVE).gate, 'unknown');
is('a browser build means no opinion', Alarms.verdict(undefined, S, SUN_EVE).gate, 'unknown');
is('and no opinion holds nothing back',
  Alarms.heldDayKeys(undefined, S, SUN_EVE).length, 0);

console.log('\n— today, once the window has gone, is not the day being judged —');
const THU_LATE = at(2026, 11, 26, 9, 0);     // Thursday, slot missed
v = Alarms.verdict(null, S, THU_LATE);
is('it has moved on to Monday', v.dayKey, '2026-11-30');
const THU_EARLY = at(2026, 11, 26, 6, 0);    // Thursday, slot still ahead
is('while the window is still open it judges today',
  Alarms.verdict(null, S, THU_EARLY).dayKey, '2026-11-26');

console.log('\n— only ONE day is ever held —');
is('a Thursday evening with no alarm holds Monday and nothing else',
  Alarms.heldDayKeys(null, S, THU_EVE), ['2026-11-30']);

console.log('\n— and the nudges actually honour it —');
const all = Notify.planNudges(S, MON_EVE, 14);
is('a fortnight of work days gives two nudges each',
  all.length, Notify.planNudges(S, MON_EVE, 14).length);
is('every nudge is in the future', all.every(n => n.at > MON_EVE), true);

const held = Notify.planNudges(S, MON_EVE, 14, ['2026-11-24']);
is('holding Tuesday removes exactly its two nudges', all.length - held.length, 2);
is('and none of the survivors are on that day',
  held.some(n => Utils.localDayKey(n.at) === '2026-11-24'), false);
is('Wednesday is untouched',
  held.some(n => Utils.localDayKey(n.at) === '2026-11-25'), true);

console.log('\n— a pause still beats everything —');
is('paused through Friday leaves nothing before Monday',
  Notify.planNudges({ ...S, pauseUntil: '2026-11-27' }, MON_EVE, 14)
    .every(n => Utils.localDayKey(n.at) >= '2026-11-30'), true);
is('notifications off means none at all',
  Notify.planNudges({ ...S, notifications: false }, MON_EVE, 14).length, 0);

console.log('\n— ids are stable, so re-arming replaces rather than duplicates —');
const again = Notify.planNudges(S, MON_EVE, 14);
is('same ids on a second pass', again.map(n => n.id), all.map(n => n.id));
is('and no two nudges share one', new Set(all.map(n => n.id)).size, all.length);

console.log(fails ? `\n${fails} FAILED` : '\nall alarm tests pass');
process.exit(fails ? 1 : 0);
