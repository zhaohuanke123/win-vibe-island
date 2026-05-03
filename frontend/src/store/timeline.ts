import { create } from "zustand";

export type TimeRange = "1h" | "6h" | "24h" | "all";

interface TimelineStore {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

const TIME_RANGES: { label: string; value: TimeRange; ms: number }[] = [
  { label: "Last hour", value: "1h", ms: 60 * 60 * 1000 },
  { label: "Last 6 hours", value: "6h", ms: 6 * 60 * 60 * 1000 },
  { label: "Last 24 hours", value: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "All time", value: "all", ms: 0 },
];

export function getTimeRangeMs(range: TimeRange): number {
  return TIME_RANGES.find((r) => r.value === range)?.ms ?? 0;
}

export function getTimeRangeOptions() {
  return TIME_RANGES.map((r) => ({ label: r.label, value: r.value }));
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  timeRange: "all",
  setTimeRange: (timeRange) => set({ timeRange }),
}));
