import { describe, expect, it } from "vitest";
import { calculateOverlayLayout } from "../../components/overlayLayout";

describe("calculateOverlayLayout", () => {
  it("keeps short expanded content at the configured minimum height", () => {
    const layout = calculateOverlayLayout({
      panelPaddingY: 16,
      contentNaturalHeight: 40,
      footerHeight: 32,
      scrollRegionNaturalHeight: 40,
    });

    expect(layout.expandedHeight).toBe(180);
    expect(layout.contentMaxHeight).toBe(500);
    expect(layout.scrollRegionMaxHeight).toBe(500);
  });

  it("uses natural content height when it fits below the maximum", () => {
    const layout = calculateOverlayLayout({
      panelPaddingY: 16,
      contentNaturalHeight: 150,
      footerHeight: 40,
      scrollRegionNaturalHeight: 120,
    });

    expect(layout.expandedHeight).toBe(258);
    expect(layout.scrollRegionMaxHeight).toBe(462);
  });

  it("caps long session content and reserves space for non-scrollable footer", () => {
    const layout = calculateOverlayLayout({
      panelPaddingY: 16,
      contentNaturalHeight: 800,
      footerHeight: 37,
      scrollRegionNaturalHeight: 700,
    });

    expect(layout.expandedHeight).toBe(600);
    expect(layout.contentMaxHeight).toBe(495);
    expect(layout.scrollRegionMaxHeight).toBe(395);
  });
});
