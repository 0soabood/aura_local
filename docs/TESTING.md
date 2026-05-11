# AURA — Test Plan
**Last updated: 2026-05-09**

---

## How to Run Tests

```bash
# Standard
npm test

# If better-sqlite3 causes ABI errors (Node 24 vs test runner mismatch)
docker compose run --rm aura-test npx vitest run
```

**Gate:** `npm test` must exit with 0 failures before any task is marked done.

---

## Test Matrix

| Domain | Tool | Priority | Status |
|--------|------|----------|--------|
| Unit — agent logic, model config | Vitest | CRITICAL | ⚠️ Run after truncation repairs |
| Integration — SQLite repos, migrations | Vitest + real DB | HIGH | ⚠️ Run after truncation repairs |
| API boundaries — Express routes | Supertest | MEDIUM | Not yet run |
| UI — CoreTerminal response rendering | Manual | HIGH | ⚠️ Blocked on 401 fix |
| Build — TypeScript compilation | `npx tsc --noEmit` | CRITICAL | ✅ Passing |

---

## Test Files (existing coverage)

```
src/components/CoreTerminal.test.tsx
src/components/NavigationHub.test.tsx
src/components/ui/ChatMessage.test.tsx
src/components/ui/VerificationBadge.test.tsx
src/components/ui/VirtualList.test.tsx
src/db/repositories/BlackboardEventRepository.test.ts
src/db/repositories/OrchestrateSessionRepository.test.ts
src/db/repositories/RoadmapRepository.test.ts
src/db/repositories/StatsRepository.test.ts
src/lib/Blackboard.test.ts
src/lib/CoreModelService.test.ts
src/lib/ReactiveOrchestrator.test.ts
src/lib/providers/ProviderRegistry.test.ts
src/lib/tools/builtin/edit_file.test.ts
src/lib/tools/builtin/run_command.test.ts
src/lib/tools/builtin/write_file.test.ts
src/lib/tools/registry.test.ts
src/main/app.test.ts
```

---

## MVP Acceptance Criteria

### Must pass before MVP is done

- [ ] `npx tsc --noEmit` → zero output
- [ ] `npm test` → zero failures
- [ ] CoreTerminal sends a prompt and receives a streamed response (manual)
- [ ] Server logs `[API] LangGraph execution completed` on prompt submission
- [ ] Model picker shows 367 models after server init
- [ ] Selecting a model and sending a prompt uses that model (check server logs)

### Build integrity (run after every task)

```bash
npx tsc --noEmit
```

Zero output = zero errors = proceed.

---

## Manual QA — Core Loop Test

1. `npm run dev` — wait for `Updated OpenRouter with 367 models`
2. Open http://localhost:3000
3. Open browser DevTools (F12) → Console tab
4. Type `hello` in CoreTerminal, press Enter
5. **Expected:** Response text streams into chat feed
6. **Expected terminal logs:**
   ```
   [API] POST /api/orchestrate received for session (new)
   [API] Invoking LangGraph for thread: session-XXXX
   [API] LangGraph execution completed.
   ```
7. **If 401:** See DEBUGGING_HANDOFF.md

---

## Manual QA — Model Selection Test

1. Click the model picker button (shows "AUTO (DEFAULT)")
2. Type "llama" in the search box
3. Click `Llama 3.3 70B (Free)` from the list
4. Send any prompt
5. **Expected server log:** shows `meta-llama/llama-3.3-70b-instruct:free` being called
6. **Expected UI:** Model name shown on response bubble

---

## Known Test Risks

| Risk | Mitigation |
|------|-----------|
| 7 agent files were truncated by prior Codex session and repaired manually | Run `npm test` to confirm no hidden breakage |
| better-sqlite3 ABI mismatch may cause test runner failures | Use Docker: `docker compose run --rm aura-test npx vitest run` |
| ReactiveOrchestrator.test.ts tests dead code | Leave tests passing but don't add new coverage for ReactiveOrchestrator |

---

## Infrastructure Tests (run once, before shipping)

```bash
# Migration idempotence — run twice, should not error
npm run dev &
sleep 3
kill %1
npm run dev &
sleep 3
kill %1
echo "If no migration errors, idempotence confirmed"
```

```bash
# API smoke test (server must be running)
curl -s http://localhost:3000/api/health | python3 -m json.tool
# Expected: {"status":"ok","providers":{...}}
```

```bash
# Models endpoint
curl -s http://localhost:3000/api/models | python3 -c "import json,sys; d=json.load(sys.stdin); print('Providers:', len(d['providers'])); print('Models:', sum(len(p['models']) for p in d['providers']))"
# Expected: Models: 367 (after server init completes)
```
