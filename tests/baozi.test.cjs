const test = require('node:test');
const assert = require('node:assert/strict');
const { createSource, fixture } = require('./harness.cjs');

test('current chapter markup yields all 36 unique images', async () => {
  const { source } = createSource();
  const result = await source.comic.loadEp('feirenzai-fenzihudong', 'feirenzai-fenzihudong|0|0');
  assert.equal(result.images.length, 36);
  assert.equal(new Set(result.images).size, 36);
  assert.equal(result.images[0], 'https://s1.bzcdn.net/scomic/feirenzai-fenzihudong/0/1-97z3/1.jpg');
  assert.match(result.images.at(-1), /\/36\.jpg$/);
});

test('chapter request uses the working web route and actual chapter slots', async () => {
  const { source, requests } = createSource();
  await source.comic.loadEp('old-slug', 'real-slug|2|9');
  assert.equal(requests[0], 'https://cn.webmota.com/comic/chapter/real-slug/2_9.html');
  assert.equal(requests.length, 1, 'must not follow the next-chapter link');
});

test('chapter list preserves comic id, section and nonsequential chapter slot', async () => {
  const html = '<h1 class="comics-detail__title">测试</h1><amp-img src="https://example.com/cover.jpg"></amp-img>' +
    '<div id="chapter-items"><div class="comics-chapters">' +
    '<a href="/user/page_direct?comic_id=real-slug&section_slot=2&chapter_slot=9"><span>特别篇</span></a>' +
    '<a href="/comic/chapter/real-slug/2_15.html"><span>番外篇</span></a></div></div>';
  const { source } = createSource(undefined, async () => ({ status: 200, body: html }));
  const info = await source.comic.loadInfo('old-slug');
  assert.deepEqual(Array.from(info.chapters.entries(), pair => Array.from(pair)), [['real-slug|2|9', '特别篇'], ['real-slug|2|15', '番外篇']]);
});

test('real search and detail parse readable metadata and chapter list', async () => {
  const { source } = createSource();
  const result = await source.search.load('非人哉', [], 1);
  const comic = result.comics.find(c => c.id === 'feirenzai-fenzihudong');
  assert.equal(comic.title, '非人哉');
  assert.match(comic.cover, /^https:/);
  const info = await source.comic.loadInfo(comic.id);
  assert.equal(info.title, '非人哉');
  assert.ok(info.chapters.size > 24);
  assert.equal(info.chapters.get('feirenzai-fenzihudong|0|0'), '第1话 我是九月');
});

test('search escapes query delimiters and stays single-page', async () => {
  const { source, requests } = createSource();
  await source.search.load('A&B 中文', [], 1);
  assert.equal(new URL(requests[0]).searchParams.get('q'), 'A&B 中文');
  assert.equal(new URL(requests[0]).searchParams.size, 1);
  const page2 = await source.search.load('A&B 中文', [], 2);
  assert.equal(page2.comics.length, 0);
  assert.equal(requests.length, 1);
});

test('homepage and category API produce comics and preserve pagination', async () => {
  const { source } = createSource();
  const parts = await source.explore[0].load();
  assert.ok(Array.isArray(parts) && parts.length > 0);
  assert.ok(parts.every(p => p.title && p.comics.length > 0));
  const result = await source.categoryComics.load('全部', 'all', ['all', 'all'], 1);
  assert.equal(result.comics.length, JSON.parse(fixture('baozi.category.json')).items.length);
  assert.equal(result.comics[0].id, 'dafengdagengren-chuyingshe');
  assert.equal(result.maxPage, null);
});

test('access challenges and empty chapters report errors instead of an empty reader', async () => {
  for (const body of ['{"error":"challenge_required"}', '<title>Just a moment...</title>', '<html><body></body></html>']) {
    const { source } = createSource(undefined, async () => ({ status: 200, body }));
    await assert.rejects(() => source.comic.loadEp('id', 'id|0|0'));
  }
});
