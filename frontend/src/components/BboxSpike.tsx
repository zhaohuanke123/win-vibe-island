import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// BboxSpike —— decouple-overlay-geometry Phase 1 验证原型。
// 故意自包含、可丢弃；不与主 Overlay.tsx 共享代码。
// 验证 4 件事：(1) clip-path 动画流畅度；(2) SetWindowRgn 单次开销；
// (3) compact 态 region 命中穿透；(4) bounding box 位置模型。
// 注：用 CSS transition 驱动 clip-path（而非 framer-motion spring）——
// framer-motion 12 对 clip-path 字符串插值不可靠，CSS transition 在 WebView2 直接走 GPU 合成。

const BOX_W = 600;
const BOX_H = 720;
const PILL_W = 236;
const PILL_H = 52;
const BOX_RADIUS = 18;
const PILL_RADIUS = PILL_H / 2;

const PILL_OFFSET_X = (BOX_W - PILL_W) / 2;

type Inset = { top: number; right: number; bottom: number; left: number; radius: number };

const COMPACT_INSET: Inset = {
  top: 0,
  right: PILL_OFFSET_X,
  bottom: BOX_H - PILL_H,
  left: PILL_OFFSET_X,
  radius: PILL_RADIUS,
};

const EXPANDED_INSET: Inset = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  radius: BOX_RADIUS,
};

function clipPathStatic(inset: Inset): string {
  return `inset(${inset.top}px ${inset.right}px ${inset.bottom}px ${inset.left}px round ${inset.radius}px)`;
}

function getScale(): number {
  return Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
}

type CallRecord = { kind: "size" | "region"; note: string; t: number };

export function BboxSpike() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [sizeCalls, setSizeCalls] = useState(0);
  const [regionCalls, setRegionCalls] = useState(0);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const isTauri = Boolean(window.__TAURI_INTERNALS__);
  // 防止 effect 双触发计数：用 ref 跟踪上次 region 状态
  const lastRegionStateRef = useRef<boolean | null>(null);

  const recordCall = useCallback((record: CallRecord) => {
    setCalls((prev) => [record, ...prev].slice(0, 8));
    if (record.kind === "size") setSizeCalls((c) => c + 1);
    else setRegionCalls((c) => c + 1);
  }, []);

  // 启动即把 HWND 撑到 bounding box（B4：恒定尺寸）
  useEffect(() => {
    if (!isTauri) return;
    void invoke("update_overlay_size", {
      width: BOX_W,
      height: BOX_H,
      webviewScaleFactor: getScale(),
      borderRadius: BOX_RADIUS,
      anchorCenter: true,
    }).then(() => {
      recordCall({ kind: "size", note: `init HWND → ${BOX_W}x${BOX_H}`, t: performance.now() });
    }).catch(() => {});
  }, [isTauri, recordCall]);

  // 状态切换时 step region（compact=药丸 / expanded=全 box）—— 仅状态切换，不在动画每帧
  useEffect(() => {
    if (!isTauri) return;
    if (lastRegionStateRef.current === isExpanded) return;
    lastRegionStateRef.current = isExpanded;

    const payload = isExpanded
      ? { x: 0, y: 0, w: BOX_W, h: BOX_H, note: `expand → full box ${BOX_W}x${BOX_H}` }
      : { x: PILL_OFFSET_X, y: 0, w: PILL_W, h: PILL_H, note: `collapse → pill (${PILL_OFFSET_X},0) ${PILL_W}x${PILL_H}` };

    void invoke("set_overlay_region", {
      x: payload.x,
      y: payload.y,
      w: payload.w,
      h: payload.h,
      webviewScaleFactor: getScale(),
    }).then(() => {
      recordCall({ kind: "region", note: payload.note, t: performance.now() });
    }).catch(() => {});
  }, [isExpanded, isTauri, recordCall]);

  const handleToggle = () => {
    setIsExpanded((v) => !v);
    if (!isTauri) return;
    // 动画开始端点：立即调一次 update_overlay_size（B4：跳到 max，此处已是 max，后端 no-op）
    void invoke("update_overlay_size", {
      width: BOX_W, height: BOX_H,
      webviewScaleFactor: getScale(),
      borderRadius: BOX_RADIUS, anchorCenter: true,
    }).then(() => {
      recordCall({ kind: "size", note: "anim start (max)", t: performance.now() });
    }).catch(() => {});
    // 动画结束端点：CSS transition 320ms 后 settle（B4：仍是 max，后端 no-op）
    window.setTimeout(() => {
      void invoke("update_overlay_size", {
        width: BOX_W, height: BOX_H,
        webviewScaleFactor: getScale(),
        borderRadius: BOX_RADIUS, anchorCenter: true,
      }).then(() => {
        recordCall({ kind: "size", note: "anim end (settle)", t: performance.now() });
      }).catch(() => {});
    }, 340);
  };

  const targetInset = isExpanded ? EXPANDED_INSET : COMPACT_INSET;

  return (
    <>
      {/* debug：bounding box 虚线轮廓，让用户看见 600×720 的实际 HWND 范围 */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: BOX_W,
          height: BOX_H,
          border: "1px dashed rgba(120, 180, 255, 0.35)",
          pointerEvents: "none",
          zIndex: 1,
        }}
        data-testid="bbox-spike-outline"
      />

      {/* 可见 overlay：固定 600×720 + CSS transition 驱动 clip-path（GPU 合成）*/}
      <div
        data-testid="bbox-spike-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: BOX_W,
          height: BOX_H,
          background: "rgba(18, 18, 20, 0.96)",
          overflow: "hidden",
          zIndex: 2,
          clipPath: clipPathStatic(targetInset),
          transition: "clip-path 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* 药丸（顶部居中，永远渲染，compact 时是唯一可见部分） */}
        <button
          type="button"
          onClick={handleToggle}
          style={{
            position: "absolute",
            top: 0,
            left: PILL_OFFSET_X,
            width: PILL_W,
            height: PILL_H,
            border: "none",
            background: "rgba(60, 100, 180, 0.9)",
            color: "white",
            fontSize: 12,
            fontFamily: "var(--font-ui, system-ui)",
            cursor: "pointer",
            borderRadius: PILL_RADIUS,
          }}
          data-testid="bbox-spike-pill"
        >
          {isExpanded ? "▼ pill (click to collapse)" : "▲ pill (click to expand)"}
        </button>

        {/* expanded 内容：clip-path 收起时被裁掉 */}
        <div
          style={{
            position: "absolute",
            top: PILL_H + 16,
            left: 16,
            right: 16,
            bottom: 16,
            color: "rgba(255,255,255,0.85)",
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 8 }}>Bbox Spike (decouple-overlay-geometry Phase 1)</div>
          <div>runtime: <strong>{isTauri ? "tauri" : "browser (region/resize n/a)"}</strong></div>
          <div>state: <strong>{isExpanded ? "expanded" : "compact"}</strong></div>
          <div>box: {BOX_W}×{BOX_H} | pill: {PILL_W}×{PILL_H} @ offset x={PILL_OFFSET_X}</div>
          <div style={{ marginTop: 8 }}>update_overlay_size calls: <strong>{sizeCalls}</strong></div>
          <div>set_overlay_region calls: <strong>{regionCalls}</strong></div>
          <div style={{ marginTop: 8, opacity: 0.7 }}>recent calls (newest first):</div>
          <pre style={{ margin: 0, opacity: 0.85 }}>
            {calls.length === 0 ? "(none)" : calls.map((c) => `[${c.kind}] ${c.note}`).join("\n")}
          </pre>

          <div style={{ marginTop: 16, padding: 8, background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.3)", borderRadius: 6 }}>
            <div style={{ color: "#FFC107", marginBottom: 4 }}>手动验证清单：</div>
            <div>1. 切到 compact，点 bounding box 内、药丸外的区域 → 应穿透到下层窗口</div>
            <div>2. 切到 expanded，点 box 内任意位置 → 应命中 overlay</div>
            <div>3. 视觉：clip-path spring 动画是否流畅（对比浏览器）</div>
            <div>4. 切到 compact，Alt+Tab / 截屏选区 → 观察 600×720 HWND 是否出现在预览</div>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            style={{
              marginTop: 16, padding: "8px 16px",
              background: "rgba(80,80,80,0.8)", color: "white",
              border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, cursor: "pointer",
            }}
          >
            {isExpanded ? "Collapse" : "Expand"}
        </button>
        </div>
      </div>
    </>
  );
}
