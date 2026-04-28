# macOS 灵动岛动画调研

> 调研日期：2026-04-26

## 一、灵动岛动画特性

### 1.1 动画类型

| 动画类型 | 描述 | 典型时长 |
|---------|------|---------|
| 展开/收缩 | 从紧凑状态扩展到详细视图 | 300-500ms |
| 状态切换 | 不同状态间的过渡（如音乐播放→计时器） | 200-400ms |
| 呼吸效果 | 轻微的尺寸脉动，表示活动状态 | 持续动画 |
| 滑入/滑出 | 内容从边缘滑入或滑出 | 250-350ms |

### 1.2 动画特点

- **弹性物理动画**：使用弹簧物理模型，而非线性缓动
- **无缝过渡**：状态间平滑过渡，无突兀跳变
- **响应式尺寸**：根据内容动态调整大小
- **圆角一致性**：动画过程中保持圆角平滑

## 二、弹簧动画参数

### 2.1 物理弹簧参数

基于 Framer Motion 和 iOS Core Animation 的弹簧动画模型：

| 参数 | 默认值 | 描述 | 推荐范围 |
|------|--------|------|---------|
| `stiffness` (刚度) | 100-400 | 值越大，动画越突然 | 200-400 |
| `damping` (阻尼) | 10-30 | 值越大，振荡越少 | 15-25 |
| `mass` (质量) | 1 | 值越大，动画越迟缓 | 0.8-1.2 |
| `velocity` (初始速度) | 0 | 动画开始时的速度 | 0 |

### 2.2 灵动岛风格推荐参数

```javascript
// 紧凑→展开动画
const expandSpring = {
  stiffness: 300,
  damping: 25,
  mass: 1,
  // 预期视觉时长: ~400ms
}

// 收缩动画
const collapseSpring = {
  stiffness: 350,
  damping: 28,
  mass: 0.9,
  // 预期视觉时长: ~300ms
}

// 状态切换
const transitionSpring = {
  stiffness: 400,
  damping: 30,
  mass: 1,
  // 预期视觉时长: ~250ms
}
```

### 2.3 Duration-Based 弹簧（简化配置）

| 参数 | 推荐值 | 描述 |
|------|--------|------|
| `bounce` | 0.2-0.3 | 轻微弹性，不过度振荡 |
| `visualDuration` | 0.3-0.5 | 视觉完成的时长（秒） |

## 三、CSS 实现方案

### 3.1 CSS Spring Animation（实验性）

```css
.overlay {
  /* 现代浏览器实验性支持 */
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 或使用 @property 配合关键帧 */
@property --scale {
  syntax: '<number>';
  initial-value: 1;
  inherits: false;
}
```

### 3.2 推荐缓动曲线

```css
/* 灵动岛风格弹性曲线 */
--spring-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
--spring-smooth: cubic-bezier(0.22, 1, 0.36, 1);
--spring-snappy: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

## 四、React/Framer Motion 实现

### 4.1 基础弹簧动画

```tsx
import { motion, useSpring } from 'framer-motion'

const springConfig = {
  stiffness: 300,
  damping: 25,
  mass: 1,
}

function DynamicIsland() {
  const scale = useSpring(1, springConfig)

  return (
    <motion.div
      layout
      transition={{
        type: 'spring',
        ...springConfig,
      }}
    >
      {/* 内容 */}
    </motion.div>
  )
}
```

### 4.2 状态切换动画

```tsx
const variants = {
  compact: {
    width: 120,
    height: 36,
    borderRadius: 18,
    transition: { type: 'spring', stiffness: 350, damping: 28 }
  },
  expanded: {
    width: 350,
    height: 80,
    borderRadius: 24,
    transition: { type: 'spring', stiffness: 300, damping: 25 }
  }
}

<motion.div
  variants={variants}
  animate={isExpanded ? 'expanded' : 'compact'}
/>
```

## 五、关键动画时长参考

| 动画类型 | 推荐时长 | 说明 |
|---------|---------|------|
| 微交互 | 100-200ms | 按钮点击、图标变化 |
| 状态切换 | 200-400ms | 灵动岛状态变化 |
| 展开/收缩 | 300-500ms | 主要尺寸变化 |
| 页面过渡 | 400-600ms | 大型内容变化 |

## 六、Windows 平台适配建议

### 6.1 前端动画（WebView2 内）

- 使用 Framer Motion 或 CSS transitions
- 弹簧参数与 macOS 风格保持一致
- 通过 Tauri IPC 同步窗口尺寸

### 6.2 后端窗口动画（Win32）

由于 Win32 不原生支持弹簧动画，建议：

1. **前端驱动**：前端计算动画帧，通过 IPC 更新窗口尺寸
2. **定时器插值**：Rust 后端使用定时器 + 缓动函数
3. **混合方案**：前端处理内容动画，后端处理窗口位置/尺寸

## 七、参考资料

- [Framer Motion Spring Animation](https://motion.dev/motion/transition/)
- [Apple Human Interface Guidelines - Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [CSS cubic-bezier Generator](https://cubic-bezier.com/)
