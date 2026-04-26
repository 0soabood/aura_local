import * as fs from 'fs/promises';
import * as path from 'path';

export class SkeletonExtractor {
  static async getFileSkeleton(filePath: string): Promise<string> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.split('\n');
    const output: string[] = [];

    let braceDepth = 0;
    let inBlockComment = false;
    let skipUntilDepthDropsTo = -1;
    let suppressedOpen = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track block comments
      if (inBlockComment) {
        if (line.includes('*/')) inBlockComment = false;
        continue;
      }
      if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('/**')) {
        if (!line.includes('*/')) inBlockComment = true;
        continue;
      }

      // Strip inline comments for brace counting only
      const stripped = line.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '""');

      const opens = (stripped.match(/\{/g) || []).length;
      const closes = (stripped.match(/\}/g) || []).length;

      const isTopLevel = braceDepth === 0;
      const isClassOrInterface = /^\s*(export\s+)?(abstract\s+)?(class|interface|enum)\s/.test(line);
      const isTypeAlias = /^\s*(export\s+)?type\s+\w+/.test(line);
      const isImport = /^\s*(import|export)\s/.test(line);
      const isFunctionSignature =
        /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
        /^\s*(public|private|protected|static|abstract|async|override)[\s(]/.test(line) ||
        /^\s*(readonly\s+)?\w+\s*[:(]/.test(line);

      if (skipUntilDepthDropsTo >= 0) {
        braceDepth += opens - closes;
        if (braceDepth <= skipUntilDepthDropsTo) {
          skipUntilDepthDropsTo = -1;
          if (suppressedOpen) {
            output.push(line.replace(/\{[^}]*$/, '{ ... }'));
            suppressedOpen = false;
          }
        }
        continue;
      }

      braceDepth += opens - closes;

      if (isImport || isTypeAlias) {
        output.push(line);
        continue;
      }

      if (isTopLevel && (isClassOrInterface || isFunctionSignature)) {
        if (opens > closes) {
          // Has opening brace — emit signature with stub, skip body
          const stubLine = line.replace(/\{.*$/, '{ ... }');
          output.push(stubLine);
          skipUntilDepthDropsTo = braceDepth - (opens - closes);
          suppressedOpen = false;
          // Re-sync depth: we've already added opens-closes above, but we want
          // to skip until depth returns to before the open
          // Recompute: depth before this line was braceDepth - (opens - closes)
          const depthBefore = braceDepth - (opens - closes);
          skipUntilDepthDropsTo = depthBefore;
          braceDepth = depthBefore; // reset so skip logic works
          continue;
        }
        output.push(line);
        continue;
      }

      // Inside a class body (depth === 1): emit member signatures, skip bodies
      if (braceDepth === 1 && opens > 0) {
        const stubLine = line.replace(/\{.*$/, '{ ... }');
        output.push(stubLine);
        const depthBefore = braceDepth - (opens - closes);
        skipUntilDepthDropsTo = depthBefore;
        braceDepth = depthBefore;
        continue;
      }

      if (braceDepth <= 1) {
        const trimmed = line.trim();
        if (trimmed && trimmed !== '}' && trimmed !== '{') {
          output.push(line);
        } else if (trimmed === '}') {
          output.push(line);
        }
      }
    }

    return output.join('\n');
  }

  static async searchCodebase(query: string, dir: string = 'src'): Promise<string> {
    const results: string[] = [];
    const regex = new RegExp(query, 'i');

    async function walk(currentDir: string): Promise<void> {
      if (results.length >= 50) return;

      let entries: import('fs').Dirent[];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= 50) return;

        const name = entry.name;
        if (name.startsWith('.') || name === 'node_modules') continue;

        const fullPath = path.join(currentDir, name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(name);
          if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md'].includes(ext)) continue;

          let content: string;
          try {
            content = await fs.readFile(fullPath, 'utf-8');
          } catch {
            continue;
          }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length && results.length < 50; i++) {
            if (regex.test(lines[i])) {
              const rel = path.relative(process.cwd(), fullPath).replace(/\\/g, '/');
              results.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        }
      }
    }

    const absDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    await walk(absDir);

    return results.length > 0
      ? results.join('\n')
      : `No matches found for "${query}" in ${dir}`;
  }
}
