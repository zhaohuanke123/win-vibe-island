import { normalizeOverlayLayoutConfig, useConfigStore } from "../store/config";

// Spring animation parameters from config
// Framer Motion springs are only used for window resize sync (Win32 requirement).
// Row-level animations use CSS transitions (see CSS_TRANSITION below).
export const SPRING_CONFIG = {
  get expand() {
    return useConfigStore.getState().getSpringConfig("expand");
  },
  get collapse() {
    return useConfigStore.getState().getSpringConfig("collapse");
  },
  get transition() {
    return useConfigStore.getState().getSpringConfig("transition");
  },
  get micro() {
    return useConfigStore.getState().getSpringConfig("micro");
  },
} as const;

// Overlay dimensions from config
export const OVERLAY_DIMENSIONS = {
  compact: {
    get width() {
      return useConfigStore.getState().config.overlay.compactWidth - 84;
    },
    get height() {
      return useConfigStore.getState().config.ui.dimensions.barHeight;
    },
    get borderRadius() {
      return useConfigStore.getState().config.overlay.compactBorderRadius;
    },
  },
  expanded: {
    get width() {
      return normalizeOverlayLayoutConfig(useConfigStore.getState().config.overlay).expandedWidth;
    },
    get height() {
      return normalizeOverlayLayoutConfig(useConfigStore.getState().config.overlay).expandedMaxHeight;
    },
    get borderRadius() {
      return useConfigStore.getState().config.overlay.expandedBorderRadius;
    },
  },
} as const;

// CSS transition durations aligned with v8 reference design.
// Use these for row hover, state changes, chevron rotation, etc.
export const CSS_TRANSITION = {
  /** Row hover / active background — 120ms ease */
  HOVER: "120ms ease",
  /** Chevron rotation / small transform — 160ms ease */
  CHEVRON: "160ms ease",
  /** Panel expand / collapse — 300ms ease */
  EXPAND: "300ms ease",
} as const;

export const DURATION = {
  micro: 150,
  transition: 250,
  expand: 300,
  collapse: 250,
} as const;

export const EASING = {
  springBounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  springSmooth: "cubic-bezier(0.22, 1, 0.36, 1)",
  springSnappy: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

// IPC throttle interval for window size sync
export const SIZE_SYNC_THROTTLE_MS = 16;
