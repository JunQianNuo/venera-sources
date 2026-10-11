const test = require('node:test');
const assert = require('node:assert/strict');
const { createSource, fixture } = require('./harness.cjs');
const baoziFile = process.env.SOURCE_FILE || 'baozi_fixed.js';
const mhFile = process.env.MH_SOURCE_FILE || 'mh1234_fixed.js';
const json = body => ({ status: 200, body: JSON.stringify(body) });
const html = body => ({ status: 200, body });
const bzEmpty = '<title>我的书架 - 包子漫画</title><div class="bookshelf"><p>当前没有追任何漫画</p></div>';
const bzShelf = '<div class="bookshelf"><div class="bookshelf-items"><amp-img src="https://example.com/cover.jpg"></amp-img><div class="info"><h4><a href="/comic/feirenzai-fenzihudong">非人哉</a></h4><ul><li>状态：连载</li><li>作者：一汪空气</li></ul></div></div></div><div class="recommend"><a href="/comic/unrelated">推荐</a></div>';
const bzLogin = '<title>登入账号 - 包子漫画</title><input id="mail"><input id="password" type="password">';
const mhEmpty = '<main data-mint-page="shelf"><div class="mint-shelf-empty">暂无收藏</div></main>';
const mhShelf = '<main data-mint-page="shelf"><article data-mint-shelf-item><a href="/go/abc">继续阅读</a><a href="/comic/16838.html"><img data-src="https://example.com/19.jpg?st=fixture&e=2000000000" src="/placeholder.svg"><h3>19天</h3></a></article><article data-mint-shelf-item><a href="/comic/47315.html"><img src="/cover.jpg"><h3>恋爱四选一</h3></a></article><div class="mint-pagination" data-pages="3"><a href="/user/fav/index/3">末页</a></div></main><section class="recommend"><article class="comic-card"><a href="/comic/999.html"><h3>推荐</h3></a></article></section>';
const member = { code: 1, data: { log: 1, id: 123 } };

test('Venera can parse source configuration before registering runtime settings', () => {
  for (const file of [baoziFile, mhFile]) {
    const { source, register, calls } = createSource(file, undefined, { registered: false });
    const account = source.account;
    assert.equal(typeof account.registerWebsite, 'string');
    assert.equal(typeof account.logout, 'function');
    assert.ok(account.login || account.loginWithWebview);
    assert.equal(typeof source.favorites.loadComics, 'function');
    assert.equal(typeof source.comic.loadInfo, 'function');
    assert.ok(source.settings);
    assert.equal(calls.length, 0);
    register();
    assert.match(source.baseUrl, /^https:\/\//);
  }
});

test('Baozi: login encodes credentials, sets TSID only on the selected host and validates the private shelf', async () => {
  const { source, calls, cookies } = createSource(baoziFile, async (url, headers, req) => {
    if (url.endsWith('/api/bui/signin')) {
      assert.equal(req.method, 'POST');
      const body = new URLSearchParams(req.body);
      assert.equal(body.get('username'), 'a+b@example.com');
      assert.equal(body.get('password'), 'a&b=中文');
      assert.match(headers['Content-Type'], /x-www-form-urlencoded/);
      return json({ result: true, data: 'synthetic-test-session' });
    }
    assert.ok(cookies.length, 'cookie must be installed before shelf validation');
    return html(bzEmpty);
  });
  assert.equal(typeof source.account?.login, 'function');
  await source.account.login('a+b@example.com', 'a&b=中文');
  assert.equal(calls.at(-1).url, 'https://cn.webmota.com/user/my_bookshelf');
  assert.equal(cookies[0].url, 'https://cn.webmota.com');
  assert.equal(cookies[0].values[0].name, 'TSID');
  assert.equal(cookies[0].values[0].domain, 'cn.webmota.com');
  assert.equal(cookies[0].values[0].value, 'synthetic-test-session');
});

test('Baozi: rejected login and empty success tokens never install a cookie', async () => {
  for (const response of [{ result: false, code: 'ERR_SIGNIN_NAME_OR_PASSWORD' }, { result: true, data: '' }, { result: true }, { result: false, code: 'ERR_SIGNIN_VERIFY_CODE' }]) {
    const { source, cookies } = createSource(baoziFile, async () => json(response));
    await assert.rejects(() => source.account.login('test@example.com', 'password'), /密码|验证|登录/);
    assert.equal(cookies.length, 0);
  }
});

test('Baozi: failed post-login session check removes the newly installed cookie', async () => {
  const { source, deletedCookies } = createSource(baoziFile, async url => url.includes('/api/bui/signin') ? json({ result: true, data: 'synthetic-test-session' }) : html(bzLogin));
  await assert.rejects(() => source.account.login('test@example.com', 'password'), /登录/);
  assert.ok(deletedCookies.includes('https://cn.webmota.com'));
});

test('Baozi: shelf excludes recommendations, supports empty accounts and rejects login/unknown pages', async () => {
  const { source, calls } = createSource(baoziFile, async () => html(bzShelf));
  const result = await source.favorites.loadComics(1);
  assert.deepEqual(Array.from(result.comics, c => c.id), ['feirenzai-fenzihudong']);
  assert.equal(result.comics[0].title, '非人哉');
  assert.equal(result.comics[0].subTitle, '一汪空气');
  assert.equal(result.maxPage, 1);
  assert.equal((await source.favorites.loadComics(2)).comics.length, 0);
  assert.equal(calls.length, 1);
  const empty = createSource(baoziFile, async () => html(bzEmpty)).source;
  assert.equal((await empty.favorites.loadComics(1)).comics.length, 0);
  for (const body of [bzLogin, '<title>404</title>', '<div class="bookshelf">unexpected markup</div>',
    '<div class="bookshelf"><li class="pure-menu-selected">临时书架(0)</li>当前没有追任何漫画</div>']) {
    const bad = createSource(baoziFile, async () => html(body)).source;
    await assert.rejects(() => bad.favorites.loadComics(1), /登录|书架/);
  }
});

test('Baozi: add/remove are idempotent and verified, and existing reading position is preserved', async () => {
  for (const adding of [true, false]) {
    let present = !adding;
    const { source, calls } = createSource(baoziFile, async (url, headers, req) => {
      if (req.method === 'POST') {
        const query = new URL(url).searchParams;
        assert.equal(query.get('op'), adding ? 'set_bookmark' : 'del_bookmark');
        assert.equal(query.get('comic_id'), 'feirenzai-fenzihudong');
        present = adding;
        return html(adding ? bzShelf : bzEmpty);
      }
      return html(present ? bzShelf : bzEmpty);
    });
    await source.favorites.addOrDelFavorite('feirenzai-fenzihudong', null, adding);
    await source.favorites.addOrDelFavorite('feirenzai-fenzihudong', null, adding);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  }
});

test('Baozi: expired sessions and unsuccessful writes cannot silently succeed', async () => {
  const expired = createSource(baoziFile, async () => html(bzLogin));
  await assert.rejects(() => expired.source.favorites.addOrDelFavorite('id', null, true), /登录/);
  assert.equal(expired.calls.filter(c => c.method === 'POST').length, 0);
  const failed = createSource(baoziFile, async () => html(bzEmpty));
  await assert.rejects(() => failed.source.favorites.addOrDelFavorite('id', null, true), /未生效|同步/);
});

test('Baozi: logout clears every configured entry and registration URL stays safe during parsing', () => {
  const { source, deletedCookies } = createSource(baoziFile);
  assert.equal(source.account.registerWebsite, 'https://cn.webmota.com/user/signup');
  source.account.logout();
  assert.equal(deletedCookies.length, 3);
  source.loadSetting = () => 'https://tw.dinnerku.com';
  assert.equal(source.account.registerWebsite, 'https://cn.webmota.com/user/signup');
});

function mh(network) {
  return createSource(mhFile, async (url, headers, req) => {
    if (url.endsWith('/api/user/info')) return json(member);
    return network(url, headers, req);
  });
}

test('MH1234: shelf uses reader session, excludes recommendations and keeps real comic IDs/covers', async () => {
  const { source, calls } = mh(async () => html(mhShelf));
  const result = await source.favorites.loadComics(1);
  assert.deepEqual(Array.from(result.comics, c => c.id), ['16838', '47315']);
  assert.equal(result.comics[0].title, '19天');
  assert.match(result.comics[0].cover, /\?st=fixture&e=2000000000$/);
  assert.equal(result.maxPage, 3);
  await source.favorites.loadComics(2);
  assert.equal(calls.at(-1).url, 'https://reader.hqread.cc/user/fav/index/2');
  assert.equal(calls.at(-1).headers.Referer, 'https://reader.hqread.cc/');
});

test('MH1234: shelf entry itself can be the comic link, including one-item shelves', async () => {
  const body = '<main data-mint-page="shelf"><div class="mint-shelf-list"><a data-mint-shelf-item class="user-list__item" href="/comic/54739.html"><div class="user-list__cover"><img src="/cover.jpg"></div><div class="user-list__content"><div class="user-list__title">测试漫画</div><p>最新章节</p></div></a></div><div class="mint-shelf-empty" hidden>暂无收藏</div></main>';
  const { source } = mh(async () => html(body));
  const result = await source.favorites.loadComics(1);
  assert.deepEqual(Array.from(result.comics, comic => comic.id), ['54739']);
  assert.equal(result.comics[0].title, '测试漫画');
  assert.equal(result.maxPage, 1);
});

test('MH1234: valid empty shelf differs from an expired session or changed markup', async () => {
  assert.equal((await mh(async () => html(mhEmpty)).source.favorites.loadComics(1)).comics.length, 0);
  for (const body of ['<script>top.location="/user/login";</script>', '<main data-mint-page="shelf">unknown</main>', '<title>404</title>']) {
    await assert.rejects(() => mh(async () => html(body)).source.favorites.loadComics(1), /登录|书架/);
  }
  const expired = createSource(mhFile, async () => json({ code: 1, data: { log: 0, id: 0 } }));
  await assert.rejects(() => expired.source.favorites.loadComics(1), /登录/);
  assert.equal(expired.calls.length, 1);
});

test('MH1234: add/remove check current state and do not toggle again on repeated requests', async () => {
  for (const adding of [true, false]) {
    let active = !adding;
    const { source, calls } = mh(async (url, headers, req) => {
      if (url.includes('/rend/isfav')) return json({ code: active ? 1 : -1, msg: active ? '已收藏' : '未收藏' });
      assert.ok(url.endsWith('/rend/favadd'));
      assert.equal(req.method, 'POST');
      const body = new URLSearchParams(req.body);
      assert.equal(body.get('did'), '16838');
      assert.equal(body.get('type'), 'comic');
      assert.match(headers['Content-Type'], /x-www-form-urlencoded/);
      active = !active;
      return json({ code: 1, cid: active ? 1 : 0 });
    });
    await source.favorites.addOrDelFavorite('16838', null, adding);
    await source.favorites.addOrDelFavorite('16838', null, adding);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  }
});

test('MH1234: guest status, unknown status, and wrong toggle results reject without unsafe retry', async () => {
  const guest = createSource(mhFile, async () => json({ code: 1, data: { log: 0, id: 0 } }));
  await assert.rejects(() => guest.source.favorites.addOrDelFavorite('16838', null, true), /登录/);
  assert.equal(guest.calls.filter(c => c.method === 'POST').length, 0);
  const unknown = mh(async () => json({ code: 9, msg: '系统繁忙' }));
  await assert.rejects(() => unknown.source.favorites.addOrDelFavorite('16838', null, true), /状态|繁忙/);
  assert.equal(unknown.calls.filter(c => c.method === 'POST').length, 0);
  const conflict = mh(async url => url.includes('/isfav') ? json({ code: -1, msg: '未收藏' }) : json({ code: 1, cid: 0 }));
  await assert.rejects(() => conflict.source.favorites.addOrDelFavorite('16838', null, true), /状态|刷新|同步/);
  assert.equal(conflict.calls.filter(c => c.method === 'POST').length, 1);
});

test('both sources prevent concurrent favorite writes from undoing each other', async () => {
  for (const file of [baoziFile, mhFile]) {
    let present = false;
    const isBaozi = file === baoziFile;
    const id = isBaozi ? 'feirenzai-fenzihudong' : '16838';
    const { source, calls } = createSource(file, async (url, headers, req) => {
      if (url.endsWith('/api/user/info')) return json(member);
      if (req.method === 'POST') {
        present = isBaozi ? true : !present;
        return isBaozi ? html(bzShelf) : json({ code: 1, cid: present ? 1 : 0 });
      }
      if (isBaozi) return html(present ? bzShelf : bzEmpty);
      return json({ code: present ? 1 : -1, msg: present ? '已收藏' : '未收藏' });
    });
    const results = await Promise.allSettled([
      source.favorites.addOrDelFavorite(id, null, true),
      source.favorites.addOrDelFavorite(id, null, true)
    ]);
    assert.equal(present, true);
    assert.equal(calls.filter(c => c.method === 'POST').length, 1);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(results.find(r => r.status === 'rejected').reason.message, /正在|稍后/);
    await source.favorites.addOrDelFavorite(id, null, true);
    assert.equal(calls.filter(c => c.method === 'POST').length, 1, 'guard must be released after completion');
  }
});

test('both sources reject invalid IDs/pages before any requests', async () => {
  for (const file of [baoziFile, mhFile]) {
    const { source, calls } = createSource(file, async () => html(''));
    await assert.rejects(() => source.favorites.loadComics(0), /页/);
    await assert.rejects(() => source.favorites.addOrDelFavorite('id&op=del', null, true), /编号/);
    assert.equal(calls.length, 0);
  }
});

test('favorite state appears in details when logged in, while public detail remains usable after session expiry', async () => {
  const b = createSource(baoziFile, async url => html(url.includes('/my_bookshelf') ? bzShelf : fixture('baozi.detail.html')));
  b.source.saveData('account', ['synthetic']);
  assert.equal((await b.source.comic.loadInfo('feirenzai-fenzihudong')).isFavorite, true);
  const m = mh(async url => url.includes('/isfav') ? json({ code: 1 }) : html(fixture('mh1234.detail.html')));
  m.source.saveData('account', ['synthetic']);
  assert.equal((await m.source.comic.loadInfo('47315')).isFavorite, true);
  const expired = createSource(mhFile, async url => url.includes('/api/') ? json({ code: 2, msg: '登录超时' }) : html(fixture('mh1234.detail.html')));
  expired.source.saveData('account', ['synthetic']);
  assert.equal((await expired.source.comic.loadInfo('47315')).title, '恋爱四选一');
});
