# AURA — Gemini Implementation Guide
**Last updated: 2026-05-09 | Status: MVP RECOVERY IN PROGRESS**

You are the implementation agent for AURA_LOCAL_SYNC. Execute the MVP recovery plan one narrow task at a time. Read this file completely before touching any code.

---

## CURRENT MISSION

Get one working prompt → response loop in the browser. Nothing else matters until that works.

**The gate:** User types a message in CoreTerminal → hits Enter → a streamed response appears on screen.

**Current blocker:** POST /api/orchestrate returns HTTP 401 from OpenRouter. Root cause: default MODEL_ROLES pointed to paid models. All roles switched to free-tier models in ModelConfig.ts as of 2026-05-09. If 401 persists after restart, generate a new key at openrouter.ai/keys.

---

## HOW TO RUN THE APP (MVP mode — browser only)

```bash
npm run dev
```

Open http://localhost:3000. That is it.

**DO NOT run:**
- `npm run start:electron` — ABI mismatch (Node ABI 137 vs Electron ABI 145) breaks better-sqlite3
- `npm run build:electron` — not needed for MVP
- Any electron-rebuild commands

Electron is shelved for MVP. The fetch fallback in CoreTerminal works without it.

---

## ACTIVE ARCHITECTURE

```
Browser (localhost:3000)
  └─ CoreTerminal.tsx
       └─ streamOrchestrate() → POST /api/orchestrate
            └─ src/main/app.ts
                 └─ compiledGraph.stream()   ← ACTIVE PATH
                      └─ src/lib/graph/workflow.ts
                           ├─ orchestratorNode
                           ├─ agentNode
                           └─ synthesisNode
```

ReactiveOrchestrator.ts is DEAD CODE. Never called. Do not touch it.

All LLM traffic goes through OpenRouter only:
```
ProviderRegistry.call("openrouter:model/id") → UnifiedCaller → openrouter.ai/api/v1/chat/completions
```

API key is in .env.local (clean as of 2026-05-09 — null bytes stripped).

### Current model roles (all free-tier)

| Role | Primary |
|------|---------|
| daily_driver | openrouter:meta-llama/llama-3.3-70b-instruct:free |
| long_context | openrouter:meta-llama/llama-3.3-70b-instruct:free |
| agent_orchestrator | openrouter:meta-llama/llama-3.3-70b-instruct:free |
| compaction | openrouter:mistralai/mistral-7b-instruct:free |
| all others | openrouter:meta-llama/llama-3.3-70b-instruct:free |

---

## MVP TASK LIST — execute in this exact order

### ✅ TASK 1 — Confirm dev server starts [DONE]
`npm run dev` → server logs `[AURA MAIN] Process running at http://localhost:3000` and `[ProviderRegistry] Updated OpenRouter with 367 models`.

### 🔴 TASK 2 — Fix 401 and get first response [CURRENT]

**What to do:**
1. Restart server: Ctrl+C, then `npm run dev`
2. Wait for `Updated OpenRouter with 367 models` log
3. Open http://localhost:3000
4. Type any message in CoreTerminal and send

**If still 401:**
- Test the key: `curl https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer YOUR_KEY"`
- Check model in server logs — confirm it ends in `:free`
- Add credits at openrouter.ai/credits if key is valid but models require payment

**Done when:** A response text appears in the CoreTerminal chat feed.

### ⬜ TASK 3 — Delete dead provider files

```bash
# Check for imports first
grep -rn "GroqProvider\|PerplexityProvider\|VertexProvider" src/ --include="*.ts"
```

Remove any import lines found. Then delete:
- `src/lib/providers/GroqProvider.ts`
- `src/lib/providers/PerplexityProvider.ts`
- `src/lib/providers/VertexProvider.ts`

**Verify:** `npx tsc --noEmit` → zero output.

### ⬜ TASK 4 — Delete auraStore_temp.ts

1. Read `src/stores/auraStore_temp.ts` — merge anything unique into `src/stores/auraStore.ts`
2. Delete `src/stores/auraStore_temp.ts`
3. Confirm `src/stores/useAura.ts` only imports from `auraStore.ts`

**Verify:** `npx tsc --noEmit` passes. No console errors in browser.

### ⬜ TASK 5 — Strip NavigationHub to CoreTerminal only

File: `src/components/NavigationHub.tsx`

Comment out (do NOT delete) all tabs and routes except TERMINAL/CoreTerminal. Mark with `{/* DISABLED FOR MVP */}`.

**Verify:** Browser shows only CoreTerminal. No broken tab errors.

### ⬜ TASK 6 — Fix preferredModel in ResearchAgent + CodeAgent

Both agents ignore the user's model selection from the UI picker.

**ResearchAgent** (`src/lib/agents/ResearchAgent.ts`):
Find where it calls `resolveModel('long_context')`. Change to:
```typescript
const model = bid.preferredModel || resolveModel('long_context');
```
Then use `model` in the `registry.call()`.

**CodeAgent** (`src/lib/agents/CodeAgent.ts`):
Same — find `resolveModel('daily_driver')`, change to:
```typescript
const model = bid.preferredModel || resolveModel('daily_driver');
```

**Verify:** Select a model in the picker, send a prompt, confirm server logs show that model being used.

### ⬜ TASK 7 — Run test suite, fix all failures

```bash
npm test
```

Fix failures one at a time. Do not skip. Do not mark done until exit code is 0.

If better-sqlite3 causes ABI failures in the test runner:
```bash
docker compose run --rm aura-test npx vitest run
```

**Verify:** `npm test` exits with 0 failures.

### ⬜ TASK 8 — Wire real token counts

File: `src/lib/CoreModelService.ts`

Currently returns `tokens_input: 0, tokens_output: 0`. Fix by reading from the API response. First log the raw response to see the actual shape:
```typescript
console.log('[CoreModelService] raw response:', JSON.stringify(response, null, 2));
```
Then wire the correct fields. OpenRouter returns `usage.prompt_tokens` and `usage.completion_tokens`.

**Verify:** Send a prompt. Check model_runs table or logs — token counts must be non-zero.

### ⬜ TASK 9 — Add ErrorBoundary to App.tsx

```tsx
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'var(--font-mono)', color: 'var(--bone)', background: 'var(--ink)', height: '100vh' }}>
          <h2 style={{ color: 'var(--oxblood)' }}>AURA CRASHED</h2>
          <pre style={{ opacity: 0.7 }}>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false })}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--bone)', color: 'var(--ink)', border: 'none', cursor: 'pointer' }}>
            RECOVER
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Wrap the router outlet with `<ErrorBoundary>` in App.tsx.

**Verify:** Introduce a deliberate throw in a component, confirm ErrorBoundary catches it.

### ⬜ TASK 10 — Delete Electron preload bridge (do this last)

Only after all other tasks are verified working.

Delete:
- `src/preload/index.ts`
- `src/electron/` directory if it exists

In every component that calls `getAura().method()` — replace with direct `fetch()`. CoreTerminal's `streamOrchestrate()` is the reference pattern.

Remove `AuraAPI` interface and `window.aura` from `src/shared/types.ts` once all components migrated.

**Verify:** `npx tsc --noEmit` passes. App works with `npm run dev` only, no preload references.

---

## BUILD HEALTH CHECK

After every task:
```bash
npx tsc --noEmit
```
Zero output = zero errors = proceed. Any output = stop and fix.

---

## FILES TO TOUCH / LEAVE ALONE

**Touch (MVP tasks only):**
- `src/lib/ModelConfig.ts`
- `src/lib/agents/ResearchAgent.ts`
- `src/lib/agents/CodeAgent.ts`
- `src/stores/auraStore.ts`
- `src/stores/useAura.ts`
- `src/components/NavigationHub.tsx`
- `src/App.tsx`
- `.env.local`

**Delete:**
- `src/stores/auraStore_temp.ts`
- `src/lib/providers/GroqProvider.ts`
- `src/lib/providers/PerplexityProvider.ts`
- `src/lib/providers/VertexProvider.ts`
- `src/preload/index.ts` (Task 10 only)

**DO NOT TOUCH:**
- `src/lib/graph/workflow.ts` — active LangGraph path
- `src/main/app.ts` — Express routes work
- `src/lib/providers/ProviderRegistry.ts` — works
- `src/lib/providers/OpenRouterProvider.ts` — works
- `src/lib/providers/UnifiedCaller.ts` — works
- `src/db/` — migrations are idempotent and working
- `src/lib/ReactiveOrchestrator.ts` — dead code, leave it

---

## DEBUGGING 401

1. Restart server, wait for `Updated OpenRouter with 367 models` log
2. Send prompt, watch for `[ProviderRegistry]` log — confirm model ends in `:free`
3. Test key directly:
   ```bash
   curl https://openrouter.ai/api/v1/auth/key -H "Authorization: Bearer YOUR_KEY_HERE"
   ```
4. Confirmed working free models:
   - `meta-llama/llama-3.3-70b-instruct:free`
   - `mistralai/mistral-7b-instruct:free`
   - `google/gemma-3-12b-it:free`

---

## OUTPUT CONTRACT

Every change you make must include:
1. What changed and why
2. Exact files modified
3. The diff or new code
4. Result of `npx tsc --noEmit`
5. How to test it
6. Do not claim done until tested
