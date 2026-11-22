/* patch-android — the handful of native edits that have to survive `cap add android`.
 *
 * The android/ directory is generated, not committed: it is 40 MB of Gradle scaffolding
 * that would bury the ten files that are actually this app. The price is that anything
 * hand-edited in there is lost on every build, so the edits live here instead, where
 * they are reviewable and run the same way locally and in CI.
 *
 * Run after `npx cap add android`, before `cap sync`.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
  console.error('No android/ platform yet — run `npx cap add android` first.');
  process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

/* An inexact alarm may fire "within the hour", which for an app whose whole job is a
   twenty-minute window is the same as not firing. On Android 13+ SCHEDULE_EXACT_ALARM
   must be granted by hand in system settings; USE_EXACT_ALARM is granted on install and
   is the right declaration for an app that behaves like an alarm clock. Google restricts
   it on Play, which does not apply to a sideloaded personal build. */
const PERMISSIONS = [
  'android.permission.USE_EXACT_ALARM',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',   // nudges survive a restart
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.INTERNET'                  // the only network use is the update check
];

let added = [];
PERMISSIONS.forEach(name => {
  if (manifest.indexOf('"' + name + '"') > -1) return;
  manifest = manifest.replace(
    /<application/,
    `<uses-permission android:name="${name}" />\n\n    <application`
  );
  added.push(name.replace('android.permission.', ''));
});

fs.writeFileSync(manifestPath, manifest);
console.log(added.length ? 'added permissions: ' + added.join(', ') : 'permissions already present');
