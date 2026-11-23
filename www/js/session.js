/* Session — the ten minutes themselves, as a state machine with no DOM and no clock.
 *
 * Every method takes `now`, so the whole flow — holds counting down, rests expiring,
 * the budget running out — can be driven through in milliseconds by a test instead of
 * being watched in real time. The UI's only job is to call `tick(Date.now())` and draw
 * what `view(now)` returns.
 *
 * Two deliberate choices worth stating:
 *
 *   Reps are not timed. A timer either rushes you or leaves you lying there waiting,
 *   and both teach you to resent the app. You tap when the set is done.
 *
 *   A timed step does not start its own clock. The countdown waits for a tap, because
 *   a plank whose timer starts the instant the rest expires is a plank you spend the
 *   first ten seconds of getting into — and that is the part that reads as failure.
 *
 *   An exercise done in several sets is scored by its WORST set. The target is a
 *   per-set number, so twenty push-ups followed by fourteen is not twenty; recording
 *   the best set would let progression climb away from what you can actually repeat.
 */
var Session = (function () {
  'use strict';

  var DEFAULT_REST = 20;
  var COUNT_IN_FROM = 3;      // tick cues for the last seconds of a hold or rest

  /** A timed step waits for you: you tap when you are down and set. */
  function waitsForTap(step) {
    return !!(step && step.kind === 'work' && step.type === 'hold');
  }

  /* ------------------------------ building ------------------------------- */

  /**
   * The flat list of steps: work, rest, work, rest… Sets and sides are expanded here
   * rather than handled inside the runner, so the runner never has to ask "which side
   * am I on" — the step says.
   */
  function buildSteps(plan, restSec) {
    var rest = (restSec == null) ? DEFAULT_REST : Number(restSec);
    var work = [];

    (plan.items || []).forEach(function (item) {
      var sets = Math.max(1, item.sets || 1);
      var sides = item.perSide ? ['left', 'right'] : [null];
      for (var s = 1; s <= sets; s++) {
        sides.forEach(function (side) {
          work.push({
            kind: 'work',
            key: item.key, name: item.name, type: item.type, unit: item.unit,
            target: item.target, set: s, sets: sets, side: side,
            calibrating: !!item.calibrating, backedOff: !!item.backedOff, basis: item.basis
          });
        });
      }
    });

    var steps = [];
    work.forEach(function (w, i) {
      steps.push(w);
      if (i < work.length - 1 && rest > 0) {
        steps.push({ kind: 'rest', target: rest, nextName: work[i + 1].name });
      }
    });
    return steps;
  }

  /** Rough seconds for a built step list, used to decide whether a plan fits. */
  function estimateSec(steps) {
    return steps.reduce(function (sum, step) {
      if (step.kind === 'rest') return sum + step.target;
      if (step.type === 'hold') return sum + step.target;
      return sum + Math.round(step.target * 2.2);
    }, 0);
  }

  /**
   * A plan trimmed to fit the time actually left. Items are dropped from the END, so
   * what survives is the front of the routine — the shoulder work, which is the part
   * with a medical reason behind it. A half session that keeps the important half is
   * worth having; one that keeps a random half is not.
   */
  function trim(plan, availableSec, restSec) {
    var items = (plan.items || []).slice();
    while (items.length > 1) {
      var candidate = { day: plan.day, name: plan.name, focus: plan.focus, items: items };
      if (estimateSec(buildSteps(candidate, restSec)) <= availableSec) break;
      items = items.slice(0, items.length - 1);
    }
    return {
      day: plan.day, name: plan.name, focus: plan.focus, items: items,
      trimmed: items.length < (plan.items || []).length
    };
  }

  /* ------------------------------- running ------------------------------- */

  function create(opts) {
    var plan = opts.plan;
    var restSec = (opts.restSec == null) ? DEFAULT_REST : Number(opts.restSec);
    var now = opts.now || Date.now();

    var state = {
      id: opts.id || Utils.uuid(),
      day: plan.day,
      kind: opts.kind || 'full',
      budgetSec: (opts.budgetMin || 10) * 60,
      restSec: restSec,
      startedAt: now,
      stepStartedAt: now,
      index: 0,
      records: {},
      lastTick: null,
      finished: false,
      abandoned: false,
      endedAt: null
    };

    var steps = buildSteps(plan, restSec);
    state.waiting = waitsForTap(steps[0]);

    return wrap(state, steps, plan);
  }

  /* Rebuild a session from a draft written mid-flight. A draft from before timed
     steps waited has no `waiting` flag, which reads as false — the old behaviour,
     which is the right way for an unknown to fail. */
  /** Rebuild a session from a draft written mid-flight. */
  function restore(draft) {
    if (!draft || !draft.state || !draft.steps) return null;
    return wrap(draft.state, draft.steps, draft.plan || { day: draft.state.day, items: [] });
  }

  function wrap(state, steps, plan) {

    function step() { return steps[state.index] || null; }

    function workSteps() {
      return steps.filter(function (s) { return s.kind === 'work'; });
    }

    function record(key, target, value, easedOff) {
      var r = state.records[key];
      if (!r) { r = state.records[key] = { key: key, target: target, values: [], easedOff: false }; }
      r.target = Math.max(r.target, target);
      if (value !== null && value !== undefined) r.values.push(Number(value));
      if (easedOff) r.easedOff = true;
    }

    function advance(now, events) {
      state.index++;
      state.stepStartedAt = now;
      state.lastTick = null;
      var next = step();
      if (!next) {
        state.finished = true;
        state.endedAt = now;
        events.push('done');
      } else if (next.kind === 'work') {
        state.waiting = waitsForTap(next);
        events.push(state.waiting ? 'ready' : 'go');
      }
      return events;
    }

    function isWaiting() { return !!state.waiting && waitsForTap(step()); }

    /**
     * Start the clock on a timed step. Everything before this is free: reading the
     * cues, finding the floor, getting an elbow under a shoulder. Returns the cue to
     * play, so the sound marks the moment the count actually began.
     */
    function begin(now) {
      if (!isWaiting()) return [];
      state.waiting = false;
      state.stepStartedAt = now || Date.now();
      state.lastTick = null;
      return ['begin'];
    }

    function elapsedStepSec(now) {
      return Math.max(0, (now - state.stepStartedAt) / 1000);
    }

    /**
     * Drive time forward. Returns the cues that fell due — the caller plays them and
     * redraws. Returning events rather than calling Sound directly keeps this file
     * free of anything a test cannot run.
     */
    function tick(now) {
      var events = [];
      var s = step();
      if (!s || state.finished || isWaiting()) return events;

      var elapsed = elapsedStepSec(now);
      var limit = (s.kind === 'rest') ? s.target : (s.type === 'hold' ? s.target : null);
      if (limit === null) return events;         // a rep set ends when you say it does

      var remaining = limit - elapsed;

      if (remaining <= 0) {
        if (s.kind === 'work') { record(s.key, s.target, s.target, false); events.push('stop'); }
        return advance(now, events);
      }

      var whole = Math.ceil(remaining);
      if (whole <= COUNT_IN_FROM && whole !== state.lastTick) {
        state.lastTick = whole;
        events.push('tick');
      }
      return events;
    }

    /** Finish the current step with an explicit number (a tapped set, or a hold cut short). */
    function complete(now, value) {
      var events = [];
      var s = step();
      if (!s || state.finished) return events;

      if (s.kind === 'work') {
        var achieved = (value === null || value === undefined) ? s.target : Number(value);
        record(s.key, s.target, achieved, false);
        events.push('stop');
      }
      return advance(now, events);
    }

    /**
     * The too-hard-today button. Records what was actually managed and flags it, so
     * progression holds station instead of reading a bad morning as a lost capacity.
     * Punishing the honest button would guarantee nobody presses it.
     */
    function easeOff(now, value) {
      var events = [];
      var s = step();
      if (!s || state.finished) return events;

      if (s.kind === 'work') {
        var managed = (value === null || value === undefined)
          ? (s.type === 'hold' && !isWaiting() ? Math.floor(elapsedStepSec(now)) : 0)
          : Number(value);
        record(s.key, s.target, managed, true);
        /* Remaining sets of the SAME exercise go with it: easing off one set and then
           being asked for the full count on the next is not easing off. The rest step
           before a DIFFERENT exercise is left alone — skipping it would hand you a
           shorter recovery as a reward for having a bad morning. */
        while (true) {
          var a = steps[state.index + 1];
          var b = steps[state.index + 2];
          if (a && a.kind === 'work' && a.key === s.key) {
            record(s.key, s.target, managed, true);
            state.index += 1;
          } else if (a && a.kind === 'rest' && b && b.kind === 'work' && b.key === s.key) {
            record(s.key, s.target, managed, true);
            state.index += 2;
          } else {
            break;
          }
        }
      }
      return advance(now, events);
    }

    /** Move on without recording anything: a skipped exercise is not a failed one. */
    function skip(now) {
      return advance(now, []);
    }

    /** End here, keeping everything already done. */
    function stopNow(now) {
      state.finished = true;
      state.endedAt = now || Date.now();
      return ['done'];
    }

    function abandon(now) {
      state.abandoned = true;
      state.finished = true;
      state.endedAt = now || Date.now();
    }

    function exercisesDone() {
      return Object.keys(state.records).map(function (key) {
        var r = state.records[key];
        return {
          key: key, target: r.target,
          // The worst set, for the reason given at the top of this file.
          achieved: r.values.length ? Math.min.apply(null, r.values) : 0,
          easedOff: r.easedOff
        };
      }).filter(function (e) { return e.achieved > 0 || e.easedOff; });
    }

    /** The row that goes into storage. */
    function toRecord(now) {
      var ended = state.endedAt || now || Date.now();
      return {
        id: state.id,
        date: new Date(state.startedAt).toISOString(),
        day: state.day,
        completed: !state.abandoned,
        kind: state.kind,
        durationSec: Math.round((ended - state.startedAt) / 1000),
        exercises: exercisesDone()
      };
    }

    function draft() {
      return { state: state, steps: steps, plan: plan, savedAt: Date.now() };
    }

    /** Everything the screen needs for one frame. */
    function view(now) {
      now = now || Date.now();
      var s = step();
      var works = workSteps();
      var doneWork = steps.slice(0, state.index).filter(function (x) { return x.kind === 'work'; }).length;
      var elapsed = (now - state.startedAt) / 1000;
      var limit = s ? ((s.kind === 'rest') ? s.target : (s.type === 'hold' ? s.target : null)) : null;
      var waiting = isWaiting();

      var nextWork = null;
      for (var i = state.index + 1; i < steps.length; i++) {
        if (steps[i].kind === 'work') { nextWork = steps[i]; break; }
      }

      return {
        id: state.id,
        day: state.day,
        kind: state.kind,
        finished: state.finished,
        step: s,
        index: state.index,
        workDone: doneWork,
        workTotal: works.length,
        waiting: waiting,
        /* While a timed step waits there is nothing to report but the whole of it:
           no elapsed time to record if you bail, and a countdown showing its full
           length rather than one already draining. */
        stepElapsedSec: (s && !waiting) ? elapsedStepSec(now) : 0,
        remainingSec: (limit === null) ? null
          : (waiting ? limit : Math.max(0, limit - elapsedStepSec(now))),
        elapsedSec: elapsed,
        budgetSec: state.budgetSec,
        overBudgetSec: Math.max(0, elapsed - state.budgetSec),
        nextWork: nextWork,
        records: state.records
      };
    }

    return {
      state: state, steps: steps, plan: plan,
      step: step, view: view, tick: tick, begin: begin,
      complete: complete, easeOff: easeOff, skip: skip,
      stopNow: stopNow, abandon: abandon,
      toRecord: toRecord, draft: draft
    };
  }

  return {
    DEFAULT_REST: DEFAULT_REST, COUNT_IN_FROM: COUNT_IN_FROM,
    waitsForTap: waitsForTap,
    buildSteps: buildSteps, estimateSec: estimateSec, trim: trim,
    create: create, restore: restore
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Session;
