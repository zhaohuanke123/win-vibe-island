import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./CommandAnalysis.css";

type RiskLevel = "low" | "medium" | "high";

interface ArgNode {
  text: string;
  meaning: string;
  riskLevel: RiskLevel | null;
}

interface CommandNode {
  command: string;
  args: ArgNode[];
  raw: string;
}

interface RiskItem {
  level: RiskLevel;
  message: string;
  suggestion: string;
}

interface CommandAnalysisResult {
  shell: string;
  summary: string;
  commands: CommandNode[];
  risks: RiskItem[];
}

const MAX_CACHE_SIZE = 50;
const analysisCache = new Map<string, CommandAnalysisResult>();

function cacheSet(key: string, value: CommandAnalysisResult) {
  if (analysisCache.size >= MAX_CACHE_SIZE) {
    const firstKey = analysisCache.keys().next().value;
    if (firstKey !== undefined) analysisCache.delete(firstKey);
  }
  analysisCache.set(key, value);
}

interface CommandAnalysisProps {
  command: string;
  "data-testid"?: string;
}

export function CommandAnalysis({ command, "data-testid": testId }: CommandAnalysisProps) {
  const [analysis, setAnalysis] = useState<CommandAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!command) return;

    const cached = analysisCache.get(command);
    if (cached) {
      setAnalysis(cached);
      setError(null);
      return;
    }

    invoke<CommandAnalysisResult>("analyze_command", { command })
      .then((result) => {
        cacheSet(command, result);
        setAnalysis(result);
        setError(null);
      })
      .catch((err) => {
        setError(String(err));
      });
  }, [command]);

  if (error) {
    return (
      <div className="cmd-analysis" data-testid={testId || "command-analysis"}>
        <div style={{ color: "#f87171", fontSize: 10 }}>{error}</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="cmd-analysis" data-testid={testId || "command-analysis"}>
        <div style={{ color: "#6b7280", fontSize: 10 }}>Analyzing...</div>
      </div>
    );
  }

  const overallRisk = analysis.risks.length > 0
    ? analysis.risks.reduce<RiskLevel>((max, r) => {
        const order: RiskLevel[] = ["low", "medium", "high"];
        return order.indexOf(r.level) > order.indexOf(max) ? r.level : max;
      }, "low")
    : null;

  return (
    <div className="cmd-analysis" data-testid={testId || "command-analysis"}>
      <div className="cmd-analysis__summary">
        <span>{analysis.summary}</span>
        {overallRisk ? (
          <span className={`cmd-analysis__badge cmd-analysis__badge--${overallRisk}`}>
            {riskLabel(overallRisk)}
          </span>
        ) : (
          <span className="cmd-analysis__badge cmd-analysis__badge--safe">Safe</span>
        )}
      </div>

      {analysis.commands.length > 0 && (
        <div className="cmd-analysis__tree">
          {analysis.commands.map((cmd, i) => (
            <div key={i} className="cmd-analysis__cmd">
              <div className="cmd-analysis__cmd-name">{cmd.command}</div>
              {cmd.args.length > 0 && (
                <div className="cmd-analysis__args">
                  {cmd.args.map((arg, j) => (
                    <div key={j} className="cmd-analysis__arg">
                      <code className="cmd-analysis__arg-text">{arg.text}</code>
                      <span className="cmd-analysis__arg-meaning">{arg.meaning}</span>
                      {arg.riskLevel && (
                        <span className={`cmd-analysis__arg-badge cmd-analysis__arg-badge--${arg.riskLevel}`}>
                          {riskLabel(arg.riskLevel)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {analysis.risks.length > 0 && (
        <div className="cmd-analysis__risks">
          {analysis.risks.map((risk, i) => (
            <div key={i} className={`cmd-analysis__risk cmd-analysis__risk--${risk.level}`}>
              <div className="cmd-analysis__risk-msg">{risk.message}</div>
              <div className="cmd-analysis__risk-suggestion">{risk.suggestion}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function riskLabel(level: RiskLevel): string {
  switch (level) {
    case "low": return "Low";
    case "medium": return "Med";
    case "high": return "High";
  }
}
