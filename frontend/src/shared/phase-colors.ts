import type { UIPhase } from "../store/sessions";

const PHASE_COLOR: Record<UIPhase, string> = {
  waitingForApproval: '#f4a4a4',
  waitingForAnswer:   '#ffd58a',
  running:            '#6ea7ff',
  completed:          '#6fb982',
  idle:               '#9a958a',
};

export function phaseColor(phase: UIPhase): string {
  return PHASE_COLOR[phase] ?? PHASE_COLOR.idle;
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
