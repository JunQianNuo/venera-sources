// 包子漫画：2026-10-11 网页结构修订。Venera / Venera Prime 图源。
class BaoziFixed extends ComicSource {
  name = "包子漫画（修订版）";
  key = "baozi_fixed";
  version = "1.1.3";
  minAppVersion = "1.4.0";
  // 构建时会按 repository.json 写入本仓库的更新地址。
  url = "";

  settings = {
    endpoint: {
      title: "网站入口（连接失败时切换）",
      type: "select",
      options: [
        { value: "https://cn.webmota.com", text: "简体 · webmota.com" },
        { value: "https://cn.kukuc.co", text: "简体 · kukuc.co" },
        { value: "https://tw.dinnerku.com", text: "繁体 · dinnerku.com" }
      ],
      default: "https://cn.webmota.com"
    }
  };

  get baseUrl() {
    return this.loadSetting("endpoint") || this.settings.endpoint.default;
  }

  absoluteUrl(value) {
    if (!value) return "";
    if (value.startsWith("//")) return "https:" + value;
    if (/^https?:\/\//.test(value)) return value;
    if (value.startsWith("/")) return this.baseUrl + value;
    return this.baseUrl + "/" + value;
  }

  text(element) {
    return element ? element.text.trim() : "";
  }

  async request(url, method = "GET", data = "", noCache = false) {
    const headers = {
      "User-Agent": "Mozilla/5.0",
      "Referer": this.baseUrl + "/"
    };
    if (noCache) {
      // Venera 会复用五秒内的 GET，即使期间已经修改网站收藏。
      headers["cache-time"] = "no";
      headers["Cache-Control"] = "no-cache";
      // 网站 CDN 仍可能缓存账号页面并忽略 Cookie，私有 GET 使用唯一 URL。
      if (method === "GET") {
        url += (url.includes("?") ? "&" : "?") + "_venera_nc=" + Date.now() + "-" + Math.random().toString(36).slice(2);
      }
    }
    if (method === "POST") {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      headers["Origin"] = this.baseUrl;
    }
    const response = method === "POST" ? await Network.post(url, headers, data) : await Network.get(url, headers);
    const body = typeof response.body === "string" ? response.body : "";
    if (/challenge_required|<title>\s*Just a moment|cf-chl-/i.test(body)) {
      throw new Error("网站要求网页验证，请切换图源设置中的网站入口，或先在浏览器中确认网站能否打开。");
    }
    if (response.status !== 200) {
      throw new Error("包子漫画请求失败（HTTP " + response.status + "），请检查网络或切换网站入口。");
    }
    return body;
  }

  get account() {
    return {
      login: async (username, password) => {
        const result = JSON.parse(await this.request(this.baseUrl + "/api/bui/signin", "POST",
          "username=" + encodeURIComponent(username) + "&password=" + encodeURIComponent(password)));
        if (result.result !== true || typeof result.data !== "string" || !result.data.trim()) {
          throw new Error(/VERIFY|CAPTCHA/i.test(String(result.code || "")) ?
            "网站要求验证，请先在网站完成验证后再登录。" : "登录失败，请检查邮箱和密码，或在网站确认账号状态。");
        }
        // 当前镜像不能使用网站脚本中硬编码的旧 baozimh.com Cookie 域。
        Network.setCookies(this.baseUrl, [new Cookie({ name: "TSID", value: result.data, domain: this.baseUrl.slice(8) })]);
        try { await this.loadShelf(); }
        catch (error) { Network.deleteCookies(this.baseUrl); throw error; }
      },
      // Venera 在注册图源之前读取账号配置，此处不能调用 loadSetting/baseUrl。
      registerWebsite: "https://cn.webmota.com/user/signup",
      logout: () => {
        for (const entry of this.settings.endpoint.options) Network.deleteCookies(entry.value);
      }
    };
  }

  async loadShelf() {
    const cookies = await Network.getCookies(this.baseUrl);
    if (!cookies.some(cookie => cookie.name === "TSID" && typeof cookie.value === "string" && cookie.value.trim())) {
      throw new Error("当前入口没有登录会话，请在图源账号中重新登录。");
    }
    const document = new HtmlDocument(await this.request(this.baseUrl + "/user/my_bookshelf", "GET", "", true));
    try {
      if (document.querySelector("#mail, input[type=password]")) throw new Error("网站登录已失效，请在图源账号中重新登录；切换网站入口后也需要重新登录。");
      const root = document.querySelector(".bookshelf");
      if (!root) throw new Error("未找到网站书架，请检查登录状态或网站页面变化。");
      if (/想要拥有专属书架|想要擁有專屬書架|临时书架|臨時書架/.test(this.text(root.querySelector(".pure-menu-selected"))) ||
          /想要拥有专属书架|想要擁有專屬書架/.test(this.text(root))) {
        throw new Error("网站返回了访客临时书架，请重新登录后读取专属书架。");
      }
      const rows = root.querySelectorAll(".bookshelf-items");
      const comics = [];
      for (const row of rows) {
        const link = row.querySelector("h4 > a[href]");
        const id = (link?.attributes["href"] || "").match(/\/comic\/([\w-]+)(?:[?#/]|$)/)?.[1];
        const title = this.text(link);
        if (!id || !title) throw new Error("网站书架条目结构已改变，请更新图源。");
        const author = row.querySelectorAll(".info li").map(e => this.text(e)).find(text => /^作者[:：]/.test(text));
        const image = row.querySelector("amp-img, img");
        comics.push(new Comic({ id, title, subTitle: author?.replace(/^作者[:：]\s*/, "") || "",
          cover: this.absoluteUrl(image?.attributes["data-src"] || image?.attributes["src"]) }));
      }
      if (!rows.length && !/没有追|沒有追|暂无|暫無|书架为空|書架為空/.test(this.text(root))) {
        throw new Error("网站书架结构已改变，无法确认是否为空，请更新图源。");
      }
      return comics;
    } finally { document.dispose(); }
  }

  favoriteOperations = new Set();

  favorites = {
    multiFolder: false,
    loadComics: async page => {
      if (!Number.isInteger(page) || page < 1) throw new Error("书架页码不正确。");
      return { comics: page === 1 ? await this.loadShelf() : [], maxPage: 1 };
    },
    addOrDelFavorite: async (id, folderId, isAdding) => {
      if (typeof id !== "string" || !/^[\w-]+$/.test(id)) throw new Error("漫画编号不正确。");
      if (this.favoriteOperations.has(id)) throw new Error("当前漫画正在同步收藏，请稍后刷新书架。");
      this.favoriteOperations.add(id);
      try {
        const present = (await this.loadShelf()).some(comic => comic.id === id);
        // 已收藏时不重复 set_bookmark，避免将网站阅读位置重置至第零章。
        if (present === isAdding) return;
        // 与官网收藏按钮一致使用 GET；这个操作请求也不可缓存。
        await this.request(this.baseUrl + "/user/operation_v2?op=" + (isAdding ? "set_bookmark" : "del_bookmark") +
          "&comic_id=" + encodeURIComponent(id) + (isAdding ? "&chapter_slot=0" : ""), "GET", "", true);
        if ((await this.loadShelf()).some(comic => comic.id === id) !== isAdding) {
          throw new Error("网站书架同步未生效，请刷新书架确认状态后重试。");
        }
      } finally { this.favoriteOperations.delete(id); }
    }
  };

  parseComic(element) {
    const link = element.querySelector("a[href]");
    const match = (link?.attributes["href"] || "").match(/\/comic\/([\w-]+)(?:[?#/]|$)/);
    const title = this.text(element.querySelector("h3"));
    if (!match || !title) return null;
    return new Comic({
      id: match[1],
      title,
      subTitle: this.text(element.querySelector("small")),
      cover: this.absoluteUrl(element.querySelector("amp-img, img")?.attributes["src"]),
      tags: element.querySelectorAll("div.tabs > span").map(e => this.text(e)).filter(Boolean)
    });
  }

  parseCards(document) {
    return document.querySelectorAll("div.comics-card").map(e => this.parseComic(e)).filter(Boolean);
  }

  explore = [{
    title: "包子漫画（修订版）",
    type: "multiPartPage",
    load: async () => {
      const document = new HtmlDocument(await this.request(this.baseUrl + "/"));
      try {
        const parts = [];
        for (const part of document.querySelectorAll("div.index-recommend-items")) {
          const title = this.text(part.querySelector("div.catalog-title"));
          const comics = this.parseCards(part);
          if (title && comics.length) parts.push({ title, comics });
        }
        if (!parts.length) throw new Error("未找到首页漫画列表，网站可能改变了页面结构。");
        return parts;
      } finally { document.dispose(); }
    }
  }];

  category = {
    title: "包子漫画（修订版）",
    parts: [{
      name: "类型",
      type: "fixed",
      categories: ["全部", "恋爱", "纯爱", "古风", "异能", "悬疑", "剧情", "科幻", "奇幻", "玄幻", "穿越", "冒险", "推理", "武侠", "格斗", "战争", "热血", "搞笑", "大女主", "都市", "总裁", "后宫", "日常", "韩漫", "少年", "其它"],
      categoryParams: ["all", "lianai", "chunai", "gufeng", "yineng", "xuanyi", "juqing", "kehuan", "qihuan", "xuanhuan", "chuanyue", "mouxian", "tuili", "wuxia", "gedou", "zhanzheng", "rexie", "gaoxiao", "danuzhu", "dushi", "zongcai", "hougong", "richang", "hanman", "shaonian", "qita"],
      itemType: "category"
    }],
    enableRankingPage: false
  };

  categoryComics = {
    optionList: [
      { options: ["all-全部", "cn-国漫", "jp-日本", "kr-韩国", "en-欧美"] },
      { options: ["all-全部", "serial-连载中", "pub-已完结"] }
    ],
    load: async (category, param, options, page) => {
      const language = this.baseUrl.startsWith("https://tw.") ? "tw" : "cn";
      const url = this.baseUrl + "/api/bzmhq/amp_comic_list?type=" + encodeURIComponent(param || "all") +
        "&region=" + encodeURIComponent(options?.[0] || "all") +
        "&state=" + encodeURIComponent(options?.[1] || "all") +
        "&filter=%2a&page=" + page + "&limit=36&language=" + language +
        "&__amp_source_origin=" + encodeURIComponent(this.baseUrl);
      const data = JSON.parse(await this.request(url));
      if (!Array.isArray(data.items)) throw new Error("分类接口没有返回漫画列表。");
      return {
        comics: data.items.filter(e => e.comic_id && e.name).map(e => new Comic({
          id: e.comic_id,
          title: e.name,
          subTitle: e.author || "",
          cover: "https://static-tw.baozimh.com/cover/" + e.topic_img + "?w=285&h=375&q=100",
          tags: e.type_names || []
        })),
        maxPage: data.next ? null : page
      };
    }
  };

  search = {
    optionList: [],
    load: async (keyword, options, page) => {
      if (page > 1) return { comics: [], maxPage: 1 };
      const document = new HtmlDocument(await this.request(this.baseUrl + "/search?q=" + encodeURIComponent(keyword)));
      try {
        if (!document.querySelector("html")) throw new Error("搜索接口没有返回网页。");
        return { comics: this.parseCards(document), maxPage: 1 };
      } finally { document.dispose(); }
    }
  };

  // 读取链接中的真实编号，避免把列表序号误当章节编号。
  chapterId(href) {
    const path = href.match(/\/comic\/chapter\/([\w-]+)\/(\d+)_(\d+)\.html/);
    if (path) return path[1] + "|" + path[2] + "|" + path[3];
    const param = name => {
      const match = href.match(new RegExp("[?&]" + name + "=([^&#]*)"));
      return match ? decodeURIComponent(match[1]) : "";
    };
    const comic = param("comic_id");
    const section = param("section_slot");
    const chapter = param("chapter_slot");
    if (/^[\w-]+$/.test(comic) && /^\d+$/.test(section) && /^\d+$/.test(chapter)) {
      return comic + "|" + section + "|" + chapter;
    }
    return null;
  }

  comic = {
    loadInfo: async id => {
      const url = this.baseUrl + "/comic/" + encodeURIComponent(id);
      const document = new HtmlDocument(await this.request(url));
      try {
        const title = this.text(document.querySelector("h1.comics-detail__title"));
        if (!title) throw new Error("未找到漫画详情，漫画可能下架或页面结构已改变。");
        const chapters = new Map();
        let links = document.querySelectorAll("#chapter-items .comics-chapters > a, #chapters_other_list .comics-chapters > a");
        if (!links.length) links = document.querySelectorAll(".comics-chapters > a").reverse();
        for (const link of links) {
          const chapterId = this.chapterId(link.attributes["href"] || "");
          const title = this.text(link.querySelector("span")) || this.text(link);
          if (chapterId && title) chapters.set(chapterId, title);
        }
        if (!chapters.size) throw new Error("未找到可读取的章节，网站可能改变了章节链接。");
        const cover = document.querySelector("div.l-content > div > div > amp-img") || document.querySelector("amp-img, img");
        const recommend = [];
        for (const item of document.querySelectorAll("div.recommend--item")) {
          if (!item.querySelector("div.tag-comic")) continue;
          const link = item.querySelector("a[href]");
          const match = (link?.attributes["href"] || "").match(/\/comic\/([\w-]+)(?:[?#/]|$)/);
          const title = this.text(item.querySelector("span"));
          if (match && title) recommend.push(new Comic({
            id: match[1], title,
            cover: this.absoluteUrl(item.querySelector("amp-img, img")?.attributes["src"])
          }));
        }
        let isFavorite;
        if (this.isLogged) {
          try { isFavorite = (await this.loadShelf()).some(comic => comic.id === id); } catch (_) { /* 收藏状态失败不影响公开详情。 */ }
        }
        return new ComicDetails({
          title,
          isFavorite,
          cover: this.absoluteUrl(cover?.attributes["src"]),
          description: this.text(document.querySelector("p.comics-detail__desc")),
          tags: {
            "作者": [this.text(document.querySelector("h2.comics-detail__author"))].filter(Boolean),
            "标签": document.querySelectorAll("div.tag-list > span").map(e => this.text(e)).filter(Boolean)
          },
          chapters,
          recommend,
          updateTime: this.text(document.querySelector("div.supporting-text em")).replace(/[()（）]/g, "").replace(/年|月/g, "-").replace(/日/g, ""),
          url
        });
      } finally { document.dispose(); }
    },

    loadEp: async (comicId, epId) => {
      const match = epId.match(/^([\w-]+)\|(\d+)\|(\d+)$/);
      if (!match) throw new Error("章节编号格式不正确，请重新打开修订版图源中的漫画详情。");
      // page_direct 会跳转至失效入口；网页章节在一页内已包含全部图片。
      const url = this.baseUrl + "/comic/chapter/" + match[1] + "/" + match[2] + "_" + match[3] + ".html";
      const document = new HtmlDocument(await this.request(url));
      try {
        const images = [];
        const seen = new Set();
        for (const node of document.querySelectorAll(".comic-contain .comic-contain__item[data-src]")) {
          const image = this.absoluteUrl(node.attributes["data-src"]);
          if (/^https?:\/\//.test(image) && !seen.has(image)) {
            seen.add(image);
            images.push(image);
          }
        }
        if (!images.length) throw new Error("章节没有返回图片，请检查网站入口、网页验证或页面结构变化。");
        return { images };
      } finally { document.dispose(); }
    },

    onImageLoad: () => ({ headers: { "Referer": this.baseUrl + "/", "User-Agent": "Mozilla/5.0" } })
  };
}
