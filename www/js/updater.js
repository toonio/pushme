/* Updater — over-the-air web-bundle updates, without a server of my own.
 *
 * The native shell is installed once by hand. Everything above it — all of www — is a
 * bundle the app can replace at runtime through @capgo/capacitor-updater, so fixing a
 * wrong target or a bad cue does not mean sideloading another APK.
 *
 * The release feed is GitHub's own public API for this repository. That is the whole
 * back end: no account, no token, no service to keep running, and nothing about the
 * owner leaves the phone — the request carries a repository path and nothing else.
 * Sixty unauthenticated calls an hour is a generous budget for one phone checking once
 * a day.
 *
 * A native shell change (a new plugin, a permission, an icon) still needs a new APK;
 * only the web layer travels this way. The Settings card says which is which.
 */
var Updater = (function () {
  'use strict';

  var REPO = 'toonio/pushme';
  var RELEASES = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  var ASSET = /^pushme-www-(.+)\.zip$/;

  var current = { version: '0.0.0', commit: 'dev', builtAt: null };

  function plugin() {
    var cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.CapacitorUpdater) || null;
  }

  function available() { return !!plugin(); }

  /** What this running bundle is. Travels inside the bundle, so an OTA update
      automatically reports its own version rather than the shell's. */
  function loadLocal() {
    return fetch('build.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) { current = j; return j; })
      .catch(function () { return current; });
  }

  function version() { return current; }

  /**
   * Capgo keeps a new bundle on probation: unless the app announces that it started,
   * the next launch rolls back to the previous one. That is the safety net for a
   * bundle that crashes on boot, and it only works if this is actually called.
   */
  function notifyReady() {
    var p = plugin();
    if (!p) return Promise.resolve(false);
    return p.notifyAppReady().then(function () { return true; }).catch(function () { return false; });
  }

  /** Compare dotted versions numerically. "0.10.0" is newer than "0.9.0". */
  function compare(a, b) {
    var x = String(a).replace(/^v/, '').split(/[.\-+]/);
    var y = String(b).replace(/^v/, '').split(/[.\-+]/);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i], 10), q = parseInt(y[i], 10);
      if (isNaN(p) && isNaN(q)) continue;
      if (isNaN(p)) return -1;
      if (isNaN(q)) return 1;
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  }

  /**
   * Ask GitHub what the latest release is.
   * Resolves to { newer, version, url, notes } or { newer: false, reason }.
   */
  function check() {
    return fetch(RELEASES, {
      cache: 'no-store',
      headers: { 'Accept': 'application/vnd.github+json' }
    }).then(function (r) {
      /* 404 here means the repository has no published release yet, which is a normal
         state and not a failure to reach anything. Reporting it as an error would send
         somebody looking for a network problem that does not exist. */
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('GitHub answered ' + r.status);
      return r.json();
    }).then(function (rel) {
      if (!rel) return { newer: false, reason: 'nothing has been released yet' };
      var asset = (rel.assets || []).filter(function (a) { return ASSET.test(a.name); })[0];
      if (!asset) return { newer: false, reason: 'that release has no web bundle attached' };

      var remote = ASSET.exec(asset.name)[1];
      if (compare(remote, current.version) <= 0) {
        return { newer: false, reason: 'you are on the latest (' + current.version + ')', version: remote };
      }
      return {
        newer: true, version: remote,
        url: asset.browser_download_url,
        notes: (rel.body || '').split('\n').slice(0, 4).join(' ').trim()
      };
    }).catch(function (e) {
      return { newer: false, reason: 'could not reach GitHub: ' + e.message };
    });
  }

  /**
   * Download a bundle and switch to it. `set` reloads the webview, so nothing after
   * this resolves is guaranteed to run.
   */
  function apply(found) {
    var p = plugin();
    if (!p) return Promise.reject(new Error('this build cannot update itself'));
    return p.download({ url: found.url, version: found.version })
      .then(function (bundle) { return p.set(bundle); });
  }

  return {
    REPO: REPO,
    available: available, loadLocal: loadLocal, version: version,
    notifyReady: notifyReady, compare: compare, check: check, apply: apply
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Updater;
