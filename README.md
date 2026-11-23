# pushme

Ten minutes of shoulder and core work, defended from breakfast.

The problem is not willpower and not time — there are forty-five minutes between the
alarm and the door. The problem is that the ten minutes get eaten invisibly, by
breakfast, and by the time anyone notices it is too late to start. So the app does two
things: it asks at the moment the slot is cheapest, and it tells you when the slot is
about to close.

Everything is derived from four numbers you set once:

```
last call  = leave − dressing − session budget − safety buffer
invitation = alarm + 5 minutes
```

With the defaults (alarm 06:45, out by 07:30, 5 min dressing, 10 min session, 5 min
buffer) that is a nudge at **06:50** and a last call at **07:10**. Change when you
leave and both move. Nothing in the code knows those times.

## What it does

- **Today** — which phase of the morning you are in, how long is left, and today's plan
  with the target for each exercise.
- **The session** — one exercise at a time, in type big enough to read from the floor.
  Nothing starts without you: reps wait for a tap, and so does the clock on a timed
  hold, so you can read the cues and get into position before anything counts down. Twenty seconds of rest
  between exercises. A **Too hard today** button that records the real number and does
  not count it against you.
- **Progress** — where each exercise started, where it is now, and the line between.
- **History** — a month at a glance, and every session in it.
- **Settings** — the four morning numbers (and a sentence saying what they produce), the
  routine as editable data, the alarm check, export and import.

## The routine

Two alternating days, around five minutes of work each:

| Day A — shoulder-led | Day B — core-led |
| --- | --- |
| Wall angels | Scapular push-ups |
| Prone Y-T-W | Prone T hold |
| Push-ups ×2 | Push-ups |
| Dead bug | Crunches |
| Plank | Side plank |

**This is a starting point, not a prescription.** It was written for a known shoulder
weakness whose diagnosis this repository does not contain. The list lives in
[`www/js/exercises.js`](www/js/exercises.js) as data and can be edited from the Settings
screen — if a physiotherapist gives you a different list, put that one in. Nothing else
in the app needs to change.

The starting numbers are openers, and the app throws them away: **the first completed
run of an exercise sets the baseline**, whatever it achieved. After that, meeting a
target adds one rep or five seconds; missing it twice in a row backs off to what you
actually managed. Near misses (within 10%) still count as met, and the *worst* set of a
multi-set exercise is the one recorded — twenty push-ups followed by fourteen is
fourteen.

## Scoring

The unit is the **week**, not the day: three mornings out of Monday–Thursday, and the
fourth is allowed to go wrong. A streak of days would let one missed Tuesday erase two
months, which is the shape of feedback that makes people stop opening the app. A test
asserts that eight weeks of three-of-four survive the fourth day being blank every time.

## Why it is a native app

A web page cannot wake you. Web push needs a server; periodic background sync is
engagement-driven and gives no time-of-day guarantee. So the web app is wrapped in
Capacitor, which can schedule a real local notification.

It is also why `USE_EXACT_ALARM` is declared: an inexact alarm may fire *within the
hour*, which for a twenty-minute window is the same as not firing.

The app installs once and updates itself after that. Each release carries two files:

- `pushme-<version>.apk` — the native shell. Only needed when the shell itself changes.
- `pushme-www-<version>.zip` — the web bundle, which the app finds by itself through
  **Settings → Updates**.

The release feed is GitHub's own public API for this repository. That is the entire back
end: no account, no token, nothing to keep running.

## The alarm check

Android will tell any app when the **next** alarm clock goes off, with no permission
required — and deliberately nothing else: no label, no repeat rule, no owning app. So
pushme cannot know that an alarm is *the work alarm*. The guess it makes instead is
stated on the Settings screen: an alarm before 08:00 (editable) looks like a work alarm,
and no alarm at all looks like a day off.

Only the **next work day** is ever held back. Beyond the immediate next alarm the phone
says nothing, and an app that silently stops nudging for a fortnight has deleted itself.
The manual **pause until** is the reliable control; this is the convenience on top.

## Building

Nothing needs installing to run the tests:

```
node tools/test-all.js
```

They cover the deadline arithmetic, the progression rules, the session engine and the
alarm heuristic — around 150 assertions, and a ten-minute workout runs in a millisecond
because every method takes `now` as an argument.

To see the app:

```
python -m http.server 8787 --directory www
```

Everything works in a browser except the part that wakes you up, and the app says so on
the Today screen rather than pretending.

To cut a release, push a tag:

```
git tag v0.2.0 && git push origin v0.2.0
```

CI generates the Android project (`android/` is not committed — 40 MB of Gradle
scaffolding would bury the ten files that are actually this app), applies the native
edits from [`tools/patch-android.js`](tools/patch-android.js), builds a debug-signed APK
for sideloading, and attaches both artefacts to the release.

## Layout

```
www/js/schedule.js      the deadline arithmetic — four numbers in, two nudges out
www/js/exercises.js     the catalogue as data, with hand-drawn schematic figures
www/js/progression.js   what to ask of you today, from what you did before
www/js/session.js       the ten minutes, as a state machine with no DOM and no clock
www/js/score.js         weeks, streaks, the month grid
www/js/alarms.js        the guess about whether tomorrow is a work day
www/js/notify.js        the nudges, and the admission that a web page cannot deliver them
www/js/updater.js       over-the-air web updates from GitHub releases
tools/test-*.js         all of the above, tested without a device
native/android/         the one Java file Capacitor does not generate
```

The hard parts are pure functions in files that never touch a DOM, and the screen only
draws what they return. That is what makes a morning routine testable at one in the
afternoon.
