import type { ToolDefinition, ToolCall, ToolResult, ToolFn } from './types';

export class ToolRegistry {
  private readonly tools = new Map<string, { def: ToolDefinition; fn: ToolFn }>();

  register(def: ToolDefinition, fn: ToolFn): this {
    this.tools.set(def.function.name, { def, fn });
    return this;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const entry = this.tools.get(call.name);
    if (!entry) {
      return {
        tool_call_id: call.id,
        content: `Error: Unknown tool "${call.name}". Available: ${[...this.tools.keys()].join(', ')}`,
        isError: true,
      };
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
