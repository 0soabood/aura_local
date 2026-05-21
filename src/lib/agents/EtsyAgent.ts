import { BaseMessage } from '@langchain/core/messages';
import { ToolRegistry } from '../tools/registry';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { BlackboardEvent, AgentBid, AgentOutput, EventType } from '../../shared/types';
import { resolveModel } from '../ModelConfig.server';
import { ModelRole } from '../ModelConfig';

/**
 * EtsyAgent - Specialized agent for Etsy automation
 * Handles listing creation, image uploads, pricing, and Printify integration
 * Optimized for e-commerce automation with AI-generated content
 */
export class EtsyAgent {
  name = 'etsy_agent';
  description = 'Creates and manages Etsy listings with AI-generated titles, descriptions, tags, and images. Integrates with Printify for print-on-demand products.';

  private registry: ProviderRegistry;
  private toolRegistry: ToolRegistry;

  constructor(registry: ProviderRegistry, toolRegistry: ToolRegistry) {
    this.registry = registry;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Evaluate if this agent should handle the request
   * Returns confidence score 0.0-1.0
   */
  evaluate(events: BlackboardEvent[]): AgentBid {
    const lastUserMessage = [...events]
      .reverse()
      .find(e => e.event_type === 'user_message');

    if (!lastUserMessage) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'No user message', expectedOutputShape: 'text' };
    }

    const content = lastUserMessage.content.toLowerCase();

    // High confidence keywords for Etsy tasks
    const etsyKeywords = [
      'etsy', 'listing', 'shop', 'sell', 'product',
      'printify', 'print on demand', 'podb',
      'digital download', 'svg', 'png', 'graphic design',
      'title', 'tags', 'description', 'price',
      'publish', 'draft', 'activate',
    ];

    const hasEtsyKeyword = etsyKeywords.filter(k => content.includes(k)).length >= 2;

    if (!hasEtsyKeyword) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Not an Etsy task', expectedOutputShape: 'text' };
    }

    // Calculate confidence based on keyword matches
    let confidence = 0.5; // Base confidence for Etsy keywords
    
    if (content.includes('etsy') || content.includes('listing')) confidence += 0.3;
    if (content.includes('create') || content.includes('make') || content.includes('new')) confidence += 0.2;
    if (content.includes('printify') || content.includes('print on demand')) confidence += 0.2;
    if (content.includes('graphic') || content.includes('design') || content.includes('svg')) confidence += 0.1;
    if (content.includes('title') || content.includes('description') || content.includes('tags')) confidence += 0.1;
    
    // Check if required tools are available
    const hasCreateListing = this.toolRegistry.has('create_etsy_listing');
    const hasUpdateListing = this.toolRegistry.has('update_etsy_listing');
    const hasPrintify = this.toolRegistry.has('publish_to_printify');
    
    if (!hasCreateListing && !hasUpdateListing) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Etsy tools not available', expectedOutputShape: 'text' };
    }

    return {
      agentName: this.name as any,
      confidence: Math.min(confidence, 1.0),
      proposedAction: `Etsy task: ${content.slice(0, 50)}...`,
      expectedOutputShape: 'text',
    };
  }

  /**
   * Execute the agent's task
   */
  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    const lastUserMessage = [...events]
      .reverse()
      .find(e => e.event_type === 'user_message');

    if (!lastUserMessage) {
      return {
        event_type: 'execution_error',
        content: 'No user message found',
      };
    }

    const userQuery = lastUserMessage.content;

    try {
      // Determine task type
      const taskType = this.determineTaskType(userQuery);
      
      switch (taskType) {
        case 'create_listing':
          return await this.createListing(userQuery);
        case 'update_listing':
          return await this.updateListing(userQuery);
        case 'publish_printify':
          return await this.publishToPrintify(userQuery);
        default:
          return {
            event_type: 'execution_error',
            content: `Unknown Etsy task type: ${taskType}`,
          };
      }
    } catch (err: any) {
      return {
        event_type: 'execution_error',
        content: `EtsyAgent error: ${err.message}`,
      };
    }
  }

  private determineTaskType(query: string): string {
    const lower = query.toLowerCase();
    
    if (lower.includes('create') || lower.includes('new') || lower.includes('add')) {
      return 'create_listing';
    }
    if (lower.includes('update') || lower.includes('modify') || lower.includes('change')) {
      return 'update_listing';
    }
    if (lower.includes('printify') || lower.includes('publish')) {
      return 'publish_printify';
    }
    
    // Default to create listing
    return 'create_listing';
  }

  private async createListing(query: string): Promise<AgentOutput> {
    // Extract listing details from query or use defaults
    const title = this.extractTitle(query);
    const description = this.generateDescription(query);
    const price = this.extractPrice(query);
    const tags = this.extractTags(query);

    // Call create_etsy_listing tool
    const toolCall = {
      id: `call_${Date.now()}`,
      name: 'create_etsy_listing',
      arguments: {
        title,
        description,
        price,
        tags,
        currency: 'USD',
        whoMade: 'i_did',
        whenMade: '2020_2024',
        isSupply: false,
        isDigital: true, // Default to digital for graphics
      },
    };

    const result = await this.toolRegistry.execute(toolCall);

    if (result.isError) {
      return {
        event_type: 'execution_error',
        content: `Failed to create Etsy listing: ${result.content}`,
      };
    }

    const parsedResult = JSON.parse(result.content);
    
    return {
      event_type: 'agent_output',
      content: `✅ **Etsy Listing Created Successfully**

**Title:** ${title}
**Price:** $${price.toFixed(2)}
**Tags:** ${tags.join(', ')}

---

${parsedResult.message}

**Next Steps:**
${parsedResult.nextSteps?.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') || 'Review and publish when ready.'}

---

**Description Preview:**
${description.slice(0, 200)}...
`,
      metadata: {
        model_id: 'etsy_agent',
        latency_ms: 0,
        listingId: parsedResult.listing?.listing_id,
        state: 'draft',
      },
    };
  }

  private async updateListing(query: string): Promise<AgentOutput> {
    // In a real implementation, would extract listing ID from query or context
    const listingId = 'mock_listing_123';
    
    const updates: Record<string, unknown> = {};
    
    if (query.toLowerCase().includes('publish') || query.toLowerCase().includes('activate')) {
      updates.state = 'active';
    }
    
    const toolCall = {
      id: `call_${Date.now()}`,
      name: 'update_etsy_listing',
      arguments: {
        listingId,
        ...updates,
      },
    };

    const result = await this.toolRegistry.execute(toolCall);

    if (result.isError) {
      return {
        event_type: 'execution_error',
        content: `Failed to update Etsy listing: ${result.content}`,
      };
    }

    const parsedResult = JSON.parse(result.content);
    
    return {
      event_type: 'agent_output',
      content: `✅ **Etsy Listing Updated**

**Listing ID:** ${listingId}
**Updated Fields:** ${parsedResult.updatedFields?.join(', ') || 'none'}

---

${parsedResult.message}

**New State:** ${parsedResult.newState || 'unchanged'}
`,
      metadata: {
        model_id: 'etsy_agent',
        latency_ms: 0,
        listingId,
      },
    };
  }

  private async publishToPrintify(query: string): Promise<AgentOutput> {
    const title = this.extractTitle(query);
    const description = this.generateDescription(query);
    
    // Mock image paths (in real implementation, would generate or use provided images)
    const images = ['design_front.png', 'design_back.png'];
    
    const toolCall = {
      id: `call_${Date.now()}`,
      name: 'publish_to_printify',
      arguments: {
        title,
        description,
        images,
        publish: false, // Default to draft for review
      },
    };

    const result = await this.toolRegistry.execute(toolCall);

    if (result.isError) {
      return {
        event_type: 'execution_error',
        content: `Failed to publish to Printify: ${result.content}`,
      };
    }

    const parsedResult = JSON.parse(result.content);
    
    return {
      event_type: 'agent_output',
      content: `✅ **Printify Product Created**

**Title:** ${title}
**Images:** ${images.length} design(s)
**State:** ${parsedResult.product?.state || 'draft'}

---

${parsedResult.message}

**Next Steps:**
${parsedResult.nextSteps?.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') || 'Review and publish when ready.'}
`,
      metadata: {
        model_id: 'etsy_agent',
        latency_ms: 0,
        productId: parsedResult.product?.id,
      },
    };
  }

  private extractTitle(query: string): string {
    // Simple extraction - in real implementation, would use AI to generate
    const words = query.split(' ').slice(0, 8).join(' ');
    return words.length > 10 ? words : 'AI-Generated Graphic Design';
  }

  private generateDescription(query: string): string {
    return `Beautiful AI-generated design created with AURA Local Sync. Perfect for digital projects, crafting, and personal use. High-quality digital download ready for immediate use.

Features:
- High-resolution PNG file
- Transparent background
- Scalable design
- Instant download

Created with AI automation technology.`;
  }

  private extractPrice(query: string): number {
    // Extract price from query or default
    const priceMatch = query.match(/\$(\d+\.?\d*)/);
    if (priceMatch) {
      return parseFloat(priceMatch[1]);
    }
    return 4.50; // Default price
  }

  private extractTags(query: string): string[] {
    // Default tags for graphic design
    return [
      'digital download',
      'svg',
      'png',
      'graphic design',
      'ai generated',
      'aura local sync',
      'digital art',
      'instant download',
      'crafting',
      'printable',
    ].slice(0, 13);
  }
}
