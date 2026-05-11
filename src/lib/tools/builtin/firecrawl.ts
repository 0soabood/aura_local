import type { ToolDefinition, ToolFn } from '../types';

interface FirecrawlArgs {
  url: string;
  formats?: ('markdown' | 'html' | 'rawHtml' | 'screenshot' | 'json')[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number; // milliseconds
  timeout?: number; // milliseconds
  actions?: Array<{
    type: 'screenshot' | 'click' | 'write' | 'press' | 'scroll' | 'scrape';
    selector?: string;
    text?: string;
    key?: string;
  }>;
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    screenshot?: string; // Base64
    json?: Record<string, unknown>;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode?: number;
      error?: string;
    };
  };
  error?: string;
}

/**
 * Tool: Firecrawl - Web scraping and crawling
 * Gives AURA live internet access via Firecrawl API
 * Requires FIRECRAWL_API_KEY in environment
 */
export const firecrawlDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'firecrawl',
    description: 'Scrape web pages or crawl websites using Firecrawl API. Extracts content in markdown, HTML, or JSON format. Supports screenshots, interactions, and wait conditions. Gives AURA live internet access.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to scrape or crawl',
        },
        formats: {
          type: 'array',
          items: { type: 'string', description: 'Content format: markdown, html, rawHtml, screenshot, json' },
          description: 'Content formats to return (default: markdown)',
        },
        onlyMainContent: {
          type: 'boolean',
          description: 'Extract only main content, skip headers/footers (default: true)',
        },
        includeTags: {
          type: 'array',
          items: { type: 'string', description: 'CSS selector to include' },
          description: 'CSS selectors to include in extraction',
        },
        excludeTags: {
          type: 'array',
          items: { type: 'string', description: 'CSS selector to exclude' },
          description: 'CSS selectors to exclude from extraction',
        },
        waitFor: {
          type: 'number',
          description: 'Wait time in milliseconds before scraping (for dynamic content)',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 30000)',
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', description: 'Action type: screenshot, click, write, press, scroll, scrape' },
              selector: { type: 'string', description: 'CSS selector for click/write/press actions' },
              text: { type: 'string', description: 'Text to write (for write action)' },
              key: { type: 'string', description: 'Key to press (for press action)' },
            },
          },
          description: 'Actions to perform before scraping (screenshots, clicks, etc.)',
        },
      },
      required: ['url'],
    },
  },
};

export const firecrawlFn: ToolFn = async (args: Record<string, unknown>) => {
  const {
    url,
    formats = ['markdown'],
    onlyMainContent = true,
    includeTags,
    excludeTags,
    waitFor,
    timeout = 30000,
    actions,
  } = args as any as FirecrawlArgs;

  try {
    // Get API key from environment
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return 'Error: FIRECRAWL_API_KEY not found in environment. Please add it to .env.local';
    }

    // Prepare request body
    const requestBody: Record<string, unknown> = {
      url,
      formats,
      onlyMainContent,
    };

    if (includeTags) requestBody.includeTags = includeTags;
    if (excludeTags) requestBody.excludeTags = excludeTags;
    if (waitFor) requestBody.waitFor = waitFor;
    if (actions) requestBody.actions = actions;

    // Call Firecrawl API
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return `Firecrawl API error (${response.status}): ${errorText}`;
    }

    const result: FirecrawlResponse = await response.json();

    if (!result.success) {
      return `Firecrawl failed: ${result.error || 'Unknown error'}`;
    }

    const data = result.data;
    if (!data) {
      return 'Firecrawl returned no data';
    }

    // Format response for AURA
    let output = `✅ **Firecrawl Success**

**URL:** ${url}
**Status:** ${data.metadata?.statusCode || 'N/A'}

---

`;

    if (data.markdown) {
      output += `**Markdown Content:**\n\`\`\`markdown\n${data.markdown.slice(0, 2000)}${data.markdown.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
    }

    if (data.json) {
      output += `**JSON Data:**\n\`\`\`json\n${JSON.stringify(data.json, null, 2)}\n\`\`\`\n\n`;
    }

    if (data.screenshot) {
      output += `**Screenshot:** Base64 screenshot captured (${data.screenshot.length} chars)\n\n`;
    }

    if (data.metadata?.title) {
      output += `**Page Title:** ${data.metadata.title}\n`;
    }

    if (data.metadata?.description) {
      output += `**Description:** ${data.metadata.description}\n`;
    }

    output += `\n**Full response saved. Use this data for research, analysis, or content extraction.**`;

    return output;
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return `Firecrawl timeout after ${timeout}ms. Try increasing the timeout or simplifying the request.`;
    }
    return `Firecrawl error: ${err.message}`;
  }
};
