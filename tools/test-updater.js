/* Tests for what the updater reads out of a GitHub release.
 * Run: node tools/test-updater.js
 *
 * This file exists because of a bug that shipped: capgo refuses to install a bundle
 * it cannot verify, and it refuses BEFORE making any network call, so omitting the
 * checksum surfaced on the phone as "failed to download from <url>" — pointing at a
 * network that was never touched. Nothing here needs a network or a device.
 */
const fs = require('fs');
const path = require('path');

global.window = {};
const Updater = require(path.join(__dirname, '..', 'www', 'js', 'updater.js'));

let fails = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label +
    (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
}

const HEX = '1eaec165466f79415b33b7ea0fd44476d0c97cfb4a2536cb03e4dbe8aebc8166';
const zip = extra => Object.assign({
  name: 'pushme-www-0.3.0.zip',
  browser_download_url: 'https://github.com/toonio/pushme/releases/download/v0.3.0/pushme-www-0.3.0.zip'
}, extra);

console.log('— the checksum GitHub already publishes —');
let a = Updater.pickAsset({ assets: [zip({ digest: 'sha256:' + HEX })] });
is('version comes from the file name', a.version, '0.3.0');
is('and the hash from the asset digest', a.checksum, HEX);
is('so no second request is needed', a.checksumUrl, null);
is('upper case is still the same hash',
  Updater.pickAsset({ assets: [zip({ digest: 'sha256:' + HEX.toUpperCase() })] }).checksum, HEX);

console.log('\n— digests that are not a sha256 are not a sha256 —');
is('another algorithm is ignored',
  Updater.pickAsset({ assets: [zip({ digest: 'md5:d41d8cd98f00b204e9800998ecf8427e' })] }).checksum, null);
is('a truncated hash is ignored',
  Updater.pickAsset({ assets: [zip({ digest: 'sha256:abc123' })] }).checksum, null);
is('a missing digest is ignored', Updater.pickAsset({ assets: [zip()] }).checksum, null);

console.log('\n— the fallback, for the day the digest field changes shape —');
a = Updater.pickAsset({ assets: [
  zip(),
  { name: 'pushme-www-0.3.0.zip.sha256', browser_download_url: 'https://x/sum' }
] });
is('falls back to the published file', [a.checksum, a.checksumUrl], [null, 'https://x/sum']);
is('but prefers the digest when there is one', Updater.pickAsset({ assets: [
  zip({ digest: 'sha256:' + HEX }),
  { name: 'pushme-www-0.3.0.zip.sha256', browser_download_url: 'https://x/sum' }
] }).checksumUrl, null);
is('and the .sha256 file is never mistaken for the bundle itself',
  Updater.pickAsset({ assets: [
    { name: 'pushme-www-0.3.0.zip.sha256', browser_download_url: 'https://x/sum' }
  ] }).reason, 'that release has no web bundle attached');

console.log('\n— a release with nothing in it —');
is('no assets at all', Updater.pickAsset({ assets: [] }).reason,
  'that release has no web bundle attached');
is('the APK alone is not a web bundle', Updater.pickAsset({
  assets: [{ name: 'pushme-0.3.0.apk', browser_download_url: 'https://x/a.apk' }]
}).reason, 'that release has no web bundle attached');

console.log('\n— reading a .sha256 file —');
is('hash and filename', Updater.parseSumFile(HEX + '  pushme-www-0.3.0.zip'), HEX);
is('hash on its own', Updater.parseSumFile(HEX), HEX);
is('trailing newline and spaces', Updater.parseSumFile('  ' + HEX + ' \n'), HEX);
is('upper case comes back lower', Updater.parseSumFile(HEX.toUpperCase()), HEX);
is('an error page is not a checksum', Updater.parseSumFile('<html>404</html>'), null);
is('empty is not a checksum', Updater.parseSumFile(''), null);

console.log('\n— version comparison —');
is('0.10.0 is newer than 0.9.0', Updater.compare('0.10.0', '0.9.0'), 1);
is('equal is equal', Updater.compare('1.2.3', '1.2.3'), 0);
is('a leading v changes nothing', Updater.compare('v0.3.0', '0.3.0'), 0);
is('older is older', Updater.compare('0.2.0', '0.3.0'), -1);

console.log(fails ? `\n${fails} FAILED` : '\nall updater tests pass');
process.exit(fails ? 1 : 0);
