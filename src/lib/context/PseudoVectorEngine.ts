/**
 * Pseudo-Vector Context Engine
 * 
 * A lightweight keyword-based relevance scoring system for CodeAgent.
 * Since we don't have true vector embeddings, this uses:
 * 1. TF-IDF-like scoring for keyword relevance
 * 2. File path relevance (closer paths score higher)
 * 3. File type relevance (TypeScript/JavaScript files prioritized)
 * 4. Recency bias (files modified recently score higher)
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface FileScore {
  filePath: string;
  score: number;
  preview: string; // First few relevant lines
}

interface SearchOptions {
  maxResults?: number;
  fileTypes?: string[]; // e.g., ['.ts', '.tsx', '.js']
  excludeDirs?: string[]; // e.g., ['node_modules', 'dist', '.git']
  contextWindow?: number; // Lines of context to return
}

const DEFAULT_OPTIONS: Required<SearchOptions> = {
  maxResults: 10,
  fileTypes: ['.ts', '.tsx', '.js', '.jsx', '.py', '.md'],
  excludeDirs: ['node_modules', 'dist', 'build', '.git', 'coverage', '__mocks__'],
  contextWindow: 5,
};

// Simple tokenizer - splits on non-alphanumeric, filters stop words
function tokenize(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'should', 'could', 'may', 'might', 'must', 'shall', 'can', 'need',
    'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for',
    'while', 'import', 'export', 'from', 'class', 'interface', 'type',
  ]);
  
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(token => token.length > 2 && !stopWords.has(token));
}

// Calculate TF (Term Frequency) for a document
function calculateTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

// Simple IDF approximation - rarer terms score higher
function calculateIDF(term: string, allDocs: string[][]): number {
  const docsWithTerm = allDocs.filter(doc => doc.includes(term)).length;
  if (docsWithTerm === 0) return 1;
  return Math.log(allDocs.length / docsWithTerm) + 1;
}

// Score a file's relevance to a query
function scoreFile(queryTokens: string[], fileContent: string, filePath: string, allDocs: string[][]): number {
  const fileTokens = tokenize(fileContent);
  const fileTF = calculateTF(fileTokens);
  
  let score = 0;
  
  // TF-IDF scoring
  for (const queryToken of queryTokens) {
    const tf = fileTF.get(queryToken) || 0;
    const idf = calculateIDF(queryToken, allDocs);
    score += tf * idf;
  }
  
  // Boost score for path relevance (files in relevant directories)
  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.includes('src/') || normalizedPath.includes('lib/')) {
    score *= 1.5;
  }
  
  // Boost for file extension relevance
  const ext = path.extname(filePath);
  if (['.ts', '.tsx'].includes(ext)) score *= 1.3;
  if (['.js', '.jsx'].includes(ext)) score *= 1.2;
  
  // Boost for exact filename matches
  const fileName = path.basename(filePath, ext);
  for (const queryToken of queryTokens) {
    if (fileName.includes(queryToken)) {
      score *= 2.0;
      break;
    }
  }
  
  return score;
}

// Get preview lines around relevant content
function getPreview(content: string, queryTokens: string[], contextWindow: number): string {
  const lines = content.split('\n');
  let bestLine = 0;
  let bestScore = 0;
  
  // Find the line with most query token matches
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenize(lines[i]);
    let lineScore = 0;
    for (const qt of queryTokens) {
      if (lineTokens.includes(qt)) lineScore++;
    }
    if (lineScore > bestScore) {
      bestScore = lineScore;
      bestLine = i;
    }
  }
  
  // Extract context window around best line
  const start = Math.max(0, bestLine - contextWindow);
  const end = Math.min(lines.length, bestLine + contextWindow + 1);
  
  return lines.slice(start, end).join('\n');
}

/**
 * Main search function - finds relevant files for a query
 */
export async function searchRelevantFiles(
  query: string,
  rootDir: string = 'src',
  options: SearchOptions = {}
): Promise<FileScore[]> {
  const opts: Required<SearchOptions> = { ...DEFAULT_OPTIONS, ...options };
  const queryTokens = tokenize(query);
  
  if (queryTokens.length === 0) return [];
  
  // Collect all candidate files
  const files: string[] = [];
  const allContent: string[][] = [];
  
  function walkDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!opts.excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (opts.fileTypes.includes(ext)) {
            files.push(fullPath);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              allContent.push(tokenize(content));
            } catch {
              allContent.push([]);
            }
          }
        }
      }
    } catch (err) {
      // Skip directories we can't read
    }
  }
  
  walkDir(rootDir);
  
  // Score each file
  const scoredFiles: FileScore[] = [];
  
  for (let i = 0; i < files.length; i++) {
    try {
      const content = fs.readFileSync(files[i], 'utf-8');
      const score = scoreFile(queryTokens, content, files[i], allContent);
      
      if (score > 0) {
        scoredFiles.push({
          filePath: files[i],
          score,
          preview: getPreview(content, queryTokens, opts.contextWindow),
        });
      }
    } catch {
      // Skip files we can't read
    }
  }
  
  // Sort by score descending and return top N
  scoredFiles.sort((a, b) => b.score - a.score);
  return scoredFiles.slice(0, opts.maxResults);
}

/**
 * Format search results for injection into agent prompt
 */
export function formatContextForPrompt(results: FileScore[]): string {
  if (results.length === 0) return 'No relevant files found.';
  
  let output = `## Relevant Files (Pseudo-Vector Search Results)\n\n`;
  output += `Found ${results.length} relevant files:\n\n`;
  
  for (const result of results) {
    output += `### ${result.filePath}\n`;
    output += `Score: ${result.score.toFixed(2)}\n\`\`\`\`\n`;
    output += result.preview + '\n\`\`\`\`\n\n';
  }
  
  return output;
}
