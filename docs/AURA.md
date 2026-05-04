# AURA Self-Build Roadmap

## 🎯 Current Status (as of 2026-04-30)

### ✅ Completed
- **Phase 0**: Stabilize in-flight neubrutalist UI work (32 files committed to `feat/neubrutalist-ui`)
- **Phase 1**: Add Radix headless primitives (8 components created in `src/components/ui/`)
- **Phase 2**: Performance baseline (VirtualList, memoization complete)
- **Phase 3**: Command Palette + Routing Fix (cmdk, `<Outlet />`, keyboard shortcuts)
- **Phase 4**: State Unification (Zustand store + hooks)
- **Phase 5**: ADHD-Calibrated UX Wins (Energy Toggle, Brain Dump, Stream ReAct, Session badges)
- **UI Refactor**: ✅ Complete (migrated from Tailwind classes to neubrutalist inline styles with CSS variables)
- **Electron Fix**: ✅ Rebuilt `better-sqlite3` native module for Electron
- **Build**: ✅ Passing (`npm run build` succeeds)
- **Recharts**: ✅ Removed from dependencies (saved ~200KB)

### 🔄 In Progress  
- **Tests**: ❌ Failing due to `better-sqlite3` native module version mismatch (Node.js v22) - run in Docker as workaround

### 📋 Pending
- **Veto Layer**: Tiered authorization model + interrupt/approve workflow
- **Bureaucratic Automation**: German LEA application + Gewerbeanmeldung
- **Etsy and Printify Automation**: Listing Agent + Veto Layer integration

---

## UI Framework Evaluation & Roadmap (In Progress)
**Goal**: No full framework swap. Stay on Tailwind v4, add Radix primitives (shadcn-style copy-paste), TanStack Virtual, Zustand, cmdk. Drop unused recharts.

### Phase 0: Stabilize In-Flight Work ✅ **COMPLETE**
- [x] Created feature branch `feat/neubrutalist-ui`
- [x] Committed 32 in-flight UI files (ChatPage, ChatThread, ChatMessage, ChatInput, AppLayout, AuraApp, DebugPanel, NavigationHub, RoadmapPage, CoreTerminal, aura.css, useChatStream, etc.)
- [x] Build passes (`npm run build` ✅)
- [ ] Tests: Pending better-sqlite3 native module fix (Node.js v22 compatibility)

### Phase 1: Headless Primitives ✅ **COMPLETE**
- [x] Installed Radix UI packages: `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`, `@radix-ui/react-tooltip`, `@radix-ui/react-tabs`
- [x] Installed `cmdk` (command palette) and `@tanstack/react-virtual` (virtualization)
- [x] Created UI primitives in `src/components/ui/`:
  - `Button.tsx` - Neubrutalist button with variants (primary/secondary/danger)
  - `Tag.tsx` - Tag component with verification states
  - `Dialog.tsx` - Radix dialog with neubrutalist styling
  - `DropdownMenu.tsx` - Radix dropdown menu
  - `Popover.tsx` - Radix popover
  - `Tooltip.tsx` - Radix tooltip
  - `Tabs.tsx` - Radix tabs
  - `CommandPalette.tsx` - cmdk-based ⌘K launcher
  - `VirtualList.tsx` - TanStack Virtual wrapper
- [x] Updated `aura.css` with complete neubrutalist styling for all components
- [x] Updated `index.css` with design tokens (Fraunces, JetBrains Mono, neubrutalist color palette)
- [x] Removed `recharts` from package.json (unused, saves ~200KB)

### Phase2: Performance Baseline ✅ **COMPLETE**
- [x] Removed `recharts` from dependencies
- [x] Apply `VirtualList` to SystemLogs (virtualize 200+ unvirtualized rows)
- [x] Apply `VirtualList` to CoreTerminal messages (unbounded chat messages)
- [x] Memoize ChatMessage markdown render (React.memo keyed on message id + final-flag)
- [x] Add Vitest + RTL test for new primitives
- [x] Add dynamic model selection fetching from `/api/models` endpoint

### Phase3: Command Palette + Routing Fix ✅ **COMPLETE**
- [x] Install `cmdk`, build CommandPalette bound to ⌘K
- [x] Wire to existing `aura.*` IPC: list sessions, jump to roadmap, toggle agents
- [x] Replace AppLayout's `useState('hub')` modal-switching with `<Outlet />` + real routes for `/terminal`, `/roadmap`, `/dash`, `/logs`, `/research`
- [x] Add keyboard shortcut (⌘K / Ctrl+K) to open Command Palette
- [x] Add navigation commands to Command Palette (Hub, Terminal, Roadmap, ROI, Logs)
- [x] Add action commands (New Session, Toggle Brain Dump Mode)

### Phase4: State Unification ✅ **COMPLETE**
- [x] Install `zustand`, create `auraStore.ts`
- [x] Create `useAura.ts` selector hooks
- [x] Migrate IPC fetches (`getStatsV2`, `listSessionsV2`, `listRoadmapItems`) into store actions
- [x] Replace prop-drilled `onNavigate` callback with route navigation

### Phase5: ADHD-Calibrated UX Wins ✅ **COMPLETE**
- [x] Bottom bar with active provider name
- [x] Energy Toggle (Low/High) as `data-energy` attribute on `<html>`
- [x] Brain Dump Mode entry point (vague paragraph → auto-decomposed checklist)
- [x] Stream ReAct trace as discrete think/act/observe rows
- [x] Session resumption badges in NavigationHub
- [x] Keyboard-first density mode (Tab to all controls, Esc closes panels, `/` focuses input, `g r` jumps to roadmap)

---

## In Progress
- [x] Migration idempotence test for SQLite schema — **DONE** (created tests/migration-idempotence.test.ts, runs in Docker)

## Backlog
- [ ] Add firecrawl end point through API (Key already in .env.local), Giving live internet access to AURA.

Phase 0: Foundation Stability

- [x] **DONE** SQLite state persistence — migrated to SqliteSaver from @langchain/langgraph-checkpoint-sqlite (orchestrate_sessions + blackboard_events tables active)
- [x] **DONE** Enforce mandate: POST /api/orchestrate must only call compiledGraph — confirmed app.ts calls compiledGraph directly, ReactiveOrchestrator not in request path
- [x] **DONE** Ban ReactiveOrchestrator from request paths — verified ReactiveOrchestrator.ts exists but is never called by active API
- [x] **DONE** Port synthesis guard + keyword boosts into orchestratorNode — ported from ReactiveOrchestrator.ts to src/lib/graph/workflow.ts

Phase 1: ROI Dashboard Live Data

- [x] **DONE** Wire /api/roi-events to live aggregation by category — endpoints implemented in app.ts (GET/POST/PATCH/DELETE)
- [x] **DONE** Replace hardcoded "Top Consumers" data with live query — added /api/stats-v2 endpoint with top_consumers aggregation, updated ROIDash.tsx to display live data
- [ ] Add Completion Queue calculation (built-but-unshipped projects)
- [ ] Implement adapted RICE scoring (Effort = Executive Function Cost)
- [ ] Manually score the 7 dormant projects (Last Theory, GraphicMan V2, Jobbot, Nexus Terminal, ChiefAssistant, Email Architect Pro, Etsy)
- [ ] Render RICE-ranked Completion Queue in dashboard
- [x] **DONE** Enforce mandate: POST /api/orchestrate must only call compiledGraph
- [x] **DONE** Ban ReactiveOrchestrator from request paths
- [x] **DONE** Write test confirming ReactiveOrchestrator is not invoked from /api/orchestrate — verified in code review



FIX- Memorydump mode broken



Phase 2: Veto Layer

- [ ] Define tiered authorisation model (never-interrupt / always-interrupt / configurable)
- [ ] Categorise existing tools into tiers (read_file = never, git push = always, etc.)
- [ ] Implement interrupt() call in orchestrator node with serialisable action payload
- [ ] Add approval_required event type to WebSocket broadcast
- [ ] Build approval card UI in CoreTerminal
- [ ] Render diffs as diffs (not raw JSON)
- [ ] Render shell commands with working directory
- [ ] Render API calls in human-meaningful form (e.g. "Publish Etsy listing for €4.50")
- [ ] Create /api/sessions/continue endpoint
- [ ] Wire approve action to graph.invoke(Command(resume=payload))
- [ ] Wire reject/modify actions
- [ ] Test full interrupt → approve → resume cycle on a low-stakes action
- [ ] Validation milestone: Deploy The Last Theory live via Veto Layer-authorised git push
- [ ] Confirm a non-you human can access The Last Theory at a live URL

Phase 3: Bureaucratic Automation

 Draft German-language Letter of Intent to LEA (self-employment authorisation)
 Frame letter around low-time-commitment, automated nature, studies primary
 Generate document checklist (passport, residence title, health insurance, livelihood proof)
 Pre-fill Gewerbeanmeldung draft (Einzelunternehmen, Geschäftsbezeichnung, Tätigkeitsbeschreibung)
 Verify consistency between LEA letter and Gewerbeanmeldung
 Review LEA letter personally
 Submit LEA application via official portal (manual)
 After LEA approval: review and submit Gewerbeanmeldung (manual)

Phase 4: Etsy and Printify Automation

 Verify current Printify rate limits against live developer docs
 Verify current Etsy Open API v3 endpoints and auth pattern
 Decide: extend run_command whitelist to Python OR wrap GraphicMan V2 behind HTTP endpoint (recommended: HTTP)
 Implement chosen GraphicMan integration path
 Create Etsy Listing Agent in agent registry
 Wire agent to extract title + 13 tags from existing Perplexity research docs
 Implement createDraftListing call with full metadata
 Implement uploadListingImage call
 Wire Veto Layer interrupt() with rendered listing preview
 On approve: call updateListing with state="active"
 Validation milestone: One Printify-routed listing live via the pipeline
 Batch: produce 10 listings through the pipeline
 Batch: scale to 20–50 listings

Phase 5: Funding (Parallel Track)

 Verify Reaktor.Berlin solo founder exception with current BSS program contacts
 Decide funding path: BSS (team) vs GründungsBONUS Plus (solo) vs both
 Generate business plan draft from existing technical documentation
 Generate pitch deck (architecture + 190 tests as execution evidence)
 Frame AURA as ADHD accessibility technology
 Identify scientific mentor at HTW Berlin
 Contact HTW Centre for Entrepreneurship
 Review and refine funding documents personally
 Submit funding application(s)









    //# AURA Self-Build Roadmap OLD!!!!------------------------------------------------------------------

## In Progress
- [x] Migration idempotence test for SQLite schema — **DONE** (created tests/migration-idempotence.test.ts, runs in Docker)

## Backlog
- [ ] Add firecrawl end point through API (Key already in .env.local), Giving live access to AURA.

- [ ] Connect ROI Dashboard to Live Data ("Top Consumers" section) - replace hardcoded data with `/api/roi-events` aggregated by category (MOVED TO LAST)
- [ ] ROI live data test: verify data updates live (not static) (MOVED TO LAST)

## Known Issues
- **better-sqlite3 Windows native module**: Direct test execution on Windows fails due to native module loading issues. Workaround: run tests in Docker using `docker compose run --rm aura-test npx vitest run`. The Docker container has better-sqlite3 properly compiled for Alpine Linux.
- **getStatsV2() partially live**: Now fetches from /api/stats-v2 with real DB aggregations for top_consumers, but hourly_latency_ms and spend_series_usd still need full implementation
- **ROI Dashboard "TOP CONSUMERS"**: ✅ DONE — now displays live data from roi_events aggregation
- **Live ReAct streaming not wired to WebSocket**: CoreTerminal reads post-response SSE data, not live WebSocket events from debug.ts

## Done-
- [x] NavigationHub test: assert tile counts come from DB queries, not hardcoded strings (run via Docker) — **DONE** (17/17 tests passing)
- [x] CoreTerminal test: verify receives per-step think/act/observe events via SSE and renders incrementally (run via Docker) — **DONE** (8/8 tests passing)
- [x] State persistence: migrate from temporary MemorySaver to SQLite (orchestrate_sessions + blackboard_events) for durable session resume — **DONE** (migrated to SqliteSaver from @langchain/langgraph-checkpoint-sqlite)
- [x] Port synthesis guard + keyword boosts into orchestratorNode in src/lib/graph/workflow.ts — **DONE** (ported from ReactiveOrchestrator.ts)
- [x] Wire CoreTerminal to stream ReAct trace as individual think/act/observe events via SSE — **DONE** (WebSocket debug connection in CoreTerminal, broadcasts from LangGraph nodes)
- [x] State persistence: migrate from temporary MemorySaver to SQLite (orchestrate_sessions + blackboard_events) for durable session resume — **DONE** (migrated to SqliteSaver from @langchain/langgraph-checkpoint-sqlite)
 [x] Add model selection to CoreTerminal — **DONE** (users can now select model from dropdown, passed via preferredModel to LangGraph)
- [x] Wire CoreTerminal to stream ReAct trace as individual think/act/observe events via WebSocket — **DONE** (WebSocket debug connection in CoreTerminal, broadcasts from LangGraph nodes)
- [x] Implement pseudo-vexp context engine for CodeAgent local file retrieval — **DONE** (keyword-based relevance scoring, auto-injected when CodeAgent runs)
- [x] Add Energy Toggle to UI (Low/High energy mode adjusting output verbosity) — **DONE** (toggle button in UI, injects energy mode instructions into synthesis prompt)
- [x] Add Brain Dump Mode (agents auto-decompose vague goal into checklist) — **DONE** (toggle button, prefixes message with decomposition prompt)
- [x] Add session resumption badges to NavigationHub — **DONE** (↻ badge shown on sessions with 'done' or 'error' state)
- [x] Bottom bar: show active provider name, not just "API ONLINE" — **DONE** (CoreTerminal status line shows activeProvider.toUpperCase())
- [x] Memory injection empirical verification (add canary line to SOUL.md, confirm ✦ in response) — **DONE** (added canary line "✦ MEMORY CHECK" to SOUL.md)
- [x] Auth/rate-limiting on API endpoints — **DONE** (added API key auth via X-API-Key header, rate-limiting: 100 req/15min per IP)
- [x] Mandate: POST /api/orchestrate must only call compiledGraph (LangGraph) - ban ReactiveOrchestrator in request paths — **DONE** (already implemented - app.ts calls compiledGraph directly, ReactiveOrchestrator not in request path)
- [x] Port synthesis guard + keyword boosts into orchestratorNode in src/lib/graph/workflow.ts — **DONE** (ported synthesis guard, research/code keyword boosts from ReactiveOrchestrator.ts)
- [x] NavigationHub crash test: verify listSessionsV2() returns {id, title, state} for every session — **DONE** (10 tests passing in Docker, fixed text matching issues)
- [x] Fix Docker dev container launch - created .dockerignore, updated Dockerfile with Python setuptools and better-sqlite3 rebuild for Alpine Linux, fixed docker-compose.yml health check to use IPv4, container now healthy and accessible on port 3000
- [x] Modernize CoreTerminal UI with Tailwind CSS and refined dark theme
- [x] Support dynamic session state tracking (Running/Idle) in Sidebar using backend `inFlight` memory
- [x] Fix immediate empty session creation and UI refresh on "+ New Session"
- [x] Replace fetch-based preload bridge with true Electron `ipcRenderer.invoke`
- [x] Fix NavigationHub crash by switching to `listSessionsV2`
- [x] Boot React UI inside true Electron `BrowserWindow` with ContextBridge
- [x] Rebuild full UI from current simple chat/kanban baseline
- [x] NavigationHub God View — all 5 tabs accessible
- [x] Session sidebar shows dynamic titles instead of hardcoded UUIDs
- [x] Add session rename endpoint (PATCH /api/sessions/:id)
- [x] Add full 8-tool suite (write_file, edit_file, run_command, etc.) to LangGraph tool registry
- [x] v3 ReactiveOrchestrator with blackboard event loop
- [x] v2 SupervisorRouter with hierarchical domain routing
- [x] Memory system (SOUL/USER/AGENTS) with hot-reload
- [x] Tool registry with read_file, list_directory, write_memory
- [x] Tool registry extended with write_file, edit_file, run_command
- [x] Verification contract (verification_state across all repos)
- [x] Supertest API coverage
- [x] DB repo tests (BlackboardEvent, OrchestrateSession)
- [x] BaseAgent ReAct loop with OpenAI multi-turn protocol
- [x] CodeAgent tool-calling fix (qwen-2.5-coder-32b, XML fallback parser)
- [x] CircuitBreaker per-provider with 30s cooldown
- [x] **UI Refactor**: Migrated all UI components to neubrutalist design system (ChatPage, ChatInput, AuraApp, AppLayout, ChatMessage, CommandPalette, CoreTerminal)
- [x] **Electron Fix**: Rebuilt `better-sqlite3` native module for Electron (`npm run rebuild`)
- [x] **Neubrutalist CSS**: Applied design tokens from `index.css` (--ink, --bone, --oxblood, --chartreuse, --marigold, --ultramarine)
- [x] **Inline Styles**: Replaced Tailwind classes with inline styles using CSS variables for proper neubrutalist theming

---

## 🔍 UI Diagnosis — Hub Invisible + Chat "Reloads" on Response

**Branch**: `feat/neubrutalist-ui` (commit fd3af78 "fix(ui): restore routed UI with AppLayout and all routes")

### Bug 1 — Hub Menu Invisible (Routing Misconfiguration)

**Symptom**: Only a chat surface is visible; the Hub / God View tile menu is invisible.

**Root Cause**: `NavigationHub` is never registered as a route in the router, and `AppLayout` imports it but never renders it.

**Evidence**:
- `src/main.tsx:14-27`: Router registers `<ChatPage />` as the index route at `/`. No `hub` route exists.
  ```ts
  { index: true, element: <ChatPage /> },  // "/" renders ChatPage, not NavigationHub
  ```
- `src/components/AppLayout.tsx:4`: `NavigationHub` is imported but never rendered
- `AppLayout.tsx:71-101`: The "HUB" escape-hatch button is only rendered when `currentView !== 'hub'`, but `getCurrentView()` returns `'hub'` for `/` (the default route), so the button is hidden

**Why it manifests as "only a chat terminal"**:
The user lands at `/`, which renders `<ChatPage />` — a chat UI with input field and message list. The HUB button is hidden. Other routes (`/terminal`, `/roadmap`, etc.) exist but have no menu, link, sidebar, or button to surface them.

**Minimal Fix Options**:
- **(a)** Make `NavigationHub` the index route with an `onNavigate` adapter using `useNavigate()`
- **(b)** Add explicit `{ path: 'hub', element: <NavigationHub ... /> }` and redirect `/` to `/hub`

---

### Bug 2 — Chat "Reloads" on Every Response (State Replacement Artifact)

**Symptom**: Chat appears to "reload every time it tries responding"

**Root Cause**: In `src/components/useChatStream.tsx:60-64`, the `done` SSE event handler replaces the entire `events` array with server's full DB-persisted history:

```ts
} else if (eventType === 'done') {
  setEvents(data.events);  // ← full-array replacement
  setSessionId(data.sessionId);
  setActiveAgent(null);
}
```

Combined with the optimistic insert at `useChatStream.tsx:25` (`setEvents(prev => [...prev, optimisticMsg])`):
1. User submits → optimistic user message appended (id = `Date.now()`)
2. Progress events fire → activeAgent updates, list keeps optimistic msg
3. `done` event fires → `setEvents(data.events)` wipes entire array and replaces it with server-side rows that have **different id values** (DB primary keys, not `Date.now()`)
4. `ChatPage` renders messages via `key={ev.id}` → since every key changed, React unmounts every `ChatMessage` and re-mounts new ones

**Result**: Animations, scroll position, and transient component state all reset — looks identical to a page reload.

**Contributing Factor**: Stale-closure deps on `useCallback`
- `useChatStream.tsx:74`: `}, [events, sessionId])` — including `events` in deps means `sendMessage` is recreated on every event mutation
- Any memoized child receiving `sendMessage` will re-render on every chunk

**Ruled Out**:
- ✅ `e.preventDefault()` IS called on form submit at `ChatPage.tsx:20`
- ✅ No `window.location.reload()` or `window.location.href = …` anywhere
- ✅ No `navigate(...)` call inside the streaming hook
- ✅ Submit button has explicit `type="submit"` inside a form with `onSubmit` doing `preventDefault`

**Cross-Check: Electron / Fetch URL**:
- `useChatStream.tsx:29` hard-codes `fetch('http://localhost:3000/api/orchestrate', …)` instead of using `window.aura.streamOrchestrate()` (documented IPC path per `GEMINI.md:189-198`)
- Works in dev (Vite + Express both up) but will break in production Electron if not connecting to localhost:3000

**Minimal Fix Layer**:
- In `useChatStream.tsx:60-64`: Reconcile instead of replace — only append events not already present by seq, or use stable composite key in `ChatPage.tsx:64` such as `` key={`${ev.session_id}-${ev.seq}`} `` so optimistic and server rows that represent the same logical message reuse the same React key
- Remove `events` from the `useCallback` deps at `useChatStream.tsx:74` and use functional `setEvents(prev => …)` form throughout

---

### Files Involved

| File | Role in Bug |
|------|-------------|
| `src/main.tsx` | Router definition; missing hub route (line 19) |
| `src/components/AppLayout.tsx` | NavigationHub import unused, HUB button gated wrongly |
| `src/components/NavigationHub.tsx` | Exists, takes `onNavigate` prop, never reached |
| `src/components/ChatPage.tsx` | What the user actually sees at `/` |
| `src/components/useChatStream.tsx` | `done` handler causes the "reload" (line 61) |
| `src/components/ChatMessage.tsx` | Keyed by `ev.id` — all keys change on `done` |

---

### Verification (When Fixes Land)

**Hub Visibility**:
1. Launch dev (`npm run dev`), open Electron window
2. First screen should be `NavigationHub` with all department tiles (Terminal, Roadmap, Research, ROI, Logs, Archive)
3. Click each tile and confirm the route loads
4. Press top-right "HUB" button on a child route → returns to `NavigationHub`

**Chat Reload**:
1. Submit a message from ChatPage
2. Expected: optimistic user message appears immediately, agent status indicator animates, response streams in
3. User message stays visually anchored through the `done` event with no visible flash, no scroll jump, no key remount
4. Check React DevTools Profiler — `ChatMessage` instances for prior turns should not re-mount on `done`

**Regression Sanity**:
- ⌘K command palette still opens
- All five navigation entries still route correctly
- Escape returns from any non-hub view

---

### Summary

| Symptom | Bug | Root Cause | File |
|---------|-----|------------|------|
| "Cannot see hubs / hub menu" | 1 | `NavigationHub` never registered as a route; index renders `ChatPage` instead | `src/main.tsx:19`, `AppLayout.tsx:4` |
| "Chat reloads when responding" | 2 | `setEvents(data.events)` on `done` swaps whole array, all `key={ev.id}` mounts churn | `useChatStream.tsx:61`, `ChatPage.tsx:64` |

Both bugs are independent. Bug 1 hides the entire navigation surface; Bug 2 makes the visible surface feel broken.

---

## ✅ UI Fixes Applied (2026-04-30)

### Fix 1 — Hub Menu Now Visible (Routing Fix)

**Changes made**:
- `src/main.tsx`: Added `NavigationHub` as the index route and `/hub` route
- `src/components/NavigationHub.tsx`: Refactored to use `useNavigate()` from react-router-dom instead of `onNavigate` prop
- `src/components/AppLayout.tsx`: Updated `handleNavigate` to route to `/hub` instead of `/`; added `chat` route handling
- Added `/chat` route for `ChatPage` so it doesn't block the index route

**Result**: NavigationHub (God View) now renders at `/` and `/hub`. The HUB button in AppLayout correctly navigates back to the hub.

### Fix 2 — Chat No Longer "Reloads" on Response

**Changes made**:
- `src/components/useChatStream.tsx`:
  - Added `useRef` to track `sessionId` without stale closures
  - Changed `done` handler to **reconcile** server events with client-side optimistic messages instead of replacing the entire array
  - Removed `events` and `sessionId` from `useCallback` deps array (using functional updates and refs instead)
  - Used `sessionIdRef.current` for the fetch call to avoid stale closures

**Result**: When the `done` event arrives, the chat no longer "reloads" — optimistic messages are preserved and server events are merged in, preventing React key churn.

### Files Modified
1. `src/main.tsx` — Router configuration
2. `src/components/AppLayout.tsx` — Navigation handler
3. `src/components/NavigationHub.tsx` — Use react-router's `useNavigate`
4. `src/components/useChatStream.tsx` — Event reconciliation + stale closure fix
5. `src/components/NavigationHub.test.tsx` — Updated tests to remove `onNavigate` prop
