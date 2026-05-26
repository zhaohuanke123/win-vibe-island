export const meta = {
  name: 'doc-gate',
  description: 'Documentation Gate 执行流程。源码修改前的必经检查，确保文档先行、设计合规。涵盖任务上下文收集、Gate 条件评估、结果处理和设计合规检查。',
  phases: [
    { title: '上下文收集', detail: '读取 task.json、progress.txt，定位当前任务的文档引用' },
    { title: 'Gate 评估', detail: '逐项检查文档完整性、设计规格状态、行为定义是否到位' },
    { title: '结果处理', detail: '通过则放行；未通过则更新文档或记录跳过原因' },
    { title: '设计合规', detail: '涉及视觉变更时运行 check-design-compliance.js' },
  ],
}

// ============================================================
// Documentation Gate 工作流
// ============================================================
// 适用场景：
//   1. 需要修改源码（bug fix、feature、behavior change）
//   2. 用户提到 "Documentation Gate"、"文档门禁"
//   3. 新对话开始时确定上下文
//
// 前置条件：
//   - 用户已明确修改意图
//   - task.json 和 progress.txt 存在
//
// 权威定义：
//   Gate 条件表见 WORKFLOW.md Step 1
//   Memory 优先级见 CLAUDE.md
// ============================================================

phase('上下文收集')

const taskContext = await agent(`
读取项目任务上下文。按以下步骤操作：

1. 读取 task.json，找到当前活跃任务（status 不是 completed 且不是 removed 的任务）
2. 读取 progress.txt，了解已完成的工作和当前进度
3. 如果没有活跃任务：
   - 报告 "NO_ACTIVE_TASKS" 并说明最后完成的任务
   - 列出最近的 progress.txt 记录摘要
   - 等待用户指示：是要创建新任务，还是对已有任务做修改
4. 如果有活跃任务，提取：
   - task ID 和 title
   - requirement_ref（需求文档引用）
   - design_ref（设计文档引用）
   - docs_updated（文档是否已更新）
5. 读取 architecture.md 获取架构约束概要

输出格式（有活跃任务时）：
- Task ID: ...
- Title: ...
- Requirement ref: ...
- Design ref: ...
- Docs updated: ...
- Progress summary: ...

输出格式（无活跃任务时）：
- Status: NO_ACTIVE_TASKS
- Last completed task: ...
- Progress summary: ...
`, { label: '收集任务上下文', phase: '上下文收集' });

log(`## 任务上下文\n${taskContext}`);

phase('Gate 评估')

const noActiveTasks = taskContext.includes('NO_ACTIVE_TASKS');
let gatePassed = false;

if (noActiveTasks) {
  log('## Gate 评估跳过 — 没有活跃任务。等待用户指示后续操作（创建新任务或修改已有任务）。');
} else {

const gateResult = await agent(`
根据以下任务上下文，执行 Documentation Gate 检查。

${taskContext}

## Gate 检查清单（逐项输出通过/未通过 + 说明）

1. **任务文档引用**：当前任务是否有 requirement_ref 和 design_ref，或有明确的等价文档章节？
2. **设计规格**：如果 design_ref 指向 docs/design/specs/，该文件是否存在且 status 为 "approved"？
3. **行为定义**：bug/feature/behavior change 的预期行为是否已写入文档？
4. **文档更新**：如果行为有变化，相关文档是否已先更新（docs_updated 为 true）？
5. **跳过记录**：如果用户确认跳过文档，progress.txt 是否记录了原因、风险、待补文档？

## 输出
- Gate 状态：PASS 或 FAIL
- 每项检查的结果
- 如果 FAIL，列出具体缺失项和建议的补救措施
`, { label: 'Gate 评估', phase: 'Gate 评估' });

log(`## Gate 评估结果\n${gateResult}`);

phase('结果处理')

gatePassed = gateResult.includes('PASS') && !gateResult.includes('FAIL');

if (!gatePassed) {
  const failAction = await agent(`
Documentation Gate 未通过。根据以下失败原因，选择处理方式并执行。

Gate 评估结果：
${gateResult}

## 处理规则

1. **实现 bug**：如果文档已定义正确行为但代码不符 → 在 progress.txt 记录为 implementation bug，然后 Gate 可通过
2. **缺少文档**：先更新相关文档（或建议用户确认跳过）
3. **用户确认跳过**：在 progress.txt 记录跳过原因、风险和待补文档

## 输出
- 采取的行动
- progress.txt 的更新内容（如果有）
- Gate 重新评估结果：PASS 或 STILL_BLOCKED
`, { label: '处理 Gate 失败', phase: '结果处理' });

  log(`## Gate 失败处理\n${failAction}`);
}

} // end if (!noActiveTasks)

log(`
## 模块文档导航
需要查阅具体模块时，参考以下文档：
- 动画 → docs/architecture/animation-design.md
- 状态流程 → docs/architecture/states-and-flows.md
- 设计规格 → docs/design/specs/
- Hook 配置 → docs/hooks/hooks-setup.md
- 测试 → docs/testing/testing.md
- 命令解析 → docs/command-registry-design.md
`);

phase('设计合规')

const needsDesignCheck = noActiveTasks ? 'NO — 没有活跃任务' : await agent(`
根据当前任务上下文，判断是否涉及视觉变更（颜色、尺寸、动画、样式等）。

任务上下文：
${taskContext}

判断标准：
- 修改了 index.css、config.ts、animation.ts、types.rs
- 新增/修改了组件 CSS
- 涉及 UI 布局、颜色、动画参数

只需回答 YES 或 NO，并简要说明理由。
`, { label: '判断是否需要设计合规检查', phase: '设计合规' });

if (needsDesignCheck.includes('YES')) {
  log('## 设计合规检查（需要）');

  const complianceResult = await agent(`
运行设计合规检查脚本并分析结果。

执行命令：
\`\`\`bash
node scripts/check-design-compliance.js
\`\`\`

脚本机械对比以下内容（不依赖 AI 判断）：
- index.css 中的 CSS 变量值 → 对比 design-tokens.json
- config.ts 中的尺寸/颜色/弹簧默认值 → 对比 design-tokens.json
- animation.ts 中的缓动/时长 → 对比 design-tokens.json
- types.rs ↔ config.ts Rust/前端双向同步
- BEM 命名约定

退出码含义：
- 0 = 通过，可继续
- 1 = 有差异，必须修复

如果有差异：
1. 判断差异是否为有意修改设计参数
2. 如果是有意修改 → 建议先更新 docs/design/design-tokens.json 使其与源码一致，再重新运行检查
3. 如果不是有意修改 → 需要修复代码中的偏差

design-tokens.json 始终反映当前实际值。

输出检查结果和建议。
`, { label: '设计合规检查', phase: '设计合规' });

  log(`### 合规检查结果\n${complianceResult}`);
} else {
  log('## 设计合规检查（不需要）— 当前任务不涉及视觉变更');
}

log(`
---
## Documentation Gate 工作流完成

### 总结
- Gate 状态：${noActiveTasks ? '⏭️ 跳过（无活跃任务）' : (gatePassed ? '✅ 通过' : '⚠️ 已处理')}
- 设计合规：${needsDesignCheck.includes('YES') ? '已检查' : '不需要'}
- **下一步**：${noActiveTasks ? '等待用户指示（创建新任务或修改已有任务）' : '可以开始源码修改'}
`);
