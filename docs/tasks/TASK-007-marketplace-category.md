# TASK-007 ｜ Marketplace 发布失败：类目回归修复（#D-05）→ 发版 0.1.5

> 来源：人类通道（CI 日志粘贴，2026-11-21 12:3x +0800）
> 现象：`release.yml` v0.1.4 tag 推送 → `publish-marketplace` job 失败：
> `Error: The category 'Chatbots' is not available in language 'en-us'.`（exit 1）
> 流水线：发布缺陷单 → 元数据修复 → 一致性门禁 → 发版 0.1.5 → CI 双通道自动发布
> 状态：**已闭环**（双通道发布 PASS，见 §4）

## 1. 缺陷单

**#D-05 ｜ P1 ｜ 发布流水线 ｜ package.json categories 含 Marketplace 非法类目 `Chatbots`，通道①自 v0.1.4 起被拒**

- **引入**：commit `50ff85e`（docs(readme): Marketplace 级英文重写 + **商店元数据优化**）将 categories 由 `["Other"]` 改为 `["AI","Chatbots","Other"]`；该提交**不在 v0.1.3 内**（v0.1.3 categories=`["Other"]`，上架成功——Marketplace 上现存的最后版本即 0.1.3）。
- **根因**：Marketplace 发布 API 对 categories 做 en-us 枚举校验，`Chatbots` 不在合法集内（服务端报错，本地 `vsce package` 不校验类目故未拦截）。
- **修复**：`Chatbots` → `Chat`（合法类目，实测 GitHub Copilot Chat 在用：`Programming Languages / Machine Learning / AI / Chat`）；`AI`、`Other` 保持（`AI` 同为实测在用合法类目）。
- **教训**：商店元数据（categories/keywords/icon）属发布载体，改动应经本地 `vsce package` + 至少一次通道①实测验证；本次引入未经发布通道验证即随版本 tag 放行。

## 2. 流水线记录

- 2026-11-21 12:3x 总调度：收到人类粘贴的 CI 失败日志 → 根因定位（上述）
- 事实核验：`github_get_release_by_tag v0.1.4` —— 通道②**成功**（Release v0.1.4 + sdysyhj-0.1.4.vsix 已上架）→ v0.1.4 按定义"已发版"并冻结（versioning.md §2.2/§4：不开补发改包口子）→ 裁决走新版本 **0.1.5**（PATCH +1）
- **核验裁剪裁决**（versioning.md §4"可裁剪用例范围但须任务单留痕"）：零代码变更（与 v0.1.4 代码逐字节一致，仅 package.json 元数据/CHANGELOG/文档），v0.1.4 同代码已过 CI 全量门禁（release.yml test job 先于打包发布，全绿）→ 本地裁剪为：typecheck+build 冒烟、`vsce package` 打包核对、版本五处一致性、密钥扫描；全量自测仍由 v0.1.5 tag 推送的 CI 门禁强制重跑兜底
- 类目合法性验证（不凭记忆）：Marketplace gallery API 实测 Copilot Chat 类目集含 `AI`/`Chat`

## 3. 发版记录（versioning.md §5 剧本）

- 步骤 2/3：package.json 0.1.4→0.1.5 + categories `Chatbots`→`Chat`；CHANGELOG 顶部 0.1.5 条目
- 步骤 4（裁剪冒烟）：typecheck / build ✅（输出见提交时记录）；`npx @vscode/vsce package` 产出 `sdysyhj-0.1.5.vsix` ✅；旧 0.1.4 vsix 从工作区移除（载体④一致性）
- 步骤 6 一致性门禁：① package.json 0.1.5 ② CHANGELOG 顶部 0.1.5 ③ tag v0.1.5（本提交打）④ 仅存 sdysyhj-0.1.5.vsix ✅；推送前密钥扫描 CLEAN
- 步骤 7：commit `chore(release): v0.1.5` + annotated tag `v0.1.5` + push
- 步骤 8：CI 自动——tag 推送触发 release.yml：门禁+全量测试 → 打包 → ① Marketplace（Trusted Publishing/OIDC）② GitHub Release；结果回填于 §4

## 4. CI 发布结果（tag 推送后回查，2026-11-21 12:46 +0800）

- **通道② GitHub Release：✅ 成功**（04:35:24Z，发布耗时约 1 分钟，与 v0.1.4 一致——即门禁+全量测试+打包全过）
  - Release：https://github.com/tecaccc/Sdysyhj/releases/tag/v0.1.5
  - 附件：`sdysyhj-0.1.5.vsix`（21,388,147 B，sha256:2bff17ae…）
- **通道① Marketplace：⏳ 暂不可见**（gallery API 实测最新版本仍为 0.1.3，上架 11 分钟后未更新）——两种可能：上架传播延迟 / 再次失败（本工具集无 Actions 运行日志可查）；已安排 12:53 复查，若仍为 0.1.3 则记录疑似失败，需人类查 Actions 日志：
  - 扩展页：https://marketplace.visualstudio.com/items?itemName=tecacc.sdysyhj
  - Actions：https://github.com/tecaccc/Sdysyhj/actions/workflows/release.yml
- 佐证事实：v0.1.3 确已上架成功（Marketplace 现存版本 0.1.3，类目 Other）——与 §1 根因分析一致
- （复查处补记见下）

### 补记（2026-11-21 12:53 +0800，复查定时器）

- **通道① Marketplace：✅ 成功** —— gallery API 实测最新版本 **0.1.5**（04:51:11Z 更新，即发布后约 16 分钟传播到位，此前 04:46Z 不可见属正常延迟）；类目已更新为 `['AI', 'Chat']`（`Chat` 合法生效，`Chatbots` 报错消除；展示层未显示 `Other`，如实记录）；0.1.4 因发布失败不在上架序列，最新版直接由 0.1.3 → 0.1.5
- 扩展页：https://marketplace.visualstudio.com/items?itemName=tecacc.sdysyhj
- **#D-05 闭环结论：双通道发布全绿，修复验证完成；无需任何后续发版动作**
