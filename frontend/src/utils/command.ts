export function extractBashCommand(input?: Record<string, unknown>): string | null {
  if (!input) return null;

  const candidates = [input.command, input.cmd, input.script];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}
