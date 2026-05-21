import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

/**
 * MarkdownRenderer — renders agent/message content as rich markdown.
 *
 * Uses react-markdown with custom component overrides for:
 *   - Code blocks with dark terminal styling
 *   - Tables with AURA's border/opacity design language
 *   - Links that open in new tabs
 *   - Lists with proper indentation
 *   - FileLink-style file path badges (via the inner FileLink component on inline code)
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const components: Partial<Components> = {
    // Code blocks — dark terminal-style with copy button
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      const codeText = String(children).replace(/\n$/, '');

      if (isInline) {
        return (
          <code
            className="px-1 py-0.5 rounded text-[11px] font-mono bg-white/[0.06] border border-white/5 text-cyan-200/90"
            {...props}
          >
            {children}
          </code>
        );
      }

      const language = className?.replace('language-', '') || '';

      return (
        <div className="relative group my-3">
          {/* Language badge + copy button */}
          <div className="flex items-center justify-between px-3 py-1 rounded-t-lg bg-[#0d0d1a] border border-white/[0.06] border-b-0">
            {language ? (
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/25">{language}</span>
            ) : (
              <span className="text-[9px] font-mono text-white/15">code</span>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(codeText)}
              className="text-[9px] font-mono text-white/20 hover:text-white/50 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.04]"
              title="Copy code"
            >
              📋 copy
            </button>
          </div>
          <pre className="m-0 px-4 py-3 rounded-b-lg bg-[#0a0a14] border border-white/[0.06] overflow-x-auto">
            <code className={`text-[12px] font-mono leading-relaxed text-cyan-200/80 ${className || ''}`} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    },

    // Tables — match AURA's dark theme
    table: ({ children }) => (
      <div className="overflow-x-auto my-3">
        <table className="w-full border-collapse border border-white/[0.06] rounded-lg overflow-hidden text-[12px]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-white/[0.03] border-b border-white/[0.06]">{children}</thead>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left text-[10px] font-mono uppercase tracking-wider text-white/40 font-medium border-r border-white/[0.04] last:border-r-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 border-t border-white/[0.04] border-r border-white/[0.04] last:border-r-0 text-white/70">
        {children}
      </td>
    ),

    // Links — open in new tab
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-500/30 transition-colors"
      >
        {children}
      </a>
    ),

    // Headings
    h1: ({ children }) => <h1 className="text-base font-semibold text-white/80 mt-4 mb-2">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-semibold text-white/70 mt-3 mb-1.5">{children}</h2>,
    h3: ({ children }) => <h3 className="text-[13px] font-semibold text-white/60 mt-2 mb-1">{children}</h3>,

    // Paragraphs
    p: ({ children }) => <p className="text-sm leading-relaxed text-white/80 mb-2 last:mb-0">{children}</p>,

    // Lists
    ul: ({ children }) => <ul className="list-disc list-inside text-sm text-white/80 space-y-0.5 mb-2 ml-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-white/80 space-y-0.5 mb-2 ml-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-indigo-500/30 pl-3 my-2 text-white/50 text-sm italic">
        {children}
      </blockquote>
    ),

    // Horizontal rules
    hr: () => <hr className="border-white/[0.04] my-3" />,

    // Inline formatting
    strong: ({ children }) => <strong className="font-semibold text-white/90">{children}</strong>,
    em: ({ children }) => <em className="italic text-white/80">{children}</em>,
  };

  return (
    <div className="markdown-content">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
};
