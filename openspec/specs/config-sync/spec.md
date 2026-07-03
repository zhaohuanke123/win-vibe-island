# Config Sync Specification

## Purpose

定义 Rust 后端与前端双端 UI 配置默认值的一致性不变量。
这是 `scripts/config-sync.js`（域内确定性门禁）守护的承重不变量，也是 `.claude/rules/ArchitectureConstraints.md` 第 6 条「配置治理」的行为真相源。
任何 UI 配置默认值的变更必须 (MUST)在 Rust 与前端两处同步，否则 `cargo check && npm run build && config-sync.js --strict` 将失败。

实现参考：
- Rust 默认值：`src-tauri/src/config/types.rs`
- 前端默认值：`frontend/src/store/config.ts`
- 设计令牌（中间桥梁）：`frontend/src/config/design-tokens.json`
- CSS 变量：`frontend/src/index.css`
- 动画参数：`frontend/src/config/animation.ts`

## Requirements

### Requirement: Five Config Categories Dual-Default Parity

以下 5 类配置的默认值必须 (MUST)在 Rust（`src-tauri/src/config/types.rs`）与前端（`frontend/src/store/config.ts`）两处保持一致：

| 配置类别 | Rust 结构 | 前端字段 |
|----------|-----------|----------|
| 状态色 | `StateColors` | `DEFAULT_CONFIG.ui.stateColors` |
| 弹簧参数 | `SpringConfig` | `DEFAULT_CONFIG.ui.animation.spring` |
| 动画时长 | `AnimationConfig` | `DEFAULT_CONFIG.ui.animation` |
| UI 尺寸 | `UiDimensions` | `DEFAULT_CONFIG.ui.dimensions` |
| Overlay 尺寸 | `OverlayConfigDefaults` | `DEFAULT_CONFIG.overlay` |

每类下的具体键（如 idle/running/waitingForApproval/...、expand/collapse/transition/micro 弹簧、barHeight/padding/gap/statusDotSize、compactWidth/expandedWidth/各种 radius 等）必须 (MUST)一一对应。

#### Scenario: 只改一端

- **WHEN** 开发者只修改了 Rust `StateColors.idle` 而未同步前端 `stateColors.idle`
- **THEN** `config-sync.js --strict` 必须 (MUST)报错并指出差异；`cargo check && npm run build` 不得放行

#### Scenario: 两端同步修改

- **WHEN** 5 类中任一默认值在 Rust 与前端被同步为相同值
- **THEN** `cargo check && npm run build && config-sync.js --strict` 全部通过

### Requirement: Deep Merge Semantics

Rust 端 `get_app_config` 返回的用户配置必须 (MUST) **deep merge** 到前端默认值之上，**不得**整体替换。
用户未显式配置的字段必须 (MUST)保留前端默认值。

#### Scenario: 用户部分配置

- **WHEN** 用户配置只覆盖了 `ui.stateColors.idle`，未提供其他状态色
- **THEN** 前端最终配置中其他状态色必须 (MUST)保留前端默认值，不得变成 null / undefined

### Requirement: Design Tokens Consistency

`config-sync.js` 的 5 阶段一致性检查必须 (MUST)全部通过：

1. CSS 变量（`frontend/src/index.css`）↔ `design-tokens.json`
2. 前端 `config.ts` ↔ `design-tokens.json`
3. Rust `types.rs` ↔ 前端 `config.ts` 双向（5 类配置）
4. `animation.ts` ↔ `design-tokens.json`
5. BEM 命名规范（warning-only）

#### Scenario: design-tokens 与 CSS 不一致

- **WHEN** `design-tokens.json` 中某个色值更新但 CSS 变量未同步
- **THEN** `config-sync.js --strict` 必须 (MUST)在第 1 阶段报错并阻塞

### Requirement: Verification Gates

任何涉及 UI 配置默认值的变更必须 (MUST)通过以下验证（按相关性选取）：

- `cargo check`（Rust 端编译）
- `npm run build`（前端编译）
- `node scripts/config-sync.js --strict`（双端一致性）

CI 必须 (MUST)在每次 PR / push 到 master 时运行 `config-sync.js --strict`。

#### Scenario: CI 拦截

- **WHEN** PR 修改了配置默认值但未通过 `config-sync.js --strict`
- **THEN** CI 必须 (MUST)红，PR 不得合并
