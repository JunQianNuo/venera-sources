const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function validateConfig(config) {
  if (typeof config.repository !== 'string' ||
      (config.repository && !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(config.repository))) {
    throw new Error('仓库配置 repository 应为 GitHub 的 owner/repo；未发布时填写空字符串。');
  }
  if (typeof config.branch !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(config.branch) || config.branch.includes('..') || config.branch.endsWith('.') || config.branch.endsWith('.lock')) {
    throw new Error('仓库配置 branch 必须是简单分支名，例如 main。');
  }
  if (!config.sources || typeof config.sources !== 'object' || Array.isArray(config.sources)) {
    throw new Error('仓库配置 sources 应为 key 到图源说明的对象。');
  }
  return config;
}

function field(code, name, filename) {
  const pattern = new RegExp('^  ' + name + ' = ("(?:\\\\.|[^"\\\\])*");$', 'gm');
  const matches = [...code.matchAll(pattern)];
  if (matches.length !== 1) throw new Error(filename + ' 必须包含一个双引号字符串字段：' + name);
  return JSON.parse(matches[0][1]);
}

function build(root, { check = false } = {}) {
  const config = validateConfig(JSON.parse(fs.readFileSync(path.join(root, 'repository.json'), 'utf8')));
  const sourceDir = path.join(root, 'sources');
  const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.js')).sort();
  if (!files.length) throw new Error('sources 中没有图源。');
  const keys = new Set();
  const outputs = new Map();
  const index = [];
  for (const filename of files) {
    if (!/^[A-Za-z0-9_-]+\.js$/.test(filename)) throw new Error('不支持的图源文件名：' + filename);
    const code = fs.readFileSync(path.join(sourceDir, filename), 'utf8').replace(/\r\n/g, '\n');
    try { new vm.Script(code, { filename }); }
    catch (error) { throw new Error(filename + ' 语法错误：' + error.message); }
    if (!/^class \w+ extends ComicSource \{/m.test(code)) throw new Error(filename + ' 缺少 ComicSource 类声明。');
    const item = { name: field(code, 'name', filename), key: field(code, 'key', filename),
      version: field(code, 'version', filename), minAppVersion: field(code, 'minAppVersion', filename) };
    if (!item.name || !/^[A-Za-z0-9_]+$/.test(item.key)) throw new Error(filename + ' 名称或 key 不正确。');
    if (keys.has(item.key)) throw new Error('图源 key 重复：' + item.key);
    keys.add(item.key);
    for (const version of [item.version, item.minAppVersion]) {
      if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error(filename + ' 版本必须为 x.y.z。');
    }
    if (typeof config.sources[item.key] !== 'string' || !config.sources[item.key].trim()) {
      throw new Error('仓库配置缺少 ' + item.key + ' 的图源说明。');
    }
    field(code, 'url', filename);
    item.description = config.sources[item.key];
    item.fileName = 'dist/' + filename;
    if (config.repository) item.url = 'https://raw.githubusercontent.com/' + config.repository + '/' + config.branch + '/' + item.fileName;
    const published = code.replace(/^  url = "(?:\\.|[^"\\])*";$/m, '  url = ' + JSON.stringify(item.url || '') + ';');
    outputs.set(item.fileName, published.endsWith('\n') ? published : published + '\n');
    index.push(item);
  }
  // Validate every source before writing anything, so one bad source cannot make a partial release.
  outputs.set('index.json', JSON.stringify(index, null, 2) + '\n');
  const dist = path.join(root, 'dist');
  const obsolete = fs.existsSync(dist) ? fs.readdirSync(dist).filter(name => name.endsWith('.js') && !outputs.has('dist/' + name)) : [];
  if (check) {
    for (const [filename, content] of outputs) {
      const target = path.join(root, filename);
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content) {
        throw new Error(filename + ' 已过期或缺失，请运行 npm run build 重新生成。');
      }
    }
    if (obsolete.length) throw new Error('dist 有已删除的图源，请运行 npm run build 重新生成。');
  } else {
    fs.mkdirSync(dist, { recursive: true });
    for (const [filename, content] of outputs) fs.writeFileSync(path.join(root, filename), content);
    for (const filename of obsolete) fs.unlinkSync(path.join(dist, filename));
  }
  return index;
}

module.exports = { build, validateConfig };
if (require.main === module) {
  try {
    const root = path.resolve(__dirname, '..');
    const check = process.argv.includes('--check');
    const result = build(root, { check });
    console.log((check ? '生成物一致性检查通过' : '已生成索引及发布脚本') + '：' + result.length + ' 个图源');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'repository.json')));
    console.log(config.repository ? '仓库地址：https://raw.githubusercontent.com/' + config.repository + '/' + config.branch + '/index.json' : '尚未配置 GitHub 仓库；dist 脚本可以本地导入，但不会自动更新。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
