const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { createSource } = require('./harness.cjs');

async function request(url, headers = {}, head = false) {
  const args = ['--silent', '--show-error', '--location',
    '--connect-timeout', '10', '--max-time', '20', '--write-out', '\n__STATUS__%{http_code}'];
  if (process.platform === 'win32') args.push('--ssl-revoke-best-effort');
  for (const [name, value] of Object.entries(headers)) args.push('--header', name + ': ' + value);
  if (head) args.push('--head');
  args.push(url);
  const { stdout } = await execFile(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { maxBuffer: 4 * 1024 * 1024 });
  const position = stdout.lastIndexOf('\n__STATUS__');
  return { status: Number(stdout.slice(position + 11)), body: stdout.slice(0, position) };
}

(async () => {
  const { source } = createSource('mh1234_fixed.js', request);
  const report = { checkedAt: new Date().toISOString(), transport: 'Node Venera API shim + curl; not a mobile Venera runtime test', results: [] };
  function record(item) { report.results.push(item); console.log(JSON.stringify(item)); }
  const parts = await source.explore[0].load();
  assert.equal(parts.length, 3);
  record({ function: 'homepage', sections: parts.length, comics: parts.reduce((n, p) => n + p.comics.length, 0) });
  const category = await source.categoryComics.load('恋爱', '17', ['0', 'hits'], 2);
  assert.equal(category.comics.length, 21);
  record({ function: 'filtered category page 2', comics: category.comics.length, maxPage: category.maxPage });
  const search = await source.search.load('我的微信连三界', [], 1);
  assert.equal(search.comics.length, 1);
  assert.equal(search.comics[0].id, '13704');
  record({ function: 'search', comics: search.comics.length, selected: search.comics[0].title });
  const page2 = await source.search.load('恋爱', [], 2);
  assert.ok(page2.comics.length > 0);
  record({ function: 'search page 2', comics: page2.comics.length, maxPage: page2.maxPage });
  const info = await source.comic.loadInfo('16838');
  const ep = Array.from(info.chapters.keys())[0];
  record({ function: 'detail', title: info.title, chapters: info.chapters.size, firstChapter: ep });
  const chapter = await source.comic.loadEp('16838', ep);
  assert.equal(chapter.images.length, 9);
  record({ function: 'reader', comic: '19天', chapter: info.chapters.get(ep), images: chapter.images.length });
  const second = await source.comic.loadEp('47315', '3529165');
  assert.equal(second.images.length, 102);
  record({ function: 'reader', comic: '恋爱四选一', chapter: '1', images: second.images.length });
  let imageFailures = 0;
  for (const url of [info.cover, chapter.images[0], chapter.images.at(-1), second.images[0]]) {
    let verified = false;
    const attempts = [];
    for (let attempt = 0; attempt < 2 && !verified; attempt++) {
      try {
        const response = await request(url, source.comic.onImageLoad(url).headers, true);
        verified = response.status === 200 && /Content-Type:\s*image\//i.test(response.body);
        attempts.push({ status: response.status, imageType: /Content-Type:\s*image\//i.test(response.body) });
      } catch (error) { attempts.push({ error: String(error.message).split('\n').at(-2) || 'network error' }); }
    }
    if (!verified) imageFailures++;
    record({ function: 'image HEAD', verified, attempts, url: new URL(url).origin + new URL(url).pathname });
  }
  report.imageFailures = imageFailures;
  fs.mkdirSync(path.resolve(__dirname, '..', 'reports'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '..', 'reports', 'mh1234.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(imageFailures, 0, 'some image endpoints could not be verified');
})().catch(error => { console.error(String(error.message).replace(/([?&](?:st|e)=)[^&\s]+/g, '$1[redacted]')); process.exitCode = 1; });
