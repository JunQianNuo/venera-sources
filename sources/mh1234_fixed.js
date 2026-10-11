// 漫画1234：适配 m.wmh1234.com 的 2026-10 网页及阅读跳转。
class MH1234Fixed extends ComicSource {
  name = "漫画1234（新版网站）";
  key = "mh1234_fixed";
  version = "1.2.1";
  minAppVersion = "1.4.0";
  url = "";

  // 在实际检查阅读权限的域名登录，Venera 会保存该域名的 Cookie。
  // 网站登录成功后才执行 redirect，避免把访客的 /user 跳转误判为成功。
  loginReturnUrl = "https://reader.hqread.cc/?venera_login=mh1234_fixed";
  account = {
    loginWithWebview: {
      url: "https://reader.hqread.cc/user/login?redirect=" + encodeURIComponent(this.loginReturnUrl),
      checkStatus: (url, title) => url.split("#")[0] === this.loginReturnUrl
    },
    registerWebsite: "https://reader.hqread.cc/user/login/reg",
    logout: () => {
      Network.deleteCookies("https://reader.hqread.cc");
      Network.deleteCookies(this.baseUrl);
    }
  };

  settings = {
    website: {
      title: "网站地址（完整 HTTPS 地址）",
      type: "input",
      default: "https://m.wmh1234.com"
    }
  };

  get baseUrl() {
    const value = (this.loadSetting("website") || this.settings.website.default).trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(value)) {
      throw new Error("请填写完整的网站地址，例如 https://m.wmh1234.com 。");
    }
    return value;
  }

  absoluteUrl(value, base = this.baseUrl) {
    if (!value) return "";
    if (value.startsWith("//")) return "https:" + value;
    if (/^https?:\/\//.test(value)) return value;
    return base + (value.startsWith("/") ? "" : "/") + value;
  }

  text(element) { return element ? element.text.trim() : ""; }

  cover(element) {
    const image = element?.querySelector("img");
    return this.absoluteUrl(image?.attributes["data-src"] || image?.attributes["src"]);
  }

  async request(url, method = "GET", data = "") {
    const origin = url.startsWith("https://reader.hqread.cc/") ? "https://reader.hqread.cc" : this.baseUrl;
    const headers = {
      "User-Agent": "Mozilla/5.0",
      "Referer": origin + "/"
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      headers["Origin"] = origin;
    }
    const response = method === "POST" ? await Network.post(url, headers, data) : await Network.get(url, headers);
    if (response.status !== 200) {
      throw new Error("漫画1234请求失败（HTTP " + response.status + "），请检查网站地址或网络。");
    }
    const body = typeof response.body === "string" ? response.body : "";
    if (/challenge_required|<title>\s*Just a moment|cf-chl-/i.test(body)) {
      throw new Error("网站要求网页验证，请先在浏览器中检查网站是否能正常打开。");
    }
    return body;
  }

  async accountApi(path, method = "GET", data = "") {
    return JSON.parse(await this.request("https://reader.hqread.cc/index.php/api/" + path, method, data));
  }

  async requireSession() {
    const result = await this.accountApi("user/info");
    if (Number(result.code) !== 1 || Number(result.data?.log) !== 1 || !(Number(result.data?.id) > 0)) {
      throw new Error("网站登录已失效，请在图源账号选项中重新网页登录。");
    }
  }

  async favoriteStatus(id) {
    const result = await this.accountApi("rend/isfav?did=" + id + "&type=comic");
    if (Number(result.code) === 1) return true;
    if (Number(result.code) === -1 && result.msg === "未收藏") return false;
    throw new Error("无法确认网站收藏状态：" + String(result.msg || "请刷新后重试"));
  }

  favoriteOperations = new Set();

  favorites = {
    multiFolder: false,
    loadComics: async page => {
      if (!Number.isInteger(page) || page < 1) throw new Error("书架页码不正确。");
      await this.requireSession();
      const url = "https://reader.hqread.cc/user/fav" + (page > 1 ? "/index/" + page : "");
      const document = new HtmlDocument(await this.request(url));
      try {
        const root = document.querySelector('[data-mint-page="shelf"]');
        if (!root) throw new Error("未找到网站书架，请重新登录或更新图源。");
        const comics = [];
        const rows = root.querySelectorAll("[data-mint-shelf-item]");
        for (const row of rows) {
          // 书架卡片自身也可能是 <a>；querySelector 只查子元素，会漏掉自身。
          const link = [row, ...row.querySelectorAll("a[href]")].find(element =>
            /\/comic\/([1-9]\d*)\.html(?:[?#]|$)/.test(element.attributes["href"] || ""));
          const id = (link?.attributes["href"] || "").match(/\/comic\/([1-9]\d*)\.html(?:[?#]|$)/)?.[1];
          if (!id) throw new Error("网站书架条目结构已改变，请更新图源。");
          const title = this.text(row.querySelector(".user-list__title, h3, h2, strong")) || this.text(link);
          if (!title) throw new Error("未找到网站书架漫画名称，请更新图源。");
          const image = row.querySelector("img");
          comics.push(new Comic({ id, title,
            cover: this.absoluteUrl(image?.attributes["data-src"] || image?.attributes["src"], "https://reader.hqread.cc") }));
        }
        if (!rows.length && !root.querySelector(".mint-shelf-empty")) throw new Error("网站书架结构已改变，无法确认是否为空。");
        let maxPage = page;
        const pages = Number(root.querySelector(".mint-pagination[data-pages]")?.attributes["data-pages"]);
        if (Number.isInteger(pages) && pages > 0) maxPage = Math.max(maxPage, pages);
        for (const link of document.querySelectorAll('a[href*="/user/fav/index/"]')) {
          const match = (link.attributes["href"] || "").match(/\/user\/fav\/index\/(\d+)\/?(?:[?#]|$)/);
          if (match) maxPage = Math.max(maxPage, Number(match[1]));
        }
        return { comics, maxPage };
      } finally { document.dispose(); }
    },
    addOrDelFavorite: async (id, folderId, isAdding) => {
      if (typeof id !== "string" || !/^[1-9]\d*$/.test(id)) throw new Error("漫画编号不正确。");
      if (this.favoriteOperations.has(id)) throw new Error("当前漫画正在同步收藏，请稍后刷新书架。");
      this.favoriteOperations.add(id);
      try {
        await this.requireSession();
        if (await this.favoriteStatus(id) === isAdding) return;
        // 网站接口是切换状态，不可直接重试，否则可能撤销上一次成功操作。
        const result = await this.accountApi("rend/favadd", "POST", "did=" + id + "&type=comic");
        if (Number(result.code) !== 1 || ![0, 1].includes(result.cid) || Boolean(result.cid) !== isAdding) {
          throw new Error("网站收藏同步状态未确认，请刷新书架后重试。" + String(result.msg || ""));
        }
      } finally { this.favoriteOperations.delete(id); }
    }
  };

  parseCard(element) {
    const link = element.attributes["href"] ? element : element.querySelector("a[href]");
    const id = (link?.attributes["href"] || "").match(/\/comic\/(\d+)\.html(?:[?#]|$)/)?.[1];
    const title = this.text(element.querySelector("h3, h2, strong"));
    if (!id || !title) return null;
    return new Comic({
      id, title,
      cover: this.cover(element),
      subTitle: this.text(element.querySelector(".comic-card__chapter, small, p"))
    });
  }

  parseCards(element, selector = ".comic-card") {
    return element ? element.querySelectorAll(selector).map(e => this.parseCard(e)).filter(Boolean) : [];
  }

  imageUrls(values) {
    const images = [];
    const seen = new Set();
    for (const value of values) {
      if (typeof value !== "string" || !/^(https?:\/\/|\/)/.test(value) || /placeholder\.svg/.test(value)) continue;
      const image = this.absoluteUrl(value, "https://reader.hqread.cc");
      if (!seen.has(image)) { seen.add(image); images.push(image); }
    }
    return images;
  }

  async authorizedImages(epId) {
    // 只查询当前会话已有的权限；购买由用户在网站中完成。
    const url = "https://reader.hqread.cc/index.php/api/comic/isbuy?id=" + epId;
    const result = JSON.parse(await this.request(url));
    if (Number(result.code) === 1 && Array.isArray(result.pic)) {
      const images = this.imageUrls(result.pic.map(pic => pic?.img));
      if (!images.length) throw new Error("网站已确认权限，但章节图片暂未就绪，请稍后重试。");
      return images;
    }
    if (Number(result.code) === 2 || /(?:登录|登陆).*(?:超时|失效|后)|(?:请先|需要|未)(?:登录|登陆)/.test(String(result.msg || ""))) {
      throw new Error("本章需要有效登录，请在漫画源的账号选项中使用网页登录后重试；登录过期时需重新登录。");
    }
    if (Number(result.code) === 3) {
      if (result.type === "vip") throw new Error("当前账号没有本章所需的 VIP 权限，请在网站中确认会员状态。");
      throw new Error("当前账号尚未购买或解锁本章，请在网站中完成后重试。");
    }
    throw new Error(String(result.msg || "网站无法确认本章阅读权限，请稍后重试。"));
  }

  maxPage(document, page) {
    let max = page;
    for (const link of document.querySelectorAll(".pagination-wrapper a")) {
      const label = this.text(link);
      if (/^\d+$/.test(label)) max = Math.max(max, Number(label));
      const tail = (link.attributes["href"] || "").match(/(?:\/page\/|\/search\/[^/]+\/)(\d+)\/?(?:[?#]|$)/);
      if (tail) max = Math.max(max, Number(tail[1]));
    }
    return max;
  }

  explore = [{
    title: "漫画1234（新版网站）",
    type: "multiPartPage",
    load: async () => {
      const document = new HtmlDocument(await this.request(this.baseUrl + "/"));
      try {
        const parts = [];
        const feature = document.querySelector(".mint-feature");
        const comic = feature ? this.parseCard(feature) : null;
        if (comic) parts.push({ title: "今日推荐", comics: [comic] });
        for (const section of document.querySelectorAll(".mint-section")) {
          const title = this.text(section.querySelector(".mint-section-heading h2"));
          const comics = this.parseCards(section, ".mint-update-card, .mint-cover-card");
          if (title && comics.length) parts.push({ title, comics });
        }
        if (!parts.length) throw new Error("未找到首页漫画列表，网站可能改变了页面结构。");
        return parts;
      } finally { document.dispose(); }
    }
  }];

  category = {
    title: "漫画1234（新版网站）",
    parts: [{
      name: "题材与地区",
      type: "fixed",
      categories: ["全部", "恋爱", "搞笑", "热血", "都市", "冒险", "校园", "古风", "悬疑", "玄幻", "科幻", "奇幻", "武侠", "生活", "剧情", "穿越", "治愈", "重生", "系统", "国漫", "日漫", "韩漫", "欧美", "其他"],
      categoryParams: ["0", "17", "13", "6", "31", "7", "11", "28", "18", "10", "8", "96", "66", "29", "84", "14", "67", "171", "173", "257", "240", "209", "258", "97"],
      itemType: "category"
    }],
    enableRankingPage: false
  };

  categoryComics = {
    optionList: [
      { options: ["0-全部", "1-连载", "2-完结"] },
      { options: ["hits-热门", "addtime-更新", "id-最新"] }
    ],
    load: async (category, param, options, page) => {
      const url = this.baseUrl + "/category/tags/" + encodeURIComponent(param || "0") +
        "/finish/" + encodeURIComponent(options?.[0] || "0") +
        "/order/" + encodeURIComponent(options?.[1] || "hits") + "/page/" + page;
      const document = new HtmlDocument(await this.request(url));
      try {
        const section = document.querySelector(".comic-section");
        if (!section) throw new Error("未找到分类页面，网站可能改变了分类接口。");
        return { comics: this.parseCards(section), maxPage: this.maxPage(document, page) };
      } finally { document.dispose(); }
    }
  };

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      const encoded = encodeURIComponent(keyword);
      const url = this.baseUrl + (page > 1 ? "/search/" + encoded + "/" + page : "/search?key=" + encoded);
      const document = new HtmlDocument(await this.request(url));
      try {
        // 推荐列表也使用 comic-card；搜索只读取结果所在的第一个区域。
        const section = document.querySelector("section.container.mt-lg");
        if (!section?.querySelector("h1")) throw new Error("未找到搜索结果区域，网站可能改变了搜索接口。");
        return { comics: this.parseCards(section), maxPage: this.maxPage(document, page) };
      } finally { document.dispose(); }
    }
  };

  comic = {
    loadInfo: async id => {
      if (!/^\d+$/.test(id)) throw new Error("漫画编号不正确。");
      const url = this.baseUrl + "/comic/" + id + ".html";
      const document = new HtmlDocument(await this.request(url));
      try {
        const title = this.text(document.querySelector("#mintWorkTitle"));
        if (!title) throw new Error("未找到漫画详情，漫画可能下架或页面结构已改变。");
        const chapters = new Map();
        // 新网站的详情目录默认倒序，章节 ID 使用网站的真实编号。
        for (const link of document.querySelectorAll("[data-mint-chapters] a[data-chapter-id]").reverse()) {
          const chapterId = link.attributes["data-chapter-id"];
          if (/^\d+$/.test(chapterId) && this.text(link)) chapters.set(chapterId, this.text(link));
        }
        if (!chapters.size) throw new Error("未找到可读取的章节目录。");
        const metadata = document.querySelectorAll(".mint-work-info > p");
        const author = this.text(metadata[0]).replace(/\s*著$/, "").trim();
        const tags = this.text(metadata[1]).split(/\s+/).filter(Boolean);
        let isFavorite;
        if (this.isLogged) {
          try { await this.requireSession(); isFavorite = await this.favoriteStatus(id); } catch (_) { /* 收藏状态失败不影响公开详情。 */ }
        }
        return new ComicDetails({
          title,
          isFavorite,
          cover: this.absoluteUrl(document.querySelector("#mintWorkCover")?.attributes["src"]),
          description: this.text(document.querySelector("#mintIntroPanel > div")),
          tags: { "作者": author ? [author] : [], "标签": tags },
          updateTime: this.text(document.querySelector(".mint-work-meta")).split("·").pop().replace(/\s*更新$/, "").trim(),
          chapters,
          recommend: this.parseCards(document, ".mint-cover-card"),
          url
        });
      } finally { document.dispose(); }
    },

    loadEp: async (comicId, epId) => {
      if (!/^\d+$/.test(comicId) || !/^\d+$/.test(epId)) throw new Error("章节编号不正确，请从新版图源重新打开漫画详情。");
      let url = this.baseUrl + "/comic/" + comicId + "/" + epId + ".html";
      const visited = new Set();
      for (let step = 0; step < 3; step++) {
        if (visited.has(url)) throw new Error("网站阅读跳转出现循环。");
        visited.add(url);
        const html = await this.request(url);
        const document = new HtmlDocument(html);
        try {
          const reader = document.querySelector("[data-mint-reader]");
          if (reader) {
            if (reader.attributes["data-comic-id"] !== comicId || reader.attributes["data-chapter-id"] !== epId) {
              throw new Error("网站返回了其他章节，请重新打开漫画详情。");
            }
            const vip = Number(reader.attributes["data-chapter-vip"]);
            const cion = Number(reader.attributes["data-chapter-cion"]);
            if (!Number.isFinite(vip) || !Number.isFinite(cion) || vip > 0 || cion > 0) {
              return { images: await this.authorizedImages(epId) };
            }
            // 必须完整保留 st/e 等签名参数；src 通常只是占位图。
            const images = this.imageUrls(reader.querySelectorAll("img.reader-image")
              .map(image => image.attributes["data-src"] || image.attributes["src"]));
            if (!images.length) throw new Error("章节没有返回公开图片，可能需要登录或网站结构已改变。");
            return { images };
          }
          // 只提取网站发布的跳转地址，不执行网页脚本。
          let next = document.querySelector('a[href^="https://reader.hqread.cc/r/"]')?.attributes["href"];
          if (!next) {
            const match = html.match(/location\.replace\(\s*("(?:\\.|[^"\\])*")\s*\)/);
            if (match) next = JSON.parse(match[1]);
          }
          const approved = next && (/^https:\/\/reader\.hqread\.cc\/r\/[A-Za-z0-9_-]+\/?$/.test(next) ||
            next.startsWith(this.baseUrl + "/go/") || next.startsWith(this.baseUrl + "/r/"));
          if (!approved) throw new Error("未找到有效的阅读跳转地址，网站可能需要登录或更换了阅读域名。");
          url = next;
        } finally { document.dispose(); }
      }
      throw new Error("网站阅读跳转次数过多，请在浏览器检查章节是否能打开。");
    },

    onImageLoad: () => ({ headers: { "Referer": "https://reader.hqread.cc/", "User-Agent": "Mozilla/5.0" } })
  };
}
