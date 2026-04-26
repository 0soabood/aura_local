"use strict";
/**
 * AURA_LOCAL_SYNC Shared Type Definitions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_NAMES = exports.EVENT_TYPES = exports.TELEMETRY_FORMULAS = exports.VERIFIED_VERIFICATION_STATES = exports.VERIFICATION_STATES = void 0;
exports.isVerificationState = isVerificationState;
exports.assertVerificationState = assertVerificationState;
// Source-of-truth verification taxonomy for all domain records.
exports.VERIFICATION_STATES = [
    'unverified',
    'self_checked',
    'source_checked',
    'accepted',
    'rejected',
];
// States that count as trusted for telemetry health calculations.
exports.VERIFIED_VERIFICATION_STATES = [
    'accepted',
    'source_checked',
];
// Runtime guard. Use at any boundary that accepts a verification_state from
// untrusted input (HTTP body, partial update payload, etc.). Throws on drift.
function isVerificationState(value) {
    return typeof value === 'string'
        && exports.VERIFICATION_STATES.includes(value);
}
function assertVerificationState(value) {
    if (!isVerificationState(value)) {
        throw new Error(`Invalid verification_state: ${JSON.stringify(value)}. ` +
            `Allowed: ${exports.VERIFICATION_STATES.join(', ')}`);
    }
    return value;
}
// Canonical telemetry formulas; repositories should implement these definitions exactly.
exports.TELEMETRY_FORMULAS = {
    totalValueSignal: "SUM(roadmap_items.roi_score WHERE status = 'done')",
    tasksCompleted: "COUNT(roadmap_items WHERE status = 'done')",
    activeProposals: "COUNT(roadmap_items WHERE status != 'done')",
    executionVelocity: "COUNT(roadmap_items WHERE status = 'done' AND updated_at in last 7 days)",
    researchDensity: 'COUNT(research_snippets)',
    systemHealth: 'ROUND((trusted_snippets / total_snippets) * 100) where trusted_snippets = accepted OR source_checked',
    recentActivity: 'COUNT(system_logs) GROUP BY date(created_at) for last 7 days',
};
// ── v3: Reactive Blackboard / Actor-Pub-Sub types ────────────────────────────
exports.EVENT_TYPES = [
    'user_message',
    'agent_output',
    'execution_error',
    'synthesis_complete',
    'escalation_required',
    'code_written',
    'code_context_retrieved',
];
exports.AGENT_NAMES = [
    'research_agent',
    'code_agent',
    'synthesis_agent',
    'orchestrator',
];
