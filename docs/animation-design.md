# Vibe Island 动画系统技术方案

> 版本：1.0
> 日期：2026-04-26
> 状态：草案

## 一、设计目标

### 1.1 用户体验目标

- **灵动岛风格**：借鉴 macOS Dynamic Island 的动画美学
- **流畅自然**：使用弹簧物理动画，避免机械感
- **响应迅速**：动画时长控制在 200-500ms
- **不干扰工作**：紧凑状态收成小胶囊并保持可点击，展开时显示完整交互面板

### 1.2 技术目标

- **60fps 动画**：平滑的视觉体验
- **低 CPU 占用**：避免持续高负载
- **跨平台兼容**：Windows 10/11 均可运行
- **易于维护**：前后端职责清晰

## 二、动画系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Overlay   │  │  Approval   │  │   Animation         │  │
│  │  Component  │  │   Panel     │  │   Controller        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   Framer Motion                              │
│                   (Spring Physics)                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ IPC (invoke/update_overlay_size)
                           │ 节流：16ms 最小间隔
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Rust)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  commands   │  │   overlay   │  │   Window Manager    │  │
│  │    .rs      │  │    .rs      │  │   (Win32 API)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 职责分工

| 层级 | 职责 | 技术 |
|------|------|------|
| Frontend | 动画计算、状态管理、UI 渲染 | Framer Motion |
| IPC | 尺寸同步、事件通知 | Tauri Commands |
| Backend | 窗口管理、Win32 API 调用 | Rust + windows crate |

### 2.3 数据流

```
用户交互 → 状态变化 → Framer Motion 动画
                              ↓
                        onUpdate 回调
                              ↓
                    invoke('update_overlay_size')
                              ↓
                        节流检查 (16ms)
                              ↓
                        SetWindowPos()
                              ↓
                        窗口尺寸更新
```

## 三、动画参数配置

### 3.1 弹簧动画参数

```typescript
// frontend/src/config/animation.ts

export const SPRING_CONFIG = {
  // 展开/收缩动画
  expand: {
    stiffness: 300,
    damping: 25,
    mass: 1,
  },
  collapse: {
    stiffness: 350,
    damping: 28,
    mass: 0.9,
  },
  // 状态切换
  transition: {
    stiffness: 400,
    damping: 30,
    mass: 1,
  },
  // 微交互（按钮点击等）
  micro: {
    stiffness: 500,
    damping: 35,
    mass: 0.8,
  },
} as const

// 动画时长参考
export const DURATION = {
  micro: 150,      // 微交互
  transition: 250, // 状态切换
  expand: 400,     // 展开
  collapse: 300,   // 收缩
} as const
```

### 3.2 缓动曲线（CSS fallback）

```typescript
export const EASING = {
  // 弹性曲线
  springBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  // 平滑曲线
  springSmooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
  // 快速响应
  springSnappy: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
} as const
```

### 3.3 明显弹性灵动岛尺寸

Overlay 主动画由 Framer Motion 驱动，并通过 `update_overlay_size` 同步 Tauri 窗口真实宽高。紧凑态不再保持 420px 固定宽度，而是收成可点击小胶囊；展开态从窗口中心向两侧弹性扩展。审批/问答/计划请求出现时使用固定 600x720 专注模式，审批内容优先于 session 列表。

| 状态 | 宽度 | 高度 | 圆角 | 行为 |
|------|------|------|------|------|
| compact | 236px | 52px | 26px | 仅显示状态点、会话标签和 Hook 小点，可点击展开 |
| expanded | 600px | 720px | 18px | 普通展开内容；审批/问答/计划时进入专注处理模式 |

弹簧参数：

```typescript
export const SPRING_CONFIG = {
  expand: {
    stiffness: 300,
    damping: 22,
    mass: 0.9,
  },
  collapse: {
    stiffness: 380,
    damping: 26,
    mass: 0.85,
  },
} as const
```

窗口同步要求：

- 动画帧调用 `update_overlay_size({ width, height, anchorCenter: true })`
- 后端以当前窗口中心点为锚点重新计算 X 坐标，避免从左侧单边展开或收缩
- 胶囊态保持主窗口可交互，不启用点击穿透
- 外层容器同时动画 `borderRadius` 和 `clipPath`，实际黑色 surface 只由 shell 绘制；bar/panel 保持透明，避免子层背景覆盖父层底部圆角
- 审批请求到达时延后一帧触发展开，保证从胶囊态到固定 600x720 专注模式有可见 spring 动画；长内容只让正文主区域滚动；审批处理或超时清理后自动收回胶囊
- 审批/问答/Plan 模式只显示轻量 session 上下文摘要，不渲染完整 session 列表，避免压缩主任务内容
- 审批面板内部保留一个主滚动区域；外层 Overlay 不显示第二层滚动条

## 四、前端实现

### 4.1 动画组件

```tsx
// frontend/src/components/AnimatedOverlay.tsx
import { motion, useAnimation } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { SPRING_CONFIG } from '../config/animation'

interface AnimatedOverlayProps {
  isExpanded: boolean
  children: React.ReactNode
}

export function AnimatedOverlay({ isExpanded, children }: AnimatedOverlayProps) {
  const controls = useAnimation()

  // 尺寸配置
  const variants = {
    compact: {
      width: 236,
      height: 52,
      borderRadius: 26,
    },
    expanded: {
      width: 600,
      height: 720,
      borderRadius: 18,
    },
  }

  // 处理动画更新，同步窗口尺寸
  const handleUpdate = useThrottledCallback(
    async (latest: { width: number; height: number }) => {
      try {
        await invoke('update_overlay_size', {
          width: Math.round(latest.width),
          height: Math.round(latest.height),
          anchorCenter: true,
        })
      } catch (error) {
        console.error('Failed to update overlay size:', error)
      }
    },
    16 // ~60fps
  )

  return (
    <motion.div
      variants={variants}
      animate={isExpanded ? 'expanded' : 'compact'}
      transition={{
        type: 'spring',
        ...SPRING_CONFIG.expand,
      }}
      onUpdate={handleUpdate}
      style={{
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  )
}
```

### 4.2 节流 Hook

```typescript
// frontend/src/hooks/useThrottledCallback.ts
import { useCallback, useRef } from 'react'

export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(0)

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now()
      if (now - lastRun.current >= delay) {
        lastRun.current = now
        return callback(...args)
      }
    }) as T,
    [callback, delay]
  )
}
```

### 4.3 状态切换动画

```tsx
// frontend/src/components/StatusDot.tsx
import { motion } from 'framer-motion'

interface StatusDotProps {
  status: 'idle' | 'thinking' | 'waiting' | 'error'
}

const statusColors = {
  idle: '#6b7280',
  thinking: '#3b82f6',
  waiting: '#f59e0b',
  error: '#ef4444',
}

export function StatusDot({ status }: StatusDotProps) {
  return (
    <motion.div
      animate={{
        backgroundColor: statusColors[status],
        scale: status === 'thinking' ? [1, 1.2, 1] : 1,
      }}
      transition={{
        backgroundColor: { type: 'spring', stiffness: 400, damping: 30 },
        scale: {
          duration: 1,
          repeat: Infinity,
          ease: 'easeInOut',
        },
      }}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
      }}
    />
  )
}
```

### 4.4 内容入场动画

展开时使用 `AnimatePresence` 让面板内容执行 `opacity + y + scale` 入场，session 列表采用轻微 stagger。收缩时先隐藏面板内容，再让窗口回到胶囊尺寸，避免内容在小胶囊中挤压。

### 4.5 Compact 状态布局规范

紧凑态胶囊内容必须自适应垂直居中，不依赖固定像素值。

**布局要求**：
- `#root` 容器使用 `align-items: center` 让内容垂直居中
- `overlay__shell` 使用 `display: flex; flex-direction: column;` 让子元素自适应排列
- `overlay__bar` 内容通过 `align-items: center` 在 bar 高度内垂直居中

**CSS 实现**：

```css
#root {
  align-items: center;
}
```

这样无论窗口高度如何变化，内容都会自适应居中。

## 五、后端实现

### 5.1 尺寸更新命令

```rust
// src-tauri/src/commands.rs

use std::sync::Mutex;
use std::time::{Duration, Instant};

static LAST_SIZE_UPDATE: Mutex<Option<Instant>> = Mutex::new(None);
const MIN_UPDATE_INTERVAL: Duration = Duration::from_millis(16);

#[tauri::command]
pub fn update_overlay_size(
    width: u32,
    height: u32,
    anchor_center: Option<bool>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    // 节流检查
    {
        let mut last = LAST_SIZE_UPDATE.lock().unwrap();
        if let Some(last_time) = *last {
            if last_time.elapsed() < MIN_UPDATE_INTERVAL {
                return Ok(()); // 跳过过快的更新
            }
        }
        *last = Some(Instant::now());
    }

    let target_x = if anchor_center.unwrap_or(false) {
        // Resize around the current window center so the island expands from the middle.
        let position = window.outer_position().map_err(|e| e.to_string())?;
        let current = window.outer_size().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().unwrap_or(1.0);
        let current_width = current.width as f64 / scale;
        let center_x = position.x as f64 / scale + current_width / 2.0;
        Some(center_x - width as f64 / 2.0)
    } else {
        None
    };

    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: width as f64,
            height: height as f64,
        }))
        .map_err(|e| e.to_string())?;

    if let Some(x) = target_x {
        window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
            x,
            y: 8.0,
        })).map_err(|e| e.to_string())?;
    }

    Ok(())
}
```

### 5.2 点击穿透切换

```rust
// src-tauri/src/overlay.rs

#[cfg(target_os = "windows")]
pub fn set_click_through(hwnd: HWND, enabled: bool) -> Result<()> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT
    };

    unsafe {
        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);

        if enabled {
            ex_style |= WS_EX_TRANSPARENT.0 as isize;
        } else {
            ex_style &= !(WS_EX_TRANSPARENT.0 as isize);
        }

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);
    }

    Ok(())
}

// 根据状态自动切换
pub fn update_interactive_mode(hwnd: HWND, is_expanded: bool) -> Result<()> {
    set_click_through(hwnd, !is_expanded)
}
```

### 5.3 圆角设置（Windows 11）

```rust
// src-tauri/src/overlay.rs

#[cfg(target_os = "windows")]
pub fn set_rounded_corners(hwnd: HWND) -> Result<()> {
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute,
        DWMWA_WINDOW_CORNER_PREFERENCE,
        DWM_WINDOW_CORNER_PREFERENCE,
    };

    unsafe {
        let corner_pref = DWM_WINDOW_CORNER_PREFERENCE::DWMCWP_ROUND;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_pref as *const _ as _,
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        )?;
    }

    Ok(())
}
```

## 六、性能优化

### 6.1 前端优化

| 优化项 | 方法 |
|-------|------|
| 节流 IPC | 16ms 最小间隔 |
| will-change | CSS 提示 GPU 加速 |
| transform | 使用 transform 而非 width/height |
| 避免重排 | 使用 absolute 定位 |

```css
.overlay {
  will-change: transform, width, height;
  transform: translateZ(0); /* 强制 GPU 层 */
}
```

### 6.2 后端优化

| 优化项 | 方法 |
|-------|------|
| 节流检查 | 避免过快的 Win32 调用 |
| 批量更新 | 合并连续的尺寸变化 |
| 异步处理 | 不阻塞主线程 |

### 6.3 性能指标

| 指标 | 目标值 |
|------|--------|
| 动画帧率 | ≥ 60fps |
| IPC 延迟 | < 1ms |
| CPU 占用 | < 5% (动画期间) |
| 内存增量 | < 10MB |

## 七、测试计划

### 7.1 单元测试

- [ ] 弹簧动画参数计算正确性
- [ ] 节流函数逻辑正确性
- [ ] Win32 API 调用正确性

### 7.2 集成测试

- [ ] 展开/收缩动画流畅性
- [ ] 窗口尺寸同步正确性
- [ ] 点击穿透切换正确性

### 7.3 性能测试

- [ ] 动画帧率测试
- [ ] CPU 占用测试
- [ ] 内存占用测试

## 八、实施计划

### Phase 1: 基础动画（1-2天）

1. 添加 Framer Motion 依赖
2. 实现基础展开/收缩动画
3. 实现 IPC 尺寸同步

### Phase 2: 交互优化（1天）

1. 实现点击穿透自动切换
2. 添加状态切换动画
3. 优化动画参数

### Phase 3: 性能优化（1天）

1. 添加节流机制
2. GPU 加速优化
3. 性能测试和调优

### Phase 4: 测试和文档（1天）

1. 编写测试用例
2. 更新文档
3. Code Review

## 九、风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| IPC 延迟导致动画卡顿 | 高 | 节流 + 前端预测 |
| Win32 API 兼容性问题 | 中 | 版本检测 + fallback |
| 高 DPI 显示异常 | 中 | DPI 感知代码 |
| WebView2 性能问题 | 低 | GPU 加速 |

## 十、参考资料

- [Framer Motion Documentation](https://motion.dev/motion/)
- [Windows DWM API](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/)
- [AnimateWindow function](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-animatewindow)
