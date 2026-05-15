/**
 * Extract a human-readable summary from tool input.
 * Returns a short string suitable for display in session bar.
 */
export function getToolDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    // Search tools
    case "search":
    case "web_search":
    case "firecrawl_search": {
      const q = (input.query || input.q || input.pattern) as string;
      return q ? `searching "${truncate(q, 60)}"` : "searching...";
    }

    // Scrape / fetch
    case "scrape":
    case "web_fetch":
    case "firecrawl_scrape":
    case "firecrawl_crawl": {
      const url = (input.url || input.target) as string;
      return url ? `fetching ${truncate(url.replace(/^https?:\/\//, ""), 50)}` : "fetching page...";
    }

    // Read file
    case "read_file":
    case "read":
    case "Read": {
      const path = (input.file_path || input.path || input.filePath) as string;
      return path ? `reading ${truncateFilename(path)}` : "reading file...";
    }

    // Write / edit file
    case "write_to_file":
    case "write_file":
    case "Write":
    case "Edit":
    case "replace_in_file":
    case "edit_file": {
      const path = (input.file_path || input.path || input.filePath) as string;
      return path ? `editing ${truncateFilename(path)}` : "editing file...";
    }

    // Bash / terminal
    case "bash":
    case "execute_command":
    case "Bash":
    case "terminal": {
      const cmd = (input.command || input.cmd || input.script) as string;
      if (cmd) {
        const firstLine = cmd.split("\n")[0].trim();
        return `$ ${truncate(firstLine, 50)}`;
      }
      return "running command...";
    }

    // Test running
    case "test":
    case "run_tests":
    case "pytest":
    case "vitest":
    case "npm_test": {
      return "running tests...";
    }

    // Git
    case "git":
    case "git_commit":
    case "git_push": {
      return "git operation...";
    }

    // Task / plan
    case "task":
    case "todo_write":
    case "plan": {
      return "planning...";
    }

    // Grep / search files
    case "search_files":
    case "grep":
    case "search_content":
    case "Search": {
      const q = (input.pattern || input.query || input.regex) as string;
      return q ? `grep "${truncate(q, 40)}"` : "searching files...";
    }

    // List / ls
    case "list_files":
    case "ls":
    case "search_file": {
      return "listing files...";
    }

    // Lint
    case "lint":
    case "eslint":
    case "cargo_check": {
      return "linting...";
    }

    default:
      return toolName || "working...";
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

function truncateFilename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}
