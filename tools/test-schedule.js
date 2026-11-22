/* Tests for the derived-deadline maths. Run: node tools/test-schedule.js */
const fs = require('fs');
const path = require('path');

const load = f => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8');
  return eval(src + '\n;(typeof module!=="undefined"&&module.exports)||null;'), eval(src.match(/^var (\w+)/m)[1]);
};
global.Utils = load('utils.js');
global.Schedule = load('schedule.js');

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

const S = { wakeAlarm: '06:45', leaveBy: '07:30', dressMin: 5, budgetMin: 10, bufferMin: 5 };
const at = (dow, hm) => {           // a date with a chosen weekday and time
  const d = new Date(2026, 10, 23); // Mon 23 Nov 2026
  d.setDate(d.getDate() + ((dow - 1 + 7) % 7));
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

console.log('— the owner\'s real numbers —');
const m = Schedule.moments(S);
is('valid', m.valid, true);
is('last call is 07:10', Utils.formatHM(m.lastCall), '07:10');
is('invitation is 06:50', Utils.formatHM(m.invitation), '06:50');

console.log('\n— derived, not hardcoded —');
is('leaving 15 min later moves the deadline',
  Utils.formatHM(Schedule.moments({ ...S, leaveBy: '07:45' }).lastCall), '07:25');
is('a longer session moves it earlier',
  Utils.formatHM(Schedule.moments({ ...S, budgetMin: 20 }).lastCall), '07:00');
is('waking later moves the invitation',
  Utils.formatHM(Schedule.moments({ ...S, wakeAlarm: '07:00' }).invitation), '07:05');

console.log('\n— settings that make no sense are refused, not guessed —');
is('leaving before waking', Schedule.moments({ ...S, leaveBy: '06:00' }).valid, false);
is('no room at all', Schedule.moments({ ...S, leaveBy: '07:00', budgetMin: 30 }).valid, false);
is('garbage time', Schedule.moments({ ...S, wakeAlarm: 'half six' }).valid, false);
is('garbage number', Schedule.moments({ ...S, dressMin: 'soon' }).valid, false);
is('invitation never lands after last call',
  Schedule.moments({ ...S, wakeAlarm: '07:09' }).invitation <= Schedule.moments({ ...S, wakeAlarm: '07:09' }).lastCall, true);

console.log('\n— the day\'s phases (Tuesday) —');
const phase = hm => Schedule.state(S, at(2, hm)).phase;
is('06:30 before the invitation', phase('06:30'), 'before');
is('06:50 the window opens', phase('06:50'), 'window');
is('07:00 still in the window', phase('07:00'), 'window');
is('07:10 last call', phase('07:10'), 'lastcall');
is('07:14 still fits (just)', phase('07:14'), 'lastcall');
is('07:16 no longer fits', phase('07:16'), 'missed');
is('08:00 missed', phase('08:00'), 'missed');

console.log('\n— Mon–Thu only, Friday is the weekend —');
[['Mon', 1, true], ['Tue', 2, true], ['Wed', 3, true], ['Thu', 4, true],
 ['Fri', 5, false], ['Sat', 6, false], ['Sun', 0, false]].forEach(([name, dow, want]) => {
  is(name + ' is a work day: ' + want, Schedule.isWorkDay(at(dow, '07:00')), want);
});
is('Friday reports offday', Schedule.state(S, at(5, '07:00')).phase, 'offday');
is('Friday schedules no nudges', Schedule.nudgesFor(S, at(5, '06:00')).length, 0);

console.log('\n— how much is left —');
is('at 06:50, 20 minutes to the deadline', Schedule.state(S, at(2, '06:50')).minutesLeft, 20);
is('at 07:12, 2 minutes past it', Schedule.state(S, at(2, '07:12')).minutesLeft, -2);
is('at 07:18, 7 minutes of room (short session territory)',
  Schedule.state(S, at(2, '07:18')).minutesAvailable, 7);
is('at 07:26 the wall is reached, no room left',
  Schedule.state(S, at(2, '07:26')).minutesAvailable, 0);
is('the buffer warns early without shortening the day: deadline 07:10, wall 07:25',
  [Utils.formatHM(Schedule.moments(S).lastCall),
   Utils.formatHM(Schedule.moments(S).leave - S.dressMin)], ['07:10', '07:25']);
is('at 07:05, a full session still fits', Schedule.state(S, at(2, '07:05')).fits, true);

console.log('\n— the nudges themselves —');
const n = Schedule.nudgesFor(S, at(2, '00:00'));
is('two of them', n.length, 2);
is('first is the invitation at 06:50', [n[0].kind, Utils.formatHM(Utils.minutesOfDay(n[0].at))], ['invitation', '06:50']);
is('second is the last call at 07:10', [n[1].kind, Utils.formatHM(Utils.minutesOfDay(n[1].at))], ['lastcall', '07:10']);
is('the last call names the deadline', /07:30/.test(n[1].body), true);

console.log('\n— next work day —');
is('Friday rolls to Monday', Schedule.nextWorkDay(at(5, '09:00')).getDay(), 1);
is('Sunday rolls to Monday', Schedule.nextWorkDay(at(0, '09:00')).getDay(), 1);
is('Tuesday is itself', Schedule.nextWorkDay(at(2, '09:00')).getDay(), 2);

console.log(fails ? `\n${fails} FAILED` : '\nall schedule tests pass');
process.exit(fails ? 1 : 0);
