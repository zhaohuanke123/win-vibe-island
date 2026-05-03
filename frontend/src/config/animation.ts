import { useConfigStore } from "../store/config";

// Spring animation parameters from config
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
      return useConfigStore.getState().config.overlay.expandedWidth;
    },
    get minHeight() {
      return useConfigStore.getState().config.overlay.expandedMinHeight;
    },
    get maxHeight() {
      return useConfigStore.getState().config.overlay.expandedMaxHeight;
    },
    get borderRadius() {
      return useConfigStore.getState().config.overlay.expandedBorderRadius;
    },
  },
} as const;

export const DURATION = {
  micro: 150,
  transition: 250,
  expand: 400,
  collapse: 300,
} as const;

export const EASING = {
  springBounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  springSmooth: "cubic-bezier(0.22, 1, 0.36, 1)",
  springSnappy: "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
} as const;

// IPC throttle interval for window size sync
export const SIZE_SYNC_THROTTLE_MS = 16;
