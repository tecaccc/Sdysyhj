# 发布流程（Release Runbook）

> 工程文档。约束智能体相关的版本纪律见 `DevelopmentGuidelines/versioning.md`（仅存本地，不入库）。
> 本文件描述两条发布通道如何经 GitHub Actions 自动执行，以及发版操作者的固定步骤。

## 总览

| 通道 | 触发 | 执行者 | 产物 |
|---|---|---|---|
| ① Microsoft Marketplace（VS Code 商店） | 推送 annotated tag `v<version>` | `.github/workflows/release.yml` → `publish-marketplace` job | 商店上架新版本 |
| ② GitHub Release | 同上 | `release.yml` → `github-release` job | Release `v<version>` + 附带 `sdysyhj-<version>.vsix` |
| （配套）CI 自测 | push / PR 到 `main`，或发版 tag | `.github/workflows/ci.yml` / `release.yml` 的 `test` job | 类型检查 + 构建 + 单元/集成测试 |

- **通道①免密钥**：采用 **Marketplace Trusted Publishing**（OIDC）——workflow 声明 `permissions: id-token: write`，`vsce publish --oidc` 用 GitHub Actions 的 OIDC token（audience `marketplace.visualstudio.com`）向 Marketplace 换取 15 分钟时效的发布凭证，全程不落任何 PAT/secret。
- **通道②零配置**：用 Actions 自带的 `GITHUB_TOKEN`（workflow 已声明 `contents: write`）。

另外支持**手动触发**（workflow_dispatch）：Actions → *Release* → *Run workflow* → 填入已有 annotated tag（如 `v0.1.3`）。适用场景：

- **bootstrap**：tag 推送时该 tag 提交中尚无 release.yml（tag 触发的 workflow 必须存在于 tag 指向的提交里）；
- tag 推送事件丢失/流水线未跑时的补发。手动触发同样走完整门禁（一致性检查 + 测试），发布的是**指定 tag 提交**的内容，而非当前 main。

流水线顺序：**一致性门禁 + 全量测试 → 打包 vsix → ①② 并行发布**。
任何一个前置环节失败即中止；两个发布 job 互不影响，可单独重跑失败 job。

## 一次性配置（首次发版前）

### 1. Marketplace 发布者

- `package.json` 的 `publisher` 字段为 **`tecacc`**，扩展 ID 即 `tecacc.sdysyhj`；
- 须用拥有该发布者的 Microsoft 账号在 [Marketplace 发布者管理页](https://marketplace.visualstudio.com/manage) 登录确认（若无，先创建 publisher，ID 必须为 `tecacc`）。

### 2. 启用 Trusted Publishing（通道①，免 PAT）

在 [Marketplace 发布者管理页](https://marketplace.visualstudio.com/manage)：

1. 打开发布者 `tecacc` → 选择 **Trusted Publishing** → **Create** 新建策略；
2. 策略字段（须与实际完全一致，任一不匹配即 401/403）：

| 字段 | 值 |
|---|---|
| Policy name | 如 `Release workflow`（仅展示用） |
| Repository owner | `tecaccc` |
| Repository | `Sdysyhj` |
| Workflow | `release.yml`（`.github/workflows/` 下的文件名） |
| Environment | 留空（本 workflow 未使用 GitHub environment） |

3. **私有仓库注意**：策略创建后须在 **48 小时内**成功跑一次发布 workflow，首次成功的 token 交换会永久激活策略。

官方文档：<https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-from-github-actions-using-trusted-publishing>

### 3. 版本载体核对（已就绪项）

- `package.json` 的 `repository.url` 已指向本仓库（Marketplace 页面的仓库链接与 README 相对链接解析依赖它）；
- `.gitignore` 含 `*.vsix`（产物不入库，由 CI 现场打包）。

### （备选）PAT 方式

Trusted Publishing 不可用时（如需从 Actions 之外手动 `vsce publish`）：[Azure DevOps](https://dev.azure.com) → Personal access tokens → 新建（Organization: All accessible organizations；Scopes: **Marketplace → Manage**）→ 仓库 Settings → Secrets → Actions 添加 `VSCE_PAT`。本地使用：`VSCE_PAT=<token> npx @vscode/vsce publish`。（仓库 workflow 已不读取该 secret。）

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
| ① Marketplace | `vsce publish -i <vsix> --oidc --skip-duplicate`（OIDC 凭证 15 分钟时效，每次发布现换） | 仅该 job |
| ② GitHub Release | 以 tag 建 Release，正文为 CHANGELOG 对应条目，附 vsix | 仅该 job |

7. 任务单补发版留痕：Marketplace 链接、Release 链接、CI 运行链接（总调度）。

## 失败恢复

- **重跑**：Actions → 对应 run → *Re-run failed jobs*。两个发布 job 均幂等：
  - Marketplace 用 `--skip-duplicate`，版本已上架则跳过不报错；
  - GitHub Release 已存在时自动转为补传/覆盖 vsix 资产。
- **Marketplace 401/403**：多为 Trusted Publishing 策略不匹配——核对 owner=`tecaccc`、repo=`Sdysyhj`、workflow=`release.yml`、environment 留空、publisher=`tecacc`；另注意每个 GitHub OIDC token 只能交换一次（重跑会换新 token，无影响）。
- **门禁失败**（tag↔版本不一致等）：本地修正后**不得改写已推 tag**——按 versioning.md 处理：删除远端 tag 属于版本载体回退，须人类裁决后重走。
- **CI 未跑完前不要打下一个 tag**（同版本两个 run 无害但混乱；流水线按 tag 串行）。
- **上架后发现缺陷**：不回退不补发，走新版本 `0.1.(x+1)`（缺陷单 → 修复 → 核验 → 发版）。

## 历史备注

- `v0.1.2` 及之前：tag 提交中无 release.yml，且 `publisher` 仍为旧值 `sdysyhj`——这些版本**只走 GitHub Release**（手动 dispatch 补发即可），Marketplace 上架自 `v0.1.3`（publisher=`tecacc` + Trusted Publishing）起。

## 校验清单（发版后）

- [ ] Marketplace 上 `tecacc.sdysyhj` 新版本可见，版本号、CHANGELOG 页一致
- [ ] GitHub Release `v0.1.x` 存在，附 `sdysyhj-0.1.x.vsix`，正文为 CHANGELOG 条目
- [ ] CI run 全绿；Actions artifact 中有对应 vsix
