import { OVERLAY_DIMENSIONS } from "../config/animation";

export interface OverlayLayoutInput {
  panelPaddingY: number;
  contentNaturalHeight: number;
  footerHeight: number;
  scrollRegionNaturalHeight: number;
}

export interface OverlayLayoutResult {
  expandedHeight: number;
  contentMaxHeight: number;
  scrollRegionMaxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateOverlayLayout(input: OverlayLayoutInput): OverlayLayoutResult {
  const barHeight = OVERLAY_DIMENSIONS.compact.height;
  const minHeight = OVERLAY_DIMENSIONS.expanded.minHeight;
  const maxHeight = OVERLAY_DIMENSIONS.expanded.maxHeight;

  const panelPaddingY = finiteOrZero(input.panelPaddingY);
  const contentNaturalHeight = finiteOrZero(input.contentNaturalHeight);
  const footerHeight = finiteOrZero(input.footerHeight);
  const scrollRegionNaturalHeight = finiteOrZero(input.scrollRegionNaturalHeight);

  const naturalHeight = barHeight + panelPaddingY + contentNaturalHeight + footerHeight;
  const expandedHeight = clamp(naturalHeight, minHeight, maxHeight);

  const contentMaxHeight = Math.max(0, maxHeight - barHeight - panelPaddingY - footerHeight);
  const nonScrollableContentHeight = Math.max(0, contentNaturalHeight - scrollRegionNaturalHeight);
  const scrollRegionMaxHeight = Math.max(0, contentMaxHeight - nonScrollableContentHeight);

  return {
    expandedHeight,
    contentMaxHeight,
    scrollRegionMaxHeight,
  };
}
