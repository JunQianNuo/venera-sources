const fs = require('node:fs');
const path = require('node:path');
const { validateConfig, build } = require('./build.cjs');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'repository.json');
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--repository') throw new Error('用法：npm run configure -- --repository GitHub用户名/venera-sources');
  const previous = fs.readFileSync(file, 'utf8');
  const config = validateConfig({ ...JSON.parse(previous), repository: args[1] });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  try { build(root); }
  catch (error) { fs.writeFileSync(file, previous); throw error; }
  console.log('已配置：https://raw.githubusercontent.com/' + config.repository + '/' + config.branch + '/index.json');
} catch (error) { console.error(error.message); process.exitCode = 1; }
