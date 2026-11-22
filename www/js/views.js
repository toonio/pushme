/* Views — Progress, History and Settings.
 *
 * Today and the session itself live in app.js, because they share the running clock.
 * These three are redrawn from scratch whenever the data changes; they are small
 * enough that diffing would be more code than it saves.
 */
var Views = (function () {
  'use strict';

  /* ------------------------------- progress ------------------------------ */

  function progress(sessions, settings) {
    var list = UI.clear('progress-list');
    var summary = Progression.progressSummary(sessions);

    UI.setText('stat-streak', Score.streakWeeks(sessions, new Date(), settings.weeklyTarget));
    var t = Score.totals(sessions);
    UI.setText('stat-sessions', t.sessions);
    UI.setText('stat-minutes', t.minutes);

    UI.show('progress-empty', summary.length === 0);
    if (!summary.length) return;

    summary.forEach(function (s) {
      var dir = s.delta > 0 ? 'up' : (s.delta < 0 ? 'down' : 'flat');
      var unit = s.type === 'hold' ? 's' : '';
      /* One session is a starting point, not a trend. "+0" under a first run reads as
         a failure to improve on something you have only done once. */
      var delta = s.sessions < 2 ? 'first run'
                : (s.delta > 0 ? '+' : '') + s.delta + unit;
      var headline = s.sessions < 2 ? String(s.latest) + unit
                                    : s.first + unit + ' → ' + s.latest + unit;

      list.appendChild(UI.el('div', { class: 'card ex-card' }, [
        UI.el('div', { class: 'ex-main' }, [
          UI.el('div', { class: 'ex-name', text: s.name }),
          UI.el('div', { class: 'ex-numbers' }, [
            UI.el('span', { text: headline + '  ' }),
            UI.el('span', { class: 'ex-delta ' + dir, text: delta }),
            UI.el('span', { text: '  ·  best ' + s.best + unit + '  ·  ' + s.sessions + '×' })
          ])
        ]),
        UI.sparkline(s.series.map(function (p) { return p.value; }),
          { label: s.name + ' over time' })
      ]));
    });
  }

  /* -------------------------------- history ------------------------------ */

  function history(sessions, monthDate, settings) {
    var grid = UI.clear('month-grid');
    var month = Score.monthGrid(sessions, monthDate, new Date());

    UI.setText('month-label', Utils.MONTHS[month.month.getMonth()] + ' ' + month.month.getFullYear());

    /* Pad to the Monday before the 1st, so columns are weekdays rather than a ribbon. */
    var lead = (month.month.getDay() + 6) % 7;
    for (var i = 0; i < lead; i++) grid.appendChild(UI.el('div', {}));

    month.days.forEach(function (d) {
      grid.appendChild(UI.el('div', {
        class: 'mday ' + d.status +
          (Utils.localDayKey(d.date) === Utils.localDayKey(new Date()) ? ' is-today' : ''),
        text: String(d.date.getDate()),
        title: Utils.localDayKey(d.date) + ' — ' + d.status
      }));
    });

    var list = UI.clear('history-list');
    var inMonth = sessions.filter(function (s) {
      var d = new Date(s.date);
      return d.getMonth() === month.month.getMonth() && d.getFullYear() === month.month.getFullYear();
    }).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    if (!inMonth.length) {
      list.appendChild(UI.el('p', { class: 'note', text: 'No sessions this month.' }));
      return;
    }

    inMonth.forEach(function (s) {
      var d = new Date(s.date);
      var best = s.exercises.map(function (e) {
        var ex = Exercises.get(e.key);
        return (ex ? ex.name : e.key) + ' ' + e.achieved + (ex && ex.type === 'hold' ? 's' : '');
      }).join(' · ');

      var badge = !s.completed ? 'left' : (s.kind === 'short' ? 'short' : 'day ' + s.day);

      list.appendChild(UI.el('div', { class: 'card h-item' }, [
        UI.el('div', { class: 'h-date', text: Utils.DAY_NAMES[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' · ' + Utils.formatHM(Utils.minutesOfDay(d)) }),
        UI.el('div', { class: 'h-body', text: best || 'nothing recorded' }),
        UI.el('span', { class: 'h-badge', text: badge })
      ]));
    });
  }

  /* -------------------------------- settings ----------------------------- */

  var routineDay = 'A';
  var bound = false;

  var NUMBER_FIELDS = {
    'set-dress': 'dressMin', 'set-budget': 'budgetMin', 'set-buffer': 'bufferMin',
    'set-rest': 'restSec', 'set-target': 'weeklyTarget'
  };
  var TIME_FIELDS = { 'set-wake': 'wakeAlarm', 'set-leave': 'leaveBy' };
  var CHECKS = {
    'set-sound': 'sound', 'set-vibrate': 'vibrate', 'set-awake': 'keepAwake',
    'set-notify': 'notifications'
  };

  function settings(onChange) {
    var s = Settings.load();

    Object.keys(TIME_FIELDS).forEach(function (id) { UI.$(id).value = s[TIME_FIELDS[id]]; });
    Object.keys(NUMBER_FIELDS).forEach(function (id) { UI.$(id).value = s[NUMBER_FIELDS[id]]; });
    Object.keys(CHECKS).forEach(function (id) { UI.$(id).checked = !!s[CHECKS[id]]; });
    UI.$('set-pause').value = s.pauseUntil || '';

    describeSchedule(s);
    describeNotifications(s);
    UI.setText('routine-source', s.days ? 'yours' : 'default');
    drawRoutine(onChange);

    if (bound) return;
    bound = true;

    Object.keys(TIME_FIELDS).forEach(function (id) {
      UI.on(id, 'change', function (e) { commit(TIME_FIELDS[id], e.target.value, onChange); });
    });
    Object.keys(NUMBER_FIELDS).forEach(function (id) {
      UI.on(id, 'change', function (e) { commit(NUMBER_FIELDS[id], Number(e.target.value), onChange); });
    });
    Object.keys(CHECKS).forEach(function (id) {
      UI.on(id, 'change', function (e) { commit(CHECKS[id], e.target.checked, onChange); });
    });
    UI.on('set-pause', 'change', function (e) { commit('pauseUntil', e.target.value || null, onChange); });
    UI.on('set-pause-clear', 'click', function () {
      UI.$('set-pause').value = '';
      commit('pauseUntil', null, onChange);
    });

    UI.$$('#routine-days .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        routineDay = b.getAttribute('data-day');
        UI.$$('#routine-days .seg-btn').forEach(function (x) { UI.toggleClass(x, 'on', x === b); });
        drawRoutine(onChange);
      });
    });

    UI.on('routine-add', 'click', function () {
      var key = UI.$('routine-pick').value;
      if (!key) return;
      var days = Settings.load().days || Settings.forkRoutine();
      var ex = Exercises.get(key);
      days[routineDay].items.push({ key: key, target: ex.type === 'hold' ? 30 : 10 });
      Settings.save({ days: days });
      UI.setText('routine-source', 'yours');
      drawRoutine(onChange);
      onChange();
    });

    UI.on('routine-restore', 'click', function () {
      if (!confirm('Put the default routine back? Your edits to the exercise list are lost; your session history is not touched.')) return;
      Settings.restoreRoutine();
      UI.setText('routine-source', 'default');
      drawRoutine(onChange);
      onChange();
    });

    bindData(onChange);
    bindUpdates();
  }

  /* -------------------------------- updates ------------------------------- */

  var found = null;

  function bindUpdates() {
    describeBuild();

    UI.on('update-check', 'click', function () {
      UI.setText('update-status', 'Asking GitHub…');
      UI.show('update-apply', false);
      Updater.check().then(function (r) {
        found = r.newer ? r : null;
        UI.show('update-apply', !!r.newer);
        UI.setText('update-status', r.newer
          ? 'Version ' + r.version + ' is available.' + (r.notes ? ' ' + r.notes : '')
          : 'No update: ' + r.reason + '.');
      });
    });

    UI.on('update-apply', 'click', function () {
      if (!found) return;
      if (!Updater.available()) {
        UI.setText('update-status',
          'This is the browser build — reload the page to get the newest web files. ' +
          'Over-the-air updates only apply to the installed app.');
        return;
      }
      UI.setText('update-status', 'Downloading ' + found.version + '…');
      Updater.apply(found).catch(function (e) {
        UI.setText('update-status', 'That did not work: ' + e.message);
      });
    });
  }

  function describeBuild() {
    var v = Updater.version();
    UI.setText('update-version', v.version + ' · ' + v.commit);
    UI.setText('update-status', Updater.available()
      ? 'The web half of the app updates over the air from the releases of ' + Updater.REPO +
        '. A new plugin or permission still needs a new APK.'
      : 'Browser build — it already runs whatever the server last served.');
  }

  function commit(key, value, onChange) {
    var patch = {}; patch[key] = value;
    var s = Settings.save(patch);
    describeSchedule(s);
    describeNotifications(s);
    onChange();
  }

  /* The settings screen states what the numbers produce, in words. Four fields that
     silently combine into a notification time are four fields nobody can check. */
  function describeSchedule(s) {
    var m = Schedule.moments(s);
    UI.toggleClass('set-derived', 'danger', !m.valid);
    if (!m.valid) {
      UI.setText('set-derived', 'These numbers do not work: ' + m.reason + '. Nothing will be scheduled until they do.');
      return;
    }
    UI.setText('set-derived',
      'So: nudged at ' + Utils.formatHM(m.invitation) + ', last call at ' + Utils.formatHM(m.lastCall) +
      ', and a session started at ' + Utils.formatHM(m.lastCall) + ' still leaves ' +
      s.bufferMin + ' spare minutes before you have to get dressed.');
  }

  function describeNotifications(s) {
    var text;
    if (!Notify.available()) {
      text = 'This is the browser build, which cannot wake you — a web page has no way to ' +
             'fire an alarm at ' + s.wakeAlarm + ' when it is not running. Everything else works; ' +
             'install the app for the nudges.';
    } else if (!s.notifications) {
      text = 'Nudges are off. The app still tracks everything you do.';
    } else if (s.pauseUntil) {
      text = 'Paused through ' + s.pauseUntil + '. Nudges resume the next work day after that.';
    } else {
      text = 'Armed for the next ' + Notify.DAYS_AHEAD + ' days, re-armed every time you open the app.';
    }
    UI.setText('set-notify-status', text);
  }

  function drawRoutine(onChange) {
    var list = UI.clear('routine-list');
    var days = Settings.days();
    var day = days[routineDay];
    var editable = !!Settings.load().days;

    day.items.forEach(function (item, idx) {
      var ex = Exercises.get(item.key);
      if (!ex) return;
      var unit = ex.type === 'hold' ? 's' : '';
      var step = ex.type === 'hold' ? 5 : 1;

      function bump(by) {
        var d = Settings.load().days || Settings.forkRoutine();
        var it = d[routineDay].items[idx];
        it.target = Math.max(1, (it.target || 0) + by);
        Settings.save({ days: d });
        UI.setText('routine-source', 'yours');
        drawRoutine(onChange);
        onChange();
      }

      list.appendChild(UI.el('li', {}, [
        UI.el('span', { class: 'r-name', text: ex.name + (item.sets > 1 ? ' ×' + item.sets : '') }),
        UI.el('button', { class: 'btn', type: 'button', text: '−', onclick: function () { bump(-step); } }),
        UI.el('span', { class: 'r-val', text: item.target + unit }),
        UI.el('button', { class: 'btn', type: 'button', text: '+', onclick: function () { bump(step); } }),
        UI.el('button', {
          class: 'btn btn-ghost danger', type: 'button', text: '✕',
          'aria-label': 'remove ' + ex.name,
          onclick: function () {
            var d = Settings.load().days || Settings.forkRoutine();
            if (d[routineDay].items.length <= 1) { UI.toast('A day needs at least one exercise.'); return; }
            d[routineDay].items.splice(idx, 1);
            Settings.save({ days: d });
            UI.setText('routine-source', 'yours');
            drawRoutine(onChange);
            onChange();
          }
        })
      ]));
    });

    /* The targets shown here are whatever the routine says; what the session actually
       asks for comes from your history. Saying so avoids the obvious confusion. */
    if (!editable) {
      list.appendChild(UI.el('p', { class: 'note', text:
        'Editing any number here takes a private copy of the default routine. Your session targets come from your own history, not from these — these are only the starting points.' }));
    }

    var pick = UI.clear('routine-pick');
    pick.appendChild(UI.el('option', { value: '', text: 'Add an exercise…' }));
    Exercises.all().forEach(function (ex) {
      pick.appendChild(UI.el('option', { value: ex.key, text: ex.name }));
    });
  }

  /* ---------------------------------- data ------------------------------- */

  function bindData(onChange) {
    UI.on('data-export', 'click', function () {
      DB.exportJSON().then(function (text) {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = UI.el('a', { href: url, download: 'pushme-' + Utils.localDayKey(new Date()) + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        UI.setText('data-note', 'Exported. Keep it somewhere that is not this phone.');
      });
    });

    UI.on('data-import', 'click', function () { UI.$('data-file').click(); });

    UI.on('data-file', 'change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      file.text().then(function (text) {
        return DB.importJSON(text, { withSettings: false });
      }).then(function (r) {
        UI.setText('data-note', 'Imported ' + r.imported + ' session' + (r.imported === 1 ? '' : 's') +
          (r.skipped ? ', skipped ' + r.skipped + ' that did not look like sessions.' : '.'));
        onChange();
      }).catch(function (err) {
        UI.setText('data-note', 'Could not import that file: ' + err.message);
      });
      e.target.value = '';
    });

    UI.on('data-reset', 'click', function () {
      if (!confirm('Erase every recorded session? This cannot be undone. Export first if you want to keep them.')) return;
      DB.clearSessions().then(function () {
        UI.setText('data-note', 'All sessions erased.');
        onChange();
      });
    });
  }

  return {
    progress: progress, history: history, settings: settings,
    describeNotifications: describeNotifications, describeBuild: describeBuild
  };
})();
