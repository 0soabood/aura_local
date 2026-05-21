import type {
  VetoAction,
  VetoConfig,
  ApprovalRequest,
  ApprovalResponse,
  VetoActionStatus,
} from './types';
import { getToolTier, requiresApproval, describeAction } from './types';
import { broadcastEvent } from '../debug';

/**
 * VetoManager - Central authorization layer for tool execution
 * 
 * Intercepts tool calls, checks authorization tiers, and either:
 * - Allows execution (never tier)
 * - Blocks and requests approval (always tier)
 * - Checks user config (configurable tier)
 */
export class VetoManager {
  private config: VetoConfig;
  private pendingActions = new Map<string, VetoAction>();
  private approvedActions = new Map<string, VetoAction>(); // track previously approved tools
  private approvedOverrides = new Map<string, Record<string, unknown>>(); // original key → modified args
  private sessionId: string;

  constructor(sessionId: string, config?: Partial<VetoConfig>) {
    this.sessionId = sessionId;
    this.config = {
      ...config,
      defaultBehavior: config?.defaultBehavior ?? 'require-approval',
      tierOverrides: config?.tierOverrides ?? {},
      alwaysRequireFor: config?.alwaysRequireFor ?? [],
      neverRequireFor: config?.neverRequireFor ?? [],
    };
  }

  /**
   * Process a tool call through the veto layer
   * Returns the action if approved, or null if approval is required
   */
  async processToolCall(
    toolName: string,
    args: Record<string, unknown>,
    resumeCommand?: { resume: unknown }
  ): Promise<VetoAction | null> {
    // If this tool was already approved in this session, reuse the approval
    const approvedKey = `${toolName}:${JSON.stringify(args)}`;
    if (this.approvedActions.has(approvedKey)) {
      const existing = this.approvedActions.get(approvedKey)!;
      existing.status = 'approved';
      this.broadcastActionUpdate(existing);
      return existing;
    }

    // If this tool has a pending override (modified args approved), apply it
    const overrideArgs = this.approvedOverrides.get(approvedKey);
    if (overrideArgs) {
      const action: VetoAction = {
        id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        toolName,
        toolArgs: overrideArgs,
        tier: getToolTier(toolName, this.config),
        status: 'approved',
        timestamp: Date.now(),
        description: describeAction(toolName, overrideArgs),
      };
      // Move from overrides to permanent approvedActions so future calls also pass
      this.approvedActions.set(`${toolName}:${JSON.stringify(overrideArgs)}`, action);
      this.approvedOverrides.delete(approvedKey);
      this.broadcastActionUpdate(action);
      return action;
    }

    const action: VetoAction = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      toolName,
      toolArgs: args,
      tier: getToolTier(toolName, this.config),
      status: 'pending',
      timestamp: Date.now(),
      description: describeAction(toolName, args),
    };

    // Check if approval is required
    if (!requiresApproval(toolName, this.config, args)) {
      action.status = 'approved';
      this.broadcastActionUpdate(action);
      return action;
    }

    // Store pending action
    this.pendingActions.set(action.id, action);

    // Broadcast approval request
    const request: ApprovalRequest = {
      action,
      sessionId: this.sessionId,
      resumeCommand,
    };

    broadcastEvent(this.sessionId, {
      type: 'approval_required',
      action: action as any,
      request,
      timestamp: Date.now(),
    });

    return null; // Signal that approval is pending
  }

  /**
   * Approve a pending action
   */
  approveAction(actionId: string): VetoAction | null {
    const action = this.pendingActions.get(actionId);
    if (!action) return null;

    action.status = 'approved';
    this.pendingActions.delete(actionId);
    // Store in approved actions so future calls for the same tool+args are auto-approved
    const key = `${action.toolName}:${JSON.stringify(action.toolArgs)}`;
    this.approvedActions.set(key, action);
    this.broadcastActionUpdate(action);

    return action;
  }

  /**
   * Reject a pending action
   */
  rejectAction(actionId: string, notes?: string): VetoAction | null {
    const action = this.pendingActions.get(actionId);
    if (!action) return null;

    action.status = 'rejected';
    action.metadata = { ...action.metadata, reviewerNotes: notes };
    this.pendingActions.delete(actionId);
    this.broadcastActionUpdate(action);

    return action;
  }

  /**
   * Modify and approve a pending action
   */
  modifyAction(
    actionId: string,
    modifiedArgs: Record<string, unknown>,
    notes?: string
  ): VetoAction | null {
    const action = this.pendingActions.get(actionId);
    if (!action) return null;

    const originalArgs = { ...action.toolArgs };
    action.toolArgs = modifiedArgs;
    action.status = 'modified';
    action.description = describeAction(action.toolName, modifiedArgs);
    action.metadata = { ...action.metadata, reviewerNotes: notes };
    this.pendingActions.delete(actionId);
    // Store override so the graph can re-execute with modified args on resume
    const originalKey = `${action.toolName}:${JSON.stringify(originalArgs)}`;
    this.approvedOverrides.set(originalKey, modifiedArgs);
    // Also store with modified args so future calls with those args are auto-approved
    const key = `${action.toolName}:${JSON.stringify(modifiedArgs)}`;
    this.approvedActions.set(key, action);
    this.broadcastActionUpdate(action);

    return action;
  }

  /**
   * Get all pending actions for this session
   */
  getPendingActions(): VetoAction[] {
    return [...this.pendingActions.values()].filter(a => a.status === 'pending');
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<VetoConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Broadcast action status update via WebSocket
   */
  private broadcastActionUpdate(action: VetoAction): void {
    broadcastEvent(this.sessionId, {
      type: 'veto_action_update',
      action,
      timestamp: Date.now(),
    });
  }

  /**
   * Clean up old actions (older than 1 hour)
   */
  cleanup(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, action] of this.pendingActions.entries()) {
      if (action.timestamp < oneHourAgo) {
        this.pendingActions.delete(id);
      }
    }
    // Also clean stale overrides (use same timestamp heuristic on keys)
    // We don't store timestamps in overrides, so we clear them when
    // no pending actions remain to avoid indefinite memory growth.
    if (this.pendingActions.size === 0) {
      this.approvedOverrides.clear();
    }
  }
}
