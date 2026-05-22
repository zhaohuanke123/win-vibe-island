---
name: command-spec
description: |
  新增 Bash 命令解析规格（TOML）。用于扩展声明式命令注册表，让 command_analyzer 能解析新的 Bash 命令。
  触发条件：
  - 用户要求解析新的 Bash 命令
  - "扩展命令注册表"、"添加 command spec"、"支持 xxx 命令解析"
  - 命令分析结果显示为 unknown 或未识别
  不要触发：与 Bash 命令解析无关的功能开发
---

# 命令规格添加流程

## 背景

项目使用声明式命令注册表（见 `docs/command-registry-design.md`），每个 Bash 命令的参数解析规则定义在 `src-tauri/src/command_specs/` 目录下的 TOML 文件中。编译时通过 `include_str!` 自动嵌入。

## 步骤

### 1. 确认命令需求

确定要支持的命令及其关键参数（flags、options、positional args）。

### 2. 创建 TOML 规格文件

在 `src-tauri/src/command_specs/` 创建 `<command-name>.toml`：

```toml
name = "command-name"
brief = "命令简述"

[[flags]]
short = "-a"
long = "--all"
description = "描述"

[[options]]
long = "--output"
metavar = "FILE"
description = "输出文件"

[[args]]
name = "source"
required = false
description = "源文件"
```

### 3. 验证自动嵌入

TOML 文件放在 `command_specs/` 目录后，`command_analyzer.rs` 会在编译时自动加载。

运行 `cargo check` 确认编译通过。

### 4. 测试解析

使用 `analyze_command` IPC 命令测试：

```typescript
const result = await invoke("analyze_command", { command: "command-name --flag value" });
```

## 参考

- 设计文档：`docs/command-registry-design.md`
- 现有规格：`src-tauri/src/command_specs/*.toml`（63 个命令）
- 解析器：`src-tauri/src/command_analyzer.rs`
- [[tauri-command]] — 对应的 IPC 命令流程

## 检查清单

- [ ] TOML 文件格式正确（参考已有规格）
- [ ] `cargo check` 编译通过
- [ ] 通过 `analyze_command` 验证解析结果
