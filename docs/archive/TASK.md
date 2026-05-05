# Vibe Island 窗口问题修复任务

## 项目背景
Vibe Island 是一个 Windows Overlay 应用（类似 Dynamic Island），使用 Tauri 2.0 + Rust + React + WebView2。

## 需要修复的问题

### 问题 1: Ghost Titlebar（窗口边框可见）
**现象**: 透明窗口有残留边框，能看到隐约的标题栏
**原因**: WebView2 版本 144.x 有 bug
**解决方案**: 
1. 下载 WebView2 Fixed Runtime 143.x (https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download)
2. 在 `tauri.conf.json` 中配置使用固定版本：
```json
"bundle": {
  "windows": {
    "webviewInstallMode": {
      "type": "fixedRuntime",
      "path": "./Microsoft.WebView2.FixedVersionRuntime.143.0.3650.139.x64/"
    }
  }
}
```

### 问题 2: 不能点击穿透
**现象**: 收起状态下不能点击穿透到下面的窗口
**原因**: Tauri 主窗口（WebView2）没有设置 `WS_EX_TRANSPARENT`
**解决方案**:
1. 在 `src-tauri/src/commands.rs` 添加新命令 `set_window_interactive`
2. 使用 Win32 API 获取 Tauri 主窗口的 HWND
3. 设置/移除 `WS_EX_TRANSPARENT` 样式
4. 收起时启用点击穿透，展开时禁用

参考代码（overlay.rs 已有类似实现）：
```rust
#[cfg(target_os = "windows")]
pub fn set_window_interactive(window: WebviewWindow, interactive: bool) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::*;
    use windows::Win32::Foundation::HWND;
    
    // 获取窗口句柄
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd = HWND(hwnd.0 as *mut _);
    
    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let new_style = if interactive {
            ex_style & !(WS_EX_TRANSPARENT.0 as isize)
        } else {
            ex_style | (WS_EX_TRANSPARENT.0 as isize)
        };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
    }
    Ok(())
}
```

### 问题 3: 展开/收起时闪烁
**现象**: 展开/收起动画时窗口闪烁
**原因**: React 渲染和窗口大小调整互相打架
**解决方案**: CSS transform 方案
1. 窗口初始化时设置固定最大尺寸（如 420x500）
2. 移除动态 `set_window_size` 调用
3. 用 CSS `transform: scaleY()` 控制展开/收起
4. 设置 `transform-origin: top center`

```css
.overlay {
  transform: scaleY(0.12); /* 收起状态 */
  transform-origin: top center;
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.overlay--expanded {
  transform: scaleY(1);
}
```

## 关键文件
- `/mnt/d/zhk02/Desktop/vibe-island/src-tauri/tauri.conf.json` — Tauri 配置
- `/mnt/d/zhk02/Desktop/vibe-island/src-tauri/src/commands.rs` — Rust 命令
- `/mnt/d/zhk02/Desktop/vibe-island/src-tauri/src/overlay.rs` — 已有 Win32 API 实现
- `/mnt/d/zhk02/Desktop/vibe-island/frontend/src/components/Overlay.tsx` — React 组件
- `/mnt/d/zhk02/Desktop/vibe-island/frontend/src/components/Overlay.css` — 样式文件

## 注意事项
1. 项目运行在 Windows 上，需要考虑 DPI 缩放
2. 已有 `overlay.rs` 实现了原生窗口的点击穿透，可以参考
3. 窗口始终透明，用户看不到窗口边界
4. 保持现有功能不变（session 管理、approval 面板等）
