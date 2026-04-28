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
exports.readFileFn = exports.readFileDef = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_CHARS = 4000;
const PROJECT_ROOT = process.cwd();
exports.readFileDef = {
    type: 'function',
    function: {
        name: 'read_file',
        description: 'Read the contents of a file in the project. ' +
            'Path must be relative to the project root. ' +
            'Returns up to 4000 characters; longer files are truncated.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative file path from the project root.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
    },
};
const readFileFn = async (args) => {
    const relativePath = String(args.path ?? '').trim();
    if (!relativePath)
        return 'Error: path must be a non-empty string.';
    const resolved = path.resolve(PROJECT_ROOT, relativePath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
        return `Error: Path "${relativePath}" escapes the project root.`;
    }
    if (!fs.existsSync(resolved))
        return `Error: File not found: ${relativePath}`;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
        return `Error: "${relativePath}" is a directory — use list_directory instead.`;
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    if (content.length > MAX_CHARS) {
        return `${content.slice(0, MAX_CHARS)}\n\n[Truncated — ${content.length} chars total, showing first ${MAX_CHARS}]`;
    }
    return content;
};
exports.readFileFn = readFileFn;
