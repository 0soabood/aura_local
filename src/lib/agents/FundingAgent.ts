import { BaseMessage } from '@langchain/core/messages';
import { ToolRegistry } from '../tools/registry';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { BlackboardEvent, AgentBid, AgentOutput } from '../../shared/types';
import { resolveModel } from '../ModelConfig.server';
import { ModelRole } from '../ModelConfig';

/**
 * FundingAgent - Specialized agent for funding applications and pitch decks
 * Handles business plan generation, pitch deck creation, and funding strategy
 * Optimized for ADHD accessibility technology and scientific validation
 */
export class FundingAgent {
  name = 'funding_agent';
  description = 'Generates business plans, pitch decks, and funding applications. Specialized for ADHD accessibility technology and scientific validation.';

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

    // High confidence keywords for funding tasks
    const fundingKeywords = [
      'funding', 'investment', 'grant', 'bss', 'gründungsbonus',
      'business plan', 'pitch deck', 'investor', 'venture capital',
      'seed round', 'series a', 'angel', 'accelerator',
      'ht w', 'htw berlin', 'scientific mentor', 'research',
      'adhd', 'accessibility', 'neurodivergent',
    ];

    const hasFundingKeyword = fundingKeywords.some(k => content.includes(k));
    
    if (!hasFundingKeyword) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Not a funding task', expectedOutputShape: 'text' };
    }

    // Calculate confidence based on keyword matches
    let confidence = 0.5; // Base confidence for funding keywords
    
    if (content.includes('business plan')) confidence += 0.3;
    if (content.includes('pitch deck')) confidence += 0.3;
    if (content.includes('funding') || content.includes('investment')) confidence += 0.2;
    if (content.includes('ht w') || content.includes('htw berlin')) confidence += 0.1;
    if (content.includes('adhd') || content.includes('accessibility')) confidence += 0.1;
    
    // Check if required tools are available
    const hasBusinessPlan = this.toolRegistry.has('generate_business_plan');
    const hasPitchDeck = this.toolRegistry.has('generate_pitch_deck');
    
    if (!hasBusinessPlan && !hasPitchDeck) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Funding tools not available', expectedOutputShape: 'text' };
    }

    return {
      agentName: this.name as any,
      confidence: Math.min(confidence, 1.0),
      proposedAction: `Funding task: ${content.slice(0, 50)}...`,
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
        case 'business_plan':
          return await this.generateBusinessPlan(userQuery);
        case 'pitch_deck':
          return await this.generatePitchDeck(userQuery);
        default:
          return {
            event_type: 'execution_error',
            content: `Unknown funding task type: ${taskType}`,
          };
      }
    } catch (err: any) {
      return {
        event_type: 'execution_error',
        content: `FundingAgent error: ${err.message}`,
      };
    }
  }

  private determineTaskType(query: string): string {
    const lower = query.toLowerCase();
    
    if (lower.includes('business plan')) {
      return 'business_plan';
    }
    if (lower.includes('pitch deck') || lower.includes('pitchdeck')) {
      return 'pitch_deck';
    }
    
    // Default to business plan
    return 'business_plan';
  }

  private async generateBusinessPlan(query: string): Promise<AgentOutput> {
    // Extract company name from query or use default
    const companyName = this.extractCompanyName(query);

    // Call generate_business_plan tool
    const toolCall = {
      id: `call_${Date.now()}`,
      name: 'generate_business_plan',
      arguments: {
        companyName,
        industry: 'AI/ML Automation - ADHD Accessibility Tech',
        problemStatement: 'Businesses and individuals struggle with repetitive digital tasks that could be automated with AI, especially neurodivergent individuals',
        solution: 'AI-powered automation platform using LangGraph orchestration with ADHD-optimized UX',
        targetMarket: 'Small businesses, solopreneurs, students, and ADHD individuals',
        businessModel: 'SaaS subscription + transaction fees from Etsy/Printify sales',
        revenueStreams: [
          'SaaS subscriptions (monthly/annual)',
          'Etsy listing fees (5% transaction fee)',
          'Printify profit margins (20-40%)',
          'Consulting and custom automation services',
        ],
        competitiveAdvantage: 'ADHD-first design, 190+ passing tests as execution proof, local-first architecture, scientific validation via HTW Berlin',
        financialProjections: {
          year1Revenue: 50000,
          year2Revenue: 150000,
          year3Revenue: 500000,
          fundingNeeded: 100000,
        },
        teamMembers: [
          {
            name: '[Your Name]',
            role: 'Founder/CEO',
            background: 'HTW Berlin student, ADHD advocate, 190+ passing tests as execution proof',
          },
        ],
        useAI: true,
      },
    };

    const result = await this.toolRegistry.execute(toolCall);

    if (result.isError) {
      return {
        event_type: 'execution_error',
        content: `Failed to generate business plan: ${result.content}`,
      };
    }

    const parsedResult = JSON.parse(result.content);
    
    return {
      event_type: 'agent_output',
      content: `✅ **Business Plan Generated Successfully**

**Company:** ${companyName}
**Industry:** AI/ML Automation - ADHD Accessibility Tech

---

${parsedResult.plan}

---

**Next Steps:**
${parsedResult.sections?.map((section: string, i: number) => `${i + 1}. Review and refine: ${section}`).join('\n') || 'Review and refine before submission.'}

**Status:** ${parsedResult.status || 'Draft - Review and refine before submission'}
`,
      metadata: {
        model_id: 'funding_agent',
        latency_ms: 0,
        companyName,
        sections: parsedResult.sections,
      },
    };
  }

  private async generatePitchDeck(query: string): Promise<AgentOutput> {
    const companyName = this.extractCompanyName(query);

    const toolCall = {
      id: `call_${Date.now()}`,
      name: 'generate_pitch_deck',
      arguments: {
        companyName,
        tagline: 'AI Automation for Everyone, Especially the Neurodivergent',
        problem: 'Businesses and individuals struggle with repetitive digital tasks, especially those with ADHD',
        solution: 'AI-powered automation platform with ADHD-optimized UX and LangGraph orchestration',
        marketSize: '€46.7B AI automation market + emerging ADHD accessibility niche',
        businessModel: 'SaaS + transaction fees',
        traction: '190+ passing tests, functional prototype, Etsy/Printify integration, Bureaucratic automation ready',
        competitiveAdvantage: 'ADHD-first design, 190+ tests as execution proof, local-first architecture, scientific validation via HTW Berlin',
        financialAsk: {
          amount: 100000,
          equity: 10,
          useOfFunds: 'Product Development (40%), Marketing (30%), Operations (20%), Reserve (10%)',
        },
        teamHighlights: [
          'Founder/CEO: HTW Berlin student and ADHD advocate',
          'Built AURA from scratch with 190+ passing tests',
          'Passionate about accessibility technology',
        ],
        useAI: true,
      },
    };

    const result = await this.toolRegistry.execute(toolCall);

    if (result.isError) {
      return {
        event_type: 'execution_error',
        content: `Failed to generate pitch deck: ${result.content}`,
      };
    }

    const parsedResult = JSON.parse(result.content);
    
    return {
      event_type: 'agent_output',
      content: `✅ **Pitch Deck Generated Successfully**

**Company:** ${companyName}
**Tagline:** AI Automation for Everyone, Especially the Neurodivergent

---

${parsedResult.deck}

---

**Next Steps:**
${parsedResult.slides?.map((slide: string, i: number) => `${i + 1}. Practice: ${slide}`).join('\n') || 'Practice your presentation before delivering.'}

**Status:** ${parsedResult.status || 'Draft - Practice your presentation before delivering!'}
`,
      metadata: {
        model_id: 'funding_agent',
        latency_ms: 0,
        companyName,
        slides: parsedResult.slides,
      },
    };
  }

  private extractCompanyName(query: string): string {
    // Simple extraction - in real implementation, would use AI to extract
    const words = query.split(' ').slice(0, 5).join(' ');
    return words.length > 10 ? 'AURA Local Sync' : words || 'AURA Local Sync';
  }
}
