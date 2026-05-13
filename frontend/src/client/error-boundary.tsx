import React from "react";

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

type ErrorFallback = React.ComponentType<ErrorFallbackProps>;

interface ErrorBoundaryProps {
  children: React.ReactNode;
  FallbackComponent?: ErrorFallback;
  onError?: (error: Error, info: { componentStack: string }) => void;
}

type ErrorBoundaryState = { hasError: boolean; error: Error | null };

/**
 * React Error Boundary 组件。
 *
 * 在包裹的组件树内发生渲染错误时：
 *   1. 捕获错误
 *   2. 调用 onError 回调（可在此处记录日志）
 *   3. 渲染 FallbackComponent（若未提供则渲染默认的降级 UI）
 */
class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, {
      componentStack: info.componentStack ?? "",
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.FallbackComponent) {
        return (
          <this.props.FallbackComponent
            error={this.state.error}
            resetErrorBoundary={this.handleReset}
          />
        );
      }
      return <DefaultFallback error={this.state.error} resetErrorBoundary={this.handleReset} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

/* ============================================================
 * 默认降级 UI
 * ============================================================ */

function DefaultFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  const isDev = import.meta.env.DEV;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        color: "#e74c3c",
        fontSize: "14px",
      }}
    >
      <p>Component render error</p>
      {isDev && (
        <pre
          style={{
            marginTop: "12px",
            padding: "8px",
            background: "#1a1a2e",
            borderRadius: "6px",
            fontSize: "12px",
            maxWidth: "100%",
            overflow: "auto",
            color: "#e0e0e0",
          }}
        >
          {error.stack}
        </pre>
      )}
      <button
        onClick={resetErrorBoundary}
        style={{
          marginTop: "12px",
          padding: "6px 16px",
          border: "none",
          borderRadius: "6px",
          background: "#e74c3c",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
