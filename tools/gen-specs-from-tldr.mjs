#!/usr/bin/env node
/**
 * gen-specs-from-tldr.mjs
 *
 * 从 tldr-pages 仓库解析 Markdown 页面，生成 TOML 命令规格文件。
 *
 * tldr 页面格式：
 *   - 描述文字（可能用 [x] 标注选项字母）
 *   `命令 {{占位符}} {{[-x|--xxx]}} 参数`
 *
 * 用法：
 *   node tools/gen-specs-from-tldr.mjs [--skip-existing] [--limit N]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const OUTPUT_DIR = getArg("--output") || "src-tauri/src/command_specs";
const SKIP_EXISTING = args.includes("--skip-existing");
const SOURCE_DIR = getArg("--source") || null;
const LIMIT = parseInt(getArg("--limit") || "0", 10);

const EXISTING_COMMANDS = new Set([
  "rm", "git", "npm", "pnpm", "yarn", "curl", "wget",
  "chmod", "chown", "find", "mv", "cp",
]);

const ALIAS_MAP = {
  "npm": ["pnpm", "yarn", "bun"],
  "curl": ["wget"],
};

function main() {
  const tldrDir = SOURCE_DIR || cloneTldrRepo();
  const pagesDir = join(tldrDir, "pages", "common");

  if (!existsSync(pagesDir)) {
    console.error(`Pages directory not found: ${pagesDir}`);
    process.exit(1);
  }

  const files = readdirSync(pagesDir).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} tldr pages`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (const file of files) {
    if (LIMIT && generated >= LIMIT) break;

    const commandName = basename(file, ".md");

    if (SKIP_EXISTING && EXISTING_COMMANDS.has(commandName)) {
      skipped++;
      continue;
    }

    // 跳过非字母开头的命令（特殊符号、数字等）
    if (!/^[a-z]/.test(commandName)) {
      skipped++;
      continue;
    }

    const content = readFileSync(join(pagesDir, file), "utf-8");
    const spec = parseTldrPage(commandName, content);
    if (!spec || spec.options.length === 0) {
      skipped++;
      continue;
    }

    const toml = generateToml(spec);
    const outPath = join(OUTPUT_DIR, `${spec.name}.toml`);
    writeFileSync(outPath, toml, "utf-8");
    generated++;
    console.log(`  ✓ ${spec.name}.toml (${spec.options.length} opts, ${spec.subcommands.length} subs)`);
  }

  console.log(`\nDone: ${generated} generated, ${skipped} skipped`);
}

function parseTldrPage(commandName, content) {
  const lines = content.split("\n");
  const options = [];
  const subcommands = new Map();

  // 描述：> 开头的行
  let description = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("> ")) {
      description = trimmed.slice(2).replace(/\s*\(.*\)\s*$/, "").trim();
      break;
    }
  }

  // 解析示例：描述行 + 反引号命令行
  let i = 0;
  while (i < lines.length) {
    const descLine = lines[i].trim();

    // 描述行以 "- " 开头
    if (descLine.startsWith("- ")) {
      const desc = descLine.slice(2).trim();
      i++;

      // 跳过空行，找到反引号命令行
      while (i < lines.length && lines[i].trim() === "") i++;
      if (i < lines.length) {
        const cmdLine = lines[i].trim();
        const cmdMatch = cmdLine.match(/^`(.+)`$/);
        if (cmdMatch) {
          extractFromCommand(commandName, cmdMatch[1], desc, options, subcommands);
        }
      }
    }
    i++;
  }

  // 去重选项
  const seenOpts = new Set();
  const uniqueOptions = options.filter(opt => {
    const key = `${opt.short}|${opt.long}`;
    if (seenOpts.has(key)) return false;
    seenOpts.add(key);
    return true;
  });

  const uniqueSubcommands = [...subcommands.values()];

  return {
    name: commandName,
    description: description || commandName,
    options: uniqueOptions,
    subcommands: uniqueSubcommands,
  };
}

function extractFromCommand(commandName, cmdStr, desc, options, subcommands) {
  // tldr 使用 {{ }} 包裹占位符，选项格式如 {{[-x|--xxx]}}
  // 先提取所有 {{ }} 块
  const placeholderRe = /\{\{(.+?)\}\}/g;
  const placeholders = [];
  let m;
  while ((m = placeholderRe.exec(cmdStr)) !== null) {
    placeholders.push(m[1]);
  }

  // 也从命令本身提取裸选项（不在 {{ }} 内的 -x 或 --xxx）
  // 去掉所有 {{ }} 内容后
  const stripped = cmdStr.replace(/\{\{.+?\}\}/g, "").trim();
  const bareTokens = stripped.split(/\s+/).filter(Boolean);

  // 第一个 token 通常是命令名或路径，跳过
  let cmdToken = bareTokens[0] || "";
  // 处理完整路径如 /usr/bin/tar
  if (cmdToken.includes("/")) {
    cmdToken = cmdToken.split("/").pop();
  }

  // 检测子命令：命令名后第一个非选项 token
  const tokensAfterCmd = bareTokens.slice(1);
  let subcmd = null;
  for (const t of tokensAfterCmd) {
    if (!t.startsWith("-")) {
      subcmd = t;
      break;
    }
  }

  // 从 {{ }} 占位符中提取选项
  for (const ph of placeholders) {
    // 格式：[-x] 或 [--xxx] 或 [-x|--xxx] 或 [-x|--xxx-y]
    // 也可能是 [-x|--xxx-y 描述]
    const optMatch = ph.match(/^\[(-[\w])(?:\|(--[\w-]+))?\]$/)
      || ph.match(/^\[(--[\w-]+)\]$/);

    if (optMatch) {
      const short = optMatch[1] || "";
      const long = optMatch[2] || "";
      options.push({
        short,
        long,
        description: deriveDescription(short || long, desc),
      });
    }
  }

  // 从裸 token 中提取选项
  for (const t of tokensAfterCmd) {
    // --long-option
    const longM = t.match(/^(--[\w-]+)/);
    if (longM) {
      options.push({
        short: "",
        long: longM[1],
        description: deriveDescription(longM[1], desc),
      });
      continue;
    }

    // -s 短选项（也可能是组合 -rf）
    const shortM = t.match(/^-([a-zA-Z]{1,3})$/);
    if (shortM) {
      // 只拆分单个字母
      for (const ch of shortM[1]) {
        options.push({
          short: `-${ch}`,
          long: "",
          description: deriveDescription(`-${ch}`, desc),
        });
      }
    }
  }

  // 记录子命令
  if (subcmd && !subcommands.has(subcmd)) {
    subcommands.set(subcmd, {
      name: subcmd,
      description: desc.split(/[,;.]/)[0].trim(),
      options: [],
    });
  }

  // tldr 也用 {{[subcmd1|subcmd2]}} 表示子命令选项
  for (const ph of placeholders) {
    const subMatch = ph.match(/^\[([\w-]+(?:\|[\w-]+)*)\]$/);
    if (subMatch) {
      const names = subMatch[1].split("|");
      for (const name of names) {
        if (!name.startsWith("-") && !subcommands.has(name)) {
          subcommands.set(name, {
            name,
            description: desc.split(/[,;.]/)[0].trim(),
            options: [],
          });
        }
      }
    }
  }
}

const KNOWN_FLAGS = {
  "-r": "递归操作",
  "-R": "递归操作",
  "-f": "强制执行，不提示确认",
  "-i": "交互模式",
  "-v": "显示详细信息（verbose）",
  "-q": "静默模式",
  "-s": "静默模式 / 脚本模式",
  "-l": "长格式输出",
  "-a": "包含所有（包括隐藏项）",
  "-h": "显示帮助信息",
  "-n": "不实际执行（试运行）",
  "-e": "表达式模式",
  "-p": "指定端口或路径",
  "-d": "调试模式 / 指定目录",
  "-c": "指定命令 / 创建模式",
  "-w": "匹配整个单词",
  "-x": "可执行权限 / 提取模式",
  "-t": "指定类型 / 标签",
  "-u": "指定用户",
  "-g": "指定组 / 全局",
  "-o": "指定输出",
  "-L": "跟随重定向",
  "-S": "显示错误",
  "-O": "远程文件名保存",
  "-E": "扩展正则表达式",
  "-P": "Perl 正则表达式 / 保留权限",
  "-z": "gzip 压缩",
  "-j": "bzip2 压缩",
  "-J": "xz 压缩",
  "-k": "保留文件 / 千字节",
  "-W": "等待 / 匹配单词",
  "-T": "测试 / 超时",
  "-m": "指定模式 / 消息",
  "-b": "批处理模式 / 字节",
  "-B": "批处理 / 后台",
  "-F": "指定配置文件 / 强制",
  "-D": "定义宏 / 调试",
  "-C": "指定目录 / 继续断点",
  "-I": "指定输入 / 忽略大小写",
  "-A": "显示所有 / 追加",
  "-M": "手动页路径",
  "-N": "行号",
  "-1": "单列显示",
  "-y": "自动确认 yes",
  "--help": "显示帮助信息",
  "--version": "显示版本号",
  "--verbose": "显示详细信息",
  "--quiet": "静默模式",
  "--silent": "静默模式",
  "--force": "强制执行",
  "--recursive": "递归操作",
  "--dry-run": "不实际执行（试运行）",
  "--no-dry-run": "实际执行",
  "--global": "全局操作",
  "--local": "本地操作",
  "--all": "包含所有",
  "--json": "JSON 格式输出",
  "--color": "彩色输出",
  "--no-color": "无彩色输出",
  "--interactive": "交互模式",
  "--yes": "自动确认",
  "--no": "自动拒绝",
  "--output": "指定输出文件",
  "--input": "指定输入文件",
  "--config": "指定配置文件",
  "--directory": "指定工作目录",
  "--file": "指定文件",
  "--name": "指定名称",
  "--port": "指定端口",
  "--host": "指定主机",
  "--user": "指定用户",
  "--password": "指定密码",
  "--timeout": "指定超时时间",
  "--recursive": "递归处理",
  "--exclude": "排除模式",
  "--include": "包含模式",
  "--delete": "删除匹配项",
  "--replace": "替换模式",
  "--append": "追加模式",
  "--update": "更新模式",
  "--create": "创建模式",
  "--extract": "解压模式",
  "--list": "列表模式",
  "--test": "测试模式",
  "--install": "安装模式",
  "--uninstall": "卸载模式",
  "--remove": "移除模式",
  "--add": "添加模式",
  "--show": "显示模式",
  "--enable": "启用",
  "--disable": "禁用",
  "--status": "显示状态",
  "--restart": "重启",
  "--stop": "停止",
  "--start": "启动",
  "--save": "保存",
  "--load": "加载",
  "--export": "导出",
  "--import": "导入",
  "--follow": "跟随输出",
  "--tail": "尾部输出",
  "--head": "头部输出",
  "--reverse": "反向排序",
  "--sort": "排序",
  "--filter": "过滤",
  "--limit": "限制数量",
  "--skip": "跳过数量",
  "--width": "指定宽度",
  "--height": "指定高度",
  "--depth": "指定深度",
};

function deriveDescription(flag, contextDesc) {
  if (KNOWN_FLAGS[flag]) return KNOWN_FLAGS[flag];
  // 从 flag 名推测
  const name = flag.replace(/^-+/, "").replace(/-/g, " ");
  return name;
}

function generateToml(spec) {
  let lines = [];
  lines.push(`[command]`);
  lines.push(`name = ${JSON.stringify(spec.name)}`);
  lines.push(`description = ${JSON.stringify(spec.description)}`);

  const aliases = ALIAS_MAP[spec.name] || [];
  if (aliases.length > 0) {
    lines.push(`aliases = ${JSON.stringify(aliases)}`);
  }

  for (const sub of spec.subcommands) {
    lines.push("");
    lines.push(`[[command.subcommands]]`);
    lines.push(`name = ${JSON.stringify(sub.name)}`);
    lines.push(`description = ${JSON.stringify(sub.description)}`);
  }

  for (const opt of spec.options) {
    lines.push("");
    lines.push(`[[command.options]]`);
    lines.push(`short = ${JSON.stringify(opt.short || "")}`);
    lines.push(`long = ${JSON.stringify(opt.long || "")}`);
    lines.push(`description = ${JSON.stringify(opt.description)}`);
  }

  lines.push("");
  return lines.join("\n");
}

function cloneTldrRepo() {
  const tmpDir = join(process.env.TEMP || "/tmp", "tldr-pages");
  if (existsSync(join(tmpDir, "pages"))) {
    console.log(`Using cached tldr-pages at ${tmpDir}`);
    try {
      execSync("git pull --ff-only", { cwd: tmpDir, stdio: "pipe" });
      console.log("  Updated to latest");
    } catch {
      console.log("  (using cached version)");
    }
    return tmpDir;
  }
  console.log("Cloning tldr-pages repository...");
  execSync("git clone --depth 1 https://github.com/tldr-pages/tldr.git " + tmpDir, {
    stdio: "inherit",
  });
  return tmpDir;
}

function getArg(name) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

main();
