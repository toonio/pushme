/* Runs every test file. Run: node tools/test-all.js */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter(f => /^test-.+\.js$/.test(f) && f !== 'test-all.js')
  .sort();

let failed = [];
files.forEach(f => {
  process.stdout.write('\n========== ' + f + ' ==========\n');
  try {
    process.stdout.write(execFileSync(process.execPath, [path.join(__dirname, f)]).toString());
  } catch (e) {
    process.stdout.write((e.stdout || '').toString());
    failed.push(f);
  }
});

console.log('\n' + (failed.length ? 'FAILED: ' + failed.join(', ') : files.length + ' test files, all green'));
process.exit(failed.length ? 1 : 0);
