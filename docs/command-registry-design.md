# Command Registry Design — 声明式命令解析规格系统

## 1. 背景

`command_analyzer.rs` 中每个命令都有手写的 `explain_xxx_arg()` 函数（共 8 个），通过 match 分支逐个解释参数含义和风险等级。这种方式存在以下问题：

- **不可扩展**：新增命令必须改源码，编写新的 match 函数
- **参数遗漏**：手写容易遗漏选项，无法与实际命令保持同步
- **重复模式**：大部分函数逻辑相同（匹配选项 → 返回 ArgNode），只有数据不同

## 2. 解决方案

将命令参数规格外部化为 **TOML 配置文件**，用**通用解释器**替代手写 match。

### 2.1 架构概览

```
src-tauri/src/command_specs/    ← TOML 规格文件（编译时 include_str! 嵌入）
    rm.toml
    git.toml
    _risk_patterns.toml         ← 全局风险模式
            ↓
command_analyzer.rs             ← 通用解释器读取规格
    load_specs()                ← 启动时解析 TOML → HashMap<String, CommandSpec>
    explain_arg_from_spec()     ← 替代 explain_rm_arg() 等
    detect_node_risks()         ← 从 spec.risk_patterns + 全局模式驱动
```

### 2.2 数据来源补充链

TOML 规格文件可从多种来源自动生成或辅助编写：

| 来源 | 方向 | 优先级 | 说明 |
|------|------|--------|------|
| tldr-pages | 方向 2 | P1 | 解析 Markdown 页面提取选项 → 自动生成初始 TOML |
| Shell Completion | 方向 5 | P2 | 解析 zsh/bash 补全脚本 → 补充选项名 |
| `--help` 解析 | 方向 6 | P2 | 解析帮助输出 → 补充选项描述 |
| Man Page | 方向 3 | P3 | 离线 CI 解析 → 完整性检查 |
| LLM | 方向 4 | 参考 | 人工编写时辅助查询选项含义和风险 |
| Cheat Sheet | 方向 8 | P3 | cheat.sh/navi 格式 → 常用示例 |

工具脚本存放在 `tools/` 目录，不参与 Cargo 编译。

## 3. TOML 规格文件格式

### 3.1 CommandSpec 结构

```toml
[command]
name = "rm"                          # 命令名（必需）
description = "删除文件或目录"         # 命令描述（必需）
risk_base = "medium"                 # 基础风险等级（可选：low/medium/high）
aliases = []                         # 命令别名（可选，如 ["del"]）

# 选项列表
[[command.options]]
short = "-r"                         # 短选项（可选）
long = "--recursive"                  # 长选项（可选）
description = "递归删除目录及其内容"   # 选项描述（必需）
takes_value = false                   # 是否接受参数值（可选，默认 false）
risk = "high"                         # 风险等级（可选）

# 子命令（可选，如 git 有 reset/clean/checkout 等）
[[command.subcommands]]
name = "reset"
description = "重置当前 HEAD 到指定状态"
risk = "medium"

[[command.subcommands.options]]
short = ""
long = "--hard"
description = "强制重置工作区和暂存区"
risk = "high"

# 命令特定的风险模式（可选，正则匹配非选项参数）
[[command.risk_patterns]]
pattern = "^/|^(\\*)|^(\\.)$"
risk = "high"
message = "危险目标路径，影响范围极大"
```

### 3.2 全局风险模式

`_risk_patterns.toml` 定义跨命令适用的通用风险检测：

```toml
[[patterns]]
pattern = "^--force$|-f$"            # 正则表达式
risk = "medium"                      # 风险等级
message = "强制执行选项"              # 风险描述
applies_to = "*"                     # 适用命令（* = 所有）

[[patterns]]
pattern = "^-(r|R)|--recursive$"
risk = "medium"
message = "递归操作"
applies_to = "rm,chown,chmod"
```

### 3.3 文件命名约定

- 文件名 = 命令名 + `.toml`（如 `rm.toml`、`git.toml`）
- 多命令共用规格时，用主命令名命名（如 `package.toml` 覆盖 npm/pnpm/yarn）
- `_` 前缀为系统文件（`_risk_patterns.toml`）

## 4. 运行时加载

### 4.1 编译时嵌入

使用 `include_str!` 宏在编译时将 TOML 文件内容嵌入二进制：

```rust
const RM_SPEC: &str = include_str!("command_specs/rm.toml");
const GIT_SPEC: &str = include_str!("command_specs/git.toml");
// ...
```

**优点**：
- 无文件 I/O 开销，启动即用
- 编译时发现文件缺失
- 单文件分发，无需额外资源

### 4.2 解析时机

`load_specs()` 使用 `lazy_static` / `OnceLock` 在首次调用时解析，后续调用直接返回缓存。

```rust
use std::sync::OnceLock;

static SPECS: OnceLock<HashMap<String, CommandSpec>> = OnceLock::new();

fn get_specs() -> &'static HashMap<String, CommandSpec> {
    SPECS.get_or_init(|| {
        let mut map = HashMap::new();
        for (name, toml_str) in ALL_SPECS {
            match toml::from_str::<CommandSpec>(toml_str) {
                Ok(spec) => {
                    map.insert(name.to_string(), spec);
                    // 注册别名
                    for alias in &spec.command.aliases {
                        map.insert(alias.clone(), spec.clone());
                    }
                }
                Err(e) => log::error!("Failed to parse spec {}: {}", name, e),
            }
        }
        map
    })
}
```

## 5. 通用解释器

### 5.1 explain_arg_from_spec

```rust
fn explain_arg_from_spec(spec: &CommandSpec, arg: &str) -> ArgNode {
    // 1. 匹配子命令（如果有）
    if let Some(subs) = &spec.subcommands {
        for sub in subs {
            if sub.name == arg {
                return ArgNode {
                    text: arg.to_string(),
                    meaning: sub.description.clone(),
                    risk_level: sub.risk.clone(),
                };
            }
        }
    }

    // 2. 匹配选项
    let all_options = collect_options(spec);
    for opt in &all_options {
        if opt.short.as_deref() == Some(arg) || opt.long.as_deref() == Some(arg) {
            return ArgNode {
                text: arg.to_string(),
                meaning: opt.description.clone(),
                risk_level: opt.risk.clone(),
            };
        }
    }

    // 3. 匹配风险模式（非选项参数）
    if !arg.starts_with('-') {
        if let Some(patterns) = &spec.risk_patterns {
            for rp in patterns {
                if Regex::new(&rp.pattern).map(|r| r.is_match(arg)).unwrap_or(false) {
                    return ArgNode {
                        text: arg.to_string(),
                        meaning: rp.message.clone(),
                        risk_level: Some(rp.risk.clone()),
                    };
                }
            }
        }
    }

    // 4. 兜底
    if arg.starts_with('-') {
        ArgNode {
            text: arg.to_string(),
            meaning: format!("{} 选项", spec.command.name),
            risk_level: None,
        }
    } else {
        ArgNode {
            text: arg.to_string(),
            meaning: "参数".to_string(),
            risk_level: None,
        }
    }
}
```

### 5.2 explain_arg 路由

```rust
fn explain_arg(command: &str, arg: &str) -> ArgNode {
    let specs = get_specs();
    if let Some(spec) = specs.get(command) {
        return explain_arg_from_spec(spec, arg);
    }
    // 未注册命令：全局风险模式兜底
    explain_arg_fallback(command, arg)
}
```

## 6. 数据驱动风险检测

### 6.1 detect_node_risks

```rust
fn detect_node_risks(node: &CommandNode) -> Vec<RiskItem> {
    let mut risks = Vec::new();
    let specs = get_specs();

    if let Some(spec) = specs.get(&node.command) {
        // 从 spec 的 risk_patterns 提取风险
        risks.extend(detect_spec_risks(node, spec));
    }

    // 全局风险模式兜底（对所有命令生效）
    risks.extend(detect_global_risks(node));

    risks
}
```

### 6.2 detect_chain_risks

管道链风险（`curl | bash`）从全局 `_risk_patterns.toml` 读取，不再硬编码。

## 7. 向后兼容

- **Public API 不变**：`analyze_command(raw: &str) -> CommandAnalysis`
- **输出结构不变**：`CommandAnalysis` / `CommandNode` / `ArgNode` / `RiskItem` / `RiskLevel` 保持原样
- **渐进迁移**：先实现通用解释器，确保所有现有测试通过，再删除旧代码
- **现有 26 个测试必须全部通过**

## 8. 新增依赖

```toml
# src-tauri/Cargo.toml
toml = "0.8"      # TOML 解析
regex = "1"       # 风险模式正则匹配
```

## 9. 数据来源工具

### 9.1 tools/gen-specs-from-tldr.py

从 tldr-pages 仓库解析 Markdown 页面，提取命令选项生成初始 TOML。

工作流程：
1. Clone tldr-pages/tldr 仓库
2. 解析 `pages/common/*.md`
3. 从示例行提取：命令名、选项、描述
4. 输出 TOML 到 `src-tauri/src/command_specs/`
5. 已有规格的命令跳过

### 9.2 tools/gen-specs-from-completions.py

解析 zsh/bash 补全脚本提取选项名和描述。

### 9.3 tools/gen-specs-from-help.py

执行 `cmd --help` 解析 GNU/BSD 格式帮助输出。

### 9.4 整合流程

```
tldr-pages ──→ 初始 TOML（~100 命令）
Completion ──→ 补充选项名称
--help     ──→ 补充选项描述
Man Page   ──→ 完整性检查
LLM        ──→ 人工编写时参考

所有输出 → command_specs/*.toml → 人工审查 → cargo build 编译嵌入
```
