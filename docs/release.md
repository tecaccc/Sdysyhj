# 发布流程（Release Runbook）

> 工程文档。约束智能体相关的版本纪律见 `DevelopmentGuidelines/versioning.md`（仅存本地，不入库）。
> 本文件描述两条发布通道如何经 GitHub Actions 自动执行，以及发版操作者的固定步骤。

## 总览

| 通道 | 触发 | 执行者 | 产物 |
|---|---|---|---|
| ① Microsoft Marketplace（VS Code 商店） | 推送 annotated tag `v<version>` | `.github/workflows/release.yml` → `publish-marketplace` job | 商店上架新版本 |
| ② GitHub Release | 同上 | `release.yml` → `github-release` job | Release `v<version>` + 附带 `sdysyhj-<version>.vsix` |
| （配套）CI 自测 | push / PR 到 `main`，或发版 tag | `.github/workflows/ci.yml` / `release.yml` 的 `test` job | 类型检查 + 构建 + 单元/集成测试 |

另外支持**手动触发**（workflow_dispatch）：Actions → *Release* → *Run workflow* → 填入已有 annotated tag（如 `v0.1.2`）。适用场景：
- **bootstrap**：tag 推送时该 tag 提交中尚无 release.yml（tag 触发的 workflow 必须存在于 tag 指向的提交里）；
- tag 推送事件丢失/流水线未跑时的补发。手动触发同样走完整门禁（一致性检查 + 测试），发布的是**指定 tag 提交**的内容，而非当前 main。

流水线顺序：**一致性门禁 + 全量测试 → 打包 vsix → ①② 并行发布**。
任何一个环节失败即中止（两个发布 job 互不影响，可单独重跑失败 job）。

## 一次性配置（首次发版前）

### 1. Marketplace 发布者

- `package.json` 的 `publisher` 字段（当前为 `sdysyhj`）必须与你在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) 拥有的发布者 ID 一致。
- 若尚未创建：用 Microsoft 账号登录 Marketplace → Publish extensions → 创建 publisher（ID 即 publisher 字段值）。

### 2. 配置 `VSCE_PAT` secret（Marketplace 发布凭证）

1. 登录 [Azure DevOps](https://dev.azure.com)（与 Marketplace 同一 Microsoft 账号）→ 右上角头像 → **Personal access tokens**；
2. **New Token**：
   - Name：如 `sdysyhj-marketplace-publish`
   - Organization：`All accessible organizations`
   - Expiration：按需（到期需换新，发布 job 会明确报错提示）
   - Scopes：**Custom defined → Marketplace → Manage**（勾选 Manage，不是 Acquire）
3. 复制生成的 token（仅显示一次）；
4. 仓库 → **Settings → Secrets and variables → Actions → New repository secret**：
   - Name：`VSCE_PAT`
   - Secret：粘贴 token

> GitHub Release 通道无需配置——使用 Actions 自带的 `GITHUB_TOKEN`（workflow 已声明 `contents: write` 权限）。

### 3. 版本载体核对（已就绪项）

- `package.json` 的 `repository.url` 已指向本仓库（Marketplace 页面的仓库链接与 README 相对链接解析依赖它）；
- `.gitignore` 含 `*.vsix`（产物不入库，由 CI 现场打包）。

## 发版步骤（每次发版）

本地步骤与 `DevelopmentGuidelines/versioning.md` §5 发版剧本一致：

1. 前置确认：核验报告逐 FR PASS、交付验收完成、任务单闭环（总调度）；
2. `package.json` `version` 递增为 `0.1.(x+1)`（研发）；
3. `CHANGELOG.md` 顶部新增该版本条目（研发）；
4. 全量自测全绿：`npm run typecheck` / `npm run build` / `npm run verify:unit` / `npm run verify:integration`（研发）；
5. 一致性检查 + 密钥扫描（总调度）；
6. 提交 `chore(release): v0.1.(x+1)`，打 **annotated** tag：
   ```bash
   git tag -a v0.1.X -m "发版结论：<一句话>"
   git push origin main v0.1.X     # commit 与 tag 一起推
   ```

推送 tag 后 CI 自动接管：

| CI 步骤 | 内容 | 失败即 |
|---|---|---|
| 门禁 | tag 必须 annotated；`v<版本>` ↔ `package.json` ↔ CHANGELOG 条目三处一致 | 中止全部 |
| 测试 | 类型检查 + 构建 + 单元/集成测试（即 §5 步骤 4 的 CI 复跑） | 中止全部 |
| 打包 | `npx @vscode/vsce package` → `sdysyhj-<version>.vsix`（产物留 Actions artifact，保留 30 天） | 中止发布 |
| ① Marketplace | `vsce publish -i <vsix> --skip-duplicate` | 仅该 job |
| ② GitHub Release | 以 tag 建 Release，正文为 CHANGELOG 对应条目，附 vsix | 仅该 job |

7. 任务单补发版留痕：Marketplace 链接、Release 链接、CI 运行链接（总调度）。

## 失败恢复

- **重跑**：Actions → 对应 run → *Re-run failed jobs*。两个发布 job 均幂等：
  - Marketplace 用 `--skip-duplicate`，版本已上架则跳过不报错；
  - GitHub Release 已存在时自动转为补传/覆盖 vsix 资产。
- **`VSCE_PAT` 缺失/过期**：`publish-marketplace` job 会在检查步骤给出配置指引；GitHub Release 不受影响，配置后重跑该 job 即可。
- **门禁失败**（tag↔版本不一致等）：本地修正后**不得改写已推 tag**——按 versioning.md 处理：删除远端 tag 属于版本载体回退，须人类裁决后重走。
- **CI 未跑完前不要打下一个 tag**（同版本两个 run 无害但混乱；流水线按 tag 串行）。
- **上架后发现缺陷**：不回退不补发，走新版本 `0.1.(x+1)`（缺陷单 → 修复 → 核验 → 发版）。

## 校验清单（发版后）

- [ ] Marketplace 上 `sdysyhj` 新版本可见，版本号、CHANGELOG 页一致
- [ ] GitHub Release `v0.1.x` 存在，附 `sdysyhj-0.1.x.vsix`，正文为 CHANGELOG 条目
- [ ] CI run 全绿；Actions artifact 中有对应 vsix
