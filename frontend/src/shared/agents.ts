export interface AgentInfo {
  name: string;
  short: string;
  color: string;
  cli: string;
}

const AGENTS: Record<string, AgentInfo> = {
  claude:    { name: 'Claude Code', short: 'CC', color: '#d97742', cli: 'claude' },
  codex:     { name: 'Codex',       short: 'CX', color: '#4aa3df', cli: 'codex' },
  cursor:    { name: 'Cursor',      short: 'CR', color: '#7a5cff', cli: 'cursor' },
  gemini:    { name: 'Gemini CLI',  short: 'GM', color: '#42e86b', cli: 'gemini' },
  kimi:      { name: 'Kimi CLI',    short: 'KM', color: '#fde047', cli: 'kimi' },
  opencode:  { name: 'OpenCode',    short: 'OC', color: '#ffb547', cli: 'opencode' },
  qoder:     { name: 'Qoder',       short: 'QD', color: '#ff6b9f', cli: 'qoder' },
  qwen:      { name: 'Qwen Code',   short: 'QW', color: '#c084fc', cli: 'qwen' },
  factory:   { name: 'Factory',     short: 'FA', color: '#6e9fff', cli: 'droid' },
  codebuddy: { name: 'CodeBuddy',   short: 'CB', color: '#fca5a5', cli: 'codebuddy' },
};

export type AgentType = keyof typeof AGENTS;

const AGENT_KEYS = Object.keys(AGENTS) as AgentType[];

export function getAgent(type: string): AgentInfo {
  return AGENTS[type] ?? AGENTS.claude;
}

export function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const PROCESS_MAP: Record<string, AgentType> = {
  claude: 'claude',
  codex: 'codex',
  cursor: 'cursor',
  gemini: 'gemini',
  kimi: 'kimi',
  opencode: 'opencode',
  qoder: 'qoder',
  qwen: 'qwen',
  droid: 'factory',
  codebuddy: 'codebuddy',
};

export function detectAgentType(processName: string): AgentType {
  const lower = processName.toLowerCase().replace(/\.exe$/, '');
  if (lower in PROCESS_MAP) return PROCESS_MAP[lower];
  for (const key of AGENT_KEYS) {
    if (lower.includes(key)) return key;
  }
  return 'claude';
}
