"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeMemoryFn = exports.writeMemoryDef = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const loader_1 = require("../../memory/loader");
const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const ALLOWED = ['SOUL', 'USER', 'AGENTS'];
exports.writeMemoryDef = {
    type: 'function',
    function: {
        name: 'write_memory',
        description: 'Append new content to one of the AURA persistent memory files. ' +
            'Use to save user preferences, facts, or session summaries for future sessions. ' +
            'Allowed files: SOUL (identity), USER (user context), AGENTS (agent config).',
        parameters: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Which memory file to append to: "SOUL", "USER", or "AGENTS".',
                },
                content: {
                    type: 'string',
                    description: 'Markdown content to append. Be concise and factual.',
                },
            },
            required: ['file', 'content'],
            additionalProperties: false,
        },
    },
};
const writeMemoryFn = async (args) => {
    const file = String(args.file ?? '').toUpperCase().trim();
    if (!ALLOWED.includes(file)) {
        return `Error: Invalid memory file "${file}". Allowed: ${ALLOWED.join(', ')}`;
    }
    const content = String(args.content ?? '').trim();
    if (!content)
        return 'Error: content cannot be empty.';
    const filePath = path.join(MEMORY_DIR, `${file}.md`);
    try {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
        const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
        const separator = existing && !existing.endsWith('\n') ? '\n\n' : '\n';
        fs.writeFileSync(filePath, `${existing}${separator}${content}\n`, 'utf-8');
        (0, loader_1.reloadAuraMemory)();
        return `Appended to ${file}.md successfully.`;
    }
    catch (err) {
        return `Error writing to ${file}.md: ${err.message}`;
    }
};
exports.writeMemoryFn = writeMemoryFn;
