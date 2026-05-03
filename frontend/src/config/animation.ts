export const SPRING_CONFIG = {
  expand: {
    stiffness: 300,
    damping: 22,
    mass: 0.9,
  },
  collapse: {
    stiffness: 380,
    damping: 26,
    mass: 0.85,
  },
  transition: {
    stiffness: 400,
    damping: 30,
    mass: 1,
  },
  micro: {
    stiffness: 500,
    damping: 35,
    mass: 0.8,
  },
} as const;

export const OVERLAY_DIMENSIONS = {
  compact: {
    width: 236,
    height: 52,
    borderRadius: 26,
  },
  expanded: {
    width: 420,
    minHeight: 180,
    maxHeight: 600,
    borderRadius: 18,
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
