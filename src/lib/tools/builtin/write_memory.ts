import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ToolDefinition, ToolFn } from '../types';
import { reloadAuraMemory } from '../../memory/loader';

const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const ALLOWED: readonly string[] = ['SOUL', 'USER', 'AGENTS'];

export const writeMemoryDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_memory',
    description:
      'Append new content to one of the AURA persistent memory files. ' +
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

export const writeMemoryFn: ToolFn = async (args) => {
  const file = String(args.file ?? '').toUpperCase().trim();
  if (!ALLOWED.includes(file)) {
    return `Error: Invalid memory file "${file}". Allowed: ${ALLOWED.join(', ')}`;
  }

  const content = String(args.content ?? '').trim();
  if (!content) return 'Error: content cannot be empty.';

  const filePath = path.join(MEMORY_DIR, `${file}.md`);
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

    // P3: Detect preference overwrites for transparency
    // Look for key-value-like patterns in existing content that match the new content
    const updateInfo = detectPreferenceUpdate(existing, content);

    const separator = existing && !existing.endsWith('\n') ? '\n\n' : '\n';
    fs.writeFileSync(filePath, `${existing}${separator}${content}\n`, 'utf-8');
    reloadAuraMemory();

    if (updateInfo) {
      return `Updated ${file}.md: ${updateInfo.oldValue} → ${updateInfo.newValue}`;
    }
    return `Appended to ${file}.md successfully.`;
  } catch (err: any) {
    return `Error writing to ${file}.md: ${err.message}`;
  }
};

/**
 * P3: Detect if the new content updates an existing preference.
 * Looks for semantic similarity between lines (same topic, different value).
 * Returns { oldValue, newValue } if an update is detected, null otherwise.
 */
function detectPreferenceUpdate(existing: string, newContent: string): { oldValue: string; newValue: string } | null {
  if (!existing.trim()) return null;

  // Normalize: strip common prefixes so we compare the actual fact content
  const stripPrefix = (line: string) =>
    line.replace(/^\s*(Remembered fact:|Session extracted facts:|[-•*]\s*)/i, '').trim();

  const existingLines = existing.split('\n').map(stripPrefix).filter(l => l.length > 5);
  const newLines = newContent.split('\n').map(stripPrefix).filter(l => l.length > 5);

  // Preference/value patterns: "I prefer X", "main language is X", "uses X", etc.
  const valuePatterns = [
    /prefer(?:s|red)?\s*:?\s*(.+)/i,
    /favorite\s*:?\s*(.+)/i,
    /likes?\s*:?\s*(.+)/i,
    /uses?\s*:?\s*(.+)/i,
    /primary\s*:?\s*(.+)/i,
    /chosen\s*:?\s*(.+)/i,
    /selected\s*:?\s*(.+)/i,
    /updated\s*:?\s*(.+)/i,
    /changed\s*:?\s*(.+)/i,
    /now\s*:?\s*(.+)/i,
    /is\s*:?\s*(.+)/i,
    /main\s+\w+\s+is\s+(.+)/i,        // "main project is", "main language is"
    /\bproject\s+is\s+called\s+(.+)/i, // "project is called OpenClaw"
    /\bcalled\s+(.+)/i,
  ];

  for (const newLine of newLines) {
    for (const pattern of valuePatterns) {
      const newMatch = newLine.match(pattern);
      if (!newMatch) continue;
      const newVal = newMatch[1].trim().toLowerCase();
      // Build a "key" from the text before the matched value
      const newPrefix = newLine.slice(0, newMatch.index).trim().toLowerCase();

      for (const oldLine of existingLines) {
        const oldMatch = oldLine.match(pattern);
        if (!oldMatch) continue;
        const oldVal = oldMatch[1].trim().toLowerCase();
        if (oldVal === newVal) continue; // Same value, not an update

        const oldPrefix = oldLine.slice(0, oldMatch.index).trim().toLowerCase();
        // If the prefixes (topics) are similar, it's an update of the same preference
        const prefixOverlap = oldPrefix && newPrefix && (
          oldPrefix === newPrefix ||
          oldPrefix.includes(newPrefix) ||
          newPrefix.includes(oldPrefix) ||
          oldPrefix.slice(0, 20) === newPrefix.slice(0, 20)
        );

        if (prefixOverlap || (!oldPrefix && !newPrefix)) {
          const displayOld = oldMatch[1].trim().slice(0, 60);
          const displayNew = newMatch[1].trim().slice(0, 60);
          return { oldValue: displayOld, newValue: displayNew };
        }
      }
    }
  }

  // Fallback: tech-term swap detection
  const techTerms = ['go', 'golang', 'typescript', 'javascript', 'python', 'rust', 'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'react', 'vue', 'angular', 'svelte', 'astro', 'next.js', 'node', 'deno', 'bun', 'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'postgres', 'mysql', 'sqlite', 'mongo', 'redis', 'tailwind', 'bootstrap', 'sass', 'dark mode', 'light mode'];

  for (const newLine of newLines) {
    const newTerms = techTerms.filter(t => newLine.toLowerCase().includes(t));
    if (newTerms.length === 0) continue;

    for (const oldLine of existingLines) {
      const oldTerms = techTerms.filter(t => oldLine.toLowerCase().includes(t));
      if (oldTerms.length === 0) continue;

      // If the lines share non-tech words (same topic) but differ in tech term, it's an update
      const newWords = newLine.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !techTerms.includes(w));
      const oldWords = oldLine.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !techTerms.includes(w));
      const sharedTopicWords = newWords.filter(w => oldWords.includes(w));

      const sharedTech = newTerms.filter(nt => oldTerms.includes(nt));
      const differentTech = newTerms.some(nt => !oldTerms.includes(nt)) || oldTerms.some(ot => !newTerms.includes(ot));

      if (differentTech && (sharedTopicWords.length >= 2 || sharedTech.length > 0 || newLine.slice(0, 25).toLowerCase() === oldLine.slice(0, 25).toLowerCase())) {
        return {
          oldValue: oldTerms[0]?.slice(0, 60) || oldLine.slice(0, 60),
          newValue: newTerms[0]?.slice(0, 60) || newLine.slice(0, 60),
        };
      }
    }
  }

  return null;
}
