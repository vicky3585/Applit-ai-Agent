# Design Guidelines: Advanced AI Web IDE

## Design Approach

**Selected Approach**: Design System with IDE-specific patterns

**References**: VS Code's interface architecture, Linear's typography hierarchy, GitHub's dashboard patterns, and JetBrains IDE layouts

**Core Principle**: Maximize information density while maintaining clarity. Every pixel serves a functional purpose in the development workflow.

---

## Typography System

**Font Stack**:
- **Code/Monospace**: JetBrains Mono (via CDN) for all code displays, terminal output, file paths
- **UI Text**: Inter (via Google Fonts) for interface labels, buttons, navigation
- **Sizing Hierarchy**:
  - Code editor: 14px (base), line-height 1.6
  - Terminal: 13px, line-height 1.4
  - UI labels: 12px (small), 14px (medium), 16px (large headers)
  - Chat messages: 14px for user, 13px for agent responses
  - File tree: 13px

---

## Layout System

**Spacing Primitives**: Use Tailwind units of `2`, `4`, `6`, `8` only
- Component padding: `p-4`
- Section spacing: `gap-4`, `gap-6`
- Panel margins: `m-2`
- Tight spacing for info-dense areas: `gap-2`

**Application Shell Structure**:

```
┌─────────────────────────────────────────────────┐
│ Top Bar (h-14): Logo | Workspace | Agent Status│
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌──────┬──────────────────────┬───────────────┐│
│ │File  │                      │   Right Panel ││
│ │Tree  │   Main Editor Area   │               ││
│ │(w-64)│     (flex-1)         │  - Chat (40%) ││
│ │      │                      │  - Logs (30%) ││
│ │      │                      │  - State (30%)││
│ └──────┴──────────────────────┴───────────────┘│
│ ┌─────────────────────────────────────────────┐│
│ │ Bottom Panel (h-48): Terminal / Test Output ││
│ └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Panel Dimensions**:
- Left sidebar: Fixed `w-64`, collapsible to `w-12`
- Right panel: Fixed `w-96`, resizable between `w-80` to `w-[32rem]`
- Bottom terminal: `h-48`, resizable between `h-32` to `h-80`
- Main editor: `flex-1` (takes remaining space)

---

## Component Library

### Navigation & Structure

**Top Bar**:
- Full-width, fixed height `h-14`
- Three sections: Logo/brand (left), workspace selector (center), agent status indicator (right)
- Flex layout with `justify-between`, `items-center`, `px-4`

**File Explorer Panel**:
- Tree structure with indentation (`pl-4` per level)
- Icons from Heroicons (folder, file types)
- Expandable folders with chevron indicators
- File item height: `h-8`
- Hover states show action buttons (add, delete, rename)

### Code & Content Display

**Code Editor Area**:
- Full VS Code experience via code-server (separate service, embedded via iframe)
- Tab bar for open files: `h-10`, horizontal scroll if overflow
- Tab items: `px-4`, `min-w-32`, close button on hover
- Line numbers always visible
- Minimap on right edge

**Terminal Emulator**:
- xterm.js integration for full terminal experience
- Command history accessible with up/down arrows
- Output streaming with auto-scroll
- Clear button in top-right corner

### AI Agent Interface

**Chat Panel** (Right sidebar top section):
- Message list with auto-scroll to bottom
- User messages: align right, max-width prose
- Agent messages: align left, syntax highlighted code blocks
- Input area at bottom: textarea with `min-h-24`, send button
- Streaming indicator with animated dots

**Agent State Visualization**:
- Current node display: Planner → Coder → Tester → Auto-Fixer
- Progress bar showing iteration count
- Checkpoint history list with timestamps
- Action buttons: Pause, Resume, Reset

**Logs Viewer**:
- Tabular display with columns: Timestamp (w-32), Level (w-20), Message (flex-1)
- Filter buttons at top: All, Debug, Info, Warning, Error
- Auto-scroll toggle switch
- Clear logs button

### Controls & Settings

**Settings Panel** (Modal overlay):
- Organized in sections with clear dividers (`border-t`, `pt-6`)
- Toggle switches for: Extended Thinking, Local-First Mode, Auto-Fix, Auto-Save
- Dropdowns for: AI Model Selection, Max Iterations, Sandbox Timeout
- Input fields for API keys (with show/hide toggle)
- Save/Cancel buttons at bottom

**Action Buttons**:
- Primary actions: `h-10`, `px-6`, rounded corners `rounded-md`
- Secondary actions: `h-8`, `px-4`
- Icon-only buttons: `w-10`, `h-10`, centered icon
- Grouped buttons: `gap-2` spacing

### Data Display

**Snapshot/Checkpoint Cards**:
- Card layout with `p-4`, `rounded-lg` borders
- Header: Timestamp + Actions (restore, delete)
- Body: Changed files count, test results summary
- Footer: Metadata (agent state, iteration number)

**Code Diff Viewer**:
- Side-by-side or unified view toggle
- Line-by-line comparison
- Accept/Reject buttons per hunk
- Syntax highlighting maintained

---

## Interaction Patterns

**Resizable Panels**:
- Drag handles between panels: `w-1` visible divider
- Cursor changes to resize indicator on hover
- Minimum/maximum size constraints enforced

**Keyboard Shortcuts**:
- Display shortcut hints in tooltips
- Dedicated shortcuts panel (Ctrl+K to open)
- Command palette for all actions (Ctrl+P)

**Loading States**:
- Skeleton screens for file tree during workspace load
- Spinner for agent processing (inline with status text)
- Progress bars for long operations (test execution, code generation)

**Error Handling**:
- Inline error messages in relevant panels
- Toast notifications for system-level errors
- Error detail expansion on click

---

## Animations

**Minimal, Purposeful Only**:
- Panel expand/collapse: 200ms ease
- Message streaming: Typing effect with cursor blink
- Status indicator pulses when agent is active
- NO decorative animations, NO scroll effects

---

## Icons

**Icon Library**: Heroicons (outline style) via CDN

**Usage**:
- Navigation: home, folder, file, terminal, chat, settings, logs
- Actions: play, pause, stop, refresh, trash, download, upload
- Status: check-circle, x-circle, exclamation-triangle, information-circle
- Code: code, beaker (tests), bug, lightning-bolt (auto-fix)

**Sizing**: `w-5 h-5` for UI elements, `w-4 h-4` for inline icons

---

## Responsive Behavior

**Desktop-First Design** (Minimum viewport: 1280px):
- IDE experiences require substantial screen space
- Mobile: Show single panel at a time with navigation drawer
- Tablet: Collapse right panel, keep left sidebar + main editor

**Breakpoints**:
- Desktop: 1280px+ (primary target)
- Laptop: 1024px-1279px (stack bottom panel)
- Tablet: 768px-1023px (hide right panel by default)
- Mobile: <768px (single-panel view with tabs)

---

This design emphasizes **functional density, clear hierarchy, and developer productivity** over visual embellishment. Every element supports the core workflow of AI-assisted coding.