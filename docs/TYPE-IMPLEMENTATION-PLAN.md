# `/type` 高保真复刻与独立重构实施计划

> 文档状态：历史实施计划（2026-11-08）。当前实现与验收结果以 `README.md`、`docs/FEATURE-MATRIX.md` 和三路评审报告为准。下文个别早期设计（如词包面板内的组大小控件）已在实现中调整，不应作为当前接口说明。

## 1. 目标与成功标准

目标：

- 复刻参考站「看汉字打读音」的全部已观察交互；
- 保留用户要求的词包、导入、词典搜索、单条加入能力；
- 用 IndexedDB + SRS 替换参考站账号和后端；
- 静态部署到 GitHub Pages；
- 通过 UI、UX、交互逻辑三路独立评审和多轮回归。

成功标准：

1. 打开练习后无需准备页，直接进入题目或明确的词包空状态。
2. 桌面和移动布局的核心尺寸、颜色、字体层级接近参考站。
3. 键盘输入逐键判定；pending、错误、提示、跳过行为真实可用。
4. 词包可切换；每个词包独立恢复未完成组。
5. 组大小可调，选题来自整包动态队列。
6. 结算、下一组、重打、错词加练都能完成实际数据写入。
7. 导入、词典搜索、单条加入词包、导出恢复均通过 E2E。
8. 不依赖参考站 API、账号或私有资源。

## 2. 模块结构

```text
src/type/
  TypePage.tsx             编排页面状态与词包切换
  TypeTopbar.tsx           全局桌面 header + 打字页 header
  TypePackPicker.tsx       词包 chips、统计、组格（组大小在设置页）
  TypeImportPanel.tsx      内联导入与本地词典补全
  TypeSettingsPanel.tsx    三行设置 + 自动推进
  TypeSession.tsx          打字状态机与键盘处理
  TypeResult.tsx           结算页
  useTypeSession.ts        从 PracticeSession 投影题目状态
  romajiMatcher.ts         独立罗马字匹配器
  type.css                 仅 type 页面作用域样式
```

保留：

- `AppContext` 作为数据入口；
- `session.ts` 作为动态队列与会话模型；
- `srs.ts` 作为掌握度和复习调度；
- `repository.ts` 作为 IndexedDB 与备份；
- `ImportDialog` / `DictionaryBrowser` / `AddWordDialog` 继续服务知识库页面；
- 内置 N1/N2 数据和离线词典。

旧 `practice/` 组件在 type 主流程替换后不再被路由引用；其有用逻辑先迁移，再删除死代码，避免双份行为。

## 3. 页面状态机

```text
loading
  → noPack           （没有词包：选择/导入空状态）
  → preparing        （有词包，无 activeSession，正在创建）
  → active           （恢复或新建 activeSession）
  → completing       （最后一词已保存，等待结果渲染）
  → result           （显示最新 summary）
  → active           （下一组 / 重打 / 错词加练）
```

叠加层：

- `packPanelOpen`
- `settingsOpen`
- `importPanelOpen`
- `confirmDiscardOpen`
- `errorBanner`

切换词包：

1. `selectPack(packId)` 保存当前词包 ID。
2. 若该词包有 activeSession，直接恢复。
3. 否则调用 `startSession()` 创建新组。
4. 上一个词包的 activeSession 原样保留。
5. 切换时清空仅属于当前页的 pending / 提示 / 错误反馈。

## 4. 动态队列与组数

- 默认组大小 20，可配置为 1–200。
- 组大小在设置页提供数字输入，词包面板保持参考站结构，不内嵌批量控件。
- 可用词数 = 带汉字、带读音、去重后的词条数。
- 预计组数 = `ceil(可用词数 / 组大小)`。
- 当前组序号 = `completedSessions + 1`。
- 组格展示已完成组和当前组；点击当前组恢复，点击下一组开始时创建新组。
- “已完成组”数据来自 `sessions`，不伪造固定 unit。
- 不因为参考站固定 20 词/组而移除动态选题。

## 5. 打字会话

### 5.1 输入

- 可视 UI 不显示普通文本框。
- 页面保留 1×1、透明、可聚焦的 input，用于移动端唤起键盘并兼容 IME。
- 桌面同时监听 `keydown`；字母和假名进入匹配器。
- 忽略 Meta/Ctrl/Alt 组合键。
- 屏蔽空格和 Tab 的默认滚动/焦点行为。
- 忽略 `isComposing` 与 keyCode 229。

### 5.2 匹配器

`romajiMatcher.ts` 必须支持：

- 基础五十音；
- `shi/si/ci`、`chi/ti`、`tsu/tu`、`fu/hu`；
- 浊音、半浊音；
- 小写元音、小写拗音；
- 促音复制辅音；
- 拨音 `n/nn/n'/xn` 与裸 `n` 的提交时机；
- 拗音与常见外来音；
- pending 不推进、不判错；
- 错误不改变已确认位置；
- 直接假名输入。

测试用表驱动覆盖每类规则。

### 5.3 视觉反馈

- 每个目标音一个 slot。
- 当前 slot：accent 下划线 + `caret`。
- 已确认：亮色 + `key-pop`。
- 错误：danger 色 + 下划线。
- pending：当前 slot 下方小字。
- 正确音：ring 扩散。
- 错误音：读音行 `nope`。
- 完成词：短暂 result strip。
- 完整遵守 `prefers-reduced-motion`。

### 5.4 提示与跳过

- `Space` / `Tab` / 按钮按住 → 临时显示。
- 松开 → 隐藏。
- 使用后设 `hintUsed`，影响首答正确与 SRS。
- `Escape` → 真实记录 skip。
- `errors >= 3` → 显示跳过按钮。
- 跳过后清空 pending 并及时进入下一词。

### 5.5 音效与语音

- 复用并升级 `src/lib/audio.ts`：
  - 正确键噪声 + 低频正弦；
  - 错误双三角波；
  - 完成双音；
- `navigator.vibrate(30)` 仅在支持时调用。
- 发音使用 `speechSynthesis`，不请求参考站 TTS。

## 6. 设置

参考三行：

- 提示：显示读音 / 不显示
- 按键音：开 / 关
- 发音：不读 / 打完读出来

额外保留：

- 答对后自动继续（默认开）

设置使用现有 `Settings`：

- `showReading`
- `keySound`
- `speakAfterComplete`
- `autoAdvance`
- `batchSize`

更新时走 `AppContext.updateSettings`，失败回滚并 toast。

## 7. 词包面板与导入

### 7.1 chips

- 所有本地词包：内置 N1/N2 与自定义词包。
- chip 选中使用亮边、亮字、600 字重。
- “导入词包”使用虚线边框。

### 7.2 导入

参考站的一步式内联体验：

1. 输入名称与文本。
2. 点击“下一步”。
3. 本地解析；缺读音查离线词典。
4. 逐行预览，自动读音高亮。
5. “保存”创建词包并自动切换到该词包。

不依赖参考站 `POST /api/typing/packs/preview`。

### 7.3 词典与单条加入

- `/library` 的词典搜索、详情和加入词包继续可用。
- 打字页全局导航提供知识库入口。
- 词包内搜索继续由 `PackBrowser` 提供。

## 8. 结算

- 四卡片采用参考布局与 stagger `rise-in`。
- 薄弱词取自 `summary.words`，并通过当前 pack 映射展示汉字、读音、释义、结果。
- 按钮：
  - `下一组`：`startSession({ forceNew: true })`；
  - `第 N 组再打一遍`：用当前 summary 的 answers 生成同词集合 drill；
  - `只练这 X 个`：`startDrill(summary.words)`。
- 空薄弱词时显示“这一组全部一次通过”状态。

## 9. 样式与响应式

- 新增 `type.css`，所有选择器以 `.ty` 前缀作用域，避免影响词库、记录与设置页面。
- 使用 CSS 变量映射参考 token。
- 桌面：
  - 内容宽 720px；
  - 汉字 67.5px；
  - 全局导航 63px。
- 移动：
  - 内容左右 15px；
  - 汉字 45px；
  - 底部导航固定；
  - 组格 5 列。
- 不直接复制参考站 CSS；按 layout JSON 重新实现。

字体策略：

- UI 字体优先本地 `Plus Jakarta Sans`；
- 日文字体优先本地 `Noto Serif JP`；
- 若完整字体体积不适合，明确使用系统 Mincho fallback，并在功能矩阵标注。

## 10. 可访问性

- 页面仍保留可聚焦输入，`aria-label="在这里打读音"`。
- 读音槽使用 `aria-live="polite"` 输出进度。
- 模式按钮使用 radio 语义。
- 设置分段控件使用可读的 group/button 语义。
- 图标按钮有 `aria-label`。
- `Escape`、`Space`、`Tab` 不与页面滚动冲突。
- 尊重减少动态效果。

## 11. 测试

### 单元

- matcher 的基础、pending、拗音、促音、拨音、外来音、直接假名、错误不推进。
- 队列：到期优先、新词上限、补齐、固定错词 drill。
- SRS：错误、提示、跳过、首答正确。
- 词包切换与 activeSession 持久化。

### E2E

1. 打开 `/practice` 直接进入题目。
2. 输入 pending 不报错；完整正确音推进。
3. 错误输入显示错误并累计。
4. 按住 Space 显示提示并影响记录。
5. 3 次错误后出现跳过；Esc 跳过。
6. 完成组后四卡片、薄弱词和按钮出现。
7. 下一组真实创建新队列。
8. 切换 N1/N2/自定义词包，返回后恢复各自进度。
9. 调整每组词数影响新组大小。
10. 内联导入创建词包并切换。
11. 词典添加单个词后出现在词包。
12. 移动端布局与底部导航。
13. JSON 导出/恢复仍可用。

### 视觉对照

- `1041×917` 与 `390×844` 截图。
- 对照元素坐标、字号、颜色、间距、边框。
- 动效逐帧检查：caret、key-pop、ring、nope、rise-in、pop-in。

## 12. 评审轮次

### r1：基线审计

- UI Reviewer：布局/token/字体/响应式。
- UX Reviewer：真实流程、状态、移动端、空态和异常。
- Logic Reviewer：matcher、键盘、SRS、音效、持久化。

### 修复

root 按严重度修复，不等待所有 reviewer 意见重复冲突。

### r2：实现审计

- 三路 reviewer 对修改后的页面与代码重新审计。
- 必须输出剩余问题与可验证证据。

### r3：收敛

- 只修高/中严重度问题。
- 若仍有已知视觉差异，写入功能矩阵的“部分实现/无法验证”，不虚报 100%。

## 13. 风险

| 风险 | 应对 |
| --- | --- |
| 参考站固定 unit 与动态队列冲突 | 保留视觉组格，业务使用动态队列 |
| IME 与逐键判定冲突 | 隐藏 input + keydown；检测组合输入 |
| pending 实现错误导致误判 | 表驱动单测 + reviewer 交叉验证 |
| 词包切换覆盖进度 | 每包独立 `activeSession`；E2E 验证 |
| 字体体积和许可 | 使用 OFL 字体或 fallback，附许可 |
| 结算与已有 sessions 语义不一致 | 复用现有 summary；不另造记录 |
| 旧样式回归 | type.css 作用域 + 全量 E2E |
| GitHub Pages 子路径 | hash 路由 + `base: "./"` |
| 浏览器音频策略 | 首次用户交互后创建 AudioContext |
| 无法验证参考后端 | 功能矩阵明确“无法验证”，不冒充等价 |

## 14. 实施顺序

1. 提交 research / plan。
2. 三路 reviewer 基线审计。
3. 实现 matcher 与音效。
4. 实现 type 页面骨架、topbar、设置。
5. 实现 session、反馈和进度。
6. 实现 pack picker、组大小、导入。
7. 实现 result。
8. 更新路由，移除旧 practice 路由依赖。
9. 截图对照并修复。
10. reviewer r2/r3。
11. 单测、构建、E2E。
12. 功能矩阵与最终报告。
