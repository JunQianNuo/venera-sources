# 我的 Venera 漫画源仓库

包含包子漫画与漫画1234。修改源码后生成发布文件，再推送到 GitHub，即可供 Venera 检查图源更新。

## 添加到 Venera

在漫画源管理的“添加仓库”或“仓库地址”中填写：

```text
https://raw.githubusercontent.com/JunQianNuo/venera-sources/main/index.json
```

打开仓库列表，添加“包子漫画（修订版）”和“漫画1234（新版网站）”。不同 Venera 分支的按钮名称可能不同；仓库地址必须指向 `index.json`，不是 GitHub 仓库网页。

如果之前导入过本地版，旧脚本没有更新地址，需要将代码更新为仓库的 `dist` 版本一次。保留相同的 key，但改版前后的漫画编号和章节编号是否一致仍会影响旧记录。先备份应用数据；遇到重复源提示时，可在该源的代码编辑器中替换为对应 `dist/*.js` 的完整代码，再保存并重新打开。此后可用应用的图源更新功能获取新版本。

也可以按链接导入发布脚本：

- [包子漫画 1.1.1](https://raw.githubusercontent.com/JunQianNuo/venera-sources/main/dist/baozi_fixed.js)
- [漫画1234 1.2.1](https://raw.githubusercontent.com/JunQianNuo/venera-sources/main/dist/mh1234_fixed.js)

最低声明版本为 Venera 1.4.0。尚未在用户手机上验证；实际兼容性以使用的 Venera / Venera Prime 分支为准。

## 当前功能

| 功能 | 包子漫画 | 漫画1234 |
| --- | --- | --- |
| 首页、搜索、详情、章节阅读 | 已实现 | 已实现 |
| 分类筛选 | 类型、地区、连载状态 | 题材、连载状态、排序 |
| 入口设置 | 3 个简繁入口可切换 | 可填写网站地址 |
| 网站登录 | 邮箱和密码登录，校验专属书架 | 网站自身页面登录 |
| 网站书架同步 | 读取专属书架、收藏和取消收藏 | 分页读取网站书架、收藏和取消收藏 |
| 本地收藏、阅读记录 | 由 Venera 管理 | 由 Venera 管理 |

Venera 提供账号、收藏和设置接口，网站端功能仍需要每个图源适配。[官方图源文档](https://github.com/venera-app/venera/blob/master/doc/comic_source.md)。漫画1234登录使用阅读域名 `reader.hqread.cc`。登录、书架和收藏操作已有模拟测试，尚未用真实账号验证；账号书架条目的解析仍需在手机上确认。登录不保证能读取账号没有权限的章节。

## 登录和使用网站书架

1. 在漫画源管理中更新两个图源，打开该图源的账号选项。
2. 包子漫画使用网站账号的邮箱和密码登录；漫画1234选择网页登录，在网站页面自行输入账号、密码和验证码。网站成功跳转后 Venera 应结束网页登录。
3. 打开 Venera 的收藏页面，选择对应图源的网站收藏。详情页收藏时选择对应网站收藏，即可写回网站；只加入本地收藏不会写回网站。
4. 首次验证可选择一部原本没有收藏的漫画，加入网站书架，在浏览器确认，然后取消该测试收藏并再次确认。已有收藏不必删除。

这次同步包含网站书架的读取、加入和移除，不会自动合并所有本地收藏，也不包含网站阅读进度同步。包子切换入口后需要在新入口重新登录；漫画1234主站地址设置不会改变固定的阅读/登录域名。登录过期时会提示重新登录，无法确认写入结果时会提示先刷新书架，避免盲目重复操作。

如果出现“书架结构已改变”，请反馈图源版本和错误文字，不要发送账号密码、Cookie 或完整未脱敏日志。

包子 1.1.0 若出现安装时的 `Null check operator used on a null value`，请刷新仓库并安装 1.1.1。漫画1234 1.2.0 收藏后书架报条目结构错误时，更新至 1.2.1 后刷新网站收藏；已成功写入网站的漫画不需要重复收藏。

## 快速修复并更新

开发环境：Node.js 22 或更新版本、Git。第一次进入目录运行：

```powershell
npm ci --ignore-scripts
```

随后每次修复：

1. 修改 `sources/baozi_fixed.js` 或 `sources/mh1234_fixed.js`，同时提高顶部 `version`，例如 `1.1.1` → `1.1.2`。
2. 根据新页面结构补充 `tests/fixtures/` 与对应测试。
3. 运行下面的生成、验证和提交命令。

```powershell
npm run build
npm run verify
git add sources dist index.json tests
git commit -m "fix: repair comic source"
git push origin main
```

推送后查看 [Actions](https://github.com/JunQianNuo/venera-sources/actions) 的“图源测试”。测试通过后，在 Venera 中检查图源更新；原始文件地址也可能短暂缓存。

注意：main 的原始文件会在推送后直接变更；CI 提示错误并不会自动撤回发布。应先本地验证，较大修改通过分支和 PR 审查后再合并。

完整排错和扩展方法见 [维护指南](docs/maintenance.md)。

## 文件布局

| 路径 | 用途 |
| --- | --- |
| `sources/` | 手动维护的图源源码 |
| `dist/` | 自动生成、供 Venera 下载的脚本 |
| `index.json` | 自动生成的仓库列表 |
| `repository.json` | 发布仓库、分支和图源说明 |
| `tests/` | 离线测试、精简网页结构、手动网络检查 |
| `scripts/` | 生成、配置、发布一致性与版本检查 |

不要直接修改 `dist/` 或 `index.json`；下一次构建会覆盖它们。

Fork 到其他 GitHub 账号时，执行下面命令，再把 README 中的链接改为自己的仓库：

```powershell
npm run configure -- --repository 你的GitHub用户名/venera-sources
```

本仓库仅包含适配代码和测试用的网页结构片段，不存储漫画图片或账号凭据。
