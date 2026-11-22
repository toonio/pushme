/* Sound — short, loud, distinguishable cues for a session done on the floor, where the
 * phone is face-up two metres away and you are not looking at it.
 *
 * Patterns differ in count and pitch, not just in timing: the go cue and the stop cue
 * have to be tellable apart while you are face-down and out of breath, and two beeps
 * that differ only in length are not enough.
 */
var Sound = (function () {
  'use strict';

  var ctx = null;

  function context() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  /** Browsers suspend audio until a gesture; call this from the button that starts. */
  function unlock() {
    var c = context();
    if (c && c.state === 'suspended') c.resume();
    return !!c;
  }

  function beep(c, startAt, freq, durSec, gainPeak) {
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = 'square';            // more harmonics, carries further than a sine
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(gainPeak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durSec);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(startAt);
    osc.stop(startAt + durSec + 0.02);
  }

  var PATTERNS = {
    /* Two rising chirps: begin. */
    go:   { beeps: [[880, 0.09], [1320, 0.14]], gap: 0.10, gain: 0.45 },
    /* Five fast high beeps: stop working. Unmistakable against the two-chirp go. */
    stop: { beeps: [[1500, 0.06], [1500, 0.06], [1500, 0.06], [1500, 0.06], [1500, 0.06]],
            gap: 0.05, gain: 0.5 },
    /* Three slower mid beeps: rest is over, next exercise. */
    next: { beeps: [[660, 0.12], [660, 0.12], [990, 0.18]], gap: 0.14, gain: 0.45 },
    /* One short tick, for the last seconds of a hold. */
    tick: { beeps: [[1200, 0.04]], gap: 0, gain: 0.25 },
    /* A small fanfare at the end, because finishing deserves one. */
    done: { beeps: [[660, 0.1], [880, 0.1], [1320, 0.28]], gap: 0.10, gain: 0.5 }
  };

  var VIBRATIONS = {
    go: [60, 60, 120], stop: [40, 40, 40, 40, 200], next: [90, 70, 90],
    tick: [25], done: [120, 80, 120, 80, 300]
  };

  var enabled = true;
  var vibrateEnabled = true;

  function configure(opts) {
    if (opts && typeof opts.sound === 'boolean') enabled = opts.sound;
    if (opts && typeof opts.vibrate === 'boolean') vibrateEnabled = opts.vibrate;
  }

  function play(name) {
    var pattern = PATTERNS[name];
    if (!pattern) return;

    if (vibrateEnabled && navigator.vibrate) {
      try { navigator.vibrate(VIBRATIONS[name] || 80); } catch (e) { /* unsupported */ }
    }
    if (!enabled) return;

    var c = context();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    var t = c.currentTime + 0.02;
    pattern.beeps.forEach(function (b) {
      beep(c, t, b[0], b[1], pattern.gain);
      t += b[1] + pattern.gap;
    });
  }

  return { unlock: unlock, configure: configure, play: play, PATTERNS: PATTERNS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
