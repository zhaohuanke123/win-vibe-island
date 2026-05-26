import type { GlobalProvider } from "@ladle/react";
import "../src/index.css";

/**
 * Ladle 全局 Provider
 * - 注入项目全局 CSS（CSS 变量、玻璃态、字体）
 * - 设置深色背景模拟真实 overlay 环境
 * - 后续可在此注入 mock Zustand store
 */
export const Provider: GlobalProvider = ({ children }) => (
  <div
    style={{
      minHeight: "100vh",
      background: "#0d0d0f",
      color: "var(--paper)",
      fontFamily: "var(--font-ui)",
      padding: "24px",
    }}
  >
    {children}
  </div>
);
