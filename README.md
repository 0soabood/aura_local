![AURA Logo](https://via.placeholder.com/400x120/1a1a2e/ffffff?text=AURA+Local+Sync)

# AURA Local Sync

A local-first cognitive co-processor for solo builders. Aura extends the developer's attention, task initiation, and task completion — critical for ADHD-executive-function support where standard productivity tools fail with streaks, shame mechanics, and cloud dependency.

## What It Does

- **Orchestration Engine**: React-based agents (Supervisor, Research, Code, Synthesis) working through LangGraph workflows
- **Terminal**: Electron-powered command interface with live telemetry
- **Roadmap & Research**: Persistent project tracking with structured verification states
- **Model Registry**: Multi-provider support via OpenRouter with usage-aware routing
- **Veto System**: Human-in-the-loop approval for any action before execution

## Run Locally

**Prerequisites**: Node.js 20+

```bash
# Install dependencies
npm install

# Set your API key in .env.local
# (Copy from .env.example and add OPENROUTER_API_KEY)
cp .env.example .env.local
# Edit .env.local and add your OpenRouter API key

# Start the development server
npm run dev
```

The app runs at http://localhost:3000

## Architecture

```
src/
├── main/           # Express API server
│   ├── app.ts      # Route definitions + orchestration endpoint
│   └── index.ts    # Bootstraps Vite + Express
├── lib/
│   ├── agents/     # LangGraph agents (Supervisor, Research, Code, Synthesis)
│   ├── graph/      # Workflow definitions
│   ├── providers/  # Model providers (OpenRouter)
│   ├── memory/     # Long-term memory system
│   └── tools/      # Builtin tool registry
├── components/     # React UI components
├── stores/         # Zustand state management
├── db/             # SQLite repositories
└── shared/         # Shared TypeScript types
```

## Environment

Set at least one API key in `.env.local`:

```
OPENROUTER_API_KEY=sk-or-...
```

For Docker:

```bash
NODE_ENV=development RUNNING_IN_DOCKER=true npm run dev
```

## Domain Contract

The canonical domain contract lives in `src/shared/types.ts`:

- `VERIFICATION_STATES`: allowed lifecycle states for all verification-enabled records
- `TELEMETRY_FORMULAS`: human-readable formula contract for each metric
- `ModelProvider`: interface for all model provider implementations

Telemetry computation must stay aligned with these shared constants.

## Project Philosophy

**Local-first**: No external tracking, no cloud dependency. Data sovereignty is non-negotiable.

**No shame loops**: Built on accommodation rather than correction. Streaks, gamification, and external accountability are antithetical to the design goals.

**Attention regulation**: Always orients back to priority. Presents the single smallest next action with enough specificity to be immediately executable.

## Scripts

- `npm run dev` — Start development server (Vite + Express)
- `npm run build` — Build for production (Vite build + Electron packaging)
- `npm run lint` — Type-check with TypeScript (`tsc --noEmit`)
- `npm test` — Run test suite (Vitest)
- `npm run rebuild` — Rebuild native modules (better-sqlite3)

## License

MIT
