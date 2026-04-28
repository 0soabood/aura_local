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
exports.listDirectoryFn = exports.listDirectoryDef = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const PROJECT_ROOT = process.cwd();
exports.listDirectoryDef = {
    type: 'function',
    function: {
        name: 'list_directory',
        description: 'List files and directories at a path inside the project. ' +
            'Use "." for the project root. Non-recursive.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative directory path from the project root.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
    },
};
const listDirectoryFn = async (args) => {
    const relativePath = String(args.path ?? '.').trim() || '.';
    const resolved = path.resolve(PROJECT_ROOT, relativePath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
        return `Error: Path "${relativePath}" escapes the project root.`;
    }
    if (!fs.existsSync(resolved))
        return `Error: Directory not found: ${relativePath}`;
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        return `Error: "${relativePath}" is a file — use read_file instead.`;
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const lines = entries.map(e => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`);
    return `Contents of ${relativePath}:\n${lines.join('\n')}`;
};
exports.listDirectoryFn = listDirectoryFn;
