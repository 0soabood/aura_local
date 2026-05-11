import type { ToolDefinition, ToolCall, ToolResult, ToolFn } from './types';
import type { VetoAction, ApprovalRequest } from '../veto/types';
import { VetoManager } from '../veto/VetoManager';
import { VetoApprovalNeededError } from '../veto/VetoError';

export class ToolRegistry {
  private readonly tools = new Map<string, { def: ToolDefinition; fn: ToolFn }>();
  private vetoManager?: VetoManager;

  register(def: ToolDefinition, fn: ToolFn): this {
    this.tools.set(def.function.name, { def, fn });
    return this;
  }

  /**
   * Set the veto manager for authorization checks
   */
  setVetoManager(manager: VetoManager): void {
    this.vetoManager = manager;
  }

  /**
   * Execute a tool call, passing through the veto layer if configured
   */
  async execute(call: ToolCall): Promise<ToolResult> {
    const entry = this.tools.get(call.name);
    if (!entry) {
      return {
        tool_call_id: call.id,
        content: `Error: Unknown tool "${call.name}". Available: ${[...this.tools.keys()].join(', ')}`,
        isError: true,
      };
    }

    // Check veto layer if configured
    if (this.vetoManager) {
      const action = await this.vetoManager.processToolCall(call.name, call.arguments);
      if (!action) {
        // Approval required - get the pending action from the manager
        const pending = this.vetoManager.getPendingActions();
        const lastPending = pending[pending.length - 1];
        
        // Throw error to signal that interrupt is needed
        if (lastPending) {
          throw new VetoApprovalNeededError(lastPending);
        }
        
        return {
          tool_call_id: call.id,
          content: `Error: Approval needed but no pending action found`,
          isError: true,
        };
      }
      // Action approved - continue with execution
    }

    try {
      const content = await entry.fn(call.arguments);
      return { tool_call_id: call.id, content, isError: false };
    } catch (err: any) {
      return {
        tool_call_id: call.id,
        content: `Error executing "${call.name}": ${err.message ?? String(err)}`,
        isError: true,
      };
    }
  }

  describe(): ToolDefinition[] {
    return [...this.tools.values()].map(e => e.def);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get size(): number {
    return this.tools.size;
  }
}
