# 设计产物

本目录存放 `claude-design` skill 在探索阶段产出的过程文件。这些文件是设计决策的来源依据，与 `../specs/` 下的设计规格互补 —— artifacts 记录"我们探索了什么"，specs 记录"我们决定了什么"。

## 目录约定

| 子目录 | 内容 | 典型文件格式 |
|--------|------|-------------|
| `prototypes/` | 可交互原型 | `.html`（独立 HTML 文件） |
| `flows/` | 交互流程图、屏幕序列 | `.md`（流程描述）、`.html`（时序动画） |
| `canvases/` | 视觉探索画布、线框图、多方案对比 | `.html`（设计画布） |

## 命名规则

- 文件名包含组件名和版本号：`<component-name>-v<N>.html`
- 多方案对比使用 `-option-A`、`-option-B` 后缀
- 不写 `output.html`、`design1.html` 等无意义名称

## 与设计规格的关系

当用户确认设计方案后，claude-design 会将选定方案的关键参数写入 `../specs/<component-name>-v<N>-spec.md`。该 spec 文件应包含指向本目录关联产物的链接（在 spec 开头 `关联产物` 字段中）。

## Git 追踪

本目录下的文件被 git 追踪（属于 `docs/` 的一部分）。如果产物文件过大，可后续考虑将 `artifacts/` 加入 `.gitignore`，不影响 `specs/` 的工作流。
