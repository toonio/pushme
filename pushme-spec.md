# pushme — Project Spec

A small Android app that protects a ten-minute morning workout from being eaten by
breakfast. Native shell, web inside, updates over the air. Companion to `followme`,
same idioms, separate repo.

## The problem it solves

This is not a motivation app. The workout doesn't fail because of unwillingness or
because the schedule is tight — there are **45 minutes between the alarm and the door
and the session needs 10**. It fails because the slack drains invisibly at breakfast,
and by the time it's noticed the window has closed.

So the app's single job is **making the closing window impossible to not notice**, and
its secondary job is making the cost of skipping visible afterwards. Everything else is
in service of those two.

That diagnosis drives every decision below. If it turns out the real failure is *choice*
rather than *inattention* — seeing the 07:10 alert and swiping it away — then this design
is wrong and the answer lies in the cost side, not the prompt side.

## Architecture

- **Capacitor** shell wrapping a static web app. Android only.
- The web layer is plain HTML/CSS/JS in `followme`'s style: classic scripts, no build
  step, no framework.
- **Native is used for exactly three things**: scheduled local notifications, reading the
  next system alarm, and the OTA updater. Everything else stays web.
- **Storage**: IndexedDB for sessions and per-exercise history, `localStorage` for
  settings. On device, never leaves it. JSON export/import is the only backup.
- **No backend, no accounts, no analytics.** Unchanged from `followme`.
- **OTA**: `@capgo/capacitor-updater` (MPL-2.0) in self-hosted "No Cloud" mode — update
  bundles are zips attached to GitHub Releases. Assets stay bundled in the APK, so the
  app works with no network; updates are fetched on launch and applied on the next one.
  Play policy explicitly permits this: it replaces the web bundle in the WebView and
  downloads no native executable code.

## The morning model

Everything derives from four settings. Defaults are the real numbers:

| Setting | Default |
|---|---|
| Wake alarm | 06:45 |
| Out of the door | 07:30 |
| Dressing | 5 min |
| Session budget | 10 min |
| Safety buffer | 5 min |

Derived:

```
last call  = leaveBy − dressing − budget − buffer   =  07:30 − 5 − 10 − 5  =  07:10
invitation = wakeAlarm + 5 min                      =  06:50
```

Both are **computed, never hardcoded** — changing the leave time moves both nudges.

## Notifications

Two per morning, both **vibrate, neither plays a sound**:

1. **06:50 — the invitation.** *"10 minutes now and it's banked."* Fires while standing
   up, before breakfast starts, because breakfast is the leak and any slot after it is
   downstream of the problem.
2. **07:10 — the last call.** *"Start now or it won't fit."* This is the one that must
   land; it's the whole feature.

Completing a session at any point **cancels both**. Finishing early buys silence.

Exact timing requires the one-time Android *Alarms & reminders* grant
(`SCHEDULE_EXACT_ALARM`). Without it the system fires *"within one hour"*, which is
useless here, so the app must request it on first run and warn if it's later revoked —
revoking it **deletes** already-scheduled exact notifications.

`USE_EXACT_ALARM` is rejected: documented as *"Limited use cases"*, meant for
alarm-clock apps, and *"Subject to an upcoming Google Play policy"*.

## Only on work mornings

Nudges arm only when **both** hold:

- it's **Monday–Thursday** (Friday is part of the weekend here), and
- the next system alarm is set for **before 08:00** (threshold editable).

The second check uses `AlarmManager.getNextAlarmClock()`, which returns *"the next alarm
clock currently scheduled… by any application"*. API 21+, no permission listed, not
deprecated. It exposes `getTriggerTime()` **only — no label, no app name**, so the rule
can only be "an alarm exists before 08:00", not "the work alarm is on". That asymmetry
is fine: on a holiday no early alarm is set, so the app stays quiet.

Requires a **small custom Kotlin plugin** (~15 lines) — the only bespoke native code in
the project.

**Fallback, shipped regardless**: a manual *"pause until <date>"* button. A failed
detection must never produce an unwanted 06:50 vibration.

## The routine

> **Medical caveat.** These movements are a general-purpose starting point, not a
> prescription. The owner has a known shoulder weakness whose diagnosis is not recorded
> here; whoever diagnosed it should confirm or replace this list. The exercise list is
> therefore **editable data, never hardcoded**, so a physiotherapist's list drops
> straight in.

No equipment. Two days alternating — Mon A, Tue B, Wed A, Thu B — advancing only on
*completed* sessions, so skipping doesn't flip the rotation.

| Day A (shoulder-led) | Day B (core-led) |
|---|---|
| Wall angels · 10 reps | Scapular push-ups · 12 reps |
| Prone Y-T-W · 8 each | Prone T hold · 20 s |
| Push-ups · 2×20 reps | Push-ups · 20 reps |
| Dead bug · 10 / side | Crunches · 25 reps |
| Plank · 45 s | Side plank · 30 s / side |

Only the push-up numbers come from the owner's current practice (2×20). **The first run
of each day is calibration**: whatever is actually managed becomes the baseline, and
progression starts from there rather than from invented numbers.

A resistance band would materially improve the shoulder work — external rotations,
pull-aparts, face pulls are the staples and none are possible unweighted. Noted as a
likely later upgrade.

### Guidance

Each exercise carries:

- a **schematic SVG figure** — start and end position, arrow for the movement, authored
  in the same hand-rolled style as `followme`'s route traces. Bundled, tiny, offline, no
  licensing risk. Schematic, **not photographic**.
- **2–3 cue lines** and **one common-mistake line**.
- an optional **"show me"** link opening a video search — for learning a movement once,
  needs network, never needed again.

## Session flow

One exercise on screen at a time, designed to be read **from the floor** with the phone a
metre away, face-down or planking:

- oversized type for the rep target or the hold countdown
- the diagram large
- a **giant Done button** that can be hit without aiming
- no scrolling, no small controls

Per-exercise behaviour by type:

- **`reps`** — shows the target, waits for **Done**. A timer would either rush you or
  leave you waiting.
- **`hold`** — counts down automatically, using `followme`'s Web Audio beeps.

Between exercises: a fixed **20 s rest** (editable). Running total is shown against the
10-minute budget, with a warning if the session is drifting past it rather than silently
overrunning the deadline.

**Screen stays awake for the duration of a session**, released when it ends — same wake
lock as `followme`, never held outside a session.

### Running late

If the clock no longer allows a full session, and only then, the app offers a **short
version**: two exercises, ~4 minutes. Logged distinctly and drawn as a **half-mark** in
the month grid, so it counts for the streak without quietly becoming the new normal.

## Progression

Auto-progression per exercise: the target is last session's achievement **+1 rep** or
**+5 s**, and it **backs off after two consecutive misses**.

Every session offers a **"too hard today"** button, which logs the lower number
*without* resetting progress. A scheme that demands 24 push-ups on a bad morning is a
scheme that gets skipped entirely, and a skipped session is worse than a light one.

## Scoring

- **Target: 3 of 4** Mon–Thu days. Four of four means one bad morning wrecks a perfect
  week, and a score you can only lose is a score you stop reading. One free miss keeps
  the week winnable after a slip — which is exactly when habits die.
- **The streak counts successful weeks**, not consecutive days.
- The **month grid** shows every day individually: full mark, half mark (short session),
  miss, or non-day (Fri–Sun, greyed, never breaking anything).

## Views

1. **Today** — what day it is (A or B), the derived deadline, time remaining, and one
   big Start button. The default screen.
2. **Session** — the guided flow above.
3. **Progress** — headline deltas first (*"push-ups: 20 → 26 since you started"*), with a
   per-exercise line chart underneath for whichever is tapped. Charts reuse
   `followme`'s `seriesChart`.
4. **History** — month grid, weekly score, streak of weeks.
5. **Settings** — the four morning numbers, exercise list editing, rest duration, alarm
   threshold, pause-until, export/import.

## Data model

```json
{
  "id": "uuid",
  "date": "2026-11-23T06:52:00.000Z",
  "day": "A",
  "durationSec": 548,
  "kind": "full",
  "completed": true,
  "exercises": [
    { "key": "pushups",   "type": "reps", "target": 20, "achieved": 20, "easedOff": false },
    { "key": "plank",     "type": "hold", "target": 45, "achieved": 45, "easedOff": false }
  ]
}
```

`kind` is `full` or `short`. `achieved` is what drives progression; `target` is kept so a
later change of scheme can be reasoned about. Per-exercise history is derived on render
from the session list — no aggregation stored, same as `followme`.

## Build and distribution

- **No local Android SDK.** The machine has node 22, npm 10 and Java 21, but no Android
  Studio, no SDK, no adb. Installing them is multiple gigabytes for something that,
  thanks to OTA, runs **rarely**.
- **GitHub Actions builds the APK** and the update zip and attaches both to a release.
  The APK is installed once from the phone's browser; every subsequent JS change arrives
  over the air.
- Cost accepted: a ~5-minute CI round trip when *native* code changes, and harder native
  debugging. If that becomes painful, install the SDK then.
- **Sideloaded, not Play.** It's an app for one person. Note the developer-verification
  requirement now applying to sideloaded Android apps — to be checked at install time.
- Asset URLs carry a version stamp, as in `followme`, via the same `bump-assets.py`
  discipline.

## To verify on the device before relying on it

1. **Does the stock Clock app register alarms via `setAlarmClock()`?** If not,
   `getNextAlarmClock()` returns nothing and the holiday detection silently never arms.
   Test first; the manual pause is the fallback.
2. **The exact-alarm grant flow** — that the *Alarms & reminders* screen appears, and
   that notifications genuinely land at 07:10 rather than "within the hour".
3. **The capgo self-hosted update flow** end to end: release a zip, confirm the phone
   picks it up on next launch.
4. **Notification behaviour with the screen off and the phone idle** — `allowWhileIdle`
   notifications are documented as firing at most once per 9 minutes per app, which is
   fine for two, but worth confirming neither is swallowed.

## Decisions

- Native shell rather than a web app, **because the failure mode is inattention** and a
  notification is the right instrument for it. A static web page cannot schedule one:
  Push needs a server, Periodic Background Sync is *"Limited availability… Experimental"*
  and engagement-driven with no time-of-day guarantee.
- Discrete scheduled notifications, **not** a live-ticking countdown. The plugin supports
  an `ongoing` notification that can't be swiped away, but a ticking timer needs a
  foreground service in native Kotlin — not worth it for v1.
- `server.url` remote loading rejected: *"This is not intended for use in production."*
- A/B alternation rather than random variety — predictable, self-balancing, and it keeps
  progression comparable week to week. Random variety makes the numbers meaningless.
- Exercise list is data, not code (see the medical caveat).
- Weekly target 3 of 4, streak of weeks, one free miss.
- Mon–Thu only.

## Out of scope for v1

- Resistance-band exercises (likely v2, pending a band).
- Heart rate, cadence, or any sensor input.
- A live-ticking notification countdown.
- Play Store distribution.
- iOS — Capacitor could target it, but nothing here has been designed against it.
