const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

class Element {
  constructor(node) { this.node = node; }
  get text() { return this.node.textContent; }
  get attributes() { return Object.fromEntries(Array.from(this.node.attributes, a => [a.name, a.value])); }
  querySelector(q) { const node = this.node.querySelector(q); return node ? new Element(node) : null; }
  querySelectorAll(q) { return Array.from(this.node.querySelectorAll(q), node => new Element(node)); }
}
class HtmlDocument extends Element {
  constructor(html) { super(parseHTML(html).document); }
  dispose() {}
}
const root = path.resolve(__dirname, '..');
function fixture(name) { return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'); }
function createSource(file = process.env.SOURCE_FILE || 'baozi_fixed.js', network) {
  const requests = [];
  const deletedCookies = [];
  class ComicSource {
    loadSetting(key) { return this.settings?.[key]?.default; }
  }
  const context = vm.createContext({
    ComicSource, HtmlDocument,
    Comic: class { constructor(fields) { Object.assign(this, fields); } },
    ComicDetails: class { constructor(fields) { Object.assign(this, fields); } },
    Network: { deleteCookies: url => deletedCookies.push(url), get: async (url, headers) => {
      requests.push(url);
      if (network) return network(url, headers);
      let name;
      if (url.includes('/search?')) name = 'baozi.search.html';
      else if (url.includes('/api/')) name = 'baozi.category.json';
      else if (url.includes('/chapter/')) name = 'baozi.webchapter.html';
      else if (url.includes('/comic/')) name = 'baozi.detail.html';
      else name = 'cn.webmota.com.home.html';
      return { status: 200, body: fixture(name) };
    } }
  });
  const code = fs.readFileSync(path.resolve(root, file.includes('/') || file.includes('\\') ? file : 'sources/' + file), 'utf8');
  const className = code.match(/class\s+(\w+)\s+extends\s+ComicSource/)[1];
  vm.runInContext(code + '\n globalThis.source = new ' + className + '();', context);
  return { source: context.source, requests, deletedCookies };
}
module.exports = { createSource, fixture };
