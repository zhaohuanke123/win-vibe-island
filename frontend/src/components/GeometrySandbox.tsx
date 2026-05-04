import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatedOverlay } from "./AnimatedOverlay";
import "./GeometrySandbox.css";

const ADAPTIVE_MIN_HEIGHT = 320;
const EXPANDED_MAX_HEIGHT = 720;
const FIXED_FOCUS_HEIGHT = 720;
const OVERLAY_BAR_HEIGHT = 52;

type SandboxMode =
  | "compact"
  | "adaptive-short"
  | "adaptive-long"
  | "approval-fixed"
  | "question-fixed"
  | "plan-fixed";

type WindowGeometry = {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  x: number;
  y: number;
  scaleFactor: number;
  isVisible: boolean;
  isFocused: boolean;
};

type RectSnapshot = {
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type SandboxDiagnostics = {
  runtime: "tauri" | "browser";
  viewport: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    documentHeight: number;
    rootScrollTop: number;
    devicePixelRatio: number;
    visualViewportScale: number | null;
  };
  overlay: RectSnapshot | null;
  panel: RectSnapshot | null;
  body: (RectSnapshot & {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    canScroll: boolean;
  }) | null;
  footer: (RectSnapshot & {
    visibleWithinOverlay: boolean;
  }) | null;
  native: WindowGeometry | null;
  nativeError: string | null;
};

const modeLabels: Record<SandboxMode, string> = {
  compact: "Compact",
  "adaptive-short": "Adaptive Short",
  "adaptive-long": "Adaptive Long",
  "approval-fixed": "Approval Fixed",
  "question-fixed": "Question Fixed",
  "plan-fixed": "Plan Fixed",
};

const modeOrder: SandboxMode[] = [
  "compact",
  "adaptive-short",
  "adaptive-long",
  "approval-fixed",
  "question-fixed",
  "plan-fixed",
];

function rectSnapshot(element: HTMLElement | null): RectSnapshot | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function createInitialDiagnostics(): SandboxDiagnostics {
  return {
    runtime: "browser",
    viewport: {
      innerWidth: 0,
      innerHeight: 0,
      outerWidth: 0,
      outerHeight: 0,
      documentHeight: 0,
      rootScrollTop: 0,
      devicePixelRatio: 1,
      visualViewportScale: null,
    },
    overlay: null,
    panel: null,
    body: null,
    footer: null,
    native: null,
    nativeError: null,
  };
}

function clampAdaptiveHeight(value: number) {
  return Math.max(ADAPTIVE_MIN_HEIGHT, Math.min(value, EXPANDED_MAX_HEIGHT));
}

function makeParagraphs(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => (
    <p key={`${prefix}-${index}`}>
      {prefix} line {index + 1}: This row intentionally adds enough content to
      prove that only the body scrolls while the footer actions remain visible.
    </p>
  ));
}

function makePlanSteps(count: number) {
  return Array.from({ length: count }, (_, index) => (
    <li key={index}>
      Step {index + 1}: validate overlay geometry, scroll behavior, and fixed
      footer placement under Tauri WebView2.
    </li>
  ));
}

function DiagnosticsGrid({
  diagnostics,
  diagnosticsRef,
}: {
  diagnostics: SandboxDiagnostics;
  diagnosticsRef: React.RefObject<HTMLDListElement | null>;
}) {
  const rows = [
    ["runtime", diagnostics.runtime],
    ["viewport", `${diagnostics.viewport.innerWidth}x${diagnostics.viewport.innerHeight}`],
    ["window outer", `${diagnostics.viewport.outerWidth}x${diagnostics.viewport.outerHeight}`],
    [
      "web scale",
      `dpr ${diagnostics.viewport.devicePixelRatio}, vv ${diagnostics.viewport.visualViewportScale ?? "n/a"}`,
    ],
    ["document height", diagnostics.viewport.documentHeight],
    ["root scrollTop", diagnostics.viewport.rootScrollTop],
    ["overlay", diagnostics.overlay ? `${diagnostics.overlay.width}x${diagnostics.overlay.height}` : "n/a"],
    ["panel", diagnostics.panel ? `${diagnostics.panel.width}x${diagnostics.panel.height}` : "n/a"],
    [
      "body",
      diagnostics.body
        ? `${diagnostics.body.clientHeight}/${diagnostics.body.scrollHeight}, top=${diagnostics.body.scrollTop}`
        : "n/a",
    ],
    ["body can scroll", diagnostics.body?.canScroll ? "yes" : "no"],
    ["footer visible", diagnostics.footer?.visibleWithinOverlay ? "yes" : "no"],
    [
      "native",
      diagnostics.native
        ? `${diagnostics.native.width}x${diagnostics.native.height}, inner ${diagnostics.native.innerWidth}x${diagnostics.native.innerHeight} @${diagnostics.native.scaleFactor}`
        : diagnostics.nativeError ?? "browser only",
    ],
  ];

  return (
    <dl className="geometry-sandbox__diagnostics" ref={diagnosticsRef}>
      {rows.map(([label, value]) => (
        <div key={label} className="geometry-sandbox__metric">
          <dt>{label}</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SandboxBody({ mode }: { mode: SandboxMode }) {
  if (mode === "adaptive-short") {
    return (
      <>
        <div className="geometry-sandbox__section-title">Short adaptive content</div>
        {makeParagraphs(3, "Adaptive short")}
      </>
    );
  }

  if (mode === "adaptive-long") {
    return (
      <>
        <div className="geometry-sandbox__section-title">Long adaptive content</div>
        {makeParagraphs(24, "Adaptive long")}
      </>
    );
  }

  if (mode === "question-fixed") {
    return (
      <>
        <div className="geometry-sandbox__section-title">Question body</div>
        {makeParagraphs(12, "Question")}
        <button className="geometry-sandbox__option" type="button">Option A with a long description</button>
        <button className="geometry-sandbox__option" type="button">Option B with a long description</button>
        <button className="geometry-sandbox__option" type="button">Option C with a long description</button>
        {makeParagraphs(10, "Question tail")}
      </>
    );
  }

  if (mode === "plan-fixed") {
    return (
      <>
        <div className="geometry-sandbox__section-title">Plan body</div>
        <ol className="geometry-sandbox__plan-list">{makePlanSteps(28)}</ol>
      </>
    );
  }

  return (
    <>
      <div className="geometry-sandbox__section-title">Approval body</div>
      <div className="geometry-sandbox__code-block">
        {makeParagraphs(20, "Diff preview")}
      </div>
      {makeParagraphs(8, "Approval tail")}
    </>
  );
}

export function GeometrySandbox() {
  const [mode, setMode] = useState<SandboxMode>("adaptive-short");
  const [measuredHeight, setMeasuredHeight] = useState(ADAPTIVE_MIN_HEIGHT);
  const [diagnostics, setDiagnostics] = useState<SandboxDiagnostics>(() => createInitialDiagnostics());
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const topbarRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const panelHeaderRef = useRef<HTMLElement | null>(null);
  const diagnosticsRef = useRef<HTMLDListElement | null>(null);

  const isExpanded = mode !== "compact";
  const isFixedMode = mode === "approval-fixed" || mode === "question-fixed" || mode === "plan-fixed";
  const expandedHeight = isFixedMode ? FIXED_FOCUS_HEIGHT : measuredHeight;

  const title = modeLabels[mode];
  const actions = useMemo(() => {
    if (mode === "approval-fixed") return ["Reject", "Approve"];
    if (mode === "question-fixed") return ["Skip", "Submit"];
    if (mode === "plan-fixed") return ["Cancel", "Proceed"];
    return ["Collapse", "Re-measure"];
  }, [mode]);

  const collectDiagnostics = useCallback(async () => {
    const overlay = rectSnapshot(overlayRef.current);
    const panel = rectSnapshot(panelRef.current);
    const bodyRect = rectSnapshot(bodyRef.current);
    const footerRect = rectSnapshot(footerRef.current);
    const scroller = bodyRef.current;
    const rootScrollTop = document.scrollingElement?.scrollTop ?? 0;
    let native: WindowGeometry | null = null;
    let nativeError: string | null = null;

    if (window.__TAURI_INTERNALS__) {
      try {
        native = await invoke<WindowGeometry>("get_window_geometry");
      } catch (error) {
        nativeError = error instanceof Error ? error.message : String(error);
      }
    }

    setDiagnostics({
      runtime: window.__TAURI_INTERNALS__ ? "tauri" : "browser",
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        documentHeight: document.documentElement.clientHeight,
        rootScrollTop,
        devicePixelRatio: window.devicePixelRatio,
        visualViewportScale: window.visualViewport?.scale ?? null,
      },
      overlay,
      panel,
      body: bodyRect && scroller
        ? {
            ...bodyRect,
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
            scrollTop: Math.round(scroller.scrollTop),
            canScroll: scroller.scrollHeight > scroller.clientHeight,
          }
        : null,
      footer: footerRect
        ? {
            ...footerRect,
            visibleWithinOverlay: Boolean(overlay && footerRect.bottom <= overlay.bottom),
          }
        : null,
      native,
      nativeError,
    });
  }, []);

  useEffect(() => {
    if (!isExpanded || isFixedMode) return;
    let raf = 0;
    let retryTimer = 0;

    const measure = () => {
      const body = bodyRef.current;
      if (!body) return;
      const topbarHeight = topbarRef.current?.offsetHeight ?? OVERLAY_BAR_HEIGHT;
      const headerHeight = panelHeaderRef.current?.offsetHeight ?? 0;
      const footerHeight = footerRef.current?.offsetHeight ?? 0;
      const chrome = topbarHeight + headerHeight + footerHeight + 28;
      const nextHeight = clampAdaptiveHeight(chrome + body.scrollHeight);
      setMeasuredHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    retryTimer = window.setTimeout(scheduleMeasure, 120);
    const observer = new ResizeObserver(measure);
    if (panelRef.current) observer.observe(panelRef.current);
    if (bodyRef.current) observer.observe(bodyRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(retryTimer);
      observer.disconnect();
    };
  }, [isExpanded, isFixedMode, mode]);

  useEffect(() => {
    collectDiagnostics();
    const interval = window.setInterval(() => {
      void collectDiagnostics();
    }, 250);
    return () => window.clearInterval(interval);
  }, [collectDiagnostics, mode, expandedHeight]);

  const handleModeChange = (nextMode: SandboxMode) => {
    if (nextMode !== mode && bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
    if (nextMode === "adaptive-long") {
      setMeasuredHeight(EXPANDED_MAX_HEIGHT);
    } else if (nextMode === "adaptive-short") {
      setMeasuredHeight(ADAPTIVE_MIN_HEIGHT);
    }
    setMode(nextMode);
  };

  if (!isExpanded) {
    return (
      <AnimatedOverlay className="geometry-sandbox geometry-sandbox--compact" isExpanded={false} data-testid="geometry-sandbox">
        <button className="geometry-sandbox__compact-button" type="button" onClick={() => handleModeChange("adaptive-short")}>
          Geometry Sandbox
        </button>
      </AnimatedOverlay>
    );
  }

  return (
    <AnimatedOverlay
      key={mode}
      className={`geometry-sandbox geometry-sandbox--expanded${isFixedMode ? " geometry-sandbox--fixed" : " geometry-sandbox--adaptive"}`}
      isExpanded
      expandedHeight={expandedHeight}
      data-testid="geometry-sandbox"
    >
      <div className="geometry-sandbox__surface" ref={overlayRef}>
        <div className="geometry-sandbox__topbar" ref={topbarRef}>
          <div className="geometry-sandbox__title">
            <span className="geometry-sandbox__dot" />
            <span>{title}</span>
          </div>
          <div className="geometry-sandbox__mode-tabs">
            {modeOrder.map((item) => (
              <button
                key={item}
                type="button"
                className={item === mode ? "geometry-sandbox__mode-tab geometry-sandbox__mode-tab--active" : "geometry-sandbox__mode-tab"}
                onClick={() => handleModeChange(item)}
              >
                {modeLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="geometry-sandbox__panel" ref={panelRef} data-testid="geometry-panel">
          <header className="geometry-sandbox__panel-header" ref={panelHeaderRef}>
            <span>{isFixedMode ? "Fixed focus panel" : "Adaptive panel"}</span>
            <span>{isFixedMode ? "600x720 target" : `measured ${Math.round(measuredHeight)}px`}</span>
          </header>

          <main className="geometry-sandbox__body" ref={bodyRef} data-testid="geometry-body" onScroll={() => void collectDiagnostics()}>
            <SandboxBody mode={mode} />
          </main>

          <footer className="geometry-sandbox__footer" ref={footerRef} data-testid="geometry-footer">
            <div className="geometry-sandbox__footer-status">
              footer fixed: {diagnostics.footer?.visibleWithinOverlay ? "visible" : "checking"}
            </div>
            <div className="geometry-sandbox__actions">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="geometry-sandbox__action"
                  onClick={() => {
                    if (action === "Collapse") handleModeChange("compact");
                    if (action === "Re-measure") void collectDiagnostics();
                  }}
                >
                  {action}
                </button>
              ))}
            </div>
          </footer>
        </div>

        <DiagnosticsGrid diagnostics={diagnostics} diagnosticsRef={diagnosticsRef} />
      </div>
    </AnimatedOverlay>
  );
}
