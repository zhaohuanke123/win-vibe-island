import { memo } from "react";
import type { AgentType } from "../shared/agents";

import claudeIcon from "../assets/agents/claude.png";
import codexIcon from "../assets/agents/codex.svg";
import cursorIcon from "../assets/agents/cursor.svg";
import geminiIcon from "../assets/agents/gemini.svg";
import kimiIcon from "../assets/agents/kimi.png";
import opencodeIcon from "../assets/agents/opencode.png";
import qoderIcon from "../assets/agents/qoder.svg";
import qwenIcon from "../assets/agents/qwen.svg";
import factoryIcon from "../assets/agents/factory.svg";
import codebuddyIcon from "../assets/agents/codebuddy.svg";

const ICONS: Record<AgentType, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  gemini: geminiIcon,
  kimi: kimiIcon,
  opencode: opencodeIcon,
  qoder: qoderIcon,
  qwen: qwenIcon,
  factory: factoryIcon,
  codebuddy: codebuddyIcon,
};

interface AgentIconProps {
  agent: AgentType;
  size?: number;
  className?: string;
}

export const AgentIcon = memo(function AgentIcon({
  agent,
  size = 14,
  className,
}: AgentIconProps) {
  const src = ICONS[agent];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={agent}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  );
});
