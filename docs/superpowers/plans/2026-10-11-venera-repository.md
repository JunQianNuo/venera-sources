# Venera Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 建立可在 GitHub 托管并向 Venera 提供图源更新的仓库。

**Architecture:** 保留已验证的图源。Node 构建脚本从源码读取元数据，生成索引与带更新地址的发布脚本；离线测试与手动网络检查分开。

**Tech Stack:** Node.js >=22、node:test、linkedom 0.18.12、GitHub Actions、Git。

**Spec:** `docs/design.md`

## Global Constraints

- source key 保留 baozi_fixed 和 mh1234_fixed。
- 默认分支 main；未配置账号时只能本地导入。
- 不保存账号 Cookie、密码或漫画图片。
- 生成文件提交到 main，无需部署网站。

## Review Focus

- 未配置仓库时，避免生成看似有效的虚假远程 URL。
- 错误 owner/repo 或分支不能写入发布配置。
- 重复 key 不能覆盖已生成的文件。
- 源语法错误不能通过发布检查。
- 修改源码但忘记生成 dist/index 时 CI 必须失败。

### Task 1: Build and regression suite

**Files:** `sources/*.js`, `scripts/build.cjs`, `scripts/configure.cjs`, `repository.json`, `tests/*.test.cjs`, `tests/fixtures/*`, `package.json`。

**Interfaces:** `build(root, {check: boolean})` 生成或校验 index/dist；`validateConfig(config)` 校验配置。

- [x] 保留现有 20 个测试，将 harness 指向 sources 和 tests/fixtures。
- [x] 写发布测试：调用 build，断言 index 的 key/version/url 与 dist 脚本完全一致；断言配置、重复 key、语法和过期文件错误。
- [x] `node --test tests/build.test.cjs` 确认缺少构建模块时失败。
- [x] 实现 build/configure；`npm test` 确认全部通过。

### Task 2: Delivery and maintenance

**Files:** `.github/workflows/check.yml`, `.github/workflows/live.yml`, `README.md`, `docs/maintenance.md`, `.gitignore`, `.gitattributes`。

- [x] CI 执行 `npm ci`、`npm test`、`npm run build:check`。
- [x] 手动 live workflow 执行网络检查并上传脱敏报告。
- [x] README 写清账号配置、Venera 添加索引、旧本地源一次性迁移和功能限制。
- [x] 使用 `npm run verify` 验证完整仓库，检查打包文件不含 node_modules、日志、Cookie。
- [x] GitHub 授权和公开范围确认后配置真实地址，生成提交并推送；未授权时交付本地目录和 ZIP。
