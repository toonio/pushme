/* Tests for the session engine. Run: node tools/test-session.js
 *
 * The whole point of passing `now` into every method is that this file can run ten
 * minutes of exercise in a millisecond. Nothing here waits for anything.
 */
const fs = require('fs');
const path = require('path');

global.document = { createElementNS: () => ({ setAttribute() {}, appendChild() {} }) };
const read = f => fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8');
eval(read('utils.js')); global.Utils = Utils;
eval(read('exercises.js')); global.Exercises = Exercises;
eval(read('progression.js')); global.Progression = Progression;
eval(read('session.js')); global.Session = Session;

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label +
    (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

const T0 = 1764000000000;
const plan = Progression.planFor([], 'A');
const mk = (opts = {}) => Session.create({ plan, restSec: 20, budgetMin: 10, now: T0, ...opts });

console.log('— the step list —');
const steps = Session.buildSteps(plan, 20);
is('seven work steps: two singles, two push-up sets, two dead bug sides, one plank',
  steps.filter(s => s.kind === 'work').length, 7);
is('rests sit between them and never at the end',
  [steps.filter(s => s.kind === 'rest').length, steps[steps.length - 1].kind], [6, 'work']);
is('push-up sets are numbered',
  steps.filter(s => s.key === 'pushups').map(s => `${s.set}/${s.sets}`), ['1/2', '2/2']);
is('dead bug runs both sides',
  steps.filter(s => s.key === 'deadBug').map(s => s.side), ['left', 'right']);
is('rest knows what is coming', steps[1].nextName, 'Prone Y-T-W');
is('no rests at all when the setting says zero',
  Session.buildSteps(plan, 0).filter(s => s.kind === 'rest').length, 0);

console.log('\n— reps wait for you, they do not run a timer —');
let s = mk();
is('starts on wall angels', [s.step().key, s.step().target], ['wallAngels', 10]);
is('a minute of ticking does not move a rep step', s.tick(T0 + 60000).length, 0);
is('still on wall angels', s.step().key, 'wallAngels');
is('tapping done moves on and cues the stop', s.complete(T0 + 60000, 10), ['stop']);
is('and lands on the rest', s.step().kind, 'rest');
is('the rest does expire', s.tick(T0 + 60000 + 20001), ['go']);
is('onto the next exercise', s.step().key, 'proneYTW');

console.log('\n— holds count themselves down —');
s = mk();
['wallAngels', 'proneYTW', 'pushups', 'pushups', 'deadBug', 'deadBug'].forEach(() => {
  s.complete(T0, null);                 // tap through everything to reach the plank
  if (s.step() && s.step().kind === 'rest') s.tick(T0 + 21000);
});
is('reaches the plank', s.step().key, 'plank');
const planked = s.view(T0 + 21000);
is('with its full 45 seconds showing', Math.round(planked.remainingSec), 45);
is('no cue at 10 seconds to go', s.tick(T0 + 21000 + 35000), []);
is('a tick at 3 to go', s.tick(T0 + 21000 + 42100), ['tick']);
is('no second tick inside the same second', s.tick(T0 + 21000 + 42500), []);
is('another at 2', s.tick(T0 + 21000 + 43100), ['tick']);
is('the hold ends itself, and the session with it',
  s.tick(T0 + 21000 + 45100), ['stop', 'done']);
is('finished', s.view(T0 + 21000 + 45100).finished, true);
is('the plank scored its full target', s.toRecord().exercises.find(e => e.key === 'plank').achieved, 45);

console.log('\n— an exercise is scored by its WORST set —');
s = mk();
s.complete(T0, 10); s.tick(T0 + 21000);                 // wall angels
s.complete(T0 + 21000, 8); s.tick(T0 + 42000);          // prone Y-T-W
s.complete(T0 + 42000, 20);                             // push-ups set 1
s.tick(T0 + 63000);
s.complete(T0 + 63000, 14);                             // push-ups set 2 — the honest one
is('twenty then fourteen is fourteen, not twenty',
  s.toRecord(T0 + 70000).exercises.find(e => e.key === 'pushups').achieved, 14);

console.log('\n— the too-hard-today button —');
s = mk();
s.complete(T0, 10); s.tick(T0 + 21000);
s.complete(T0 + 21000, 8); s.tick(T0 + 42000);
is('now on push-ups, set 1 of 2', [s.step().key, s.step().set], ['pushups', 1]);
s.easeOff(T0 + 42000, 9);
is('the remaining set goes with it — it does not ask for twenty next',
  s.step().kind === 'rest' ? s.view(T0).nextWork.key : s.step().key, 'deadBug');
const eased = s.toRecord(T0 + 60000).exercises.find(e => e.key === 'pushups');
is('recorded as eased off', eased.easedOff, true);
is('with the real number, not a zero', eased.achieved, 9);
is('and the rest before the NEXT exercise survives', s.step().kind, 'rest');

console.log('\n— skipping records nothing, which is not the same as failing —');
s = mk();
s.skip(T0);
is('wall angels left no trace',
  s.toRecord(T0 + 1000).exercises.some(e => e.key === 'wallAngels'), false);

console.log('\n— stopping early keeps what was done —');
s = mk();
s.complete(T0, 10);
s.stopNow(T0 + 30000);
const partial = s.toRecord();
is('the session counts as completed', partial.completed, true);
is('with one exercise in it', partial.exercises.length, 1);
is('and a real duration', partial.durationSec, 30);
is('abandoning marks it incomplete', (() => { const a = mk(); a.complete(T0, 10); a.abandon(T0 + 5000); return a.toRecord().completed; })(), false);

console.log('\n— trimming for a short morning —');
const full = Session.estimateSec(Session.buildSteps(plan, 20));
is('the full day is about five minutes of work plus rests', full <= 600, true);
const short = Session.trim(plan, 180, 20);
is('180 seconds drops items from the end', short.items.length < plan.items.length, true);
is('and keeps the shoulder work at the front', short.items[0].key, 'wallAngels');
is('it says it trimmed', short.trimmed, true);
is('a budget that fits trims nothing', Session.trim(plan, 600, 20).trimmed, false);
is('never trims below one exercise', Session.trim(plan, 1, 20).items.length, 1);

console.log('\n— a draft survives the app being killed —');
s = mk();
s.complete(T0, 10);
s.tick(T0 + 21000);
const revived = Session.restore(JSON.parse(JSON.stringify(s.draft())));
is('same session id', revived.state.id, s.state.id);
is('same place in the list', revived.step().key, s.step().key);
is('and remembers the wall angels',
  revived.toRecord(T0 + 30000).exercises.find(e => e.key === 'wallAngels').achieved, 10);

console.log('\n— the view —');
s = mk();
const v = s.view(T0 + 5000);
is('counts work steps, not rests', [v.workDone, v.workTotal], [0, 7]);
is('knows what is next', v.nextWork.key, 'proneYTW');
is('budget in seconds', v.budgetSec, 600);
is('not over budget after five seconds', v.overBudgetSec, 0);
is('over budget is reported, not hidden', Math.round(mk().view(T0 + 660000).overBudgetSec), 60);

console.log(fails ? `\n${fails} FAILED` : '\nall session tests pass');
process.exit(fails ? 1 : 0);
