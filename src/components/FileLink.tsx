import React from 'react';

// Regex to match file paths like /absolute/path/to/file.ts or relative src/components/Foo.tsx
const FILE_PATH_RE = /((?:\/[a-zA-Z0-9_./-]+)?(?:src|lib|components|stores|db|config|public|assets|hooks|utils|types|styles|__tests__|pages|app)[a-zA-Z0-9_./-]*\.(tsx?|jsx?|ts|js|css|json|md|yaml|yml|toml|py|go|rs|vue|svelte|astro|mjs|cjs|config))(?:\b|(?=[\s.,;:!?)\]}]))|(\/(?:home|tmp|var|etc|usr|opt)[a-zA-Z0-9_./-]*\.(tsx?|jsx?|ts|js|css|json|md|yaml|yml|toml|py|go|rs))(?:\b|(?=[\s.,;:!?)\]}]))/g;

interface FileLinkProps {
  content: string;
}

export const FileLink: React.FC<FileLinkProps> = ({ content }) => {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  FILE_PATH_RE.lastIndex = 0;

  while ((match = FILE_PATH_RE.exec(content)) !== null) {
    const path = match[0];
    const idx = match.index;

    // Text before this match
    if (idx > lastIndex) {
      parts.push(content.slice(lastIndex, idx));
    }

    // The file path badge
    const filename = path.split('/').pop() || path;
    parts.push(
      <span
        key={idx}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-300/80 hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-all cursor-default select-none"
        title={path}
      >
        📄 {filename}
      </span>
    );

    lastIndex = idx + path.length;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  // No matches — just return the content as-is
  if (parts.length === 0) {
    return <>{content}</>;
  }

  return <>{parts}</>;
};
