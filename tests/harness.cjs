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
function createSource(file = process.env.SOURCE_FILE || 'baozi_fixed.js', network, options = {}) {
  const requests = [];
  const calls = [];
  const deletedCookies = [];
  const cookies = [];
  const data = new Map();
  let registered = options.registered !== false;
  const requireRegistration = () => { if (!registered) throw new Error('source has not been registered by Venera'); };
  class ComicSource {
    loadSetting(key) { requireRegistration(); return this.settings?.[key]?.default; }
    loadData(key) { requireRegistration(); return data.get(key); }
    saveData(key, value) { data.set(key, value); }
    deleteData(key) { data.delete(key); }
    get isLogged() { requireRegistration(); return !!data.get('account'); }
  }
  async function request(method, url, headers, body) {
    requests.push(url);
    calls.push({ method, url, headers, body });
    if (network) return network(url, headers, { method, body });
    let name;
    if (url.includes('/search?')) name = 'baozi.search.html';
    else if (url.includes('/api/')) name = 'baozi.category.json';
    else if (url.includes('/chapter/')) name = 'baozi.webchapter.html';
    else if (url.includes('/comic/')) name = 'baozi.detail.html';
    else name = 'cn.webmota.com.home.html';
    return { status: 200, body: fixture(name) };
  }
  const context = vm.createContext({
    ComicSource, HtmlDocument,
    Cookie: class { constructor(fields) { Object.assign(this, fields); } },
    Comic: class { constructor(fields) { Object.assign(this, fields); } },
    ComicDetails: class { constructor(fields) { Object.assign(this, fields); } },
    Network: {
      deleteCookies: url => deletedCookies.push(url),
      setCookies: (url, values) => cookies.push({ url, values }),
      getCookies: async url => cookies.filter(item => item.url === url).flatMap(item => item.values),
      get: (url, headers) => request('GET', url, headers),
      post: (url, headers, body) => request('POST', url, headers, body)
    }
  });
  const code = fs.readFileSync(path.resolve(root, file.includes('/') || file.includes('\\') ? file : 'sources/' + file), 'utf8');
  const className = code.match(/class\s+(\w+)\s+extends\s+ComicSource/)[1];
  vm.runInContext(code + '\n globalThis.source = new ' + className + '();', context);
  return { source: context.source, requests, calls, deletedCookies, cookies, register: () => { registered = true; } };
}
module.exports = { createSource, fixture };
