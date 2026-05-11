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

    action.toolArgs = modifiedArgs;
    action.status = 'modified';
    action.description = describeAction(action.toolName, modifiedArgs);
    action.metadata = { ...action.metadata, reviewerNotes: notes };
    this.pendingActions.delete(actionId);
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
  }
}
