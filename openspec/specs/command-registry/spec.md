# Command Registry Specification

## Purpose

定义声明式 Bash 命令解析注册表：每个 Bash 命令的参数解析规则用 TOML 文件描述，编译时自动嵌入，`command_analyzer` 据此解析前端传来的命令字符串。

实现参考：`src-tauri/src/command_analyzer.rs`、`src-tauri/src/command_specs/*.toml`、`docs/command-registry-design.md`。

## Requirements

### Requirement: TOML Spec Structure

每个 Bash 命令的解析规格 MUST (MUST) 定义在 `src-tauri/src/command_specs/<command>.toml`，且 MUST (MUST) 含 `name`（命令名）与 `brief`（简述）字段。

#### Scenario: 新增命令规格

- **WHEN** 为 `git` 命令新增解析规格
- **THEN** `src-tauri/src/command_specs/git.toml` MUST 含 `name = "git"` 和 `brief = "..."`

### Requirement: Argument Sections

可选参数 MUST (MUST) 用 `[[flags]]`（短/长 flag，如 `-a` / `--all`）、`[[options]]`（带值选项，含 `metavar`）、`[[args]]`（位置参数，含 `required`）三个段表达。每个条目 MUST (MUST) 含 `description`。

#### Scenario: flag 与 option 区分

- **WHEN** 命令有 `--output FILE`（带值）和 `--force`（无值）
- **THEN** `--output` MUST 进 `[[options]]` 段（含 `metavar = "FILE"`），`--force` MUST 进 `[[flags]]` 段

### Requirement: Compile-Time Embedding

`command_specs/*.toml` MUST (MUST) 通过 `include_str!` 在编译时自动嵌入 `command_analyzer`；新增 TOML 文件 MUST (MUST) 自动进入注册表，无需手动注册代码。

#### Scenario: 新增 TOML 文件

- **WHEN** 开发者放入新 `<cmd>.toml` 后运行 `cargo check`
- **THEN** 新规格 MUST 自动可用，通过 `analyze_command` IPC 即可解析该命令，无需改 Rust 注册代码

### Requirement: Analysis via IPC

命令解析 MUST (MUST) 通过 `analyze_command` IPC 命令触发，返回结构化解析结果。

#### Scenario: 前端解析命令

- **WHEN** 前端 `invoke("analyze_command", { command: "git --force push" })`
- **THEN** MUST 返回结构化结果（识别出的命令、flags、options、args），未知命令返回 unknown 标记
