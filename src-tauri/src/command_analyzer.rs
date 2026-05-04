use serde::Serialize;

// --- Data structures ---

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandAnalysis {
    pub shell: String,
    pub summary: String,
    pub commands: Vec<CommandNode>,
    pub risks: Vec<RiskItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommandNode {
    pub command: String,
    pub args: Vec<ArgNode>,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArgNode {
    pub text: String,
    pub meaning: String,
    pub risk_level: Option<RiskLevel>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RiskItem {
    pub level: RiskLevel,
    pub message: String,
    pub suggestion: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

// --- Public API ---

pub fn analyze_command(raw: &str) -> CommandAnalysis {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return CommandAnalysis {
            shell: "bash".to_string(),
            summary: "空命令".to_string(),
            commands: vec![],
            risks: vec![],
        };
    }

    let (segments, has_sudo) = tokenize(trimmed);
    let commands: Vec<CommandNode> = segments
        .iter()
        .map(|tokens| parse_segment(tokens))
        .collect();

    let mut risks = Vec::new();
    for cmd in &commands {
        risks.extend(detect_node_risks(cmd));
    }
    risks.extend(detect_chain_risks(&commands));

    if has_sudo {
        apply_sudo_risk(&mut risks);
    }

    let summary = summarize(&commands, &risks);

    CommandAnalysis {
        shell: "bash".to_string(),
        summary,
        commands,
        risks,
    }
}

// --- Tokenizer internals ---

fn split_segments(raw: &str) -> Vec<String> {
    // Split by pipe, &&, ||, ; while preserving quoted strings
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c == '\'' && !in_double {
            in_single = !in_single;
            current.push(c);
        } else if c == '"' && !in_single {
            in_double = !in_double;
            current.push(c);
        } else if !in_single && !in_double {
            if c == '|' {
                // Check for ||
                if i + 1 < chars.len() && chars[i + 1] == '|' {
                    segments.push(current.trim().to_string());
                    current.clear();
                    i += 2;
                    continue;
                }
                // Single | is pipe
                segments.push(current.trim().to_string());
                current.clear();
            } else if c == '&' {
                // Check for &&
                if i + 1 < chars.len() && chars[i + 1] == '&' {
                    segments.push(current.trim().to_string());
                    current.clear();
                    i += 2;
                    continue;
                }
                current.push(c);
            } else if c == ';' {
                segments.push(current.trim().to_string());
                current.clear();
            } else {
                current.push(c);
            }
        } else {
            current.push(c);
        }
        i += 1;
    }

    let last = current.trim().to_string();
    if !last.is_empty() {
        segments.push(last);
    }

    segments.retain(|s| !s.is_empty());
    segments
}

fn split_tokens(segment: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;

    for c in segment.chars() {
        if c == '\'' && !in_double {
            in_single = !in_single;
            current.push(c);
        } else if c == '"' && !in_single {
            in_double = !in_double;
            current.push(c);
        } else if (c == ' ' || c == '\t') && !in_single && !in_double {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn strip_sudo(tokens: &[String]) -> (Vec<String>, bool) {
    if tokens.first().map(|s| s.as_str()) == Some("sudo") {
        (tokens[1..].to_vec(), true)
    } else {
        (tokens.to_vec(), false)
    }
}

/// Commands whose combined short flags should be expanded (e.g., -rf -> -r, -f).
const EXPAND_FLAGS_COMMANDS: &[&str] = &["rm", "git"];

fn expand_known_flags(command: &str, args: &[String]) -> Vec<String> {
    if !EXPAND_FLAGS_COMMANDS.contains(&command) {
        return args.to_vec();
    }

    let mut expanded = Vec::new();
    for arg in args {
        if arg.starts_with('-') && !arg.starts_with("--") && arg.len() > 2 {
            // Combined short flags like -rf, -fd
            let flags: String = arg[1..].chars().filter(|c| c.is_ascii_alphabetic()).collect();
            for flag in flags.chars() {
                expanded.push(format!("-{flag}"));
            }
            // Preserve any non-alpha suffix (shouldn't happen for these commands, but safe)
        } else {
            expanded.push(arg.clone());
        }
    }
    expanded
}

fn tokenize(raw: &str) -> (Vec<Vec<String>>, bool) {
    let segments = split_segments(raw);
    let mut any_sudo = false;
    let mut result = Vec::new();

    for seg in &segments {
        let tokens = split_tokens(seg);
        let (tokens, has_sudo) = strip_sudo(&tokens);
        if has_sudo {
            any_sudo = true;
        }
        if tokens.is_empty() {
            continue;
        }
        let command = &tokens[0];
        let args = expand_known_flags(command, &tokens[1..]);
        let mut full = vec![command.clone()];
        full.extend(args);
        result.push(full);
    }

    (result, any_sudo)
}

// --- Segment parser ---

fn parse_segment(tokens: &[String]) -> CommandNode {
    if tokens.is_empty() {
        return CommandNode {
            command: String::new(),
            args: vec![],
            raw: String::new(),
        };
    }

    let command = tokens[0].clone();
    let raw = tokens.join(" ");
    let args: Vec<ArgNode> = tokens[1..]
        .iter()
        .map(|arg| explain_arg(&command, arg))
        .collect();

    CommandNode {
        command,
        args,
        raw,
    }
}

fn explain_arg(command: &str, arg: &str) -> ArgNode {
    match command {
        "rm" => explain_rm_arg(arg),
        "git" => explain_git_arg(arg),
        "npm" | "pnpm" | "yarn" => explain_package_arg(arg),
        "curl" | "wget" => explain_download_arg(arg),
        "chmod" => explain_chmod_arg(arg),
        "chown" => explain_chown_arg(arg),
        "find" => explain_find_arg(arg),
        "mv" => explain_mv_arg(arg),
        "cp" => explain_cp_arg(arg),
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "未识别参数".to_string(),
            risk_level: None,
        },
    }
}

fn explain_rm_arg(arg: &str) -> ArgNode {
    match arg {
        "-r" => ArgNode {
            text: arg.to_string(),
            meaning: "递归删除目录及其内容".to_string(),
            risk_level: Some(RiskLevel::High),
        },
        "-f" => ArgNode {
            text: arg.to_string(),
            meaning: "强制删除，不提示确认".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "-i" => ArgNode {
            text: arg.to_string(),
            meaning: "交互模式，删除前逐个确认".to_string(),
            risk_level: None,
        },
        "/" | "*" | "." => ArgNode {
            text: arg.to_string(),
            meaning: "危险目标路径，影响范围极大".to_string(),
            risk_level: Some(RiskLevel::High),
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "rm 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "删除目标路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_git_arg(arg: &str) -> ArgNode {
    match arg {
        "reset" => ArgNode {
            text: arg.to_string(),
            meaning: "重置当前 HEAD 到指定状态".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "--hard" => ArgNode {
            text: arg.to_string(),
            meaning: "强制重置工作区和暂存区，未提交修改将丢失".to_string(),
            risk_level: Some(RiskLevel::High),
        },
        "--soft" => ArgNode {
            text: arg.to_string(),
            meaning: "仅重置 HEAD，保留工作区和暂存区修改".to_string(),
            risk_level: None,
        },
        "--mixed" => ArgNode {
            text: arg.to_string(),
            meaning: "重置暂存区，保留工作区修改".to_string(),
            risk_level: None,
        },
        "clean" => ArgNode {
            text: arg.to_string(),
            meaning: "清理未被跟踪的文件".to_string(),
            risk_level: Some(RiskLevel::High),
        },
        "-f" => ArgNode {
            text: arg.to_string(),
            meaning: "强制执行".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "-d" => ArgNode {
            text: arg.to_string(),
            meaning: "包含未跟踪的目录".to_string(),
            risk_level: None,
        },
        "checkout" => ArgNode {
            text: arg.to_string(),
            meaning: "切换分支或恢复文件".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "--" => ArgNode {
            text: arg.to_string(),
            meaning: "分隔符，后续参数为文件路径".to_string(),
            risk_level: None,
        },
        "restore" => ArgNode {
            text: arg.to_string(),
            meaning: "恢复工作区或暂存区文件".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "--staged" => ArgNode {
            text: arg.to_string(),
            meaning: "操作暂存区而非工作区".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "-C" => ArgNode {
            text: arg.to_string(),
            meaning: "指定 Git 仓库路径".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "Git 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "Git 参数".to_string(),
            risk_level: None,
        },
    }
}

fn explain_package_arg(arg: &str) -> ArgNode {
    match arg {
        "install" | "i" | "add" => ArgNode {
            text: arg.to_string(),
            meaning: "安装项目依赖".to_string(),
            risk_level: Some(RiskLevel::Low),
        },
        "-g" | "--global" => ArgNode {
            text: arg.to_string(),
            meaning: "全局安装，修改全局环境".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "--save-dev" | "-D" | "--dev" => ArgNode {
            text: arg.to_string(),
            meaning: "安装为开发依赖".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "包管理器选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "包名或目标".to_string(),
            risk_level: None,
        },
    }
}

fn explain_download_arg(arg: &str) -> ArgNode {
    match arg {
        "-fsSL" | "-sSL" => ArgNode {
            text: arg.to_string(),
            meaning: "静默模式，跟随重定向，显示错误".to_string(),
            risk_level: None,
        },
        "-qO-" => ArgNode {
            text: arg.to_string(),
            meaning: "静默模式，输出到 stdout".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "下载工具选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "目标 URL".to_string(),
            risk_level: None,
        },
    }
}

fn explain_chmod_arg(arg: &str) -> ArgNode {
    match arg {
        "777" | "a+rwx" => ArgNode {
            text: arg.to_string(),
            meaning: "设置所有用户可读写执行，权限过于宽松".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "+x" => ArgNode {
            text: arg.to_string(),
            meaning: "添加可执行权限".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "chmod 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "权限模式".to_string(),
            risk_level: None,
        },
    }
}

fn explain_chown_arg(arg: &str) -> ArgNode {
    match arg {
        "-R" => ArgNode {
            text: arg.to_string(),
            meaning: "递归修改所有者".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "chown 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "所有者或文件路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_find_arg(arg: &str) -> ArgNode {
    match arg {
        "-delete" => ArgNode {
            text: arg.to_string(),
            meaning: "删除匹配的文件".to_string(),
            risk_level: Some(RiskLevel::High),
        },
        "-name" => ArgNode {
            text: arg.to_string(),
            meaning: "按文件名匹配".to_string(),
            risk_level: None,
        },
        "-type" => ArgNode {
            text: arg.to_string(),
            meaning: "按文件类型筛选".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "find 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "搜索路径或参数值".to_string(),
            risk_level: None,
        },
    }
}

fn explain_mv_arg(arg: &str) -> ArgNode {
    match arg {
        "-f" => ArgNode {
            text: arg.to_string(),
            meaning: "强制覆盖，不提示确认".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "mv 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "源或目标路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_cp_arg(arg: &str) -> ArgNode {
    match arg {
        "-r" | "-R" => ArgNode {
            text: arg.to_string(),
            meaning: "递归复制目录".to_string(),
            risk_level: None,
        },
        "-f" => ArgNode {
            text: arg.to_string(),
            meaning: "强制覆盖已存在的文件".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "cp 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "源或目标路径".to_string(),
            risk_level: None,
        },
    }
}

// --- Risk detection ---

fn detect_node_risks(node: &CommandNode) -> Vec<RiskItem> {
    let mut risks = Vec::new();
    let cmd = node.command.as_str();
    let arg_texts: Vec<&str> = node.args.iter().map(|a| a.text.as_str()).collect();

    match cmd {
        "rm" => {
            let has_r = arg_texts.iter().any(|a| *a == "-r");
            let has_f = arg_texts.iter().any(|a| *a == "-f");
            let targets: Vec<&&str> = arg_texts
                .iter()
                .filter(|a| !a.starts_with('-'))
                .collect();

            if has_r && has_f {
                let is_wildcard = targets.iter().any(|t| **t == "/" || **t == "*" || **t == ".");
                if is_wildcard {
                    risks.push(RiskItem {
                        level: RiskLevel::High,
                        message: "rm -rf 将删除大量文件，可能影响整个文件系统".to_string(),
                        suggestion: "极度危险，强烈建议人工确认后再执行".to_string(),
                    });
                } else {
                    risks.push(RiskItem {
                        level: RiskLevel::High,
                        message: "rm -rf 将递归强制删除目录及其内容，通常不可恢复".to_string(),
                        suggestion: "确认目标路径正确，且内容可重新生成后再执行".to_string(),
                    });
                }
            } else if has_r {
                risks.push(RiskItem {
                    level: RiskLevel::High,
                    message: "rm -r 将递归删除目录及其内容".to_string(),
                    suggestion: "确认目标路径正确，考虑使用交互模式 (-i)".to_string(),
                });
            } else if has_f {
                risks.push(RiskItem {
                    level: RiskLevel::Medium,
                    message: "rm -f 将强制删除文件，不提示确认".to_string(),
                    suggestion: "确认不需要确认提示".to_string(),
                });
            }
        }
        "git" => {
            let has_reset = arg_texts.iter().any(|a| *a == "reset");
            let has_hard = arg_texts.iter().any(|a| *a == "--hard");
            let has_clean = arg_texts.iter().any(|a| *a == "clean");
            let has_checkout = arg_texts.iter().any(|a| *a == "checkout");
            let has_restore = arg_texts.iter().any(|a| *a == "restore");
            let has_staged = arg_texts.iter().any(|a| *a == "--staged");
            let has_f = arg_texts.iter().any(|a| *a == "-f");
            let has_ddash = arg_texts.iter().any(|a| *a == "--");

            if has_reset && has_hard {
                risks.push(RiskItem {
                    level: RiskLevel::High,
                    message: "git reset --hard 将重置工作区和暂存区，未提交修改将丢失".to_string(),
                    suggestion: "先 git stash 保存当前修改，或确认无未提交的重要修改".to_string(),
                });
            }
            if has_clean && has_f {
                risks.push(RiskItem {
                    level: RiskLevel::High,
                    message: "git clean -f 将永久删除未跟踪的文件，不可恢复".to_string(),
                    suggestion: "先 git clean -n 预览将被删除的文件".to_string(),
                });
            }
            if has_checkout && has_ddash {
                risks.push(RiskItem {
                    level: RiskLevel::Medium,
                    message: "git checkout -- 将放弃工作目录中文件的修改".to_string(),
                    suggestion: "确认不需要保留这些修改".to_string(),
                });
            }
            if has_restore && has_staged {
                risks.push(RiskItem {
                    level: RiskLevel::Medium,
                    message: "git restore --staged 将取消暂存文件".to_string(),
                    suggestion: "确认这些文件不需要提交".to_string(),
                });
            } else if has_restore {
                risks.push(RiskItem {
                    level: RiskLevel::Medium,
                    message: "git restore 将放弃工作区中文件的修改".to_string(),
                    suggestion: "确认不需要保留这些修改".to_string(),
                });
            }
        }
        "chmod" => {
            if arg_texts.iter().any(|a| *a == "777" || *a == "a+rwx") {
                risks.push(RiskItem {
                    level: RiskLevel::Medium,
                    message: "chmod 设置了过于宽松的文件权限".to_string(),
                    suggestion: "考虑使用更严格的权限，如 755 或 644".to_string(),
                });
            }
        }
        "find" => {
            if arg_texts.iter().any(|a| *a == "-delete") {
                risks.push(RiskItem {
                    level: RiskLevel::High,
                    message: "find -delete 将删除所有匹配的文件".to_string(),
                    suggestion: "先不加 -delete 运行，确认匹配结果正确后再执行".to_string(),
                });
            }
        }
        "npm" | "pnpm" | "yarn" => {
            if arg_texts
                .iter()
                .any(|a| *a == "install" || *a == "i" || *a == "add")
            {
                risks.push(RiskItem {
                    level: RiskLevel::Low,
                    message: "安装项目依赖".to_string(),
                    suggestion: "无特殊风险".to_string(),
                });
            }
        }
        _ => {}
    }

    risks
}

fn detect_chain_risks(commands: &[CommandNode]) -> Vec<RiskItem> {
    let mut risks = Vec::new();

    if commands.len() < 2 {
        return risks;
    }

    // Check for download-to-shell pipe patterns
    for i in 0..commands.len() - 1 {
        let left = &commands[i];
        let right = &commands[i + 1];

        let is_download = left.command == "curl" || left.command == "wget";
        let is_shell = right.command == "sh"
            || right.command == "bash"
            || right.command == "dash"
            || right.command == "zsh";

        if is_download && is_shell {
            risks.push(RiskItem {
                level: RiskLevel::High,
                message: format!(
                    "{} | {} 从远程 URL 下载并直接执行脚本，存在代码注入风险",
                    left.command, right.command
                ),
                suggestion: "先下载脚本审查内容，再决定是否执行".to_string(),
            });
        }
    }

    risks
}

fn apply_sudo_risk(risks: &mut Vec<RiskItem>) {
    for risk in risks.iter_mut() {
        if risk.level == RiskLevel::High {
            risk.message = format!("{}，且使用 sudo 放大影响范围", risk.message);
        }
    }
    risks.push(RiskItem {
        level: RiskLevel::Medium,
        message: "使用管理员权限执行，影响范围扩大".to_string(),
        suggestion: "确认该命令确实需要提升权限".to_string(),
    });
}

fn summarize(commands: &[CommandNode], risks: &[RiskItem]) -> String {
    if commands.is_empty() {
        return "空命令".to_string();
    }

    let max_risk = risks.iter().map(|r| &r.level).max();

    let cmd_summary = match commands.len() {
        1 => {
            let cmd = &commands[0];
            match cmd.command.as_str() {
                "rm" => "删除文件或目录".to_string(),
                "git" => {
                    let subcmd = cmd
                        .args
                        .first()
                        .map(|a| a.text.as_str())
                        .unwrap_or("操作");
                    format!("执行 Git {subcmd}")
                }
                "npm" | "pnpm" | "yarn" => "执行包管理命令".to_string(),
                "curl" | "wget" => "下载文件或数据".to_string(),
                "chmod" => "修改文件权限".to_string(),
                "chown" => "修改文件所有者".to_string(),
                "find" => "搜索文件".to_string(),
                "mv" => "移动或重命名文件".to_string(),
                "cp" => "复制文件".to_string(),
                _ => format!("执行 {}", cmd.command),
            }
        }
        n => format!("包含 {n} 个命令的管道/链式操作"),
    };

    match max_risk {
        Some(RiskLevel::High) => format!("{cmd_summary}（高风险）"),
        Some(RiskLevel::Medium) => format!("{cmd_summary}（中风险）"),
        Some(RiskLevel::Low) => format!("{cmd_summary}（低风险）"),
        None => cmd_summary,
    }
}

// --- Unit tests ---

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_command() {
        let result = analyze_command("");
        assert!(result.commands.is_empty());
        assert!(result.risks.is_empty());
        assert_eq!(result.summary, "空命令");
    }

    #[test]
    fn test_whitespace_command() {
        let result = analyze_command("   ");
        assert!(result.commands.is_empty());
    }

    #[test]
    fn test_rm_rf_dist() {
        let result = analyze_command("rm -rf ./dist");
        assert_eq!(result.commands.len(), 1);
        let cmd = &result.commands[0];
        assert_eq!(cmd.command, "rm");
        // -rf should be expanded to -r, -f
        assert_eq!(cmd.args.len(), 3);
        assert_eq!(cmd.args[0].text, "-r");
        assert_eq!(cmd.args[1].text, "-f");
        assert_eq!(cmd.args[2].text, "./dist");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::High));
    }

    #[test]
    fn test_rm_rf_wildcard() {
        let result = analyze_command("rm -rf *");
        let high_risks: Vec<_> = result
            .risks
            .iter()
            .filter(|r| r.level == RiskLevel::High)
            .collect();
        assert!(!high_risks.is_empty());
        assert!(high_risks[0].message.contains("大量文件"));
    }

    #[test]
    fn test_rm_rf_root() {
        let result = analyze_command("rm -rf /");
        let high_risks: Vec<_> = result
            .risks
            .iter()
            .filter(|r| r.level == RiskLevel::High)
            .collect();
        assert!(!high_risks.is_empty());
        assert!(high_risks[0].message.contains("文件系统"));
    }

    #[test]
    fn test_sudo_rm_rf() {
        let result = analyze_command("sudo rm -rf ./build");
        let high_risks: Vec<_> = result
            .risks
            .iter()
            .filter(|r| r.level == RiskLevel::High)
            .collect();
        assert!(!high_risks.is_empty());
        assert!(high_risks[0].message.contains("sudo"));
        // Should also have a separate sudo Medium risk
        let sudo_risks: Vec<_> = result
            .risks
            .iter()
            .filter(|r| r.message.contains("管理员权限"))
            .collect();
        assert!(!sudo_risks.is_empty());
    }

    #[test]
    fn test_git_reset_hard() {
        let result = analyze_command("git reset --hard HEAD");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::High));
        let hard_risk = result
            .risks
            .iter()
            .find(|r| r.message.contains("reset --hard"))
            .unwrap();
        assert_eq!(hard_risk.level, RiskLevel::High);
    }

    #[test]
    fn test_git_clean_fd() {
        let result = analyze_command("git clean -fd");
        // args: clean (subcommand), -f, -d (expanded from -fd)
        assert_eq!(result.commands[0].args.len(), 3);
        assert_eq!(result.commands[0].args[0].text, "clean");
        assert_eq!(result.commands[0].args[1].text, "-f");
        assert_eq!(result.commands[0].args[2].text, "-d");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::High));
    }

    #[test]
    fn test_git_checkout_file() {
        let result = analyze_command("git checkout -- src/main.rs");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Medium));
    }

    #[test]
    fn test_git_restore() {
        let result = analyze_command("git restore src/main.rs");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Medium));
        assert!(result
            .risks
            .iter()
            .any(|r| r.message.contains("工作区")));
    }

    #[test]
    fn test_git_restore_staged() {
        let result = analyze_command("git restore --staged .");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Medium));
        assert!(result.risks.iter().any(|r| r.message.contains("暂存")));
    }

    #[test]
    fn test_curl_pipe_sh() {
        let result = analyze_command("curl https://x.sh | sh");
        assert!(result.commands.len() >= 2);
        assert!(result
            .risks
            .iter()
            .any(|r| r.message.contains("代码注入")));
    }

    #[test]
    fn test_curl_pipe_bash() {
        let result = analyze_command("curl -fsSL https://x | bash");
        assert!(result
            .risks
            .iter()
            .any(|r| r.message.contains("代码注入")));
    }

    #[test]
    fn test_curl_pipe_bash_s() {
        let result = analyze_command("curl https://x | bash -s");
        assert!(result
            .risks
            .iter()
            .any(|r| r.message.contains("代码注入")));
    }

    #[test]
    fn test_wget_pipe_bash() {
        let result = analyze_command("wget -qO- https://x | bash");
        assert!(result
            .risks
            .iter()
            .any(|r| r.message.contains("代码注入")));
        assert!(result.risks.iter().any(|r| r.message.contains("wget")));
    }

    #[test]
    fn test_chmod_777() {
        let result = analyze_command("chmod 777 ./script.sh");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Medium));
        assert!(result.risks.iter().any(|r| r.message.contains("宽松")));
    }

    #[test]
    fn test_find_delete() {
        let result = analyze_command("find . -name \"*.tmp\" -delete");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::High));
        assert!(result.risks.iter().any(|r| r.message.contains("删除")));
    }

    #[test]
    fn test_npm_install() {
        let result = analyze_command("npm install");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Low));
    }

    #[test]
    fn test_pnpm_install() {
        let result = analyze_command("pnpm install");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::Low));
    }

    #[test]
    fn test_echo_hello() {
        let result = analyze_command("echo \"hello\"");
        assert!(result.risks.is_empty());
        assert_eq!(result.commands[0].command, "echo");
    }

    #[test]
    fn test_split_segments() {
        let segments = split_segments("a | b && c");
        assert_eq!(segments, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_split_segments_semicolon() {
        let segments = split_segments("a; b; c");
        assert_eq!(segments, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_split_segments_or() {
        let segments = split_segments("a || b");
        assert_eq!(segments, vec!["a", "b"]);
    }

    #[test]
    fn test_strip_sudo() {
        let (tokens, has_sudo) = strip_sudo(&[
            "sudo".to_string(),
            "rm".to_string(),
            "-rf".to_string(),
        ]);
        assert!(has_sudo);
        assert_eq!(tokens, vec!["rm", "-rf"]);
    }

    #[test]
    fn test_expand_flags() {
        let expanded = expand_known_flags("rm", &["-rf".to_string(), "./dist".to_string()]);
        assert_eq!(expanded, vec!["-r", "-f", "./dist"]);
    }

    #[test]
    fn test_git_with_global_flag() {
        let result = analyze_command("git -C repo reset --hard HEAD");
        assert!(result.risks.iter().any(|r| r.level == RiskLevel::High));
    }
}
