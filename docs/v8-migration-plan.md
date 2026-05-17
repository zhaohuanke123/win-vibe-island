# Vibe Island v8 UI/Animation/Feature Migration Plan

> **Reference:** Open Island v8 design system (`design/v8-bundle/`)
> **Goal:** Align Vibe Island's UI, animations, and features with Open Island's v8 final design
> **Platform:** Windows (Tauri 2.0 + Rust + React)

---

## 0. Gap Analysis Summary

| Dimension | Reference (v8) | Current (win-vibe-island) | Gap |
|-----------|----------------|--------------------------|-----|
| **Phase Model** | 4 phases (`running/waitingForApproval/waitingForAnswer/completed`) + UI-only `idle` | 7 states (`idle/thinking/running/streaming/approval/error/done`) | **Fundamental mismatch** — need to align |
| **Pill Shape** | Single pill shape transforms between notch/panel/notif modes. Flat-top, semicircle-bottom | Rectangular overlay with StatusDot | **No pill concept** — need full redesign |
| **State Glyph** | `BarsGlyph` (3-bar animated glyph): idle breathing, running wave, waiting cross-pulse, done stroke-draw tick | `StatusDot` colored circle with pulse animations | **Wrong visual language** — need glyph system |
| **Agent Colors** | 10 agents with brand color hex (`claude:#d97742`, `codex:#4aa3df`, etc.) | Per-session state colors only, no agent identity | **No agent branding** |
| **Phase Colors** | Semantic phase colors: approval `#f4a4a4`, answer `#ffd58a`, running `#6ea7ff`, completed `#6fb982`, idle `#9a958a` | State colors in StatusDot but different set | **Need realignment** |
| **Session Row** | Spatial split: row body = jump to terminal, trailing chevron = expand detail | Click session → view detail in separate panel | **Interaction mismatch** |
| **Grouping** | `groupBy` (none/state/agent/project) + `sort` (attention/updated) orthogonal knobs | Group by cwd, filter by state, sort by activity/created | **Missing agent/state grouping** |
| **State Indicator** | 4 variants: dot/bar/glyph/tint (user-selectable) | Dot only | **Missing bar/glyph/tint** |
| **Density** | comfortable/compact | Single density | **Missing compact** |
| **Staleness** | `isStale()` — completed >5min auto-fades, merges into idle group | No staleness concept | **Missing** |
| **Notification Cards** | 4 kinds: two-way perm, three-way perm, jump/answer, done — embedded in expanded row OR standalone notif | ApprovalPanel with diff viewer (separate panel) | **Fundamental design gap** |
| **Panel Head** | Session count + waiting/running chips + gear icon | No chips, basic header | **Missing** |
| **Panel Footer** | Session count summary + keyboard shortcut hint | Settings/Activity buttons | **Different footer** |
| **Panel Scroll** | max-height 380px, pinned head/foot, only rows scroll | Adaptive height, full content scrolls | **Need constrained scroll** |
| **Color Palette** | Ink `#0d0d0f` + Paper `#f1ead9` (dark/light) | Dark theme but different colors | **Palette drift** |
| **Control Center** | Dedicated settings window with tabs (Hooks/Usage/Terminals/Settings/Shortcuts) | In-overlay SettingsPanel (limited space) | **Need separate window** |

---

## Phase A: Phase Model & Agent Taxonomy (Foundation)

### A1. Phase Model Migration
**Task 51**

Migrate from 7-state model to 4-phase + UI-only idle model.

**Current mapping:**
```
idle     → idle (UI-only, not a reducer phase)
thinking → running
running  → running
streaming → running
approval → waitingForApproval (from permissionRequested) OR waitingForAnswer (from questionAsked)
error    → completed (with error metadata)
done     → completed
```

**Changes:**
- `frontend/src/shared/session-reducer.ts`: Replace `PHASE_TO_STATE` with direct phase model
  - `AgentPhase`: `'running' | 'waitingForApproval' | 'waitingForAnswer' | 'completed'`
  - UI-only: `'idle'` (derived from no active session, not stored in reducer)
- `frontend/src/store/sessions.ts`: Update Session type `state` from union of 7 strings to `AgentPhase`
- `frontend/src/components/StatusDot.tsx` → Replace with new phase-aware component
- `src-tauri/src/agent_session.rs`: Align Rust SessionPhase with 4-case enum
- Backend `hook_server.rs`: Map hook events to new phases
- `frontend/src/hooks/useAgentEvents.ts`: Update event-to-phase mapping

**New types:**
```typescript
type AgentPhase = 'running' | 'waitingForApproval' | 'waitingForAnswer' | 'completed';
type UIPhase = AgentPhase | 'idle'; // idle is UI-only
type AgentType = 'claude' | 'codex' | 'cursor' | 'gemini' | 'kimi' | 'opencode' | 'qoder' | 'qwen' | 'factory' | 'codebuddy';
```

### A2. Agent Brand System
**Task 52**

Define agent taxonomy with brand colors and CLI names.

**Create `frontend/src/shared/agents.ts`:**
```typescript
const AGENTS = {
  claude:    { name: 'Claude Code', short: 'CC', color: '#d97742', cli: 'claude' },
  codex:     { name: 'Codex',       short: 'CX', color: '#4aa3df', cli: 'codex' },
  cursor:    { name: 'Cursor',      short: 'CR', color: '#7a5cff', cli: 'cursor' },
  gemini:    { name: 'Gemini CLI',  short: 'GM', color: '#42e86b', cli: 'gemini' },
  kimi:      { name: 'Kimi CLI',    short: 'KM', color: '#fde047', cli: 'kimi' },
  opencode:  { name: 'OpenCode',    short: 'OC', color: '#ffb547', cli: 'opencode' },
  qoder:     { name: 'Qoder',       short: 'QD', color: '#ff6b9f', cli: 'qoder' },
  qwen:      { name: 'Qwen Code',   short: 'QW', color: '#c084fc', cli: 'qwen' },
  factory:   { name: 'Factory',     short: 'FA', color: '#6e9fff', cli: 'droid' },
  codebuddy: { name: 'CodeBuddy',   short: 'CB', color: '#fca5a5', cli: 'codebuddy' },
};
```

- Session type gains `agent: AgentType` field
- Hook payloads carry agent type (extracted from process name or config path)
- `hexA(hex, alpha)` helper for tinted chip backgrounds/borders
- CSS `.agent-dot.{type}` for each agent color

### A3. Phase Color System
**Task 53**

Define semantic phase colors distinct from agent brand colors.

```typescript
const PHASE_COLOR = {
  waitingForApproval: '#f4a4a4', // warm red
  waitingForAnswer:   '#ffd58a', // amber
  running:            '#6ea7ff', // blue
  completed:          '#6fb982', // green
  idle:               '#9a958a', // neutral
};
```

- Phase colors communicate "what stage is this session in"
- Agent brand colors communicate "which CLI"
- These are orthogonal visual dimensions

---

## Phase B: Pill UI Architecture (Core Visual Redesign)

### B1. UnifiedBars Glyph Component
**Task 54**

Replace `StatusDot` with `BarsGlyph` — 3-bar animated glyph system.

**4 visual modes:**
- **idle**: Middle bar breathing (slow scale 0.7↔1.0, 3s cycle)
- **running**: 3-bar wave (bars oscillate y/height, 0.9s cycle, staggered 0.2s)
- **waiting**: Outer bars cross-pulse (scale 0.4↔1.0, 1.2s cycle)
- **done**: Stroke-draw tick (SVG path animation, 0.4s, fill=freeze)

**Implementation:**
- New component `frontend/src/components/BarsGlyph.tsx`
- SVG-based, 24x24 viewBox, 3 `<rect>` bars with CSS transitions
- `mode` prop accepts both raw glyph modes and phase names (via `phaseGlyph()`)
- Idle: simple CSS animation (scale/opacity)
- Running: SMIL `<animate>` for wave motion
- Waiting: CSS keyframes for pulse
- Done: SVG stroke-dasharray animation

**CSS in `frontend/src/components/BarsGlyph.css`:**
```css
.bars-glyph .bar {
  fill: #f1ead9; /* ink-on-paper */
  transition: height 0.3s ease, y 0.3s ease, opacity 0.3s ease;
}
.bars-glyph.running .bar:nth-child(1) { animation: bar-wave 0.9s ease-in-out infinite; animation-delay: 0s; }
.bars-glyph.running .bar:nth-child(2) { animation: bar-wave 0.9s ease-in-out infinite; animation-delay: 0.2s; }
.bars-glyph.running .bar:nth-child(3) { animation: bar-wave 0.9s ease-in-out infinite; animation-delay: 0.4s; }
```

### B2. Pill Shell & Notch Row
**Task 55**

Implement the pill container that transforms between 3 modes.

**Pill modes:**
- **notch** (compact): 32px height, flat-top + semicircle-bottom, shows BarsGlyph + optional agent dot + label
- **panel** (expanded): Shows PanelBody with session list, max-height 380px scroll area
- **notif** (notification): Shows NotifBody with action cards

**NotchRow component:**
```
[BarsGlyph] [agent-dot] [label...] ... [right-slot]
```

- 32px height, flex layout
- `macbook` prop for notch-area integration (no label, just glyph + right slot)
- Non-macbook: full row with agent dot, label, spacer, right slot
- Right slot: time, status chip, or notification count

**Pill CSS:**
- Flat top, semicircle bottom: `border-radius: 0 0 20px 20px`
- Background: `#0d0d0f` (ink)
- Color: `#f1ead9` (paper)
- Smooth height transition between modes via Framer Motion spring

### B3. State Indicator Variants
**Task 56**

Implement 4 state indicator styles for session rows.

1. **dot** (baseline): Colored dot in leading slot, color = `phaseColor(phase)`
2. **bar**: Full-height phase strip on row's left edge (3px, `border-radius: 999px`), spans row + expanded detail
3. **glyph**: Miniaturized BarsGlyph (16x16) in leading slot, idle → static dim dot
4. **tint**: No leading indicator; project name text gets `phaseColor` inline. Idle/stale stay default ink.

**Implementation:**
- `StateIndicator` component with `kind` and `phase` props
- Row wrapper gets `.ind-{kind}` class
- Bar mode uses `::before` pseudo-element with `--phase-color` CSS variable
- Configurable via settings (default: dot)

---

## Phase C: Session Row & Panel Redesign

### C1. Session Row with Spatial Split
**Task 57**

Redesign session row with jump-first click semantics.

**Row layout:**
```
[StateIndicator] [project · branch · msg] [agent-chip] [terminal-badge] [age] [▾ chevron]
                 [You: last prompt]
```

**Click semantics (spatial split):**
- Row body click → **jump to terminal** (primary action)
- Chevron click → **expand/collapse inline detail** (secondary action)
- Same pixel always does the same thing regardless of phase

**Row details:**
- Project name (from cwd), branch (if not main), message (tool/command)
- `You:` sub-line with last user prompt
- Agent chip: brand-colored CLI name in tinted pill
- Terminal badge: terminal app name
- Age: relative time (fmtAge helper)
- Chevron: SVG arrow, rotates 180° when expanded

**Expanded detail:**
- If `notifKind` exists → render NotifBody inline
- If `running` → show "Currently running" + command + Stop button
- If `idle`/`completed` → collapsed by default (stale completed auto-collapses)

**Staleness:**
```typescript
const STALE_THRESHOLD_SEC = 300; // 5 minutes
const isStale = (s) => s.state === 'completed' && s.updatedAt > STALE_THRESHOLD_SEC;
```
- Stale rows: opacity 0.7, merge into idle group
- Non-stale expanded by default

### C2. Grouped Session List
**Task 58**

Implement orthogonal groupBy/sort knobs replacing current filter/sort.

**Group modes:**
- `none`: Flat list, sorted by sort mode
- `state`: Groups by phase with priority ordering (approval → answer → running → completed → idle), idle group collapses by default
- `agent`: Groups by agent type, ordered by AGENTS key order, agent brand color in header
- `project`: Groups by project (cwd), alphabetical order

**Sort modes:**
- `attention`: Phase priority first → stale sinks → attention phases oldest-first, others newest-first
- `updated`: Pure last-activity recency

**Replace:**
- Current SessionList.tsx filter dropdown → groupBy picker
- Current sort toggle → attention/updated picker
- Current tag-based grouping → GroupedRows with STATE_GROUP_DEFS

**Group headers:**
- State groups: `.oi-prio-head` with state-dot + label + count
- Agent groups: `.oi-grp-head` with agent color + name + count
- Project groups: `.oi-grp-head` with project name + count

### C3. Panel Head & Footer
**Task 59**

Replace current Overlay header with PanelHead + PanelFooter.

**PanelHead:**
```
Sessions                    [2 waiting] [1 running]    ⚙
```
- Session count label
- Waiting chip (aggregates both waiting phases): warm red dot + count
- Running chip: blue dot + count
- Gear icon: opens Control Center (settings window)

**PanelFooter:**
```
3 sessions · 2 waiting                     Ctrl+Alt+Space
```
- Session count + waiting count
- Keyboard shortcut hint (right-aligned, low opacity)

**Panel scroll:**
- `.oi-list { max-height: 380px; overflow-y: auto; }`
- Head and foot pinned; only row list scrolls
- 6px thin scrollbar

---

## Phase D: Notification Cards

### D1. Notification Body Components
**Task 60**

Implement 4 notification card kinds that embed in expanded rows OR standalone in notif mode.

**Kind: two (2-way permission)**
- Phase: `waitingForApproval`
- Title: "Tool permission requested"
- Code block: tool name + args from PreToolUse hook
- Actions: Option B (deny/danger) + Option A (approve/primary)
- Hint: `↵ primary · esc dismiss`
- Keyboard: Enter = primary, Escape = dismiss

**Kind: three (3-way permission)**
- Same as `two` but 3+ action buttons
- Keyboard: `1` `2` `3` pick

**Kind: jump (question/answer)**
- Phase: `waitingForAnswer`
- Title: question text from QuestionPrompt
- Options: clickable pick list with key hints (1/2/3)
- Freeform input: text field for custom answer
- Actions: Dismiss + Jump to terminal + Send
- Keyboard: `1` `2` `3` pick, `↵` send, `esc` dismiss

**Kind: done (task completed)**
- Phase: `completed`
- Title: project + branch
- Reply: agent's summary text (from Stop hook)
- Quick reply: text input for follow-up
- Actions: Jump back button (standalone mode only)

**Integration:**
- `notifKind` field on Session determines which card to show
- In panel mode: embedded in expanded row detail
- In notif mode: replaces panel body entirely, shows standalone
- Current ApprovalPanel.tsx → refactored into NotifBody components

---

## Phase E: Animation & Visual Polish

### E1. Spring Physics Alignment
**Task 61**

Align animation parameters with reference v8's visual feel.

**Reference design uses CSS transitions (no spring physics):**
- Panel expand: height transition, 0.3s ease
- State changes: color/opacity, 120-200ms ease
- Row hover: background/border, 120ms ease
- Chevron rotation: 160ms ease + transform

**Current project uses Framer Motion springs:**
- expand: stiffness=300, damping=25, mass=0.8
- collapse: stiffness=400, damping=30, mass=0.7

**Alignment strategy:**
- Keep Framer Motion for window resize sync (Win32 requirement)
- Align timings with reference: 300ms expand, 120-200ms state transitions
- Reduce spring stiffness for softer feel (closer to reference's CSS ease)
- Row-level animations: pure CSS transitions (no Framer Motion per-row)

**Updated config:**
```typescript
// Closest Framer Motion spring to 300ms CSS ease
EXPAND: { stiffness: 200, damping: 22, mass: 0.8 }   // ~300ms settle
COLLAPSE: { stiffness: 280, damping: 26, mass: 0.7 }  // ~250ms settle
```

### E2. Color Palette & Typography
**Task 62**

Apply v8 design system colors and fonts.

**Colors:**
- Ink (dark): `#0d0d0f` — pill background, overlay surface
- Paper (light): `#f1ead9` — text, icons, glyphs
- Soft text: `rgba(241,234,217,0.55)` — secondary text
- Muted: `rgba(241,234,217,0.3-0.45)` — hints, labels
- Borders: `rgba(255,255,255,0.06-0.12)` — subtle separators

**Typography:**
- UI font: Inter (sans-serif), 12-13px body, 10.5-11px mono labels
- Mono font: JetBrains Mono, all badges/chips/labels
- Section headers: uppercase, 10.5px, letter-spacing 0.12em

**CSS variables:**
```css
:root {
  --ink: #0d0d0f;
  --paper: #f1ead9;
  --ink-soft: rgba(241,234,217,0.55);
  --ink-mute: rgba(241,234,217,0.3);
  --line: rgba(255,255,255,0.08);
  --bg-soft: rgba(255,255,255,0.025);
}
```

---

## Phase F: Interaction & UX Features

### F1. Jump Toast Feedback
**Task 63**

Add visual feedback when user clicks a row to jump to terminal.

**Toast:**
- Appears top-right of the overlay
- Shows terminal name and "Jumping to..."
- 1.5s animation: fade in (0→10%), hold (10→80%), fade out (80→100%)
- `pointer-events: none` — doesn't block interaction
- Real jump command executes in background

### F2. Density Mode (Comfortable/Compact)
**Task 64**

Add compact density mode for power users with many sessions.

**Comfortable (default):**
- Full row height (~48px)
- Shows: project, branch, message, You: sub-line, agent chip, terminal, age, chevron
- Expanded detail shows full notification

**Compact:**
- Reduced row height (~32px)
- Shows: project, message (no branch, no You: line), agent chip, age, chevron
- Smaller fonts, tighter padding
- Chevron button shrinks to 20x20

### F3. Detached Session Handling
**Task 65**

Visual differentiation for sessions whose process has exited.

**Attachment states:**
- `attached`: Process alive, full opacity
- `stale`: Completed >5min, opacity 0.7
- `detached`: Process exited, opacity 0.55, agent chip dims

**Visual rules:**
- `.oi-row.detached { opacity: 0.55; }`
- `.oi-row.stale { opacity: 0.7; }`
- Bar indicator wrapper also dims via `::before { opacity: matching; }`

---

## Phase G: Settings & Control Center

### G1. Control Center Window
**Task 66**

Move settings from in-overlay panel to a dedicated Control Center window.

**Tabs:**
1. **Hooks**: Hook install status per agent (installed/partial/missing), manifest info
2. **Usage**: Claude Code 5h/7d usage bars (Task 50 content)
3. **Terminals**: Grid of supported terminals with status
4. **Settings**: Display density, state indicator variant, notification sounds, language
5. **Shortcuts**: Keyboard shortcut reference

**Window specs:**
- Width: 560px
- Titlebar with traffic lights (or Windows close/minimize/maximize)
- Tab navigation with underline indicator
- Content body with sectioned layout

**Implementation:**
- New Tauri window (`control-center`) via `tauri.conf.json`
- React route or separate entry point
- Current SettingsPanel.tsx content migrates here
- Overlay keeps only a gear icon button that opens Control Center

---

## Implementation Priority

| Priority | Tasks | Rationale |
|----------|-------|-----------|
| **P0** | 51, 52, 53 | Phase model + agent taxonomy — everything else depends on correct data types |
| **P0** | 54, 55 | Glyph + pill shell — the core visual identity |
| **P1** | 56, 57 | State indicator + session row — daily-use interaction surface |
| **P1** | 58, 59 | Grouping + panel chrome — list management |
| **P1** | 60 | Notification cards — approval/answer flow |
| **P2** | 61, 62 | Animation alignment + palette — visual polish |
| **P2** | 63, 64, 65 | Jump toast + density + detached — UX refinement |
| **P3** | 66 | Control Center — settings migration |

**Suggested execution order:**
```
Phase A (51→52→53) → Phase B (54→55→56) → Phase C (57→58→59) → Phase D (60) → Phase E (61→62) → Phase F (63→64→65) → Phase G (66)
```

---

## Files Affected (Summary)

### New files
- `frontend/src/shared/agents.ts` — Agent brand system
- `frontend/src/shared/phase-colors.ts` — Phase color constants
- `frontend/src/components/BarsGlyph.tsx` + `.css` — UnifiedBars glyph
- `frontend/src/components/NotchRow.tsx` — Compact pill row
- `frontend/src/components/Pill.tsx` + `.css` — Pill shell (notch/panel/notif)
- `frontend/src/components/StateIndicator.tsx` — dot/bar/glyph/tint variants
- `frontend/src/components/SessionRow.tsx` + `.css` — Redesigned session row
- `frontend/src/components/GroupedRows.tsx` — GroupBy + sort logic
- `frontend/src/components/PanelHead.tsx` — Panel header with chips
- `frontend/src/components/NotifBody.tsx` + `.css` — 4 notification card kinds
- `frontend/src/components/ControlCenter.tsx` — Settings window

### Modified files
- `frontend/src/shared/session-reducer.ts` — Phase model migration
- `frontend/src/store/sessions.ts` — New types, agent field, phase model
- `frontend/src/components/Overlay.tsx` — Pill integration, remove old layout
- `frontend/src/components/AnimatedOverlay.tsx` — Updated spring params
- `frontend/src/components/SessionList.tsx` — GroupedRows integration
- `frontend/src/config/animation.ts` — Aligned spring/timing params
- `src-tauri/src/agent_session.rs` — 4-case SessionPhase
- `src-tauri/src/hook_server.rs` — Phase mapping
- `src-tauri/tauri.conf.json` — Control Center window config

### Removed/replaced files
- `frontend/src/components/StatusDot.tsx` → replaced by BarsGlyph + StateIndicator
- `frontend/src/components/ApprovalPanel.tsx` → replaced by NotifBody
- `frontend/src/shared/tool-category.ts` → replaced by agent brand system

---

## Risk & Constraints

- **Backward compatibility**: All existing hook endpoints keep working; new phase model maps cleanly from current events
- **Windows-only**: No macOS notch API; pill positions at top-center of screen. Notch row is purely visual, no hardware notch detection
- **Fail-open**: All visual changes are non-blocking; the pill is a view layer over the same AgentEvent stream
- **Incremental migration**: Each task is independently deployable. The pill can launch with Phase A+B only, adding C-G incrementally
- **No design divergence**: All color values, dimensions, and animation timings are locked to the v8 reference. Do not "improve" — replicate first, then tune based on Windows-specific feedback
