# DiffViewer 组件自适应规范

> 定义 DiffViewer 组件的自适应行为、边界约束和实现要求。
> 对应 task.json#14 的后续优化。

---

## 1. 组件职责

DiffViewer 是一个只读的内嵌组件，用于在 Approval Panel 中展示代码变更预览。它：

- **只显示差异**（added / removed / context lines），不是全文件查看器
- **不控制窗口尺寸**——高度由父容器 `.approval-panel__body` 约束
- **不负责滚动**——溢出滚动由父容器管理

---

## 2. 现状问题

### 问题 A：硬编码高度截断

```css
/* DiffViewer.css - 当前 */
.diff-viewer {
  max-height: 200px;    /* ← 硬编码，大 diff 被裁切 */
  overflow-y: auto;     /* ← 自己的滚动条与父容器冲突 */
}
```

当 diff 内容超过 200px 时，DiffViewer 自建滚动条，与 `.approval-panel__body` 形成**双重滚动**，用户需要滚两个容器才能看完所有内容。

### 问题 B：行数截断

```typescript
// DiffViewer.tsx - 当前
maxLines = 100,  // ← 超出 100 行的 diff 被静默截断
```

大 diff 修改会丢失尾部变更行。

### 问题 C（澄清项）："只显示变化内容"

这是 DiffViewer 的核心设计——它展示的是代码**差异**，不是全文件。当前行为正确。如果需要"全文件查看"功能，应作为独立需求（File Viewer / Full File Context）单独实现，不混入 Diff 职责。

---

## 3. 自适应行为定义

### 3.1 高度自适应

| 属性 | 变更前 | 变更后 |
|------|--------|--------|
| `max-height` | `200px` | `none`（或移除） |
| `overflow-y` | `auto` | `visible`（由父容器管理） |
| 高度行为 | 固定最大 200px | 自然撑开，占用所需空间 |

### 3.2 宽度自适应

| 属性 | 当前 | 变更 |
|------|------|------|
| `max-width` | `100%` | 保持不变 |
| `overflow-x` | `auto` | 保持不变（长代码行仍需横向滚动） |
| `.diff-viewer__content` | `width: max-content; min-width: 100%` | 保持不变 |

### 3.3 行数截断

| 参数 | 当前值 | 变更 |
|------|--------|------|
| `maxLines` 默认值 | `100` | `10000`（实际无限） |
| 截断逻辑 | 超过截断行数，末尾加 `... (more lines)` | 移除截断约束 |

注意：移除行数截断的前提是高度已改为自适应，父容器可滚动。

### 3.4 空内容 / 边界情况

| 场景 | 行为 |
|------|------|
| `oldContent === newContent`（无差异） | 返回 `null`，不渲染（已有） |
| `oldContent = ''`, `newContent = ''` | 返回 `null` |
| `oldContent = ''`, `newContent` 有内容 | 所有行标记为 `add`，正常渲染 |
| 单行变更 | 正常渲染，容器高度仅包裹内容 |
| 超大 diff（1000+ 行） | 自然撑开，父容器滚动条接管 |

### 3.5 视觉安全

- 删除 `max-height: 200px` 后的渲染高度完全取决于内容
- DiffViewer 本身没有动画过渡——不存在"自适应动画 Bug"的源头
- 父 `.approval-panel__body` 的滚动行为已有测试覆盖（见 progress.txt）

---

## 4. 实现要求

### 4.1 CSS 变更

```diff
 .diff-viewer {
   background: rgba(0, 0, 0, 0.3);
   border-radius: 6px;
   margin: 8px 0;
   overflow: hidden;
   font-family: "Consolas", "Monaco", "Courier New", monospace;
   font-size: 11px;
-  max-height: 200px;
-  overflow-y: auto;
+  max-height: none;
   max-width: 100%;
   min-width: 0;
   overflow-x: auto;
   box-sizing: border-box;
 }
```

### 4.2 TypeScript 变更

```diff
 export function DiffViewer({
   oldContent,
   newContent,
   fileName,
-  maxLines = 100,
+  maxLines = 10000,
 }: DiffViewerProps) {
```

### 4.3 不涉及文件

- `ApprovalPanel.tsx` — 不改，DiffViewer 的 props 接口不变
- `Overlay.tsx` — 不改，窗口尺寸逻辑不受影响
- `ApprovalPanel.css` — 不改，已有 `.approval-panel__body { overflow-y: auto }` 约束

---

## 5. 自动化测试要求

> 详见 `docs/testing.md` §Win App 自动化测试策略。

在修改 CSS/TS 之前，需要先补全以下测试：

### 5.1 单元测试：`DiffViewer.test.tsx`

| 测试 | 断言 |
|------|------|
| 空内容 → null 渲染 | 组件返回 `null`，无 DOM 输出 |
| 小 diff（2 行变化 + 10 行 context） | 正确渲染 +/ 行，diff-viewer 高度 ≤ 预设阈值 |
| 大 diff（50+ 行） | 内容完整渲染，无 `max-height` 截断 |
| 有 fileName | 显示文件头 |
| 无 fileName | 不显示文件头 |

### 5.2 浏览器 E2E（Playwright + Test Bridge）

| 测试 | 步骤 |
|------|------|
| PermissionRequest 含 diff | simulate → 验证 DiffViewer 出现在 ApprovalPanel 内 |
| 大 diff 滚动 | simulate 大 diff → 验证 approval panel body scrollHeight > clientHeight |

---

## 6. 不在此范围内的需求

以下需求不在本次变更范围内，如需实现应单独立项：

- **全文件查看**（Full File View）：展示文件的全部内容，与 diff 无关
- **语法高亮**：DiffViewer 当前是纯文本；`task.json#14` 已标记为 optional
- **行号跳转**：点击行号跳转到文件中的具体位置
- **内联编辑**：在 diff 视图中直接修改代码
