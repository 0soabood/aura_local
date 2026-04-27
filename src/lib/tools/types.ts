export type ToolFn = (args: Record<string, unknown>) => Promise<string>;

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  isError: boolean;
}

export interface ReActResult {
  content: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}
