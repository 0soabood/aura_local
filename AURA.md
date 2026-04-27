# AURA Self-Build Roadmap

## In Progress
- [ ] (next agent picks this up)

## Backlog
- [ ] Wire CoreTerminal to stream ReAct trace as individual think/act/observe events
- [ ] Add session rename endpoint (PATCH /api/sessions/:id)
- [ ] Implement pseudo-vexp context engine for CodeAgent local file retrieval
- [ ] Add write_file + edit_file + run_command to SynthesisAgent tool registry
- [ ] Migrate to true Electron IPC (replace Express-in-browser)
- [ ] Add Energy Toggle to UI (Low/High energy mode adjusting output verbosity)
- [ ] Add Brain Dump Mode (agents auto-decompose vague goal into checklist)
- [ ] Add session resumption badges to NavigationHub
- [ ] Bottom bar: show active provider name, not just "API ONLINE"
- [ ] Memory injection empirical verification (add canary line to SOUL.md, confirm ✦ in response)
- [ ] Migration idempotence test for SQLite schema
- [ ] Auth/rate-limiting on API endpoints

## Done
- [x] v3 ReactiveOrchestrator with blackboard event loop
- [x] v2 SupervisorRouter with hierarchical domain routing
- [x] Memory system (SOUL/USER/AGENTS) with hot-reload
- [x] NavigationHub God View — all 5 tabs accessible
- [x] Tool registry with read_file, list_directory, write_memory
- [x] Tool registry extended with write_file, edit_file, run_command
- [x] Verification contract (verification_state across all repos)
- [x] Supertest API coverage
- [x] DB repo tests (BlackboardEvent, OrchestrateSession)
- [x] BaseAgent ReAct loop with OpenAI multi-turn protocol
- [x] CodeAgent tool-calling fix (qwen-2.5-coder-32b, XML fallback parser)
- [x] CircuitBreaker per-provider with 30s cooldown
