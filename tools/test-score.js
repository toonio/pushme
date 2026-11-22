/* Tests for the weekly scoring. Run: node tools/test-score.js
 *
 * The week that matters here is Mon 23 – Thu 26 November 2026.
 */
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8');
eval(read('utils.js')); global.Utils = Utils;
eval(read('schedule.js')); global.Schedule = Schedule;
eval(read('score.js')); global.Score = Score;

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label +
    (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

const on = (y, m, d, h = 7) => new Date(y, m - 1, d, h, 0, 0, 0);
let n = 0;
const sess = (date, opts = {}) => ({
  id: 's' + (++n), date: date.toISOString(), day: 'A',
  completed: opts.completed !== false, kind: opts.kind || 'full',
  durationSec: opts.durationSec || 540, exercises: []
});

const MON = on(2026, 11, 23), TUE = on(2026, 11, 24),
      WED = on(2026, 11, 25), THU = on(2026, 11, 26), FRI = on(2026, 11, 27);

console.log('— the week is four days long, because Friday is the weekend —');
let w = Score.week([], THU, 3, THU);
is('four work days', w.days.length, 4);
is('and they are Mon to Thu', w.days.map(d => d.date.getDay()), [1, 2, 3, 4]);

console.log('\n— three of four —');
w = Score.week([sess(MON), sess(TUE), sess(WED)], THU, 3, THU);
is('three full sessions', w.done, 3);
is('target met with Thursday still to come', w.met, true);
is('Thursday — today, nothing done yet — is open, not a miss',
  w.days.find(d => d.date.getDay() === 4).status, 'open');
is('a day after today is future',
  Score.week([], MON, 3, MON).days.find(d => d.date.getDay() === 3).status, 'future');
is('a past day with nothing on it is a miss',
  Score.week([], THU, 3, THU).days.find(d => d.date.getDay() === 2).status, 'miss');

console.log('\n— a short session is real, and is not a full one —');
w = Score.week([sess(MON), sess(TUE, { kind: 'short' })], WED, 3, WED);
is('one and a half', w.done, 1.5);
is('not met yet', w.met, false);
is('but still reachable with two days left', w.possible, true);
is('the short day is marked half', w.days.find(d => d.date.getDay() === 2).status, 'half');

console.log('\n— an abandoned session is not a session —');
w = Score.week([sess(MON, { completed: false })], TUE, 3, TUE);
is('scores nothing', w.done, 0);
is('but is distinguishable from never having started',
  w.days.find(d => d.date.getDay() === 1).status, 'abandoned');

console.log('\n— out of reach is said plainly —');
w = Score.week([sess(MON)], THU, 3, THU);
is('one done, one day left, target three', [w.done, w.remaining], [1, 1]);
is('not possible this week', w.possible, false);

console.log('\n— the streak counts weeks, not days —');
const weekOf = (mondayDate, count) => {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(mondayDate.getTime());
    d.setDate(d.getDate() + i);
    out.push(sess(d));
  }
  return out;
};
const prev1 = on(2026, 11, 16), prev2 = on(2026, 11, 9);
const history = [].concat(weekOf(prev2, 3), weekOf(prev1, 3));

is('two completed weeks behind you', Score.streakWeeks(history, THU, 3), 2);
is('the unfinished current week neither adds to nor breaks the streak',
  Score.streakWeeks(history, MON, 3), 2);
is('a current week that already met the target does count',
  Score.streakWeeks(history.concat(weekOf(MON, 3)), THU, 3), 3);
is('a finished week that missed breaks it',
  Score.streakWeeks(history.concat(weekOf(MON, 1)), on(2026, 12, 1), 3), 0);
is('no history, no streak', Score.streakWeeks([], THU, 3), 0);

console.log('\n— a missed Tuesday does not erase two months —');
const long = [];
for (let wk = 0; wk < 8; wk++) {
  const mon = new Date(2026, 8, 7 + wk * 7);        // Mondays from 7 Sep 2026
  long.push(sess(mon), sess(new Date(2026, 8, 8 + wk * 7)), sess(new Date(2026, 8, 9 + wk * 7)));
}
is('eight weeks of three-of-four survive the fourth day being blank every time',
  Score.streakWeeks(long, new Date(2026, 9, 29), 3), 8);

console.log('\n— the month grid —');
const grid = Score.monthGrid([sess(MON)], THU, THU);
is('thirty days in November', grid.days.length, 30);
is('Friday the 27th is a non-day', grid.days[26].status, 'nonday');
is('Monday the 23rd is full', grid.days[22].status, 'full');
is('the 30th is in the future', grid.days[29].status, 'future');

console.log('\n— totals —');
const t = Score.totals([sess(MON), sess(TUE, { kind: 'short', durationSec: 180 }),
                        sess(WED, { completed: false })]);
is('two completed, one abandoned', t.sessions, 2);
is('one full, one short', [t.full, t.short], [1, 1]);
is('twelve minutes in all', t.minutes, 12);

console.log(fails ? `\n${fails} FAILED` : '\nall score tests pass');
process.exit(fails ? 1 : 0);
