# TASK-012 ｜ R-16~R-20 实现批次(第二曲线首批)

> 来源:**人类裁决**——Issue #14~#18 于 2026-11-28 19:45 经 GitHub 改标 `agent:in-progress`(v1.2 裁决后移通道:改标签=批准进流水线)
> 流水线:研发 → 总调度验收 → 独立核验 → 发版 0.1.11 → 回写关闭 #14~#18

## 0. 批次构成(五项,全 P2)

| 项 | Issue | 内容 | 类型 |
|---|---|---|---|
| A | #14(R-16) | 复活 UI-XSS 探针剧本为经典面板 XSS DOM 断言用例(prompt "UI-XSS" 经既有回放通道;断言 DOM 零新增 script 元素 + 探针文本逐字保真)——NFR-03 消毒行为获机器固化 | 测试 |
| B | #15(R-17) | 过渡载体清理三件套:tsconfig.json 删 jsx 行、.gitignore 删 media/chat.* 两行 + 增 `.pi-loop.json` 条目 | 配置 |
| C | #16(R-18) | test-cases.md 头部加还原注记(TC-098~137 为 0.1.8 时代历史判定,0.1.10 起判定载体回经典面板)+ technical-design.md 头部跨引用同步 v0.9 | 文档 |
| D | #17(R-19) | ui-versions ⑦ 门禁注释语境修复:扫描文本先剥离行/块注释段再匹配(或断言限定 import/from 语句位置);修复后探针复测:注释形态 consumed=false | 测试 |
| E | #18(R-20) | pi-real-smoke 语义对齐:测试头注释与 suite 标题如实声明「npm 脚本语境下实测对象为锁定依赖 bin;PATH 侧对端漂移由螺旋周期轮比对承担」+ 冒烟留痕增加解析来源标注 | 注释 |

## 1. 验收口径

1. 四门禁全绿(typecheck/build/verify:unit/verify:integration);A/D 新增或修改用例全绿;
2. D 项修复后探针复测:`// import x from "..."` 与 `/* import "..." */` 形态 consumed=false(工作区零污染演练);
3. B 项清理后 tsconfig 无 jsx、.gitignore 无 chat.* 死模式且含 .pi-loop.json;
4. A 项用例真实走 DOM 断言(jsdom),非仅版本字符串;
5. R-16 断言质量满足 P-10 精神(至少一个反证探针:非 XSS 消毒路径的对照)。

## 2. 进度日志

- 2026-11-28 19:5x 总调度:检测改标裁决 → 立项;研发子代理派发;
