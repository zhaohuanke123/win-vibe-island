/**
 * Tool category classification and visual mapping.
 * Maps tool name patterns to categories with emoji icons and colors.
 */

export type ToolCategory =
  | "search"      // 🔍 web search / scrape
  | "file_read"   // 📖 reading files
  | "file_write"  // ✏️ writing / editing files
  | "bash"        // 💻 terminal commands
  | "test"        // 🧪 running tests
  | "git"         // 📦 git operations
  | "plan"        // 📋 planning / task management
  | "lint"        // ✅ linting / checking
  | "approval"    // ⏳ waiting for approval
  | "other";      // ❓ unknown

export interface CategoryVisual {
  icon: string;
  color: string;         // CSS color for StatusDot
  label: string;
}

const CATEGORY_MAP: Record<ToolCategory, CategoryVisual> = {
  search:     { icon: "🔍", color: "#22d3ee", label: "Search" },
  file_read:  { icon: "📖", color: "#818cf8", label: "Read" },
  file_write: { icon: "✏️", color: "#60a5fa", label: "Write" },
  bash:       { icon: "💻", color: "#a78bfa", label: "Bash" },
  test:       { icon: "🧪", color: "#34d399", label: "Test" },
  git:        { icon: "📦", color: "#f97316", label: "Git" },
  plan:       { icon: "📋", color: "#fbbf24", label: "Plan" },
  lint:       { icon: "✅", color: "#a3e635", label: "Lint" },
  approval:   { icon: "⏳", color: "#f59e0b", label: "Approval" },
  other:      { icon: "❓", color: "#9ca3af", label: "Other" },
};

/**
 * Classify a tool name into a category.
 */
export function classifyTool(toolName: string): ToolCategory {
  const lower = toolName.toLowerCase();

  // Search
  if (/\b(search|scrape|crawl|fetch|web_search|firecrawl_search|firecrawl_scrape|firecrawl_crawl|web_extract|browser_navigate)\b/i.test(lower)) {
    return "search";
  }

  // File read
  if (/\b(read_file|read\b|open_file|cat\b|view)\b/i.test(lower) && !/\b(write|edit|replace)\b/i.test(lower)) {
    return "file_read";
  }

  // File write
  if (/\b(write_to_file|write_file|write\b|edit\b|edit_file|replace_in_file|patch|create_file)\b/i.test(lower)) {
    return "file_write";
  }

  // Bash
  if (/\b(bash|terminal|execute_command|shell|cmd)\b/i.test(lower)) {
    return "bash";
  }

  // Test
  if (/\b(test|pytest|vitest|jest|mocha|spec)\b/i.test(lower)) {
    return "test";
  }

  // Git
  if (/\b(git|commit|push|pull|merge|rebase)\b/i.test(lower)) {
    return "git";
  }

  // Plan / task
  if (/\b(plan|task|todo_write|task_write)\b/i.test(lower)) {
    return "plan";
  }

  // Lint
  if (/\b(lint|eslint|prettier|check|typecheck|cargo_check|cargo check)\b/i.test(lower)) {
    return "lint";
  }

  // Approval
  if (/\b(approval|permission_request|ask_user)\b/i.test(lower)) {
    return "approval";
  }

  return "other";
}

/**
 * Get visual config for a tool category.
 */
export function getCategoryVisual(category: ToolCategory): CategoryVisual {
  return CATEGORY_MAP[category];
}

/**
 * Get visual config from a tool name directly.
 */
export function getToolVisual(toolName: string): CategoryVisual {
  return getCategoryVisual(classifyTool(toolName));
}
