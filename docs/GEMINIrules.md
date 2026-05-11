# AURA Engineering Rules

## Non-negotiables
- No broad refactors without approval.
- No new tools with side effects without approval.
- No hidden prompt channels.
- No duplicated prompt assembly logic.
- No unverified claims of completion.
- No leaking internal agent transcripts into final outputs.

## Change discipline
- One problem per change set.
- One owning layer per bug fix.
- One shared helper for cross-cutting logic.
- Keep old behavior unless change is intentional.
- MVP CI requirement: The app must always remain buildable (`npm run build` & `npm run build:electron`). Do not commit code with broken TS imports or missing types.

## Validation
- Every meaningful change must include:
  - diagnosis
  - changed files
  - test plan
  - expected result

## Memory-specific
- Memory must be testable with deterministic directives.
- Memory must be visible in the final outbound provider payload.
- Memory success means behavioral proof, not just logs.

## Agent behavior
- Supervisors coordinate.
- Specialists produce scoped outputs.
- Synthesis produces clean final answers.
- Internal reasoning stays internal.