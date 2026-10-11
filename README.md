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

- [包子漫画 1.0.1](https://raw.githubusercontent.com/JunQianNuo/venera-sources/main/dist/baozi_fixed.js)
- [漫画1234 1.1.1](https://raw.githubusercontent.com/JunQianNuo/venera-sources/main/dist/mh1234_fixed.js)

最低声明版本为 Venera 1.4.0。尚未在用户手机上验证；实际兼容性以使用的 Venera / Venera Prime 分支为准。

## 当前功能

| 功能 | 包子漫画 | 漫画1234 |
| --- | --- | --- |
| 首页、搜索、详情、章节阅读 | 已实现 | 已实现 |
| 分类筛选 | 类型、地区、连载状态 | 题材、连载状态、排序 |
| 入口设置 | 3 个简繁入口可切换 | 可填写网站地址 |
| 网站登录 | 未实现 | 网站自身页面登录 |
| 网站书架同步 | 未实现 | 未实现 |
| 本地收藏、阅读记录 | 由 Venera 管理 | 由 Venera 管理 |

Venera 提供账号、收藏和设置接口，网站端功能仍需要每个图源适配。[官方图源文档](https://github.com/venera-app/venera/blob/master/doc/comic_source.md)。漫画1234登录使用阅读域名 `reader.hqread.cc`；登录和权限错误已用模拟响应验证，尚未用真实账号验证。登录不保证能读取账号没有权限的章节。

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
