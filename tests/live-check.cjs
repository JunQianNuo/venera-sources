// Read-only live check. Only image HEAD requests; no comic image downloads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { createSource } = require('./harness.cjs');

async function request(url, headers = {}, head = false) {
  const args = ['--silent', '--show-error', '--location',
    '--connect-timeout', '12', '--max-time', '30', '--write-out', '\n__STATUS__%{http_code}'];
  if (process.platform === 'win32') args.push('--ssl-revoke-best-effort');
  for (const [name, value] of Object.entries(headers)) args.push('--header', name + ': ' + value);
  if (head) args.push('--head');
  args.push(url);
  const { stdout } = await execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { maxBuffer: 4 * 1024 * 1024 });
  const pos = stdout.lastIndexOf('\n__STATUS__');
  return { status: Number(stdout.slice(pos + 11)), body: stdout.slice(0, pos) };
}

(async () => {
  const { source } = createSource(undefined, request);
  const report = { checkedAt: new Date().toISOString(), transport: 'Node Venera API shim + curl on this computer; not a mobile Venera runtime test', results: [] };
  const parts = await source.explore[0].load();
  report.results.push({ function: 'homepage', sections: parts.length, comics: parts.reduce((n, p) => n + p.comics.length, 0) });
  const category = await source.categoryComics.load('全部', 'all', ['all', 'all'], 1);
  assert.ok(category.comics.length);
  report.results.push({ function: 'category', comics: category.comics.length, maxPage: category.maxPage });
  const search = await source.search.load('非人哉', [], 1);
  const comic = search.comics.find(c => c.id === 'feirenzai-fenzihudong');
  assert.ok(comic);
  report.results.push({ function: 'search', comics: search.comics.length, selected: comic.title });
  const info = await source.comic.loadInfo(comic.id);
  assert.ok(info.chapters.size > 24);
  report.results.push({ function: 'detail', title: info.title, chapters: info.chapters.size });
  const epId = Array.from(info.chapters.keys())[0];
  const chapter = await source.comic.loadEp(comic.id, epId);
  assert.equal(chapter.images.length, 36);
  report.results.push({ function: 'chapter', id: epId, images: chapter.images.length });
  for (const url of [comic.cover, chapter.images[0], chapter.images.at(-1)]) {
    const response = await request(url, source.comic.onImageLoad().headers, true);
    assert.equal(response.status, 200, new URL(url).origin + new URL(url).pathname);
    assert.match(response.body, /Content-Type:\s*image\//i);
    report.results.push({ function: 'image HEAD', status: response.status, url: new URL(url).origin + new URL(url).pathname });
  }
  for (const endpoint of source.settings.endpoint.options.slice(1)) {
    source.loadSetting = () => endpoint.value;
    const parts = await source.explore[0].load();
    const chapter = await source.comic.loadEp(comic.id, epId);
    assert.equal(chapter.images.length, 36);
    report.results.push({ function: 'alternate entry', url: endpoint.value, sections: parts.length, images: chapter.images.length });
  }
  fs.mkdirSync(path.resolve(__dirname, '..', 'reports'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '..', 'reports', 'baozi.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(String(error.message).replace(/([?&](?:st|e)=)[^&\s]+/g, '$1[redacted]')); process.exitCode = 1; });
