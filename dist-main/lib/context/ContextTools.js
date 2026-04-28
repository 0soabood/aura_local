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
exports.searchCodebaseFn = exports.searchCodebaseDef = exports.getFileSkeletonFn = exports.getFileSkeletonDef = exports.CODE_CONTEXT_TOOLS = void 0;
exports.executeContextTool = executeContextTool;
const path = __importStar(require("path"));
const SkeletonExtractor_1 = require("./SkeletonExtractor");
const PROJECT_ROOT = process.cwd();
// Reject hallucinated / template file paths before touching the filesystem.
const PLACEHOLDER_RE = /path[_\-]?to[_\-]?your[_\-]?file|your[_\-]?file|example[_\-]?file|file[_\-]?name|placeholder/i;
const TEMPLATE_RE = /<[^>]+>|\{\{[^}]+\}\}/;
function validateFilePath(raw) {
    if (!raw || typeof raw !== 'string' || raw.trim() === '') {
        return { error: 'Error: filePath must be a non-empty string.' };
    }
    if (PLACEHOLDER_RE.test(raw)) {
        return { error: `Error: Placeholder file path rejected: "${raw}". Call search_codebase first to find the real path.` };
    }
    if (TEMPLATE_RE.test(raw)) {
        return { error: `Error: Template file path rejected: "${raw}". Call search_codebase first to find the real path.` };
    }
    const resolved = path.resolve(raw);
    const rel = path.relative(PROJECT_ROOT, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { error: `Error: File path escapes project root: "${raw}".` };
    }
    return { resolved };
}
exports.CODE_CONTEXT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'get_file_skeleton',
            description: 'Returns the structural skeleton of a TypeScript/JavaScript file — imports, class/interface/type definitions, and function signatures — with implementation bodies stripped out. ' +
                'IMPORTANT: filePath must be a real path found via search_codebase. Never pass placeholder paths.',
            parameters: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Absolute or relative path to an existing source file in this project.',
                    },
                },
                required: ['filePath'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_codebase',
            description: 'Recursively searches the codebase for lines matching a regex/string query. Returns up to 50 results in the format "filePath:lineNumber: matchedLine". Use this to discover real file paths before calling get_file_skeleton.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Regex pattern or literal string to search for.',
                    },
                    dir: {
                        type: 'string',
                        description: 'Directory to search in. Defaults to "src".',
                    },
                },
                required: ['query'],
                additionalProperties: false,
            },
        },
    },
];
// ToolDefinition-compatible exports for ToolRegistry integration.
exports.getFileSkeletonDef = {
    type: 'function',
    function: {
        name: 'get_file_skeleton',
        description: 'Returns the structural skeleton of a TypeScript/JavaScript file — imports, ' +
            'class/interface/type definitions, and function signatures — with implementation bodies stripped out. ' +
            'IMPORTANT: filePath must be a real path found via search_codebase. Never pass placeholder paths.',
        parameters: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Absolute or relative path to an existing source file in this project.',
                },
            },
            required: ['filePath'],
            additionalProperties: false,
        },
    },
};
const getFileSkeletonFn = async (args) => {
    const validation = validateFilePath(args.filePath);
    if ('error' in validation)
        return validation.error;
    try {
        return await SkeletonExtractor_1.SkeletonExtractor.getFileSkeleton(validation.resolved);
    }
    catch (err) {
        return `Error: Could not read file "${args.filePath}": ${err.message}`;
    }
};
exports.getFileSkeletonFn = getFileSkeletonFn;
exports.searchCodebaseDef = {
    type: 'function',
    function: {
        name: 'search_codebase',
        description: 'Recursively searches the codebase for lines matching a regex/string query. ' +
            'Returns up to 50 results in the format "filePath:lineNumber: matchedLine". ' +
            'Use this to discover real file paths before calling get_file_skeleton.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Regex pattern or literal string to search for.',
                },
                dir: {
                    type: 'string',
                    description: 'Directory to search in. Defaults to "src".',
                },
            },
            required: ['query'],
            additionalProperties: false,
        },
    },
};
const searchCodebaseFn = async (args) => {
    if (!args.query || typeof args.query !== 'string') {
        return 'Error: search_codebase requires a non-empty query string.';
    }
    const dir = typeof args.dir === 'string' ? args.dir : 'src';
    try {
        return await SkeletonExtractor_1.SkeletonExtractor.searchCodebase(args.query, dir);
    }
    catch (err) {
        return `Error: search_codebase failed: ${err.message}`;
    }
};
exports.searchCodebaseFn = searchCodebaseFn;
async function executeContextTool(name, args) {
    switch (name) {
        case 'get_file_skeleton': {
            const validation = validateFilePath(args.filePath);
            if ('error' in validation)
                return validation.error;
            try {
                return await SkeletonExtractor_1.SkeletonExtractor.getFileSkeleton(validation.resolved);
            }
            catch (err) {
                return `Error: Could not read file "${args.filePath}": ${err.message}`;
            }
        }
        case 'search_codebase': {
            if (!args.query || typeof args.query !== 'string') {
                return 'Error: search_codebase requires a non-empty query string.';
            }
            const dir = typeof args.dir === 'string' ? args.dir : 'src';
            try {
                return await SkeletonExtractor_1.SkeletonExtractor.searchCodebase(args.query, dir);
            }
            catch (err) {
                return `Error: search_codebase failed: ${err.message}`;
            }
        }
        default:
            return `Error: Unknown context tool: "${name}"`;
    }
}
