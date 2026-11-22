/* stamp-build — writes www/build.json and version-stamps every asset URL in index.html.
 *
 * The second half exists because of a bug in the sister app that cost a morning to
 * find: a new index.html was served while an old cached script was still running, the
 * script wrote to element ids that no longer existed, every write silently no-opped,
 * and the screen simply showed nothing. Stamping every src and href with the build id
 * means the markup and the code can never be from two different builds — the browser
 * either has both or fetches both.
 *
 * Run: node tools/stamp-build.js [version]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;

let commit = 'nogit';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { /* not a checkout */ }

const build = {
  version: version,
  commit: commit,
  builtAt: new Date().toISOString()
};

fs.writeFileSync(path.join(root, 'www', 'build.json'), JSON.stringify(build, null, 2) + '\n');

const token = version + '-' + commit;
const indexPath = path.join(root, 'www', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

/* Rewrite the ?v= on every local src/href. An asset without one is a mistake, not a
   choice, so add it rather than leaving that file to drift out of step. */
let stamped = 0;
html = html.replace(/(src|href)="((?!https?:|\/\/|#|data:)[^"?]+)(\?v=[^"]*)?"/g, (m, attr, file, q) => {
  if (/\.(js|css|json|png|svg|webmanifest)$/.test(file)) { stamped++; return `${attr}="${file}?v=${token}"`; }
  return m;
});

fs.writeFileSync(indexPath, html);
console.log(`stamped ${stamped} asset URLs with ${token}`);
console.log('wrote www/build.json:', JSON.stringify(build));
