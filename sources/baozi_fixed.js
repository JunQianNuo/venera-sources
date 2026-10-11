// 包子漫画：2026-10-11 网页结构修订。Venera / Venera Prime 图源。
class BaoziFixed extends ComicSource {
  name = "包子漫画（修订版）";
  key = "baozi_fixed";
  version = "1.0.1";
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

  async request(url) {
    const response = await Network.get(url, {
      "User-Agent": "Mozilla/5.0",
      "Referer": this.baseUrl + "/"
    });
    const body = typeof response.body === "string" ? response.body : "";
    if (/challenge_required|<title>\s*Just a moment|cf-chl-/i.test(body)) {
      throw new Error("网站要求网页验证，请切换图源设置中的网站入口，或先在浏览器中确认网站能否打开。");
    }
    if (response.status !== 200) {
      throw new Error("包子漫画请求失败（HTTP " + response.status + "），请检查网络或切换网站入口。");
    }
    return body;
  }

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
        return new ComicDetails({
          title,
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
