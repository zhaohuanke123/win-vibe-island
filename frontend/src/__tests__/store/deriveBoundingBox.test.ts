import { describe, it, expect } from "vitest";
import {
  deriveBoundingBox,
  normalizeOverlayLayoutConfig,
  DEFAULT_CONFIG,
  type OverlayConfigDefaults,
} from "../../store/config";

function makeOverlay(overrides: Partial<OverlayConfigDefaults> = {}): OverlayConfigDefaults {
  return { ...DEFAULT_CONFIG.overlay, ...overrides };
}

describe("deriveBoundingBox", () => {
  it("取所有状态宽度的最大值", () => {
    const overlay = normalizeOverlayLayoutConfig(
      makeOverlay({ compactWidth: 236, expandedWidth: 600, approvalFocusWidth: 580 }),
    );
    const bbox = deriveBoundingBox(overlay, 52);
    expect(bbox.width).toBe(600);
  });

  it("expandedMaxHeight 主导 height 当其他都小", () => {
    const overlay = normalizeOverlayLayoutConfig(
      makeOverlay({ expandedMaxHeight: 720, approvalFocusHeight: 700, expandedMinHeight: 400 }),
    );
    const bbox = deriveBoundingBox(overlay, 52);
    expect(bbox.height).toBe(720);
  });

  it("approvalFocusHeight 主导 height 当它最大", () => {
    const overlay = normalizeOverlayLayoutConfig(
      makeOverlay({ expandedMaxHeight: 600, approvalFocusHeight: 720, expandedMinHeight: 400 }),
    );
    const bbox = deriveBoundingBox(overlay, 52);
    expect(bbox.height).toBe(720);
  });

  it("panelMaxHeights.sessionList 参与 max（高于 expandedMaxHeight 时）", () => {
    const overlay = normalizeOverlayLayoutConfig(
      makeOverlay({
        expandedMaxHeight: 900,
        approvalFocusHeight: 800,
        panelMaxHeights: { sessionList: 880, sessionDetail: 760 },
      }),
    );
    const bbox = deriveBoundingBox(overlay, 52);
    // expandedMaxHeight 900 主导（panelMaxHeights 已被 clamp 到 ≤ 900）
    expect(bbox.height).toBe(900);
  });

  it("panelMaxHeights.sessionDetail 在 expandedMaxHeight 放宽后参与", () => {
    const overlay = normalizeOverlayLayoutConfig(
      makeOverlay({
        expandedMaxHeight: 950,
        approvalFocusHeight: 720,
        panelMaxHeights: { sessionList: 800, sessionDetail: 900 },
      }),
    );
    const bbox = deriveBoundingBox(overlay, 52);
    expect(bbox.height).toBe(950); // expandedMaxHeight 仍主导
  });

  it("默认配置下 bbox 是 600×720", () => {
    const overlay = normalizeOverlayLayoutConfig(DEFAULT_CONFIG.overlay);
    const bbox = deriveBoundingBox(overlay, DEFAULT_CONFIG.ui.dimensions.barHeight);
    expect(bbox).toEqual({ width: 600, height: 720 });
  });
});
