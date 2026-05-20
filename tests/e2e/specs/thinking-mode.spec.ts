import { test, expect } from "@playwright/test";
import { VibeTestClient } from "../setup/test-helpers";

test.describe("Thinking Mode (SessionPhase: running → thinking)", () => {
  let client: VibeTestClient;

  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5187");
    client = new VibeTestClient(page);
    await client.resetAll();
  });

  test("session shows thinking indicator when tool_use starts", async ({ page }) => {
    await client.simulateSessionStart("think-1", "Thinking Project");
    await client.simulateToolUse("think-1", "Think", { prompt: "Analyze this code" });

    const count = await client.getElementCount("[data-session-id='think-1']");
    expect(count).toBe(1);

    const texts = await client.getTextContents("[data-session-id='think-1'] .session-row__label");
    expect(texts.length).toBeGreaterThan(0);
  });

  test("BarsGlyph shows running animation for thinking session", async ({ page }) => {
    await client.simulateSessionStart("think-2", "Thinking Project");
    await client.simulateToolUse("think-2", "Think", { prompt: "Analyze" });

    const glyphCount = await client.getElementCount("[data-session-id='think-2'] .bars-glyph");
    expect(glyphCount).toBeGreaterThanOrEqual(1);
  });

  test("session transitions from thinking to running on tool_complete", async ({ page }) => {
    await client.simulateSessionStart("think-3", "Thinking Project");
    await client.simulateToolUse("think-3", "Think", { prompt: "Analyze" });

    await client.simulateToolComplete("think-3", "Think", 1500);

    const sessions = await client.getSessions();
    const s = (sessions as Array<{ id: string; currentTool: unknown }>).find((x) => x.id === "think-3");
    expect(s).toBeDefined();
    expect(s!.currentTool).toBeUndefined();
  });

  test("multiple concurrent thinking sessions display independently", async ({ page }) => {
    await client.simulateSessionStart("think-a", "Project A");
    await client.simulateSessionStart("think-b", "Project B");

    await client.simulateToolUse("think-a", "Think", { prompt: "A" });
    await client.simulateToolUse("think-b", "Read", { file_path: "src/main.ts" });

    const countA = await client.getElementCount("[data-session-id='think-a']");
    const countB = await client.getElementCount("[data-session-id='think-b']");
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  test("tool error on thinking session shows error state", async ({ page }) => {
    await client.simulateSessionStart("think-err", "Error Project");
    await client.simulateToolUse("think-err", "Think", { prompt: "Cause error" });
    await client.simulateToolError("think-err", "Think", "Analysis failed: timeout");

    const sessions = await client.getSessions();
    const s = (sessions as Array<{ id: string; lastError: string }>).find((x) => x.id === "think-err");
    expect(s).toBeDefined();
    expect(s!.lastError).toContain("timeout");
  });
});
