const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../scripts/build.cjs');

function project(t, repository = 'example/venera-sources') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'venera-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'sources'));
  fs.writeFileSync(path.join(root, 'repository.json'), JSON.stringify({ repository, branch: 'main', sources: { demo: '测试说明' } }));
  fs.writeFileSync(path.join(root, 'sources', 'demo.js'), 'class Demo extends ComicSource {\n  name = "测试";\n  key = "demo";\n  version = "1.2.3";\n  minAppVersion = "1.4.0";\n  url = "";\n}\n');
  return root;
}

test('published index and script carry matching keys, versions and absolute update URLs', t => {
  const root = project(t);
  const [item] = build(root);
  assert.equal(item.key, 'demo');
  assert.equal(item.version, '1.2.3');
  assert.equal(item.fileName, 'dist/demo.js');
  assert.equal(item.url, 'https://raw.githubusercontent.com/example/venera-sources/main/dist/demo.js');
  assert.equal(item.description, '测试说明');
  const code = fs.readFileSync(path.join(root, 'dist/demo.js'), 'utf8');
  assert.ok(code.includes('url = ' + JSON.stringify(item.url) + ';'));
  assert.equal(code.match(/version = "([^"]+)"/)[1], item.version);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'index.json'))), [item]);
  build(root, { check: true });
});

test('unconfigured repository produces only local filenames and no fake remote address', t => {
  const root = project(t, '');
  const [item] = build(root);
  assert.equal(item.url, undefined);
  assert.equal(item.fileName, 'dist/demo.js');
  assert.match(fs.readFileSync(path.join(root, item.fileName), 'utf8'), /url = "";/);
});

test('invalid repository names and unsafe branch paths are rejected before generating files', t => {
  const root = project(t);
  for (const config of [
    { repository: 'https://github.com/person/repo', branch: 'main' },
    { repository: '../repo', branch: 'main' },
    { repository: 'person/repo', branch: '../main' },
    { repository: 'person/repo', branch: 'main?token=secret' },
    { repository: 'person/repo', branch: 'main.lock' }
  ]) {
    fs.writeFileSync(path.join(root, 'repository.json'), JSON.stringify({ ...config, sources: { demo: '测试说明' } }));
    assert.throws(() => build(root), /配置/);
    assert.equal(fs.existsSync(path.join(root, 'index.json')), false);
  }
});

test('duplicate keys and JavaScript syntax errors prevent a partial release', t => {
  const root = project(t);
  const code = fs.readFileSync(path.join(root, 'sources/demo.js'), 'utf8');
  fs.writeFileSync(path.join(root, 'sources/other.js'), code);
  assert.throws(() => build(root), /重复/);
  assert.equal(fs.existsSync(path.join(root, 'dist')), false);
  fs.unlinkSync(path.join(root, 'sources/other.js'));
  fs.writeFileSync(path.join(root, 'sources/demo.js'), code + '\n}');
  assert.throws(() => build(root), /语法/);
  assert.equal(fs.existsSync(path.join(root, 'index.json')), false);
});

test('check mode detects stale scripts, indexes and deleted source files without rewriting them', t => {
  const root = project(t);
  build(root);
  const published = path.join(root, 'dist/demo.js');
  fs.appendFileSync(published, '// unexpected edit\n');
  assert.throws(() => build(root, { check: true }), /重新生成/);
  assert.match(fs.readFileSync(published, 'utf8'), /unexpected edit/);
  build(root);
  fs.writeFileSync(path.join(root, 'index.json'), '[]\n');
  assert.throws(() => build(root, { check: true }), /重新生成/);
  build(root);
  fs.writeFileSync(path.join(root, 'dist/deleted.js'), '// obsolete source');
  assert.throws(() => build(root, { check: true }), /重新生成/);
  build(root);
  assert.equal(fs.existsSync(path.join(root, 'dist/deleted.js')), false);
});
