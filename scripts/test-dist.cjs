const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, ['--test', 'tests/baozi.test.cjs', 'tests/mh1234.test.cjs', 'tests/accounts.test.cjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SOURCE_FILE: 'dist/baozi_fixed.js', MH_SOURCE_FILE: 'dist/mh1234_fixed.js' }
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
