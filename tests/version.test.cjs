const test = require('node:test');
const assert = require('node:assert/strict');
const { checkChange } = require('../scripts/check-versions.cjs');
function source(version, title = '测试', url = '') {
  return `class Demo extends ComicSource {\n  version = "${version}";\n  name = "${title}";\n  url = "${url}";\n}\n`;
}
test('source fixes require a higher version, while unchanged code and generated URL changes do not', () => {
  assert.doesNotThrow(() => checkChange(source('1.0.0'), source('1.0.0'), 'demo.js'));
  assert.throws(() => checkChange(source('1.0.0'), source('1.0.0', '修复'), 'demo.js'), /提高版本/);
  assert.throws(() => checkChange(source('2.0.0'), source('1.9.9', '修复'), 'demo.js'), /倒退/);
  assert.doesNotThrow(() => checkChange(source('1.9.9'), source('1.10.0', '修复'), 'demo.js'));
  assert.doesNotThrow(() => checkChange(source('1.0.0'), source('1.0.0', '测试', 'https://example.com/demo.js'), 'demo.js'));
  assert.doesNotThrow(() => checkChange(source('1.0.0').replaceAll('\n', '\r\n'), source('1.0.0'), 'demo.js'));
});
