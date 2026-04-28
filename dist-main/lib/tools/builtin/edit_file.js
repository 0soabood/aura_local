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
exports.editFileFn = exports.editFileDef = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const PROJECT_ROOT = process.cwd();
exports.editFileDef = {
    type: 'function',
    function: {
        name: 'edit_file',
        description: 'Surgically replace an exact string in a file. ' +
            'old_string must match exactly once — fails if not found or ambiguous. ' +
            'Path must be relative to the project root.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Relative file path from the project root.' },
                old_string: { type: 'string', description: 'Exact string to find and replace (must be unique in the file).' },
                new_string: { type: 'string', description: 'Replacement string.' },
            },
            required: ['path', 'old_string', 'new_string'],
            additionalProperties: false,
        },
    },
};
const editFileFn = async (args) => {
    const relativePath = String(args.path ?? '').trim();
    if (!relativePath)
        return 'Error: path must be a non-empty string.';
    const oldStr = String(args.old_string ?? '');
    const newStr = String(args.new_string ?? '');
    if (!oldStr)
        return 'Error: old_string must be a non-empty string.';
    const resolved = path.resolve(PROJECT_ROOT, relativePath);
    if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
        return `Error: Path "${relativePath}" escapes the project root.`;
    }
    if (!fs.existsSync(resolved))
        return `Error: File not found: ${relativePath}`;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory())
        return `Error: "${relativePath}" is a directory.`;
    const content = fs.readFileSync(resolved, 'utf-8');
    // Count occurrences without regex to avoid escaping issues
    let count = 0;
    let idx = 0;
    while ((idx = content.indexOf(oldStr, idx)) !== -1) {
        count++;
        idx += oldStr.length;
    }
    if (count === 0)
        return `Error: old_string not found in ${relativePath}`;
    if (count > 1)
        return `Error: old_string matches ${count} locations in ${relativePath} — be more specific`;
    const updated = content.replace(oldStr, newStr);
    fs.writeFileSync(resolved, updated, 'utf-8');
    return `Edited: ${relativePath} — replaced ${oldStr.length} chars with ${newStr.length} chars`;
};
exports.editFileFn = editFileFn;
