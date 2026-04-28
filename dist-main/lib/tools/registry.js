"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
class ToolRegistry {
    constructor() {
        this.tools = new Map();
    }
    register(def, fn) {
        this.tools.set(def.function.name, { def, fn });
        return this;
    }
    async execute(call) {
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
        }
        catch (err) {
            return {
                tool_call_id: call.id,
                content: `Error executing "${call.name}": ${err.message ?? String(err)}`,
                isError: true,
            };
        }
    }
    describe() {
        return [...this.tools.values()].map(e => e.def);
    }
    has(name) {
        return this.tools.has(name);
    }
    get size() {
        return this.tools.size;
    }
}
exports.ToolRegistry = ToolRegistry;
