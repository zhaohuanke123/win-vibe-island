import type { UIPhase } from "../store/sessions";
import { useConfigStore } from "../store/config";

const FALLBACK: Record<UIPhase, string> = {
  waitingForApproval: '#f4a4a4',
  waitingForAnswer:   '#ffd58a',
  running:            '#6ea7ff',
  completed:          '#6fb982',
  idle:               '#9a958a',
};

export function phaseColor(phase: UIPhase): string {
  const colors = useConfigStore.getState().config.ui.stateColors;
  const key = phase as keyof typeof colors;
  return colors[key] ?? FALLBACK[phase] ?? FALLBACK.idle;
}

const PHASE_PRIORITY: Record<UIPhase, number> = {
  waitingForApproval: 4,
  waitingForAnswer:   3,
  running:            2,
  completed:          1,
  idle:               0,
};

export function phasePriority(phase: UIPhase): number {
  return PHASE_PRIORITY[phase] ?? 0;
}

export function isAttentionPhase(phase: UIPhase): boolean {
  return phase === 'waitingForApproval' || phase === 'waitingForAnswer';
}

/** Attachment state — derived, not stored. */
export type AttachmentState = 'attached' | 'stale' | 'detached';

const STALE_THRESHOLD_SEC = 300; // 5 minutes

/** Determine attachment state from session fields. */
export function getAttachmentState(session: {
  state: UIPhase;
  lastActivity: number;
  detached?: boolean;
}): AttachmentState {
  if (session.detached) return 'detached';
  if (session.state === 'completed') {
    const elapsed = (Date.now() - session.lastActivity) / 1000;
    if (elapsed > STALE_THRESHOLD_SEC) return 'stale';
  }
  return 'attached';
}

/** Shorthand: is this session stale (completed > 5 min)? */
export function isStale(session: { state: UIPhase; lastActivity: number; detached?: boolean }): boolean {
  return getAttachmentState(session) === 'stale';
}

/** Shorthand: is this session detached (process exited)? */
export function isDetached(session: { detached?: boolean }): boolean {
  return session.detached === true;
}

export function fmtAge(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}
