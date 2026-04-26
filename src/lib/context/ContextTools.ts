import * as path from 'path';
import { SkeletonExtractor } from './SkeletonExtractor';

const PROJECT_ROOT = process.cwd();

// Reject hallucinated / template file paths before touching the filesystem.
const PLACEHOLDER_RE =
  /path[_\-]?to[_\-]?your[_\-]?file|your[_\-]?file|example[_\-]?file|file[_\-]?name|placeholder/i;
const TEMPLATE_RE = /<[^>]+>|\{\{[^}]+\}\}/;

function validateFilePath(raw: unknown): { error: string } | { resolved: string } {
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

export const CODE_CONTEXT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_file_skeleton',
      description:
        'Returns the structural skeleton of a TypeScript/JavaScript file — imports, class/interface/type definitions, and function signatures — with implementation bodies stripped out. ' +
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
      description:
        'Recursively searches the codebase for lines matching a regex/string query. Returns up to 50 results in the format "filePath:lineNumber: matchedLine". Use this to discover real file paths before calling get_file_skeleton.',
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
] as const;

export async function executeContextTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_file_skeleton': {
      const validation = validateFilePath(args.filePath);
      if ('error' in validation) return validation.error;
      try {
        return await SkeletonExtractor.getFileSkeleton(validation.resolved);
      } catch (err: any) {
        return `Error: Could not read file "${args.filePath}": ${err.message}`;
      }
    }
    case 'search_codebase': {
      if (!args.query || typeof args.query !== 'string') {
        return 'Error: search_codebase requires a non-empty query string.';
      }
      const dir = typeof args.dir === 'string' ? args.dir : 'src';
      try {
        return await SkeletonExtractor.searchCodebase(args.query, dir);
      } catch (err: any) {
        return `Error: search_codebase failed: ${err.message}`;
      }
    }
    default:
      return `Error: Unknown context tool: "${name}"`;
  }
}
