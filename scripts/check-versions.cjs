const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function checkChange(previous, current, filename) {
  const version = code => {
    const match = code.match(/^  version = "(\d+\.\d+\.\d+)";\r?$/m);
    if (!match) throw new Error(filename + ' 缺少 x.y.z 版本号。');
    return match[1].split('.').map(Number);
  };
  const before = version(previous), after = version(current);
  let comparison = 0;
  for (let i = 0; i < 3; i++) {
    if (after[i] !== before[i]) { comparison = Math.sign(after[i] - before[i]); break; }
  }
  if (comparison < 0) throw new Error(filename + ' 版本号不能倒退。');
  const normalize = code => code.replace(/\r\n/g, '\n').replace(/^  (version|url) = "(?:\\.|[^"\\])*";\n?/gm, '');
  if (normalize(previous) !== normalize(current) && comparison <= 0) {
    throw new Error(filename + ' 内容已修改，请提高版本号后重新生成发布文件。');
  }
}

module.exports = { checkChange };
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const base = process.env.BASE_REF;
    if (!base || /^0+$/.test(base)) { console.log('首次提交，无历史版本需要比较。'); }
    else {
      if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('BASE_REF 必须为 Git 提交 SHA。');
      const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', base, '--', 'sources/'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
      for (const file of fs.readdirSync(path.join(root, 'sources')).filter(name => name.endsWith('.js'))) {
        const relative = 'sources/' + file;
        if (!paths.includes(relative)) continue;
        const previous = execFileSync('git', ['show', base + ':' + relative], { cwd: root, encoding: 'utf8' });
        checkChange(previous, fs.readFileSync(path.join(root, relative), 'utf8'), file);
      }
      console.log('图源版本递增检查通过。');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
