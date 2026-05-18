use serde::Serialize;
use tree_sitter::{Language, Node, Parser};

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

    let segments = parse_bash_to_segments(trimmed);

    let mut any_sudo = false;
    let commands: Vec<CommandNode> = segments
        .into_iter()
        .filter_map(|tokens| {
            if tokens.is_empty() {
                return None;
            }
            let (tokens, has_sudo) = strip_sudo(&tokens);
            if has_sudo {
                any_sudo = true;
            }
            if tokens.is_empty() {
                return None;
            }
            let command = &tokens[0];
            let args = expand_known_flags(command, &tokens[1..]);
            let mut full = vec![command.clone()];
            full.extend(args);
            Some(parse_segment(&full))
        })
        .collect();

    let mut risks = Vec::new();
    for cmd in &commands {
        risks.extend(detect_node_risks(cmd));
    }
    risks.extend(detect_chain_risks(&commands));

    if any_sudo {
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

// --- Tree-sitter parsing ---

fn parse_bash_to_segments(source: &str) -> Vec<Vec<String>> {
    let language = Language::from(tree_sitter_bash::LANGUAGE);
    let mut parser = Parser::new();
    if parser.set_language(&language).is_err() {
        return fallback_shlex(source);
    }

    let tree = match parser.parse(source, None) {
        Some(t) => t,
        None => return fallback_shlex(source),
    };

    let root = tree.root_node();
    let mut segments = Vec::new();
    collect_segments(&root, source, &mut segments);

    if segments.is_empty() {
        fallback_shlex(source)
    } else {
        segments
    }
}

fn fallback_shlex(source: &str) -> Vec<Vec<String>> {
    match shlex::split(source) {
        Some(tokens) if !tokens.is_empty() => vec![tokens],
        _ => vec![],
    }
}

fn collect_segments(node: &Node, source: &str, segments: &mut Vec<Vec<String>>) {
    let kind = node.kind();
    match kind {
        "program" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() {
                    collect_segments(&child, source, segments);
                }
            }
        }
        "pipeline" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() && child.kind() != "|&" {
                    collect_segments(&child, source, segments);
                }
            }
        }
        "list" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() {
                    collect_segments(&child, source, segments);
                }
            }
        }
        "redirected_statement" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                let ck = child.kind();
                if ck == "command" || ck == "subshell" || ck == "pipeline" || ck == "list" {
                    collect_segments(&child, source, segments);
                }
            }
        }
        "subshell" | "compound_statement" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() {
                    collect_segments(&child, source, segments);
                }
            }
        }
        "command" => {
            let tokens = extract_command_tokens(node, source);
            if !tokens.is_empty() {
                segments.push(tokens);
            }
        }
        "negated_command" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "command" {
                    let tokens = extract_command_tokens(&child, source);
                    if !tokens.is_empty() {
                        segments.push(tokens);
                    }
                }
            }
        }
        "if_statement" | "while_statement" | "for_statement" | "case_statement"
        | "c_style_for_statement" | "function_definition" | "declaration_command" => {
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.is_named() {
                    collect_segments(&child, source, segments);
                }
            }
        }
        _ => {}
    }
}

fn extract_command_tokens(node: &Node, source: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if !child.is_named() {
            continue;
        }
        let kind = child.kind();
        match kind {
            "command_name" => {
                if let Ok(text) = child.utf8_text(source.as_bytes()) {
                    tokens.push(text.to_string());
                }
            }
            "word" | "string" | "raw_string" | "simple_expansion" | "expansion"
            | "command_substitution" | "concatenation" | "ansi_c_string"
            | "process_substitution" | "variable_assignment" | "variable_name"
            | "number" | "test_operator" => {
                if let Ok(text) = child.utf8_text(source.as_bytes()) {
                    tokens.push(text.to_string());
                }
            }
            _ => {}
        }
    }

    tokens
}

// --- Token processing ---

fn strip_sudo(tokens: &[String]) -> (Vec<String>, bool) {
    if tokens.first().map(|s| s.as_str()) == Some("sudo") {
        (tokens[1..].to_vec(), true)
    } else {
        (tokens.to_vec(), false)
    }
}

const EXPAND_FLAGS_COMMANDS: &[&str] = &["rm", "git"];

fn expand_known_flags(command: &str, args: &[String]) -> Vec<String> {
    if !EXPAND_FLAGS_COMMANDS.contains(&command) {
        return args.to_vec();
    }

    let mut expanded = Vec::new();
    for arg in args {
        if arg.starts_with('-') && !arg.starts_with("--") && arg.len() > 2 {
            let flags: String = arg[1..].chars().filter(|c| c.is_ascii_alphabetic()).collect();
            for flag in flags.chars() {
                expanded.push(format!("-{flag}"));
            }
        } else {
            expanded.push(arg.clone());
        }
    }
    expanded
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
        "sleep" => explain_sleep_arg(arg),
        "tail" => explain_tail_arg(arg),
        "head" => explain_head_arg(arg),
        "cat" | "less" | "more" => explain_reader_arg(arg),
        "grep" | "rg" => explain_grep_arg(arg),
        "awk" => explain_awk_arg(arg),
        "sed" => explain_sed_arg(arg),
        "ls" => explain_ls_arg(arg),
        "cd" => explain_cd_arg(arg),
        "mkdir" => explain_mkdir_arg(arg),
        "echo" => explain_echo_arg(arg),
        "docker" => explain_docker_arg(arg),
        _ => explain_generic_arg(command, arg),
    }
}

fn explain_generic_arg(command: &str, arg: &str) -> ArgNode {
    if arg.starts_with("--") {
        return ArgNode {
            text: arg.to_string(),
            meaning: format!("{command} 长选项"),
            risk_level: None,
        };
    }
    if arg.starts_with('-') && arg.len() > 1 {
        return ArgNode {
            text: arg.to_string(),
            meaning: format!("{command} 选项"),
            risk_level: None,
        };
    }
    if arg.starts_with('/') || arg.starts_with("./") || arg.starts_with("~/") || arg.starts_with("..\\") || arg.starts_with("../") || arg.contains('\\') || arg.contains('/') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "文件路径".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with("http://") || arg.starts_with("https://") {
        return ArgNode {
            text: arg.to_string(),
            meaning: "URL".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('$') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "变量或命令替换".to_string(),
            risk_level: None,
        };
    }
    if arg.chars().all(|c| c.is_ascii_digit()) {
        return ArgNode {
            text: arg.to_string(),
            meaning: "数值参数".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: format!("{command} 参数"),
        risk_level: None,
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

fn explain_sleep_arg(arg: &str) -> ArgNode {
    if arg.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "等待时间（秒）".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "sleep 选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "等待时间".to_string(),
        risk_level: None,
    }
}

fn explain_tail_arg(arg: &str) -> ArgNode {
    if arg == "-f" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "实时追踪文件变化".to_string(),
            risk_level: None,
        };
    }
    if arg == "-n" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "指定显示行数".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') && arg[1..].chars().all(|c| c.is_ascii_digit()) {
        return ArgNode {
            text: arg.to_string(),
            meaning: "显示末尾 N 行".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "tail 选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "文件路径".to_string(),
        risk_level: None,
    }
}

fn explain_head_arg(arg: &str) -> ArgNode {
    if arg == "-n" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "指定显示行数".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') && arg[1..].chars().all(|c| c.is_ascii_digit()) {
        return ArgNode {
            text: arg.to_string(),
            meaning: "显示开头 N 行".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "head 选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "文件路径".to_string(),
        risk_level: None,
    }
}

fn explain_reader_arg(arg: &str) -> ArgNode {
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "查看器选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "文件路径".to_string(),
        risk_level: None,
    }
}

fn explain_grep_arg(arg: &str) -> ArgNode {
    match arg {
        "-r" | "-R" => ArgNode {
            text: arg.to_string(),
            meaning: "递归搜索目录".to_string(),
            risk_level: None,
        },
        "-i" => ArgNode {
            text: arg.to_string(),
            meaning: "忽略大小写".to_string(),
            risk_level: None,
        },
        "-n" => ArgNode {
            text: arg.to_string(),
            meaning: "显示行号".to_string(),
            risk_level: None,
        },
        "-l" => ArgNode {
            text: arg.to_string(),
            meaning: "只输出文件名".to_string(),
            risk_level: None,
        },
        "-e" => ArgNode {
            text: arg.to_string(),
            meaning: "指定匹配模式".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "grep 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "搜索模式或文件路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_awk_arg(arg: &str) -> ArgNode {
    if arg == "-F" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "指定字段分隔符".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "awk 选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "awk 程序脚本".to_string(),
        risk_level: None,
    }
}

fn explain_sed_arg(arg: &str) -> ArgNode {
    if arg == "-i" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "直接修改文件（就地编辑）".to_string(),
            risk_level: Some(RiskLevel::Medium),
        };
    }
    if arg == "-e" {
        return ArgNode {
            text: arg.to_string(),
            meaning: "指定编辑命令".to_string(),
            risk_level: None,
        };
    }
    if arg.starts_with('-') {
        return ArgNode {
            text: arg.to_string(),
            meaning: "sed 选项".to_string(),
            risk_level: None,
        };
    }
    ArgNode {
        text: arg.to_string(),
        meaning: "sed 表达式或文件路径".to_string(),
        risk_level: None,
    }
}

fn explain_ls_arg(arg: &str) -> ArgNode {
    match arg {
        "-l" => ArgNode {
            text: arg.to_string(),
            meaning: "长格式列表".to_string(),
            risk_level: None,
        },
        "-a" => ArgNode {
            text: arg.to_string(),
            meaning: "显示隐藏文件".to_string(),
            risk_level: None,
        },
        "-la" | "-al" => ArgNode {
            text: arg.to_string(),
            meaning: "长格式列表（含隐藏文件）".to_string(),
            risk_level: None,
        },
        "-R" => ArgNode {
            text: arg.to_string(),
            meaning: "递归列出子目录".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "ls 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "目录路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_cd_arg(arg: &str) -> ArgNode {
    ArgNode {
        text: arg.to_string(),
        meaning: "目标目录".to_string(),
        risk_level: None,
    }
}

fn explain_mkdir_arg(arg: &str) -> ArgNode {
    match arg {
        "-p" => ArgNode {
            text: arg.to_string(),
            meaning: "递归创建父目录".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "mkdir 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "目录路径".to_string(),
            risk_level: None,
        },
    }
}

fn explain_echo_arg(arg: &str) -> ArgNode {
    match arg {
        "-n" => ArgNode {
            text: arg.to_string(),
            meaning: "不输出末尾换行".to_string(),
            risk_level: None,
        },
        "-e" => ArgNode {
            text: arg.to_string(),
            meaning: "启用转义字符解析".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "echo 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "输出内容".to_string(),
            risk_level: None,
        },
    }
}

fn explain_docker_arg(arg: &str) -> ArgNode {
    match arg {
        "run" => ArgNode {
            text: arg.to_string(),
            meaning: "运行容器".to_string(),
            risk_level: Some(RiskLevel::Low),
        },
        "build" => ArgNode {
            text: arg.to_string(),
            meaning: "构建镜像".to_string(),
            risk_level: Some(RiskLevel::Low),
        },
        "exec" => ArgNode {
            text: arg.to_string(),
            meaning: "在容器内执行命令".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "rm" | "rmi" => ArgNode {
            text: arg.to_string(),
            meaning: "删除容器或镜像".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "stop" | "kill" => ArgNode {
            text: arg.to_string(),
            meaning: "停止或终止容器".to_string(),
            risk_level: Some(RiskLevel::Medium),
        },
        "-it" => ArgNode {
            text: arg.to_string(),
            meaning: "交互式终端".to_string(),
            risk_level: None,
        },
        "-d" => ArgNode {
            text: arg.to_string(),
            meaning: "后台运行".to_string(),
            risk_level: None,
        },
        "-v" => ArgNode {
            text: arg.to_string(),
            meaning: "挂载卷".to_string(),
            risk_level: None,
        },
        "-p" => ArgNode {
            text: arg.to_string(),
            meaning: "端口映射".to_string(),
            risk_level: None,
        },
        "--rm" => ArgNode {
            text: arg.to_string(),
            meaning: "容器退出后自动删除".to_string(),
            risk_level: None,
        },
        _ if arg.starts_with('-') => ArgNode {
            text: arg.to_string(),
            meaning: "Docker 选项".to_string(),
            risk_level: None,
        },
        _ => ArgNode {
            text: arg.to_string(),
            meaning: "Docker 参数".to_string(),
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
    fn test_command_substitution() {
        let result = analyze_command("echo $(cat file.txt)");
        assert_eq!(result.commands.len(), 1);
        assert_eq!(result.commands[0].command, "echo");
    }

    #[test]
    fn test_redirection() {
        let result = analyze_command("cmd > out.txt 2>&1");
        assert_eq!(result.commands.len(), 1);
        assert_eq!(result.commands[0].command, "cmd");
    }

    #[test]
    fn test_subshell() {
        let result = analyze_command("(cd /tmp && ls)");
        assert!(result.commands.len() >= 2);
    }

    #[test]
    fn test_complex_pipeline() {
        let result = analyze_command("cat file | grep pattern | awk '{print $1}'");
        assert_eq!(result.commands.len(), 3);
        assert_eq!(result.commands[0].command, "cat");
        assert_eq!(result.commands[1].command, "grep");
        assert_eq!(result.commands[2].command, "awk");
    }

    #[test]
    fn test_mixed_operators() {
        let result = analyze_command("cd /tmp && ls || echo failed");
        assert_eq!(result.commands.len(), 3);
    }

    #[test]
    fn test_nested_quotes() {
        let result = analyze_command("echo \"hello 'world'\"");
        assert_eq!(result.commands.len(), 1);
        assert_eq!(result.commands[0].command, "echo");
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

    #[test]
    fn test_semicolons() {
        let result = analyze_command("echo a; echo b");
        assert_eq!(result.commands.len(), 2);
    }

    #[test]
    fn test_or_operator() {
        let result = analyze_command("true || echo fallback");
        assert_eq!(result.commands.len(), 2);
    }
}
