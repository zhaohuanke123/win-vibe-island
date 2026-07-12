/**
 * AnimatedOverlay 诊断日志（Bug 1 调查用）。
 * 生产构建下整个调用点被 Vite 剥离（import.meta.env.DEV 静态为 false）。
 * 输出格式：`[AO-DIAG] <event>` + 结构化 payload，方便 DevTools 控制台过滤。
 */
export function logAnimDiag(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  console.debug(`[AO-DIAG] ${event}`, payload);
}
