/* Tests for the progression rules. Run: node tools/test-progression.js */
const fs = require('fs');
const path = require('path');

// Minimal DOM so exercises.js (which builds SVG) can load headlessly.
global.document = {
  createElementNS: () => ({ setAttribute() {}, appendChild() {} })
};
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8');
eval(read('utils.js')); global.Utils = Utils;
eval(read('exercises.js')); global.Exercises = Exercises;
eval(read('progression.js')); global.Progression = Progression;

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

let clock = Date.parse('2026-11-23T06:52:00Z');
const session = (day, exercises, opts = {}) => ({
  id: 'x' + (clock += 86400000), date: new Date(clock).toISOString(), day,
  completed: opts.completed !== false, kind: opts.kind || 'full',
  durationSec: 540, exercises
});
const ex = (key, target, achieved, easedOff = false) => ({ key, target, achieved, easedOff });
const pushups = Exercises.get('pushups');
const plank = Exercises.get('plank');
const itemPush = { key: 'pushups', target: 20 };
const itemPlank = { key: 'plank', target: 45 };

console.log('— calibration: my invented numbers do not survive contact —');
let t = Progression.targetFor([], itemPush, pushups);
is('no history uses the opener', [t.target, t.calibrating], [20, true]);
const firstRun = [session('A', [ex('pushups', 20, 17)])];
t = Progression.targetFor(firstRun, itemPush, pushups);
is('after a first run of 17, the opener is gone', t.calibrating, false);
is('and the target follows reality, not the opener', t.target, 18);
is('a first run that beats the opener calibrates upward too',
  Progression.targetFor([session('A', [ex('pushups', 20, 26)])], itemPush, pushups).target, 27);
is('an eased-off first run is not a calibration',
  Progression.targetFor([session('A', [ex('pushups', 20, 5, true)])], itemPush, pushups).target, 20);

console.log('\n— climbing —');
is('reps step by 1',
  Progression.targetFor([session('A', [ex('pushups', 20, 20)])], itemPush, pushups).target, 21);
is('holds step by 5',
  Progression.targetFor([session('A', [ex('plank', 45, 45)])], itemPlank, plank).target, 50);
is('beating the target climbs from the achievement, not the target',
  Progression.targetFor([session('A', [ex('pushups', 20, 25)])], itemPush, pushups).target, 26);

console.log('\n— near misses are not misses —');
is('18 of 20 is within tolerance, so it still climbs',
  Progression.targetFor([session('A', [ex('pushups', 20, 18)])], itemPush, pushups).target, 19);
// needs prior history: with only one session it would be a calibration run, not a miss
is('a single real miss repeats the target, it does not drop',
  Progression.targetFor([session('A', [ex('pushups', 19, 19)]),
                         session('A', [ex('pushups', 20, 12)])], itemPush, pushups).target, 20);

console.log('\n— two misses back off —');
const twoMisses = [session('A', [ex('pushups', 20, 12)]), session('A', [ex('pushups', 20, 11)])];
t = Progression.targetFor(twoMisses, itemPush, pushups);
is('backs off to what was actually managed', t.target, 11);
is('and says so', t.backedOff, true);

console.log('\n— the too-hard-today button must not punish you —');
const easedTwice = [session('A', [ex('pushups', 22, 9, true)]), session('A', [ex('pushups', 22, 8, true)])];
t = Progression.targetFor(easedTwice, itemPush, pushups);
is('two eased-off days do not trigger a back-off', t.backedOff, false);
is('they hold station at the standing target', t.target, 22);
const easedThenMiss = [session('A', [ex('pushups', 20, 10)]), session('A', [ex('pushups', 20, 9, true)])];
is('an eased day does not count toward the miss streak',
  Progression.targetFor(easedThenMiss, itemPush, pushups).backedOff, false);

console.log('\n— short sessions are not evidence either —');
const shortThenShort = [session('A', [ex('pushups', 20, 8)], { kind: 'short' }),
                        session('A', [ex('pushups', 20, 7)], { kind: 'short' })];
is('two short sessions do not back you off',
  Progression.targetFor(shortThenShort, itemPush, pushups).backedOff, false);

console.log('\n— abandoned sessions say nothing about capacity —');
is('an abandoned session is ignored entirely',
  Progression.targetFor([session('A', [ex('pushups', 20, 3)], { completed: false })], itemPush, pushups).calibrating, true);

console.log('\n— A/B alternation —');
is('first ever day is A', Progression.nextDayKey([]), 'A');
is('after A comes B', Progression.nextDayKey([session('A', [])]), 'B');
is('after B comes A', Progression.nextDayKey([session('A', []), session('B', [])]), 'A');
is('an abandoned day does not flip the rotation',
  Progression.nextDayKey([session('A', []), session('B', [], { completed: false })]), 'B');

console.log('\n— the whole plan —');
const plan = Progression.planFor([], 'A');
is('day A has five items', plan.items.length, 5);
is('push-ups carry their 2 sets', plan.items.find(i => i.key === 'pushups').sets, 2);
is('dead bug is marked per-side', plan.items.find(i => i.key === 'deadBug').perSide, true);
is('everything starts as calibration', plan.items.every(i => i.calibrating), true);

console.log('\n— day fits the ten-minute budget —');
['A', 'B'].forEach(k => {
  const day = Exercises.day(k);
  const work = day.items.reduce((s, i) => s + Exercises.estimateSec(i), 0);
  const rest = (day.items.length - 1) * 20;
  const total = work + rest;
  const ok = total <= 600;
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + `day ${k}: ${Math.round(work)}s work + ${rest}s rest = ${Math.round(total)}s (budget 600s)`);
});

console.log('\n— headline progress —');
const run = [session('A', [ex('pushups', 20, 20), ex('plank', 45, 45)]),
             session('A', [ex('pushups', 21, 23), ex('plank', 50, 55)])];
const sum = Progression.progressSummary(run);
const p = sum.find(s => s.key === 'pushups');
is('push-ups 20 -> 23', [p.first, p.latest, p.delta], [20, 23, 3]);
is('best is tracked', p.best, 23);
is('series is oldest-first for charting', p.series.map(s => s.value), [20, 23]);

console.log(fails ? `\n${fails} FAILED` : '\nall progression tests pass');
process.exit(fails ? 1 : 0);
