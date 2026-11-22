/* app.js — boot, the Today screen, and the session runner.
 *
 * The one rule this file follows: the engine owns the truth, the screen only draws it.
 * Nothing here decides when a hold is over or what the next target is; it calls
 * `tick(now)` and paints what comes back. That is what makes the hard parts testable
 * in a file that never touches a DOM.
 */
var App = (function () {
  'use strict';

  var state = {
    sessions: [],
    settings: null,
    view: 'today',
    monthDate: new Date(),
    runner: null,
    stepCount: 0,          // the stepper's current value for a rep set
    wakeLock: null,
    timer: null
  };

  /* ---------------------------------- boot -------------------------------- */

  function boot() {
    state.settings = Settings.load();
    Sound.configure(state.settings);

    bindTabs();
    bindToday();
    bindSession();

    /* Announce the bundle before anything else can throw. Capgo puts a freshly
       downloaded bundle on probation and rolls it back on the next launch unless the
       app says it reached this point — which is exactly the protection wanted, and
       exactly the thing that silently breaks if it is called too late. */
    Updater.loadLocal().then(function () {
      Updater.notifyReady();
      Views.describeBuild();
      UI.setText('build-note',
        (Notify.available() ? 'Installed build' : 'Browser build') +
        ' · version ' + Updater.version().version + ' (' + Updater.version().commit + ')' +
        (Notify.available() ? '' : ' — everything works except waking you up.'));
    });

    Views.settings(settingsChanged);

    DB.allSessions().then(function (rows) {
      state.sessions = rows;
      offerDraft();
      render();
    });

    armNotifications();

    state.timer = setInterval(frame, 250);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        state.settings = Settings.load();
        frame();
      } else if (state.runner && !state.runner.state.finished) {
        DB.saveDraft(state.runner.draft());
      }
    });
    window.addEventListener('pagehide', function () {
      if (state.runner && !state.runner.state.finished) DB.saveDraft(state.runner.draft());
    });
  }

  /** One frame: advance the engine if a session is open, then redraw what is visible. */
  function frame() {
    if (state.runner && !state.runner.state.finished) {
      handle(state.runner.tick(Date.now()));
      drawSession();
    } else if (state.view === 'today') {
      renderToday();
    }
  }

  function render() {
    if (state.view === 'today') renderToday();
    if (state.view === 'progress') Views.progress(state.sessions, state.settings);
    if (state.view === 'history') Views.history(state.sessions, state.monthDate, state.settings);
  }

  function settingsChanged() {
    state.settings = Settings.load();
    Sound.configure(state.settings);
    armNotifications();
    render();
  }

  function armNotifications() {
    if (!Notify.available()) return;
    Notify.requestPermission().then(function () {
      return Notify.arm(Settings.load(), new Date());
    }).catch(function () { /* a refused permission is the user's call, not an error */ });
  }

  /* ---------------------------------- tabs -------------------------------- */

  function bindTabs() {
    UI.$$('#tabs .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        go(tab.getAttribute('data-view'));
      });
    });
  }

  function go(view) {
    state.view = view;
    ['today', 'progress', 'history', 'settings'].forEach(function (v) {
      UI.show('view-' + v, v === view);
    });
    UI.$$('#tabs .tab').forEach(function (t) {
      UI.toggleClass(t, 'on', t.getAttribute('data-view') === view);
    });
    if (view === 'settings') Views.settings(settingsChanged);
    render();
    window.scrollTo(0, 0);
  }

  /* --------------------------------- today -------------------------------- */

  function planForToday() {
    var dayKey = Progression.nextDayKey(state.sessions);
    return Progression.planFor(state.sessions, dayKey, Settings.day(dayKey));
  }

  function todaysSessions() {
    var key = Utils.localDayKey(new Date());
    return state.sessions.filter(function (s) {
      return s.completed && Utils.localDayKey(new Date(s.date)) === key;
    });
  }

  function renderToday() {
    var now = new Date();
    var s = state.settings;
    var st = Schedule.state(s, now);
    var done = todaysSessions();

    UI.setText('today-date', Utils.DAY_NAMES[now.getDay()] + ' ' + now.getDate() + ' ' + Utils.MONTHS[now.getMonth()]);

    var card = UI.$('today-card');
    card.className = 'card phase-' + st.phase;

    var label, headline, sub, button = 'Start';

    if (done.length) {
      card.className = 'card phase-window';
      label = 'Done';
      headline = 'Banked.';
      sub = describeDone(done[0]);
      button = 'Do another';
    } else if (st.phase === 'invalid') {
      label = 'Settings';
      headline = 'These numbers do not work.';
      sub = st.reason + ' — fix it in Settings. You can still start a session by hand.';
      button = 'Start anyway';
    } else if (st.phase === 'offday') {
      label = 'Day off';
      var next = Schedule.nextWorkDay(new Date(now.getTime() + 86400000));
      headline = 'No session today.';
      sub = 'Next one ' + (next ? Utils.DAY_NAMES[next.getDay()] : 'soon') + '.';
      button = 'Do it anyway';
    } else if (st.phase === 'before') {
      label = 'Too early';
      headline = 'Window opens at ' + Utils.formatHM(st.moments.invitation) + '.';
      sub = 'Ten minutes then, and the whole thing is banked before breakfast.';
      button = 'Start early';
    } else if (st.phase === 'window') {
      label = 'Now is the easy slot';
      headline = st.minutesLeft + ' min to last call';
      sub = 'Starting any time before ' + Utils.formatHM(st.moments.lastCall) +
            ' leaves you ' + s.bufferMin + ' spare minutes.';
    } else if (st.phase === 'lastcall') {
      label = 'Last call';
      headline = st.minutesAvailable + ' min left before you dress';
      sub = st.fits
        ? 'A full session still fits. It will be tight.'
        : 'Not the full ten — take what there is.';
      button = st.fits ? 'Start' : 'Start a short one';
    } else {
      label = 'Gone';
      headline = 'Today’s slot has closed.';
      sub = 'You would be late. Tomorrow at ' + Utils.formatHM(st.moments.invitation) + '.';
      button = 'Do it anyway';
    }

    UI.setText('today-phase', label);
    UI.setText('today-headline', headline);
    UI.setText('today-sub', sub);
    UI.setText('today-start', button);

    UI.setText('today-timeline', st.moments.valid
      ? 'alarm ' + Utils.formatHM(st.moments.wake) +
        '  ·  nudge ' + Utils.formatHM(st.moments.invitation) +
        '  ·  last call ' + Utils.formatHM(st.moments.lastCall) +
        '  ·  out ' + Utils.formatHM(st.moments.leave)
      : '');

    renderPlan();
    renderWeek(now);

    UI.show('today-note', !Notify.available());
    if (!Notify.available()) {
      UI.setText('today-note',
        'Browser build: nothing will nudge you at ' +
        (st.moments.valid ? Utils.formatHM(st.moments.invitation) : s.wakeAlarm) +
        '. A web page cannot fire an alarm when it is not running — that is what the ' +
        'installed app is for.');
    }
  }

  function describeDone(session) {
    var bits = session.exercises.slice(0, 3).map(function (e) {
      var ex = Exercises.get(e.key);
      return (ex ? ex.name : e.key) + ' ' + e.achieved + (ex && ex.type === 'hold' ? 's' : '');
    });
    return bits.join(' · ') + (session.exercises.length > 3 ? ' · …' : '') +
           '  (' + Utils.formatDuration(session.durationSec) + ')';
  }

  function renderPlan() {
    var plan = planForToday();
    var list = UI.clear('today-plan');
    var anyCalibrating = false;

    UI.setText('today-plan-title', plan.name + ' — ' + plan.focus);
    UI.setText('today-plan-budget', '~' + Math.round(
      Session.estimateSec(Session.buildSteps(plan, state.settings.restSec)) / 60) + ' min');

    plan.items.forEach(function (item) {
      if (item.calibrating) anyCalibrating = true;
      var unit = item.type === 'hold' ? 's' : '';
      var tag = null;
      if (item.calibrating) tag = UI.el('span', { class: 'p-tag', text: 'opener' });
      else if (item.backedOff) tag = UI.el('span', { class: 'p-tag down', text: 'eased' });
      else if (/^last \+/.test(item.basis || '') || /calibrated/.test(item.basis || '')) {
        tag = UI.el('span', { class: 'p-tag up', text: 'up' });
      }

      list.appendChild(UI.el('li', {}, [
        UI.el('span', { class: 'p-name', text: item.name + (item.sets > 1 ? ' ×' + item.sets : '') + (item.perSide ? ' (each side)' : '') }),
        tag,
        UI.el('span', { class: 'p-target', text: item.target + unit })
      ]));
    });

    UI.show('today-calibrating', anyCalibrating);
  }

  function renderWeek(now) {
    var w = Score.week(state.sessions, now, state.settings.weeklyTarget, now);
    var box = UI.clear('today-week');

    w.days.forEach(function (d) {
      box.appendChild(UI.el('div', { class: 'weekdot ' + d.status }, [
        UI.el('b', { text: Utils.DAY_NAMES[d.date.getDay()].slice(0, 1) }),
        UI.el('span', { text: String(d.date.getDate()) })
      ]));
    });

    UI.setText('today-week-score', w.done + ' / ' + w.target);
    var streak = Score.streakWeeks(state.sessions, now, state.settings.weeklyTarget);
    UI.setText('today-streak',
      w.met ? 'Week secured. ' + streakText(streak)
            : (w.possible ? 'Still reachable: ' + (w.target - w.done) + ' to go, ' + w.remaining + ' day' + (w.remaining === 1 ? '' : 's') + ' left. ' + streakText(streak)
                          : 'Not this week. ' + streakText(streak)));
  }

  function streakText(n) {
    if (!n) return 'No streak yet.';
    return n === 1 ? '1 week streak.' : n + ' weeks in a row.';
  }

  function bindToday() {
    UI.on('today-start', 'click', function () { startSession(); });
    UI.on('today-resume', 'click', function () { resumeDraft(); });

    UI.on('month-prev', 'click', function () { shiftMonth(-1); });
    UI.on('month-next', 'click', function () { shiftMonth(1); });
  }

  function shiftMonth(by) {
    var d = new Date(state.monthDate.getTime());
    d.setDate(1);
    d.setMonth(d.getMonth() + by);
    state.monthDate = d;
    Views.history(state.sessions, state.monthDate, state.settings);
  }

  /* -------------------------------- session ------------------------------- */

  function startSession() {
    Sound.unlock();
    var s = state.settings;
    var plan = planForToday();
    var st = Schedule.state(s, new Date());
    var kind = 'full';

    /* A morning with seven minutes in it gets a seven-minute session, not a refusal
       and not a ten-minute one that makes you late. */
    if (st.phase === 'lastcall' && !st.fits && st.minutesAvailable > 0) {
      var trimmed = Session.trim(plan, st.minutesAvailable * 60, s.restSec);
      if (trimmed.trimmed) { plan = trimmed; kind = 'short'; }
    }

    state.runner = Session.create({
      plan: plan, restSec: s.restSec, budgetMin: s.budgetMin, kind: kind, now: Date.now()
    });
    DB.saveDraft(state.runner.draft());
    openSession();
    Sound.play('go');
  }

  function offerDraft() {
    var draft = DB.loadDraft();
    if (!draft || !draft.state || draft.state.finished) { UI.show('today-resume', false); return; }
    var age = Date.now() - (draft.savedAt || 0);
    if (age > 6 * 3600 * 1000) { DB.clearDraft(); UI.show('today-resume', false); return; }
    UI.show('today-resume', true);
  }

  function resumeDraft() {
    var draft = DB.loadDraft();
    if (!draft) { UI.show('today-resume', false); return; }
    state.runner = Session.restore(draft);
    if (!state.runner) { DB.clearDraft(); UI.show('today-resume', false); return; }
    /* Time did not stop while the app was dead, but the step clock has to, or a hold
       resumed after ten minutes would instantly expire with a phantom success. */
    state.runner.state.stepStartedAt = Date.now();
    Sound.unlock();
    openSession();
  }

  function openSession() {
    UI.show('session', true);
    UI.show('s-end', false);
    lastStepKey = null;
    document.body.style.overflow = 'hidden';
    requestWakeLock();
    newStep();
    drawSession();
  }

  function closeSession() {
    UI.show('session', false);
    document.body.style.overflow = '';
    releaseWakeLock();
    state.runner = null;
    go('today');
  }

  function requestWakeLock() {
    if (!state.settings.keepAwake || !navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      state.wakeLock = lock;
    }).catch(function () { /* denied or unsupported; the session still runs */ });
  }

  function releaseWakeLock() {
    if (state.wakeLock) { try { state.wakeLock.release(); } catch (e) { /* already gone */ } }
    state.wakeLock = null;
  }

  /** Reset the per-step UI state. Called whenever the engine moves on. */
  function newStep() {
    var step = state.runner && state.runner.step();
    state.stepCount = (step && step.kind === 'work' && step.type !== 'hold') ? step.target : 0;
  }

  function handle(events) {
    if (!events || !events.length) return;
    events.forEach(function (e) {
      if (e === 'stop') Sound.play('stop');
      else if (e === 'go') { Sound.play('next'); newStep(); }
      else if (e === 'tick') Sound.play('tick');
      else if (e === 'done') finishSession();
    });
    if (state.runner && !state.runner.state.finished) DB.saveDraft(state.runner.draft());
  }

  var lastStepKey = null;

  function drawSession() {
    var r = state.runner;
    if (!r) return;
    var v = r.view(Date.now());

    UI.setText('s-elapsed', Utils.formatDuration(v.elapsedSec));
    UI.setText('s-budget', '/ ' + Utils.formatDuration(v.budgetSec));
    UI.toggleClass(UI.$$('.s-clock')[0], 'over', v.overBudgetSec > 0);

    drawPips(v);

    if (v.finished) return;

    var step = v.step;
    UI.show('s-work', step.kind === 'work');
    UI.show('s-rest', step.kind === 'rest');

    if (step.kind === 'rest') {
      UI.setText('s-rest-count', Utils.formatClock(v.remainingSec));
      UI.setText('s-rest-next', v.nextWork ? v.nextWork.name : '—');
      return;
    }

    /* Only rebuild the heavy parts when the step actually changes: the figure is SVG
       and this runs four times a second. */
    var key = step.key + '|' + step.set + '|' + step.side;
    if (key !== lastStepKey) {
      lastStepKey = key;
      drawWorkStep(step);
    }

    if (step.type === 'hold') {
      UI.setText('s-countdown', Utils.formatClock(v.remainingSec));
      UI.toggleClass('s-countdown', 'urgent', v.remainingSec <= Session.COUNT_IN_FROM);
    }
  }

  function drawPips(v) {
    var box = UI.$('s-pips');
    if (box.childElementCount !== v.workTotal) {
      UI.clear(box);
      for (var i = 0; i < v.workTotal; i++) box.appendChild(UI.el('i', { class: 'pip' }));
    }
    UI.$$('.pip', box).forEach(function (p, i) {
      p.className = 'pip' + (i < v.workDone ? ' done' : (i === v.workDone ? ' now' : ''));
    });
  }

  function drawWorkStep(step) {
    var ex = Exercises.get(step.key) || {};
    var isHold = step.type === 'hold';

    UI.setText('s-name', step.name);
    UI.show('s-side', !!step.side);
    UI.setText('s-side', step.side || '');
    UI.show('s-set', step.sets > 1);
    UI.setText('s-set', step.sets > 1 ? 'set ' + step.set + ' of ' + step.sets : '');

    var fig = UI.clear('s-figure');
    var drawing = Exercises.figureFor(step.key);
    if (drawing) fig.appendChild(drawing);

    UI.show('s-target-row', !isHold);
    UI.show('s-countdown', isHold);
    UI.show('s-stepper', !isHold);
    UI.setText('s-target', step.target);
    UI.setText('s-unit', step.unit + (step.side ? ' this side' : ''));
    UI.setText('s-count', state.stepCount);
    UI.setText('s-done', isHold ? 'Stop early' : 'Done');

    var cues = UI.clear('s-cues');
    (ex.cues || []).forEach(function (c) { cues.appendChild(UI.el('li', { text: c })); });
    UI.setText('s-mistake', ex.mistake ? 'Watch: ' + ex.mistake : '');

    UI.setText('s-more-body', 'Target ' + step.target + (isHold ? 's' : '') +
      (step.basis ? ' — ' + step.basis + '.' : '.') +
      (step.calibrating ? ' This is a starting number, not a prescription; what you manage today replaces it.' : ''));
    var link = UI.$('s-video');
    if (link) link.href = 'https://www.youtube.com/results?search_query=' +
      encodeURIComponent(ex.video || step.name);
  }

  function bindSession() {
    UI.on('s-done', 'click', function () {
      var r = state.runner; if (!r) return;
      var step = r.step(); if (!step) return;
      var value = step.type === 'hold'
        ? Math.floor(r.view(Date.now()).stepElapsedSec)
        : state.stepCount;
      handle(r.complete(Date.now(), value));
      newStep(); drawSession();
    });

    UI.on('s-less', 'click', function () {
      state.stepCount = Math.max(0, state.stepCount - 1);
      UI.setText('s-count', state.stepCount);
    });
    UI.on('s-more-btn', 'click', function () {
      state.stepCount += 1;
      UI.setText('s-count', state.stepCount);
    });

    UI.on('s-ease', 'click', function () {
      var r = state.runner; if (!r) return;
      var step = r.step(); if (!step) return;
      var value = step.type === 'hold'
        ? Math.floor(r.view(Date.now()).stepElapsedSec)
        : state.stepCount;
      handle(r.easeOff(Date.now(), value));
      newStep(); drawSession();
      UI.toast('Noted, and it will not count against you.');
    });

    UI.on('s-skip', 'click', function () {
      var r = state.runner; if (!r) return;
      handle(r.skip(Date.now()));
      newStep(); drawSession();
    });

    UI.on('s-rest-skip', 'click', function () {
      var r = state.runner; if (!r) return;
      /* `complete` on a rest step records nothing and advances with the REAL clock.
         Faking a far-future tick would move the next step's start time with it and
         leave the following hold already expired. */
      handle(r.complete(Date.now(), null));
      newStep(); drawSession();
    });

    UI.on('s-quit', 'click', function () {
      var r = state.runner; if (!r) return;
      var anything = Object.keys(r.state.records).length > 0;
      if (!anything) {
        if (!confirm('Leave? Nothing has been recorded yet.')) return;
        r.abandon(Date.now());
        DB.clearDraft();
        closeSession();
        return;
      }
      if (!confirm('Stop here? Everything you have done so far is saved.')) return;
      handle(r.stopNow(Date.now()));
    });

    UI.on('s-end-close', 'click', function () { closeSession(); });
  }

  function finishSession() {
    var r = state.runner;
    if (!r) return;
    var record = r.toRecord(Date.now());
    DB.clearDraft();
    UI.show('today-resume', false);
    releaseWakeLock();

    if (!record.exercises.length) { closeSession(); return; }

    DB.putSession(record).then(function () {
      state.sessions = state.sessions.concat([record]);
      showEnd(record);
    }).catch(function () {
      /* Storage failed; still show the summary rather than swallowing the session. */
      showEnd(record);
      UI.toast('Could not save that session.');
    });
  }

  function showEnd(record) {
    UI.show('s-work', false);
    UI.show('s-rest', false);
    UI.show('s-end', true);

    var now = new Date();
    var w = Score.week(state.sessions, now, state.settings.weeklyTarget, now);
    UI.setText('s-end-title', record.kind === 'short' ? 'Short, and it counts.' : 'Banked.');

    /* A session on a day off is real work and is recorded as such, but it cannot move
       a Mon–Thu count. Printing "0 of 3" under "Banked." would read as a scolding for
       having trained on a Sunday. */
    UI.setText('s-end-sub', Utils.formatDuration(record.durationSec) + ' · ' +
      (Schedule.isWorkDay(now)
        ? w.done + ' of ' + w.target + ' this week' + (w.met ? ' — week secured.' : '.')
        : 'a day off, so it is a bonus rather than a tick.'));

    var list = UI.clear('s-end-list');
    record.exercises.forEach(function (e) {
      var ex = Exercises.get(e.key) || {};
      var unit = ex.type === 'hold' ? 's' : '';
      var beat = e.achieved > e.target;
      list.appendChild(UI.el('li', {}, [
        UI.el('span', { class: 'p-name', text: ex.name || e.key }),
        e.easedOff ? UI.el('span', { class: 'p-tag down', text: 'eased' })
                   : (beat ? UI.el('span', { class: 'p-tag up', text: 'beat it' }) : null),
        UI.el('span', { class: 'p-target', text: e.achieved + unit })
      ]));
    });
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { state: state, go: go, render: render };
})();
