# AURA — Debugging Handoff
**Last updated: 2026-05-09**

---

## Current Status

MVP recovery in progress. Server starts and fetches 367 OpenRouter models. Core loop (CoreTerminal → /api/orchestrate → LangGraph → response) is not yet producing a response due to 401 from OpenRouter.

---

## What Works

- `npm run dev` starts cleanly (Express on 3000, Vite middleware)
- OpenRouter key is valid — 367 models fetched on startup
- TypeScript compiles with zero errors (`npx tsc --noEmit`)
- LangGraph workflow compiles and mounts correctly
- SQLite schema runs idempotent migrations on boot
- CoreTerminal searchable model picker implemented (replaces native select)
- All 7 truncated agent files repaired (BureaucracyAgent, ResearchAgent, SupervisorAgent, SynthesisAgent, CodeAgent, EtsyAgent, FundingAgent)
- `src/lib/graph/workflow.ts` export fixed (`compiledGraph` not `compiledGr`)
- `ReactiveOrchestrator.ts` fixed (sessionId/message narrowing)
- `app.ts` fixed (VetoManager uses `updateConfig()` not direct property access)
- `.env.local` null bytes stripped — file is clean

## What Is Broken

| Issue | Cause | Fix |
|-------|-------|-----|
| POST /api/orchestrate → 401 | Model roles defaulted to paid models | ModelConfig.ts updated to free-tier models. Restart server. |
| Model picker shows 3 models instead of 367 | Frontend fetched /api/models before init completed | Reload page after server logs "Updated OpenRouter with 367 models" |
| Settings panel doesn't open | Unknown — low priority | Investigate after core loop works |
| ResearchAgent/CodeAgent ignore model picker | Both call resolveModel() directly | Task 6 in GEMINI.md |

---

## Active Runtime Path

```
POST /api/orchestrate
  → src/main/app.ts (line ~430)
  → compiledGraph.stream() or compiledGraph.invoke()
  → src/lib/graph/workflow.ts
  → orchestratorNode → agentNode → synthesisNode
  → SSE stream back to CoreTerminal
```

ReactiveOrchestrator is NOT in this path. Do not trace through it.

---

## Key File Locations

| What | Where |
|------|-------|
| API key | `.env.local` |
| Model roles | `src/lib/ModelConfig.ts` |
| LangGraph workflow | `src/lib/graph/workflow.ts` |
| Express routes | `src/main/app.ts` |
| Provider call chain | `src/lib/providers/UnifiedCaller.ts` |
| OpenRouter config | `src/lib/providers/OpenRouterProvider.ts` |
| CoreTerminal UI | `src/components/CoreTerminal.tsx` |
| Zustand store | `src/stores/auraStore.ts` + `src/stores/useAura.ts` |

---

## How to Test the Core Loop

1. `npm run dev`
2. Wait for `[ProviderRegistry] Updated OpenRouter with 367 models`
3. Open http://localhost:3000
4. Type a message, press Enter
5. Watch terminal for `[API] LangGraph execution completed`
6. Watch browser for streamed response text

If you get 401: see GEMINI.md → "Debugging 401" section.

---

## Build Commands

```bash
# Run app (MVP mode)
npm run dev

# Type check
npx tsc --noEmit

# Run tests
npm test

# Run tests via Docker (if better-sqlite3 ABI fails)
docker compose run --rm aura-test npx vitest run
```

Do NOT run:
- `npm run start:electron` — ABI mismatch, Electron shelved for MVP
- `npm run build:electron` — not needed

---

## Environment

- OS: Windows 11
- Node.js: v24 (ABI 137)
- Electron: shelved (requires ABI 145 for better-sqlite3)
- better-sqlite3: v12.9.0 (works with system Node for dev server only)
- OpenRouter: 367 models available, key confirmed valid
