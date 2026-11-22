/* Exercises — the catalogue, as DATA.
 *
 * Deliberately not hardcoded into the session engine: the owner has a known shoulder
 * weakness whose diagnosis is not recorded here, and whoever diagnosed it may replace
 * any of these. Editing this list — or the copy of it in settings — must be enough to
 * change the routine, with no code change anywhere else.
 *
 * `type` drives the session behaviour:
 *   reps  — show the target, wait for a tap. A timer would rush you or leave you idle.
 *   hold  — count down, beep at the end.
 * `perSide: true` means the target applies to each side and the session runs it twice.
 *
 * Figures are schematic SVG, drawn here rather than fetched: tiny, offline, no licence
 * question, consistent style. They show a start and an end position with an arrow —
 * enough to recognise a movement, not enough to learn it cold, which is what `video`
 * is for.
 */
var Exercises = (function () {
  'use strict';

  var INK = '#e9eef5';
  var DIM = '#7d8a99';
  var MARK = '#4cc9a0';

  /* ------------------------------ figure parts ----------------------------- */

  function svg(tag, attrs, kids) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function line(x1, y1, x2, y2, opts) {
    var o = opts || {};
    return svg('line', {
      x1: x1, y1: y1, x2: x2, y2: y2,
      stroke: o.colour || INK, 'stroke-width': o.w || 4,
      'stroke-linecap': 'round', 'stroke-dasharray': o.dash || null, opacity: o.opacity || null
    });
  }

  function head(cx, cy, opts) {
    var o = opts || {};
    return svg('circle', { cx: cx, cy: cy, r: o.r || 9,
      fill: 'none', stroke: o.colour || INK, 'stroke-width': o.w || 4, opacity: o.opacity || null });
  }

  function path(d, opts) {
    var o = opts || {};
    return svg('path', { d: d, fill: 'none', stroke: o.colour || INK,
      'stroke-width': o.w || 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'stroke-dasharray': o.dash || null, opacity: o.opacity || null });
  }

  /** A curved motion arrow, so the direction of travel is never ambiguous. */
  function arrow(d) {
    var g = svg('g', {});
    g.appendChild(path(d, { colour: MARK, w: 3 }));
    return g;
  }

  function arrowHead(x, y, rotate) {
    return svg('path', {
      d: 'M0 0 L-7 -4 L-7 4 Z', fill: MARK,
      transform: 'translate(' + x + ',' + y + ') rotate(' + rotate + ')'
    });
  }

  function figure(kids) {
    return svg('svg', { viewBox: '0 0 220 150', role: 'img' }, kids);
  }

  /* Ghosted "start" pose behind the solid "end" pose. */
  function ghost(kids) {
    return svg('g', { opacity: 0.32 }, kids);
  }

  /* ------------------------------- the figures ----------------------------- */

  var FIGURES = {
    wallAngels: function () {
      return figure([
        line(28, 10, 28, 140, { colour: DIM, w: 3 }),          // the wall
        head(60, 36),
        line(60, 46, 60, 96),                                   // trunk
        line(60, 96, 60, 136),                                  // legs
        ghost([                                                 // start: elbows low
          line(60, 62, 34, 76), line(34, 76, 40, 102),
          line(60, 62, 86, 76), line(86, 76, 80, 102)
        ]),
        line(60, 62, 34, 52), line(34, 52, 42, 24),             // end: arms overhead
        line(60, 62, 86, 52), line(86, 52, 78, 24),
        arrow('M104 96 Q124 62 112 32'), arrowHead(112, 32, -75)
      ]);
    },

    proneYTW: function () {
      return figure([
        line(20, 112, 200, 112, { colour: DIM, w: 3 }),         // the floor
        head(66, 96),
        line(78, 100, 150, 100),                                // trunk, face down
        line(150, 100, 190, 108),
        ghost([line(90, 100, 70, 108), line(110, 100, 92, 108)]),
        line(88, 98, 58, 66), line(112, 98, 84, 60),            // arms lifted into a Y
        arrow('M64 88 Q52 70 54 58'), arrowHead(54, 58, -100)
      ]);
    },

    scapPushups: function () {
      return figure([
        line(20, 120, 200, 120, { colour: DIM, w: 3 }),
        head(58, 72),
        line(70, 78, 150, 92),
        line(150, 92, 192, 116),
        line(72, 80, 74, 118), line(104, 84, 104, 120),         // straight arms throughout
        ghost([path('M64 62 Q86 54 108 62')]),                  // shoulder blades pinched
        path('M64 74 Q86 82 108 74'),                           // chest sinks between them
        arrow('M86 44 Q86 56 86 64'), arrowHead(86, 66, 90)
      ]);
    },

    pushups: function () {
      return figure([
        line(20, 122, 200, 122, { colour: DIM, w: 3 }),
        ghost([                                                 // start: arms extended
          head(56, 60), line(68, 66, 150, 88), line(150, 88, 192, 116),
          line(70, 68, 72, 120), line(104, 76, 104, 122)
        ]),
        head(54, 92),                                           // end: chest low
        line(66, 96, 150, 102),
        line(150, 102, 192, 120),
        line(68, 98, 60, 122), line(100, 100, 108, 122),        // elbows bent back
        arrow('M34 62 Q30 80 34 92'), arrowHead(34, 94, 95)
      ]);
    },

    deadBug: function () {
      return figure([
        line(20, 118, 200, 118, { colour: DIM, w: 3 }),
        head(48, 100),
        line(60, 104, 148, 104),                                // back flat on the floor
        line(92, 102, 96, 58), line(96, 58, 128, 48),           // opposite arm up
        line(120, 104, 150, 70), line(150, 70, 182, 80),        // opposite leg out
        ghost([line(92, 102, 70, 60), line(120, 104, 128, 62)]),
        arrow('M150 36 Q170 44 182 62'), arrowHead(182, 64, 60)
      ]);
    },

    plank: function () {
      return figure([
        line(20, 120, 200, 120, { colour: DIM, w: 3 }),
        head(54, 74),
        line(66, 80, 158, 98),                                  // one straight line
        line(158, 98, 192, 118),
        line(70, 82, 64, 120), line(70, 82, 92, 120),           // forearm down
        line(64, 120, 96, 120, { w: 5 }),
        arrow('M96 58 L150 72'), arrowHead(152, 72, 15)
      ]);
    },

    sidePlank: function () {
      return figure([
        line(20, 122, 200, 122, { colour: DIM, w: 3 }),
        head(52, 66),
        line(62, 74, 160, 110),                                 // body on its edge
        line(62, 74, 58, 122), line(58, 122, 86, 122, { w: 5 }),
        line(74, 76, 74, 34),                                   // top arm to the ceiling
        arrow('M104 52 L104 80'), arrowHead(104, 82, 90)
      ]);
    },

    hollowHold: function () {
      return figure([
        line(20, 120, 200, 120, { colour: DIM, w: 3 }),
        head(52, 88),
        path('M64 94 Q110 112 158 92'),                         // lower back pressed down
        line(64, 92, 40, 58),                                   // arms past the ears
        line(158, 92, 190, 70),                                 // legs low
        arrow('M110 134 Q110 124 110 116'), arrowHead(110, 114, -90)
      ]);
    },

    crunches: function () {
      return figure([
        line(20, 120, 200, 120, { colour: DIM, w: 3 }),
        ghost([head(56, 100), line(68, 104, 120, 108)]),
        head(66, 80),                                           // shoulder blades lift
        line(78, 86, 124, 104),
        line(124, 104, 150, 72), line(150, 72, 182, 108),       // knees bent
        line(70, 76, 58, 60),
        arrow('M44 112 Q40 94 50 78'), arrowHead(50, 76, -70)
      ]);
    },

    proneT: function () {
      return figure([
        line(20, 112, 200, 112, { colour: DIM, w: 3 }),
        head(66, 96),
        line(78, 100, 150, 100),
        line(150, 100, 190, 108),
        ghost([line(96, 100, 96, 110), line(96, 100, 96, 110)]),
        line(96, 98, 96, 62), line(96, 98, 96, 62),             // arms straight out sideways
        line(60, 92, 134, 92),                                  // the T
        arrow('M150 70 Q150 58 150 48'), arrowHead(150, 46, -90)
      ]);
    }
  };

  /* ------------------------------ the catalogue ---------------------------- */

  var CATALOGUE = {
    wallAngels: {
      key: 'wallAngels', name: 'Wall angels', type: 'reps', unit: 'reps', figure: 'wallAngels',
      cues: [
        'Back flat to the wall, feet a little way out from it.',
        'Elbows and wrists touching the wall throughout.',
        'Slide the arms overhead, then back down, slowly.'
      ],
      mistake: 'Letting the lower back arch away from the wall to get the arms higher.',
      video: 'wall angels exercise shoulder'
    },
    proneYTW: {
      key: 'proneYTW', name: 'Prone Y-T-W', type: 'reps', unit: 'reps each', figure: 'proneYTW',
      cues: [
        'Face down, forehead resting, arms off the floor.',
        'Make a Y overhead, then a T out sideways, then a W with elbows tucked.',
        'Lift from the shoulder blades, not the hands.'
      ],
      mistake: 'Shrugging the shoulders up toward the ears instead of pulling them down and back.',
      video: 'prone Y T W raises shoulder'
    },
    scapPushups: {
      key: 'scapPushups', name: 'Scapular push-ups', type: 'reps', unit: 'reps', figure: 'scapPushups',
      cues: [
        'Push-up position, arms completely straight and staying straight.',
        'Let the chest sink between the shoulder blades, then push the upper back up.',
        'Only the shoulder blades move. Small range.'
      ],
      mistake: 'Bending the elbows — that makes it an ordinary push-up.',
      video: 'scapular push ups'
    },
    pushups: {
      key: 'pushups', name: 'Push-ups', type: 'reps', unit: 'reps', figure: 'pushups',
      cues: [
        'Hands under the shoulders, body in one line from head to heels.',
        'Elbows back at about 45°, not flared out sideways.',
        'Chest toward the floor, then press away.'
      ],
      mistake: 'Hips sagging, or the head poking forward ahead of the chest.',
      video: 'push up proper form'
    },
    deadBug: {
      key: 'deadBug', name: 'Dead bug', type: 'reps', unit: 'reps / side', perSide: true, figure: 'deadBug',
      cues: [
        'On your back, arms up, knees over hips.',
        'Lower the opposite arm and leg together, slowly.',
        'The lower back stays pressed into the floor the whole time.'
      ],
      mistake: 'Letting the back arch off the floor as the leg goes down — shorten the range instead.',
      video: 'dead bug exercise core'
    },
    plank: {
      key: 'plank', name: 'Plank', type: 'hold', unit: 'seconds', figure: 'plank',
      cues: [
        'Forearms under the shoulders, elbows directly below.',
        'One straight line: head, hips, heels.',
        'Squeeze the glutes and breathe normally.'
      ],
      mistake: 'Hips drifting up into a tent, or sagging toward the floor.',
      video: 'forearm plank form'
    },
    sidePlank: {
      key: 'sidePlank', name: 'Side plank', type: 'hold', unit: 'seconds / side', perSide: true, figure: 'sidePlank',
      cues: [
        'Elbow under the shoulder, feet stacked or staggered.',
        'Lift the hips so the body makes one line.',
        'Top arm to the ceiling or on the hip.'
      ],
      mistake: 'Letting the hips drop back or sink toward the floor.',
      video: 'side plank form'
    },
    hollowHold: {
      key: 'hollowHold', name: 'Hollow hold', type: 'hold', unit: 'seconds', figure: 'hollowHold',
      cues: [
        'On your back, press the lower back firmly into the floor.',
        'Lift the shoulder blades and the legs a little way up.',
        'Lower the legs only as far as the back stays flat.'
      ],
      mistake: 'Dropping the legs so low that the lower back lifts away from the floor.',
      video: 'hollow body hold'
    },
    crunches: {
      key: 'crunches', name: 'Crunches', type: 'reps', unit: 'reps', figure: 'crunches',
      cues: [
        'Knees bent, feet flat, hands light at the temples.',
        'Lift the shoulder blades off the floor, a short range.',
        'Chin stays off the chest — look up and forward.'
      ],
      mistake: 'Pulling on the neck with the hands.',
      video: 'crunch exercise form'
    },
    proneT: {
      key: 'proneT', name: 'Prone T hold', type: 'hold', unit: 'seconds', figure: 'proneT',
      cues: [
        'Face down, arms straight out to the sides at shoulder height.',
        'Lift the arms a few centimetres and hold.',
        'Thumbs up, shoulder blades pulled down and together.'
      ],
      mistake: 'Lifting the chest high off the floor instead of holding it still.',
      video: 'prone T raise hold'
    }
  };

  /* -------------------------------- the days ------------------------------- */

  /* Starting targets. Only the push-up numbers come from the owner's practice; the
     rest are openers, and the first completed run of each day overwrites them with
     what was actually managed. See `Progression.calibrate`. */
  var DAYS = {
    A: {
      key: 'A', name: 'Day A', focus: 'shoulder-led',
      items: [
        { key: 'wallAngels', target: 10 },
        { key: 'proneYTW', target: 8 },
        { key: 'pushups', target: 20, sets: 2 },
        { key: 'deadBug', target: 10 },
        { key: 'plank', target: 45 }
      ]
    },
    B: {
      key: 'B', name: 'Day B', focus: 'core-led',
      items: [
        { key: 'scapPushups', target: 12 },
        { key: 'proneT', target: 20 },
        { key: 'pushups', target: 20, sets: 1 },
        { key: 'crunches', target: 25 },
        { key: 'sidePlank', target: 30 }
      ]
    }
  };

  function get(key) { return CATALOGUE[key] || null; }
  function all() { return Object.keys(CATALOGUE).map(get); }
  function day(key) { return DAYS[key] || DAYS.A; }
  function dayKeys() { return ['A', 'B']; }

  /** Renders the schematic figure for an exercise, or null if it has none. */
  function figureFor(key) {
    var ex = get(key);
    if (!ex || !FIGURES[ex.figure]) return null;
    return FIGURES[ex.figure]();
  }

  /** A rough duration for one item, used to sanity-check the day against the budget. */
  function estimateSec(item) {
    var ex = get(item.key);
    if (!ex) return 0;
    var sets = item.sets || 1;
    var sides = ex.perSide ? 2 : 1;
    if (ex.type === 'hold') return item.target * sides * sets;
    return Math.round(item.target * 2.2) * sides * sets;    // ~2.2 s per controlled rep
  }

  return {
    CATALOGUE: CATALOGUE, DAYS: DAYS, FIGURES: FIGURES,
    get: get, all: all, day: day, dayKeys: dayKeys,
    figureFor: figureFor, estimateSec: estimateSec
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Exercises;
