import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAnimDiag } from "../../components/anim-diag";

describe("logAnimDiag (Bug 1 诊断日志)", () => {
  beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  // Scenario 6/7：DEV 模式下 onAnimationComplete 触发时记录结构化 payload
  it("DEV 模式：调用 console.debug 并带 [AO-DIAG] 前缀 + payload", () => {
    logAnimDiag("anim complete", { isExpanded: true, targetW: 600, actualW: 598 });
    expect(console.debug).toHaveBeenCalledWith("[AO-DIAG] anim complete", {
      isExpanded: true,
      targetW: 600,
      actualW: 598,
    });
  });

  it("DEV 模式：空 payload 也带前缀", () => {
    logAnimDiag("mount", {});
    expect(console.debug).toHaveBeenCalledWith("[AO-DIAG] mount", {});
  });

  // Scenario 8：生产构建下 DEV=false，整个调用 no-op
  it("生产模式（DEV=false）：不调用 console.debug", () => {
    vi.stubEnv("DEV", false);
    logAnimDiag("anim complete", { isExpanded: true });
    expect(console.debug).not.toHaveBeenCalled();
  });
});
