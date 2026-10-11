# 账号功能验证记录

适用版本：包子漫画 1.1.0、漫画1234 1.2.0。检查日期：2026-10-11。

## 依据

- Venera 的 [图源文档](https://github.com/venera-app/venera/blob/master/doc/comic_source.md) 与源码 `lib/comic_source/parser.dart`：普通登录返回成功后应用记录账号，网站书架使用 `favorites.loadComics` 与 `favorites.addOrDelFavorite`；操作失败必须抛出错误。
- 包子当前 `/user/signin` 页面及其公开 `signin.min.js`：登录接口为 `/api/bui/signin`，字段 `username`、`password`，成功令牌为 `TSID`。空字段请求返回 `ERR_MAIL`，确认 URL 编码表单被接受。页面脚本仍写入旧域名，图源改为当前入口域名。
- 包子当前漫画详情的收藏链接与已有接口实现：`set_bookmark`、`del_bookmark`、`/user/my_bookshelf`。匿名访问专属书架返回登录页面，访客临时书架单独识别并拒绝。
- 漫画1234当前公开 `mint.js`：`rend/isfav` 查询状态，`rend/favadd` 提交 `did` 和 `type=comic`，返回 `cid` 表示切换后的状态；公开脚本提供 `data-mint-page="shelf"`、`data-mint-shelf-item`、`mint-shelf-empty`、分页 `data-pages` 等标记。
- [MCCMS 源码](https://github.com/chshcms/mccms)：`sys/apps/controllers/api/User.php` 的会话接口、`api/Rend.php` 的收藏逻辑、`user/Fav.php` 的分页路径。当前漫画1234匿名 `user/info` 返回 `data.log=0`、`id=0`；匿名 `isfav` 也会返回“未收藏”，因此不能用它判断已登录。

## 自动化覆盖

`tests/accounts.test.cjs` 包含 14 项测试，覆盖表单编码、令牌拒绝与安装域名、登录后的会话校验、退出登录、网站书架条目和空状态、推荐列表隔离、分页、登录失效、重复和并发收藏操作、未生效写入以及详情收藏状态。相同测试也用于生成后的发布脚本。

只读网络检查确认：两个网站的匿名会话均无法读取账号书架或提交收藏，校验阶段拒绝操作，发出的 POST 请求为零。

测试中的账号、令牌和书架条目为合成数据。真实账号书架 HTML 尚未观察，条目选择器基于公开脚本标记与既有结构，模拟测试通过不能证明实际账号页面完全兼容。

本地完整验证：40/40 源码与发布工具测试、34/34 发布脚本测试通过；生成物一致性和相对上一发布版本的版本递增检查通过。

## 需要在 Venera 中验证

更新图源后自行登录，确认网站书架完整加载；1234 收藏较多时确认后续页面。用一部原本未收藏的漫画验证加入与取消，并在网站核对。检查已有漫画的收藏标记。密码和 Cookie 不应发送给维护者或上传 GitHub。

浏览器自动控制本次连续超时，未取得真实账号验证结果。代码不会自动购买章节，也不会自动合并本地收藏或同步阅读进度。
