# 图源维护指南

## 失效时先定位

| 现象 | 优先检查 | 修改位置 |
| --- | --- | --- |
| 浏览器同一网络也打不开 | 网站域名、网络、站点是否停服 | 能访问的新入口；仅改解析代码通常无法解决 |
| 首页/搜索/分类为空 | 页面选择器或接口路径 | `explore` / `search` / `categoryComics` |
| 详情有内容但章节目录错乱 | 章节链接与真实编号 | `comic.loadInfo` |
| 阅读页空白 | 阅读跳转、图片元素、登录状态 | `comic.loadEp` |
| 图片 403 或签名失效 | Referer 与完整签名参数 | `onImageLoad` / 图片 URL 提取 |
| 网站能登录但应用失败 | 实际阅读域名的 Cookie、登录成功判断 | `account.loginWithWebview` |
| 源修复后应用仍不提示更新 | key、version、脚本自身 url 与 index | `sources` 顶部元数据 + `npm run build` |

改域名前确认新入口确实属于同一网站、页面结构和编号规则兼容。漫画1234的登录、权限查询和图片请求还引用阅读域名，主站地址设置不会自动替换它们。

不要随意修改已有图源的 `key`。Venera 用它识别源；漫画 ID、章节 ID 同样应保持稳定。更换为不兼容的站点时应创建新源，而非直接覆盖旧源。

## 测试

```powershell
npm test
npm run build
npm run verify
```

`npm test` 检查源解析、登录判断、权限响应、发布元数据与版本递增规则。
`npm run verify` 还会检查生成文件是否最新，并对 `dist` 发布脚本运行相同的图源回归测试。

网络检查需要网站可访问；不会登录账号、购买章节或下载漫画图片。图片仅发 HEAD 请求。

```powershell
npm run live:baozi
npm run live:mh1234
```

也可以在 GitHub 的 Actions → “手动网站检查” → Run workflow 中选择图源。GitHub 的网络出口可能被网站限制，失败不等于用户手机也失败；通过也不等于所有章节都可读。网页列表和章节数量会变化，手动检查中的样本断言也需要维护。

不要把账号密码、Cookie 或未经脱敏的登录日志提交到仓库。网页结构测试样本去掉了脚本、表单和图片签名，样本链接不能拿来当实时阅读链接。

## 添加新漫画源

1. 在 `sources/` 新建独立 JS 文件，类继承 `ComicSource`。
2. 按现有文件格式声明双引号字段 `name`、`key`、`version`、`minAppVersion`、`url`。元数据字段保持两个空格缩进、每项单独一行；`url` 保持空字符串，由构建生成。
3. key 只用英文字母、数字、下划线且不得与已有源重复；版本号为 `x.y.z`。
4. 在 `repository.json.sources` 增加 `key: 说明`，为实际实现的功能添加测试。
5. 执行 `npm run build` 和 `npm run verify`，提交新源码、测试、`dist` 和 `index.json`。

构建脚本只读取静态元数据并做语法检查，不会执行图源；测试中的 VM 会执行被测试的源码，因此不要运行不可信的第三方图源测试。

## 扩展网站登录和书架同步

- 网站登录：实现 `account.loginWithWebview` 或普通登录接口。确认登录发生在实际请求书架和阅读权限的域名。
- 网站书架：实现官方接口 `favorites.loadComics`、`favorites.addOrDelFavorite`，有文件夹时还需文件夹接口。必须先检查网站真实书架请求、分页、增加/删除收藏接口及需要的 Cookie。
- 分类：维护 `category.parts` 和 `categoryComics.optionList/load`。
- 入口切换：维护 `settings`，所有请求统一从设置读取主站地址。

“网站书架”不同于 Venera 的本地收藏。只有网站提供书架并且脚本实现相应接口后，才能读写网站收藏；本仓库尚未实现这部分。

## 恢复误改

通过 GitHub 提交历史或 `git diff` 确认问题。恢复旧解析逻辑后，应使用更高的版本号发布回滚修复，不能将版本号倒退，否则更新检查可能无法识别。
