import { useState, useEffect } from "react";

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}h${remainMin}m`;
}

/**
 * Auto-updating elapsed time since `startTime`.
 * Updates every second when ticking.
 */
export function useElapsedTime(startTime: number | undefined, ticking: boolean = true): string {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!startTime) {
      setElapsed("");
      return;
    }

    function tick() {
      setElapsed(formatElapsed(Date.now() - startTime!));
    }

    tick(); // immediate
    if (!ticking) return;

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startTime, ticking]);

  return elapsed;
}
