# 功能对照表

验收日期：2026-11-09  
验收对象：`/type`「看汉字打读音」及其必需的词包、导入、记录与本地数据能力  
参考站：`https://jp-master.com/type`（已登录环境，ego-lite 实际操作与 DOM/计算样式取证）

## 1. 验收口径

| 标记 | 含义 |
| --- | --- |
| ✅ 已完整实现 | 已在当前构建中实际走通，并有 Playwright 或可复现的人工操作证据 |
| 🟡 部分实现 | 主流程可用，但参考站的某个状态、设备或异常边界未覆盖 |
| ⛔ 未实现 | 明确不在本项目范围，或没有真实功能 |
| ❔ 无法验证 | 依赖参考站私有后端、账号、真机或不可复现环境，不能诚实标记为通过 |

本轮实际执行：

```text
npm run typecheck          通过
npm test -- --reporter=dot 9 个测试文件 / 58 个测试通过
npm run build              通过
npx playwright test        38 个 E2E 通过
npm run test:pages         GitHub Pages 子路径离线冒烟通过
```

当前构建的独立复核见 [`reviews/verification-r8.md`](reviews/verification-r8.md)。

人工对照证据：

- `docs/reviews/logic-r7.md`、`docs/reviews/ui-r7.md`、`docs/reviews/ux-r7.md`：三路独立评审；仅对应 r7 旧构建
- `work/r8/ui-r8-audit.json`、`work/r8/ui-r8-fallback.json`、`work/r8/ux-r8-evidence.json`：当前构建的实测 JSON
- `work/audit-desktop-initial.png`、`work/audit-desktop-result.png`、`work/audit-mobile-initial.png`
- `work/record-first.png`、`work/record-second.png`
- `work/audit-metrics.json`（1041×917 与 390×844 的 computed geometry）
- 参考站本机实际截图与 DOM：内置词包结算、初始题面、隐藏输入、读音槽、提示按钮、组格与面板

## 2. 核心功能：`/type` 页面与打字流程

| 功能项 | 状态 | 实现与证据 |
| --- | --- | --- |
| 打开 `/type` 自动恢复未完成组 | ✅ 已完整实现 | `TypePage.autoStart`；E2E `type-result` 刷新用例、`type-packs` 跨词包用例 |
| 无未完成组时自动生成下一组 | ✅ 已完整实现 | `/type` 不显示旧准备页；E2E 首次进入即出现 `.ty-word` |
| 720px 居中内容列、桌面 63px 全局导航 | ✅ 已完整实现 | `audit-metrics.json`：`.ty-container x=160.5 width=720`；截图对照 |
| 移动端 360px 内容列、5 项底部导航、无桌面全局头 | ✅ 已完整实现 | E2E `type-mobile`；`.ty-global-header` 隐藏、容器宽 360、底部导航 5 项 |
| 模式胶囊「看汉字打读音 / 句子填空」 | ✅ 已完整实现（句子填空禁用） | `TypeTopbar` 真实渲染禁用项并标注范围；不会执行假功能 |
| 隐藏输入框接收键盘/IME | ✅ 已完整实现 | `.ty-hidden-input` 为 1×1；桌面 keydown、移动端 input/composition 均接入 |
| 逐键罗马字匹配 | ✅ 已完整实现 | `src/lib/romajiMatcher.ts`；单元测试覆盖 pending、促音、拨音、拗音、替代读音 |
| pending 不判错、不推进 | ✅ 已完整实现 | E2E `type-core` 输入 `enk` 后断言 `.ty-pending="k"` 且无错误 |
| Backspace 只清 pending | ✅ 已完整实现 | E2E `type-core` 按 Backspace 后 pending 消失、词仍在 |
| 错误保留已确认位置，只清当前前缀 | ✅ 已完整实现 | `processCharacter` 错误分支；E2E 三次错误后仍停在当前词 |
| 正确音节推进读音槽 | ✅ 已完整实现 | `.ty-reading-char.is-typed` 状态、key-pop/ring；E2E 逐词完成 |
| 逐键正确率 HUD | ✅ 已完整实现 | `correctKeys / totalKeys`；结算优先读 `typingAccuracy` |
| 活动计时（面板/保存/隐藏页暂停） | ✅ 已完整实现 | `activeMs`、`pageHidden`、`suspended`、`submitting`、`held` 状态共同暂停 |
| 连击：5 次出现、每 10 次 bump、30 起金色 | ✅ 已完整实现 | E2E `type-interactions` 连击用例；CSS `.ty-combo.is-bump/.is-hot` |
| 按住空格/Tab/按钮显示完整读音 | ✅ 已完整实现 | E2E `type-core`、`type-settings`；松开隐藏，提示写入 `hintUsed` |
| 提示设置默认显示读音 | ✅ 已完整实现 | `DEFAULT_SETTINGS.showReading=true`；E2E 切换「不显示」后槽位变 `・` |
| 三次错误显示「跳过」 | ✅ 已完整实现 | E2E `type-core` 三次错误后按钮出现并真实推进 |
| `Esc` 跳过 | ✅ 已完整实现 | `onKeyDown` 调用 `skipWord()`；保存 `result:"skipped"` |
| 完成后自动进入下一词 | ✅ 已完整实现 | `settings.autoAdvance`；E2E 默认路径 |
| 关闭自动推进后 Enter/按钮继续 | ✅ 已完整实现 | E2E `type-settings`；新增延迟保存用例验证保存中锁定 |
| 保存中禁止提前进入下一词 | ✅ 已完整实现 | 新增 E2E 延迟 IndexedDB 事务：按钮显示「保存中…」且 disabled，写入完成后才可点 |
| 保存失败保留当前词并可重试 | ✅ 已完整实现 | 新增 E2E 注入 `IDBObjectStore.put` 失败：错误条、输入禁用、重试成功、答案只写一次 |
| 最后一词保存失败重试只产生一次结算 | ✅ 已完整实现 | E2E `type-save-failure`：`batchSize=1` 首次写失败→重试→`sessions` 恰好 1 条、结算只出现一次 |
| 上一词结果行短暂显示 | ✅ 已完整实现 | `.ty-last-result`；完成词后显示汉字/读音/释义 |
| 最后一词完成进入同路由结算 | ✅ 已完整实现 | E2E 完成组后直接出现 `.ty-result`，无整屏反馈页 |
| 读音槽尺寸、下划线、pending、ring、nope | ✅ 已完整实现（视觉尺寸已测量，动画观感见 UI 评审） | `audit-metrics.json`；`type.css` keyframes |
| `prefers-reduced-motion` 降级 | ✅ 已完整实现 | CSS reduced-motion 分支；E2E 默认以 reduced motion 跑核心路径 |

## 3. 结算与组记录

| 功能项 | 状态 | 实现与证据 |
| --- | --- | --- |
| 四张统计卡：用时/假名每分/正确率/最高连击 | ✅ 已完整实现 | `TypeResult`；E2E 断言 4 张卡 |
| 薄弱词列表与「打错/看了/跳过」标签 | ✅ 已完整实现 | E2E `type-result` 断言 `看了`、`错 1`、`跳过` 与数量；参考源码及 live DOM 一致 |
| 全对时显示「N 个全部一次打对」且无薄弱词 | ✅ 已完整实现 | E2E 未使用提示/错误用例 |
| 四张统计卡 700ms cubic ease-out 计数 | ✅ 已完整实现 | 正常动效实测单调递增至终值；`prefers-reduced-motion` 下首帧或次帧即终值 |
| 有下一组时显示「下一组」+「第 N 组再打一遍」 | ✅ 已完整实现 | E2E `type-result`、`type-core` 覆盖内置与自定义词包 |
| 无下一组时把「第 N 组再打一遍」升为主按钮 | ✅ 已完整实现 | E2E 覆盖重打主按钮；无重复 secondary |
| 组号按词包独立，内置与自定义词包都显示纪录行 | ✅ 已完整实现 | N1 第 1/2 组、N2 从第 1 组、自定义包均按本包编号；重打显示 `第 1 组最快 0:01，追平了` |
| 新纪录/追平/慢了 N 秒文案 | ✅ 已完整实现 | `TypeResult` 分支；组号由 `getSessionGroupNumbers` 保持 |
| 结算刷新恢复同一结果 | ✅ 已完整实现 | `lastResultId/lastResultAt` + E2E 刷新用例 |
| 「第 N 组再打一遍」按原顺序与词条快照重放 | ✅ 已完整实现 | E2E `type-interactions` 断言首词/次词顺序；E2E 移除词条后仍可重打 |
| 「下一组」重新规划动态队列 | ✅ 已完整实现 | E2E `type-result` 断言下一组首词不同且刷新后保持 |
| 「只练这 N 个」只含薄弱词，并按随机 keys 顺序建队 | ✅ 已完整实现 | E2E 固定 `Math.random` 后断言首词、queue 与 `drillKeys` 一致 |
| 加练及其重打不占组号、不显示组纪录 | ✅ 已完整实现 | 单测 `isDrillLikeSummary`；E2E drill → `再来一组` → retry 两层均无 record |
| 移除词条后结算仍按当组快照展示 | ✅ 已完整实现 | E2E 删除词条后标题、弱词行仍准确；旧记录无快照时禁用必失败重打并说明原因 |
| 无下一组时给出原因与可执行入口 | ✅ 已完整实现 | `TypePage.problemForQueue` 区分无词包/无读音/每日上限/空队列；按钮进入设置/词库/重试 |
| 删除正在查看结算的词包不串入下一词包 | ✅ 已完整实现 | E2E MutationObserver 场景验证不出现混包标题、纪录或「继续当前组」 |

## 4. 词包、词典与导入

| 功能项 | 状态 | 实现与证据 |
| --- | --- | --- |
| 词包选择 | ✅ 已完整实现 | `TypePackPicker`；E2E 跨词包切换 |
| 每个词包独立保存未完成组 | ✅ 已完整实现 | E2E `type-packs` 两包各答 1 词后切回仍 2/N |
| 每组词数可配置（1–200） | ✅ 已完整实现 | 设置页；E2E 修改后已有组不变并持久化 |
| 内置 N1/N2 词包 | ✅ 已完整实现 | `public/data/builtin-n1.json`、`builtin-n2.json`；首页/词包面板可见 |
| 自定义词包新建/重命名/删除 | ✅ 已完整实现 | E2E `pack-lifecycle`；词库页面 |
| 自定义词包导入（粘贴/CSV/TSV/JSON/TXT/XLSX） | ✅ 已完整实现 | E2E `import-formats`、`type-import`、`library` |
| 导入预览、逐行编辑、重复/缺读音/无汉字标记 | ✅ 已完整实现 | `ImportDialog` / `TypeImportPanel`；缺少读音时保存保持禁用，摘要与落库词数一致；E2E `type-import` |
| 非法读音行定位 | ✅ 已完整实现 | `invalid` 行显示红框、`aria-invalid` 与行内“读音必须是平假名或片假名”；摘要区分缺读音/读音无效；E2E `type-import` |
| `/type` 内联导入后自动选中并出题 | ✅ 已完整实现 | E2E `type-import` |
| 空自定义词包显示 `0 个词 · 0 组` | ✅ 已完整实现 | `TypePackPicker` 仅在存在可打词时计算组数；E2E `type-packs` |
| 词包内搜索 | ✅ 已完整实现 | E2E `library` 搜索「勉強」 |
| 离线词典搜索（汉字/假名/中文） | ✅ 已完整实现 | E2E `library` 三种查询；词典 30,566 条 |
| 词典单条加入词包 | ✅ 已完整实现 | E2E `library` 将「懐かしい」加入后回词包搜索到 |
| 导入失败/空文本/非法行反馈 | ✅ 已完整实现（核心路径） | 单元测试与面板错误分支；尚未逐机型验证文件选择器差异 |

## 5. 学习记录与本地数据

| 功能项 | 状态 | 实现与证据 |
| --- | --- | --- |
| 记录每词错误率/一次答对率/掌握度 | ✅ 已完整实现 | E2E `type-records` 断言错误率、错误次数、掌握阶段；`srs.ts` |
| SRS 复习日期与动态队列 | ✅ 已完整实现 | `planQueue`、`scheduleWord`；单元测试 `session.test.ts`、`srs.test.ts` |
| 词条历史与会话详情 | ✅ 已完整实现 | 记录页详情弹窗；E2E `type-records` |
| 重打不消耗新组号；加练链不获得组号 | ✅ 已完整实现 | 单元测试 `getSessionGroupNumbers`、`isDrillLikeSummary`；E2E 普通重打与 drill 重打 |
| IndexedDB 持久化 | ✅ 已完整实现 | `db.ts` 五个 store；E2E 刷新恢复 |
| JSON 全量导出/恢复 | ✅ 已完整实现 | E2E `backup` 导出后覆盖恢复 |
| 损坏/恶意备份拒绝且不覆盖现有数据 | ✅ 已完整实现 | E2E `backup-errors` |
| 数据只存在当前浏览器、无账号/云端 | ✅ 已完整实现 | 无后端；README 与设置页说明 |
| 离线重新打开应用 | ✅ 已完整实现 | Service Worker 预缓存 shell、字体与内置词包；E2E `offline` 断网 reload 后仍可进入题目 |
| GitHub Pages 静态部署 | ✅ 已完整实现（本机构建验证） | `.github/workflows/deploy.yml`、`base:"./"`、hash 路由；未在真实 GitHub 仓库触发工作流 |
| 跨标签页并发写入 | ❔ 无法验证 | 单标签页保存延迟/失败已测；两个标签页同时写同一 plan 未覆盖 |
| 真机 iOS/Android IME | ❔ 无法验证 | Chromium composition 路径已实现；未逐机型实测 |
| 真实音频输出/震动/日语语音 | ❔ 无法验证 | Web Audio / speechSynthesis 调用存在；自动化不能听音 |

## 6. 明确不迁移

| 参考站功能 | 状态 | 处理 |
| --- | --- | --- |
| 「句子填空」模式 | ⛔ 未实现 | 保留禁用胶囊并说明本版本不含；不提供假交互 |
| 阅读、JLPT、知识库等非打字业务模块 | ⛔ 未实现 | 仅保留本项目真实路由：首页、词库、记录、设置、练习 |
| 登录、账号、会员额度、权限 | ⛔ 未实现 | 单人本地应用，无账号体系 |
| 云端同步/服务端保存 | ⛔ 未实现 | IndexedDB + JSON 备份 |
| 参考站私有 API、源码、品牌资源 | ⛔ 未使用 | 独立实现；仅保留行为与公开可观察布局 |

## 7. 已知差异与未完成项

以下差异是产品需求或独立部署要求，不视为核心功能缺失：

- 参考站固定 20 词/组；本项目每组词数可配置，默认 20。
- 参考站按内置 unit 顺序出题；本项目按整包动态队列和 SRS 到期状态出题。
- 参考站账号词包含固定「我的词」chip；本项目保留同一固定入口：有自定义词包时打开首个/当前自定义词包，没有自定义词包时打开真实的导入流程，不伪造空词包。
- 参考站词包面板不含本组词数控件；本项目把可配置组大小放在设置页，词包面板保持参考结构。
- 参考站内置词包结算没有组纪录；本项目对内置与自定义词包统一显示本组纪录，并把加练视为不占组号的独立练习。
- 本组纪录行是新增能力，使结算内容相对旧参考 DOM 多约 40.5px 高度；已保留该功能，不将其误报为布局溢出。
- 品牌、全局导航与词库模块使用新项目自己的信息架构，不复制参考站账号/会员入口。

仍未达到「可证明 100% 等价」的边界：

1. 没有参考站后端、账号和私有调度参数，无法证明服务端队列与额度行为等价。
2. 未做真实手机键盘、不同 IME、真实音频设备和跨标签页并发测试。
3. 视觉尺寸已按 1041×917 / 390×844 测量；逐像素字体渲染会因操作系统字体回退产生微小差异。
4. GitHub Actions 工作流未在真实仓库触发；本机生产构建与 Pages 子路径配置已验证。

## 8. 结论

核心 `/type` 打字流程、逐键状态机、提示/错误/跳过、动态队列、每包恢复、结算、组纪录、自定义词包导入、词典单条加入、SRS 记录和 JSON 备份均已形成可运行闭环，并有自动化或人工证据。  
不能诚实宣称「与参考站 100% 像素/后端等价」；应表述为：**已观察到的核心打字体验已高保真复刻，异常设备与参考站私有服务端边界仍未完全验证。**
