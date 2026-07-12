---
name: openspec-propose
description: Propose a new change with all artifacts generated in one step. Use when the user wants to quickly describe what they want to build and get a complete proposal with design, specs, and tasks ready for implementation.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.5.0"
---

Propose a new change - create the change and generate all artifacts in one step.

I'll create a change with artifacts:
- proposal.md (what & why)
- design.md (how)
- tasks.md (implementation steps)

When ready to implement, run /opsx:apply

---

**Store selection:** If the user names a store (a store is a standalone OpenSpec repo registered on this machine) or the work lives in one, run `openspec store list --json` to discover registered store ids, then pass `--store <id>` on the commands that read or write specs and changes (`new change`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). Other commands do not take the flag. Hints printed by commands already carry the flag; keep it on follow-ups. Without a store, commands act on the nearest local `openspec/` root.

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Create the change directory**
   ```bash
   openspec new change "<name>"
   ```
   This creates a scaffolded change in the planning home resolved by the CLI with `.openspec.yaml`.

3. **Get the artifact build order**
   ```bash
   openspec status --change "<name>" --json
   ```
   Parse the JSON to get:
   - `applyRequires`: array of artifact IDs needed before implementation (e.g., `["tasks"]`)
   - `artifacts`: list of all artifacts with their status and dependencies
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context. Use these instead of assuming repo-local paths.

4. **Create artifacts in sequence until apply-ready**

   Use the **TodoWrite tool** to track progress through the artifacts.

   Loop through artifacts in dependency order (artifacts with no pending dependencies first):

   a. **For each artifact that is `ready` (dependencies satisfied)**:
      - Get instructions:
        ```bash
        openspec instructions <artifact-id> --change "<name>" --json
        ```
      - The instructions JSON includes:
        - `context`: Project background (constraints for you - do NOT include in output)
        - `rules`: Artifact-specific rules (constraints for you - do NOT include in output)
        - `template`: The structure to use for your output file
        - `instruction`: Schema-specific guidance for this artifact type
        - `resolvedOutputPath`: Resolved path or pattern to write the artifact
        - `dependencies`: Completed artifacts to read for context
      - Read any completed dependency files for context
      - Create the artifact file using `template` as the structure and write it to `resolvedOutputPath`
      - Apply `context` and `rules` as constraints - but do NOT copy them into the file
      - Show brief progress: "Created <artifact-id>"

   b. **Continue until all `applyRequires` artifacts are complete**
      - After creating each artifact, re-run `openspec status --change "<name>" --json`
      - Check if every artifact ID in `applyRequires` has `status: "done"` in the artifacts array
      - Stop when all `applyRequires` artifacts are done

   c. **If an artifact requires user input** (unclear context):
      - Use **AskUserQuestion tool** to clarify
      - Then continue with creation

   d. **Before generating the tasks artifact, run the TDD detection gate**
      - Read the spec delta's `#### Scenario:` blocks that were just generated
      - Apply the detection heuristic in "TDD Mode Guidelines" below
      - If TDD-friendly signals are present AND no disqualifiers: use AskUserQuestion (see §"TDD Mode Guidelines" for exact prompt)
      - Record the decision as a one-line `**Test Approach:**` note at the end of proposal.md
      - If user accepts TDD mode: generate tasks.md per the test-first template (§"TDD Mode Guidelines")
      - Otherwise: default implementation-shaped tasks (current behavior)
      - If proposal.md already has a `**Test Approach:**` line from a prior run, honor it and skip re-asking

5. **Show final status**
   ```bash
   openspec status --change "<name>"
   ```

**Output**

After completing all artifacts, summarize:
- Change name and location
- List of artifacts created with brief descriptions
- What's ready: "All artifacts created! Ready for implementation."
- Prompt: "Run `/opsx:apply` or ask me to implement to start working on the tasks."

**Artifact Creation Guidelines**

- Follow the `instruction` field from `openspec instructions` for each artifact type
- The schema defines what each artifact should contain - follow it
- Read dependency artifacts for context before creating new ones
- Use `template` as the structure for your output file - fill in its sections
- **IMPORTANT**: `context` and `rules` are constraints for YOU, not content for the file
  - Do NOT copy `<context>`, `<rules>`, `<project_context>` blocks into the artifact
  - These guide what you write, but should never appear in the output

**TDD Mode Guidelines**

Conditional TDD: when a change touches stateful / timing / multi-step-derivation logic, generate tasks.md test-first so the red phase acts as a lie detector against tautological AI-written tests. Skip for pure refactor / UI / plumbing.

**(a) Detection heuristic** — score = QUALIFY hits minus DISQUALIFY hits. Ask iff ≥1 QUALIFY AND zero DISQUALIFY.

QUALIFY (any one suffices):
- **State transitions** — ref/boolean lifecycle, "MUST be reset", `true→false` switch, `AgentState` / `TRANSITION_MATRIX`-class behavior
- **Timing / async ordering** — "animation in flight", "after onAnimationComplete", event ordering
- **Multi-step derivation** — 3+ verb chain in THEN (measures → clamps → emits)
- **Parsing / serialization**
- **Math / bounds** — clamp to `[MIN, MAX]`, equals a constant
- **Risk-classification** — low/medium/high grade computation

DISQUALIFY (any one suppresses, default to implementation-shaped):
- Pure CSS / visual-only
- Pure rename / move / delete refactor
- Single-line config bump
- Pure plumbing / wiring
- Presentational components with no logic

Edge case: mixed signals → DISQUALIFY wins. Optionally tell the user TDD may be applied per-scenario on request.

**(b) AskUserQuestion prompt (exact)**

- **Q**: "本 change 的 spec scenarios 看起来适合 TDD（${list detected signals}）。tasks.md 要写成 test-first——每个 scenario 成一个 '写失败测试 → 确认红 → 实现 → 确认绿' 循环，还是保持默认的 implementation 形态？"
- **Options**:
  1. Test-first（TDD 模式）—— 按 spec Scenario 分组，失败测试先行
  2. Implementation-shaped（默认）
  3. 我自己逐 scenario 决定
- Default (user hits enter): option 2

**(c) Test-first tasks.md template** (contrast with default implementation shape)

One task group per spec Scenario; group title = scenario name. Each group has a fixed 4-checkbox micro-flow (apply reads checkboxes linearly — this forces test execution between writing and implementing):

```markdown
## Scenario: 动画飞行中 gatedMeasure 不调用 measure

- [ ] 1.1 写失败测试：渲染 hook、isExpanded→true、多次触发 gatedMeasure，断言 measure 未被调用。运行 `npx vitest run <file>` 确认 RED（测试失败）
- [ ] 1.2 实现 minimal 代码让测试转 GREEN（运行同一测试确认通过）
- [ ] 1.3 检查测试是否同义反复（tautological）—— 临时翻转实现断言，确认测试会失败；翻回
- [ ] 1.4 （可选）如有多余实现，删到最小可过测试

## Scenario: <下一个 spec scenario>
...
```

Refactoring tasks (TDD rule: "refactoring is not part of the loop"): place in a final `## Refactor (post-green, optional)` section, or defer to `/code-review`.

**(d) Recording the decision** — append one line to the end of proposal.md (NOT design.md — proposal is in apply's contextFiles so apply can read it back):

- Enabled: `**Test Approach:** TDD (auto-detected: stateful scenarios, timing ordering) — tasks.md is test-first.`
- Not enabled: `**Test Approach:** implementation-shaped (no TDD signals / user declined).`

**Inlined TDD rules** (these shape task generation — copied condensed from `.claude/skills/tdd/SKILL.md`):
- **Red before green**: a test that passes before the implementation exists is a lie; the test MUST fail first. This is the load-bearing rule for AI.
- **Tautological anti-pattern**: the assertion must NOT recompute the expected value the way the code does. Expected values come from the spec / a known-good literal / a worked example.
- **Implementation-coupled anti-pattern**: tests verify behavior through public interfaces, not internals (no mocking private collaborators, no querying side channels).
- **Horizontal slicing anti-pattern**: don't write all tests first then all impl. Work vertical — one scenario → red → green → next scenario.
- **Refactoring is not part of the loop**: separates from red→green; lives in a post-green section or `/code-review`.

Full TDD discipline: see `.claude/skills/tdd/SKILL.md`.

**Guardrails**
- Create ALL artifacts needed for implementation (as defined by schema's `apply.requires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user - but prefer making reasonable decisions to keep momentum
- If a change with that name already exists, ask if user wants to continue it or create a new one
- Verify each artifact file exists after writing before proceeding to next
- TDD detection gate asks at most ONCE per change; if proposal.md already has a `**Test Approach:**` line, treat it as decided and skip re-asking
