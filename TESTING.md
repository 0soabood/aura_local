# AURA_LOCAL_SYNC Test Plan v1.0

## 1. Test Matrix (Pragmatic Focus)

| Domain | Test Strategy | Priority | Focus Area |
| :--- | :--- | :--- | :--- |
| **Logic** | Vitest (Unit) | **CRITICAL** | ROI calculations, snippet parsing, model status enums. |
| **Persistence** | Vitest + SQLite (Integration) | **HIGH** | Repo CRUD, unique constraints, migration integrity. |
| **Boundaries** | Supertest (API) | **MEDIUM** | IPC Bridge serialization, Express middleware handling. |
| **UX/UI** | Manual (Human Audit) | **HIGH** | State promotion feel, Markdown readability, dashboard visual cues. |

---

## 2. Technical Acceptance Criteria

### Infrastructure
- `aura.db` migrations are idempotent and surgical (no data loss on schema updates).
- API endpoints handle malformed JSON payloads without crashing the process.

### Trust Layer
- Verification badges accurately reflect the `verification_state` DB column.
- Reasoning notes are correctly persisted during state promotion.

---

## 3. Manual QA Script (End-to-End)

### Scenario: "The Verified Pivot"
1. **Shell**: Dispatch `Scan local tech trends`. Receive unstructured AI response.
2. **Research**: Find the run in logs. Click "Promote to Snippet".
3. **Audit**: Open research entry. Add note: "Cross-referenced with internal git history."
4. **Action**: Change state to `Source Corroborated`.
5. **Roadmap**: Link snippet to a new Roadmap Milestone.
6. **Telemetry**: Verify "Research Density" incremented in the ROI Dash.

---

## 4. Automation Command Center
Run all logical and persistence tests:
`npm run test`
