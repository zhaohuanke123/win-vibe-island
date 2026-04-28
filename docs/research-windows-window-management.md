# Windows 窗口管理方案调研

> 调研日期：2026-04-26

## 一、Win32 窗口层级管理

### 1.1 窗口样式（Window Extended Styles）

Vibe Island 当前使用的窗口样式：

| 样式 | 值 | 作用 |
|------|-----|------|
| `WS_EX_TOPMOST` | 0x00000008 | 始终置顶 |
| `WS_EX_NOACTIVATE` | 0x08000000 | 不接收焦点 |
| `WS_EX_TRANSPARENT` | 0x00000020 | 点击穿透 |
| `WS_EX_LAYERED` | 0x00080000 | 支持透明度 |

### 1.2 Z-Order 管理

```rust
// 设置窗口层级
SetWindowPos(
    hwnd,
    HWND_TOPMOST,  // 或 HWND_NOTOPMOST, HWND_TOP, HWND_BOTTOM
    x, y, width, height,
    SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE
);
```

### 1.3 多窗口层级策略

| 层级 | 用途 | Z-Order |
|------|------|---------|
| 最高 | 紧急通知 | HWND_TOPMOST + 最高插入位置 |
| 高 | Overlay 主窗口 | HWND_TOPMOST |
| 中 | 普通应用 | 默认 |
| 低 | 后台窗口 | HWND_BOTTOM |

## 二、多显示器支持

### 2.1 显示器枚举

```rust
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, MONITORINFOEXW
};

// 枚举所有显示器
let monitors: Vec<HMONITOR> = vec![];
EnumDisplayMonitors(None, None, Some(enum_monitor_callback), LPARAM(0));

// 获取显示器信息
let mut info: MONITORINFOEXW = zeroed();
info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
GetMonitorInfoW(hmonitor, &mut info.monitorInfo);
```

### 2.2 显示器信息结构

```rust
struct MonitorInfo {
    handle: HMONITOR,
    rect: RECT,           // 显示器区域
    work_rect: RECT,      // 工作区域（排除任务栏）
    is_primary: bool,     // 是否主显示器
    dpi: u32,             // DPI 缩放
    scale_factor: f32,    // 缩放比例 (1.0, 1.5, 2.0)
}
```

### 2.3 Overlay 定位策略

```rust
// 获取目标显示器
fn get_target_monitor() -> HMONITOR {
    // 选项1: 主显示器
    // 选项2: 鼠标所在显示器
    // 选项3: 活动窗口所在显示器
    // 选项4: 用户配置的显示器
}

// 计算 Overlay 位置
fn calculate_overlay_position(monitor: &MonitorInfo, anchor: Anchor) -> (i32, i32) {
    let margin = 16; // 边距
    match anchor {
        Anchor::TopCenter => (
            monitor.work_rect.left + (monitor.work_rect.right - monitor.work_rect.left - OVERLAY_WIDTH) / 2,
            monitor.work_rect.top + margin
        ),
        Anchor::TopRight => (
            monitor.work_rect.right - OVERLAY_WIDTH - margin,
            monitor.work_rect.top + margin
        ),
        // ... 其他锚点
    }
}
```

## 三、窗口状态同步

### 3.1 窗口可见性

```rust
// 显示/隐藏窗口
ShowWindow(hwnd, SW_SHOW);    // 显示
ShowWindow(hwnd, SW_HIDE);    // 隐藏

// 带动画的显示/隐藏
AnimateWindow(hwnd, 200, AW_BLEND | AW_ACTIVATE);  // 淡入
AnimateWindow(hwnd, 200, AW_BLEND | AW_HIDE);      // 淡出
```

### 3.2 窗口尺寸变化通知

```rust
// 前端通知后端更新窗口尺寸
#[tauri::command]
fn update_overlay_size(width: u32, height: u32) -> Result<()> {
    let hwnd = get_overlay_hwnd()?;
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0, 0, // 保持位置
        width, height,
        SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOZORDER
    );
    Ok(())
}
```

### 3.3 DPI 变化处理

```rust
// 处理 WM_DPICHANGED 消息
fn handle_dpi_changed(hwnd: HWND, new_dpi: u32, suggested_rect: RECT) {
    // 更新内部 DPI 状态
    // 调整窗口尺寸
    SetWindowPos(hwnd, None, &suggested_rect, SWP_NOZORDER | SWP_NOACTIVATE);
}
```

## 四、点击穿透与交互模式切换

### 4.1 当前实现

```rust
// 切换点击穿透
pub fn set_click_through(hwnd: HWND, enabled: bool) -> Result<()> {
    let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if enabled {
        ex_style |= WS_EX_TRANSPARENT.0 as isize;
    } else {
        ex_style &= !(WS_EX_TRANSPARENT.0 as isize);
    }
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);
    Ok(())
}
```

### 4.2 交互模式检测

```rust
// 方案1: 鼠标悬停检测
fn on_mouse_move(hwnd: HWND, x: i32, y: i32) {
    // 鼠标进入窗口区域时禁用点击穿透
    set_click_through(hwnd, false);
}

fn on_mouse_leave(hwnd: HWND) {
    // 鼠标离开时恢复点击穿透
    set_click_through(hwnd, true);
}

// 方案2: 热键切换
fn toggle_interactive() {
    let is_interactive = get_interactive_state();
    set_click_through(hwnd, !is_interactive);
}

// 方案3: 展开时自动切换
fn on_expand(expanded: bool) {
    set_click_through(hwnd, !expanded);
}
```

### 4.3 最佳实践

| 场景 | 点击穿透 | 说明 |
|------|---------|------|
| 紧凑状态 | 启用 | 不干扰用户操作 |
| 展开状态 | 禁用 | 允许用户交互 |
| 有审批请求 | 禁用 | 必须响应用户 |
| 拖拽移动时 | 禁用 | 允许拖拽 |

## 五、窗口动画实现

### 5.1 AnimateWindow API

```rust
// Win32 内置动画
AnimateWindow(hwnd, 200, AW_BLEND);           // 淡入
AnimateWindow(hwnd, 200, AW_BLEND | AW_HIDE); // 淡出
AnimateWindow(hwnd, 200, AW_CENTER);          // 中心展开
AnimateWindow(hwnd, 200, AW_HOR_POSITIVE);    // 从左滑入
```

**限制**：
- 只支持预设动画类型
- 不支持弹簧物理动画
- 动画期间可能阻塞 UI

### 5.2 自定义动画（定时器驱动）

```rust
// 弹簧动画状态
struct SpringAnimation {
    start_value: f32,
    end_value: f32,
    current_value: f32,
    velocity: f32,
    stiffness: f32,  // 刚度
    damping: f32,    // 阻尼
    mass: f32,       // 质量
}

impl SpringAnimation {
    fn step(&mut self, dt: f32) -> bool {
        let displacement = self.current_value - self.end_value;
        let spring_force = -self.stiffness * displacement;
        let damping_force = -self.damping * self.velocity;
        let acceleration = (spring_force + damping_force) / self.mass;

        self.velocity += acceleration * dt;
        self.current_value += self.velocity * dt;

        // 检查是否完成
        displacement.abs() < 0.01 && self.velocity.abs() < 0.01
    }
}

// 定时器驱动的动画循环
fn start_animation_loop(hwnd: HWND) {
    let timer_id = 1;
    SetTimer(hwnd, timer_id, 16, None); // ~60fps

    // 在 WM_TIMER 消息中更新
    fn on_timer(hwnd: HWND) {
        if animation.step(0.016) {
            KillTimer(hwnd, timer_id);
        }
        update_window_size(hwnd, animation.current_value);
    }
}
```

### 5.3 前端驱动动画（推荐）

```tsx
// 前端使用 Framer Motion 动画
const overlayVariants = {
  compact: { width: 120, height: 36 },
  expanded: { width: 350, height: 80 },
}

<motion.div
  variants={overlayVariants}
  animate={state}
  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
  onUpdate={latest => {
    // 通知后端更新窗口尺寸
    invoke('update_overlay_size', {
      width: Math.round(latest.width),
      height: Math.round(latest.height)
    })
  }}
/>
```

## 六、DWM 高级特性（Windows 11）

### 6.1 圆角窗口

```rust
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute,
    DWMWA_WINDOW_CORNER_PREFERENCE,
    DWM_WINDOW_CORNER_PREFERENCE,
};

// 设置圆角
let corner = DWM_WINDOW_CORNER_PREFERENCE_DWMCWP_ROUND; // 圆角
DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner as *const _ as _, 4);
```

### 6.2 MICA 效果

```rust
// Windows 11 MICA 背景
let backdrop_type = DWM_SYSTEMBACKDROP_TYPE::DWMSBT_MAINWINDOW;
DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop_type as *const _ as _, 4);
```

### 6.3 暗色模式

```rust
// 暗色窗口边框
let dark_mode: BOOL = true.into();
DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark_mode as *const _ as _, 4);
```

## 七、与 Tauri 集成

### 7.1 当前架构

```
Frontend (React)          Backend (Rust)
     │                         │
     │  invoke()               │
     ├────────────────────────►│
     │                         │  Win32 API
     │                         ├────────────►
     │                         │
     │  emit event             │
     │◄────────────────────────┤
     │                         │
```

### 7.2 动画集成方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| 前端驱动 | 动画流畅、易调试 | IPC 开销 |
| 后端定时器 | 无 IPC 开销 | 实现复杂 |
| 混合方案 | 平衡性能与体验 | 架构复杂 |

### 7.3 推荐：前端驱动 + 节流

```rust
// 后端：带节流的尺寸更新
static LAST_UPDATE: Mutex<Instant> = Mutex::new(Instant::now());
const MIN_INTERVAL: Duration = Duration::from_millis(16); // ~60fps

#[tauri::command]
fn update_overlay_size(width: u32, height: u32) -> Result<()> {
    let mut last = LAST_UPDATE.lock().unwrap();
    let now = Instant::now();

    if now.duration_since(*last) < MIN_INTERVAL {
        return Ok(()); // 跳过，保持帧率
    }
    *last = now;

    // 实际更新窗口
    set_window_size(hwnd, width, height)
}
```

## 八、参考资料

- [AnimateWindow function - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-animatewindow)
- [DWMWINDOWATTRIBUTE enumeration - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)
- [Layered Windows - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/winmsg/layered-windows)
