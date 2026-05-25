# ControlCenter 控制中心 设计规格

> **Status**: approved
> **日期**: 2026-05-25
> **关联产物**: [../artifacts/flows/master-interaction-flow.html](../artifacts/flows/master-interaction-flow.html)

---

## 1. 目的

ControlCenter 是独立窗口，提供系统级设置和调试入口。包括 Hook/Pipe 服务器管理、进程监控、日志查看等功能。与主 Overlay 分离，拥有独立窗口。

## 2. 视觉规格

### 2.1 布局与尺寸

| 属性 | 值 |
|------|-----|
| 窗口尺寸 | 480×640px |
| 圆角 | 12px |
| 内边距 | 16px |

### 2.2 颜色

遵循主设计系统，与 Overlay 保持一致的玻璃态风格。

| 元素 | CSS 变量 |
|------|---------|
| 窗口背景 | `var(--glass-bg)` |
| 标题栏 | `var(--bg-soft)` |
| 内容区 | 透明 (继承) |

## 3. 组件 API

独立 Tauri 窗口，通过 IPC 命令打开/关闭。

## 4. CSS / BEM 类名结构

```
.control-center                     -- 根容器
.control-center__header             -- 标题栏
.control-center__nav                -- 导航区
.control-center__content            -- 内容区
.control-center__section            -- 功能分区
```

## 5. 实现验证清单

- [x] 窗口 480×640px, 圆角 12px
- [x] 玻璃态背景与主 Overlay 一致
- [x] 独立窗口 (非 Overlay 内嵌)
- [x] `npm run build` 通过
