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

/* ------------------------- the NextAlarm plugin -------------------------- */

const PKG = 'fr.toonio.pushme';
const javaDir = path.join(root, 'android', 'app', 'src', 'main', 'java', ...PKG.split('.'));

fs.copyFileSync(
  path.join(root, 'native', 'android', 'NextAlarmPlugin.java'),
  path.join(javaDir, 'NextAlarmPlugin.java')
);
console.log('copied NextAlarmPlugin.java');

/* Capacitor only loads a plugin that lives in the app's own module if the activity
   registers it, and it has to happen BEFORE super.onCreate builds the bridge. */
const activityPath = path.join(javaDir, 'MainActivity.java');
let activity = fs.readFileSync(activityPath, 'utf8');

if (activity.indexOf('NextAlarmPlugin.class') > -1) {
  console.log('MainActivity already registers NextAlarm');
} else {
  activity = `package ${PKG};

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must come before super.onCreate: that is where the bridge is built, and a
        // plugin registered afterwards is a plugin the web layer never sees.
        registerPlugin(NextAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(activityPath, activity);
  console.log('rewrote MainActivity.java to register NextAlarm');
}
