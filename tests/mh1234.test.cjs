const test = require('node:test');
const assert = require('node:assert/strict');
const { createSource, fixture } = require('./harness.cjs');

function sourceWith(network) {
  return createSource(process.env.MH_SOURCE_FILE || 'mh1234_fixed.js', network || (async url => {
    let file = 'mh1234.home.html';
    if (url.includes('reader.hqread.cc/')) file = 'mh1234.reader19.html';
    else if (/\/comic\/\d+\/\d+\.html/.test(url)) file = 'mh1234.direct.html';
    else if (url.includes('/comic/')) file = 'mh1234.detail.html';
    else if (url.includes('/category')) file = 'mh1234.category.html';
    else if (url.includes('/search')) file = 'mh1234.search.html';
    return { status: 200, body: fixture(file) };
  }));
}

test('MH1234: current homepage cards produce three comic sections', async () => {
  const { source } = sourceWith();
  const parts = await source.explore[0].load();
  assert.equal(parts.length, 3);
  assert.equal(parts[0].comics[0].id, '16838');
  assert.equal(parts[0].comics[0].title, '19天');
  assert.equal(parts[1].comics.length, 4);
  assert.equal(parts[2].comics.length, 12);
});

test('MH1234: search excludes unrelated recommendations and uses real lazy cover', async () => {
  const { source, requests } = sourceWith();
  const result = await source.search.load('我的微信连三界', [], 1);
  assert.equal(result.comics.length, 1);
  assert.equal(result.comics[0].id, '13704');
  assert.match(result.comics[0].cover, /^https:\/\/wmh1234\.wszwhg\.net\//);
  assert.match(result.comics[0].cover, /\?st=.+&e=\d+$/);
  assert.equal(result.maxPage, 1);
  assert.equal(new URL(requests[0]).origin, 'https://m.wmh1234.com');
});

test('MH1234: search preserves punctuation and follows the current pagination route', async () => {
  const { source, requests } = sourceWith();
  await source.search.load('A&B / 中文', [], 1);
  assert.equal(new URL(requests[0]).searchParams.get('key'), 'A&B / 中文');
  await source.search.load('恋爱', [], 2);
  assert.equal(requests[1], 'https://m.wmh1234.com/search/' + encodeURIComponent('恋爱') + '/2');
});

test('MH1234: category supports tags, finish, order and page with real maxPage', async () => {
  const { source, requests } = sourceWith();
  const result = await source.categoryComics.load('恋爱', '17', ['2', 'addtime'], 2);
  assert.equal(requests[0], 'https://m.wmh1234.com/category/tags/17/finish/2/order/addtime/page/2');
  assert.equal(result.comics.length, 21);
  assert.ok(result.maxPage > 100);
});

test('MH1234: detail keeps stable numeric chapter ids in reading order', async () => {
  const { source } = sourceWith();
  const result = await source.comic.loadInfo('47315');
  assert.equal(result.title, '恋爱四选一');
  assert.equal(Array.from(result.chapters.keys())[0], '3529165');
  assert.equal(result.chapters.get('3529165'), '1');
  assert.equal(Array.from(result.chapters.keys()).at(-1), '3926106');
  assert.ok(result.chapters.size >= 40);
  assert.match(result.description, /课业/);
});

test('MH1234: follows the published JS redirect without executing scripts, and keeps signed image URLs', async () => {
  const { source, requests } = sourceWith();
  const chapter = await source.comic.loadEp('16838', '633797');
  assert.equal(requests[0], 'https://m.wmh1234.com/comic/16838/633797.html');
  assert.equal(requests[1], 'https://reader.hqread.cc/r/MTY4MzgtNjMzNzk3LTdlN2RlMDIyMGI');
  assert.equal(requests.length, 2);
  assert.equal(chapter.images.length, 9);
  assert.ok(chapter.images.every(url => /^https:\/\/wmh1234\.wszwhg\.net\/.+\?st=.+&e=\d+$/.test(url)));
  assert.equal(new Set(chapter.images).size, 9);
  assert.equal(source.comic.onImageLoad(chapter.images[0]).headers.Referer, 'https://reader.hqread.cc/');
});

test('MH1234: login/paid pages and unrelated redirects fail clearly', async () => {
  const reader = fixture('mh1234.reader19.html');
  for (const body of [
    reader.replace('data-chapter-vip="0"', 'data-chapter-vip="1"'),
    '<html><script>location.replace("https://unrelated.example/r/abc");</script></html>',
    '<html><body>登录后阅读</body></html>'
  ]) {
    const { source } = sourceWith(async url => ({ status: 200, body: url.includes('/api/comic/isbuy') ? '{"code":3,"type":"vip","msg":"VIP会员专属"}' : body }));
    await assert.rejects(() => source.comic.loadEp('16838', '633797'));
  }
});

test('MH1234: empty search result stays empty even if recommendations exist', async () => {
  const body = '<section class="container mt-lg"><h1>搜索结果</h1><p>没有结果</p></section>' +
    '<section class="comic-section"><div class="comic-grid"><article class="comic-card"><a href="/comic/1.html"><h3>推荐</h3><img src="https://example.com/a.jpg"></a></article></div></section>';
  const { source } = sourceWith(async () => ({ status: 200, body }));
  const result = await source.search.load('无结果', [], 1);
  assert.equal(result.comics.length, 0);
});

test('MH1234: a category tag id is not interpreted as the last page number', async () => {
  const body = '<section class="comic-section"></section><div class="pagination-wrapper">' +
    '<a href="/category/tags/17">首页</a><a href="/category/tags/17">末页</a></div>';
  const { source } = sourceWith(async () => ({ status: 200, body }));
  const result = await source.categoryComics.load('恋爱', '17', [], 1);
  assert.equal(result.maxPage, 1);
});

test('MH1234: web login opens on reader origin and accepts only the success redirect', () => {
  const { source } = sourceWith();
  assert.ok(source.account?.loginWithWebview, 'web login configuration is required');
  const login = source.account.loginWithWebview;
  const url = new URL(login.url);
  assert.equal(url.origin, 'https://reader.hqread.cc');
  assert.equal(url.pathname, '/user/login');
  const destination = url.searchParams.get('redirect');
  assert.equal(new URL(destination).origin, url.origin);
  assert.equal(login.checkStatus(login.url, '在线漫画 - 漫画1234网'), false);
  assert.equal(login.checkStatus('https://reader.hqread.cc/user', ''), false);
  assert.equal(login.checkStatus('https://unrelated.example/?venera_login=mh1234_fixed', ''), false);
  assert.equal(login.checkStatus(destination, '漫画1234网'), true);
});

test('MH1234: an authorized paid chapter uses only the images supplied by the permission API', async () => {
  const reader = fixture('mh1234.reader19.html').replace('data-chapter-vip="0"', 'data-chapter-vip="1"');
  const pictures = ['https://wmh1234.wszwhg.net/test/one.webp?st=test1&e=2000000000', 'https://wmh1234.wszwhg.net/test/two.webp?st=test2&e=2000000000'];
  let apiHeaders;
  const { source, requests } = sourceWith(async (url, headers) => {
    if (url.includes('/api/comic/isbuy')) {
      apiHeaders = headers;
      return { status: 200, body: JSON.stringify({ code: 1, pic: pictures.map(img => ({ img })) }) };
    }
    return { status: 200, body: reader };
  });
  const result = await source.comic.loadEp('16838', '633797');
  assert.deepEqual(Array.from(result.images), pictures);
  assert.equal(requests.at(-1), 'https://reader.hqread.cc/index.php/api/comic/isbuy?id=633797');
  assert.equal(apiHeaders.Referer, 'https://reader.hqread.cc/');
});

test('MH1234: expired sessions and missing rights produce distinct actionable errors', async () => {
  const reader = fixture('mh1234.reader19.html').replace('data-chapter-cion="0"', 'data-chapter-cion="10"');
  for (const [response, message] of [
    [JSON.parse(fixture('mh1234.access-anonymous.json')), /登录/],
    [{ code: 3, type: 'cion', msg: '未购买' }, /购买/],
    [{ code: 3, type: 'vip', msg: 'VIP会员专属' }, /VIP/],
    [{ code: 1, pic: [] }, /图片/]
  ]) {
    const { source } = sourceWith(async url => ({ status: 200, body: url.includes('/api/comic/isbuy') ? JSON.stringify(response) : reader }));
    await assert.rejects(() => source.comic.loadEp('16838', '633797'), message);
  }
});

test('MH1234: logout clears the cookies used by reader requests', () => {
  const { source, deletedCookies } = sourceWith();
  assert.equal(typeof source.account?.logout, 'function');
  source.account.logout();
  assert.ok(deletedCookies.includes('https://reader.hqread.cc'));
});
