import { BaseMessage } from '@langchain/core/messages';
import { ToolRegistry } from '../tools/registry';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { BlackboardEvent, AgentBid, AgentOutput, EventType } from '../../shared/types';
import { resolveModel } from '../ModelConfig.server';
import { ModelRole } from '../ModelConfig';

/**
 * BureaucracyAgent - Specialized agent for generating bureaucratic documents
 * Handles LEA letters, Gewerbeanmeldung, business plans, and pitch decks
 * Optimized for German bureaucratic language and legal requirements
 */
export class BureaucracyAgent {
  name = 'bureaucracy_agent';
  description = 'Generates bureaucratic documents (LEA letters, Gewerbeanmeldung, business plans) in German and English';

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

    // High confidence keywords for bureaucratic tasks
    const bureaucracyKeywords = [
      'lea', 'letter of intent', 'self-employment', 'gewerbeanmeldung',
      'business registration', 'business plan', 'pitch deck',
      'selbstständigkeit', 'gewerbe', 'anmeldung',
      'berlin', 'germany', 'visa', 'residence permit',
      'ht w', 'studies', 'automation', 'ai agent',
    ];

    // Memory keywords for "remember/save/note/store" commands
    const memoryKeywords = [
      'remember', 'save this', 'note this', 'store this',
      'memorize', 'write down', 'keep in mind', 'don\'t forget',
      'record this', 'make a note', 'log this', 'save to memory',
    ];

    const hasBureaucracyKeyword = bureaucracyKeywords.some(k => content.includes(k));
    const hasMemoryKeyword = memoryKeywords.some(k => content.includes(k));

    // Don't re-bid if we already produced output this turn (prevents blocking synthesis)
    const reversedUserIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserIdx = reversedUserIdx >= 0 ? events.length - 1 - reversedUserIdx : 0;
    const eventsAfterLastUser = events.slice(lastUserIdx + 1);
    const alreadyCompleted = eventsAfterLastUser.some(
      e => e.event_type === 'agent_output' && e.author === 'bureaucracy_agent'
    );
    if (alreadyCompleted) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Already completed this turn', expectedOutputShape: 'text' };
    }

    if (!hasBureaucracyKeyword && !hasMemoryKeyword) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'Not a bureaucracy or memory task', expectedOutputShape: 'text' };
    }

    // Memory commands get high confidence — write to memory tool
    if (hasMemoryKeyword && !hasBureaucracyKeyword) {
      return {
        agentName: this.name as any,
        confidence: 0.85,
        proposedAction: `Save to memory: ${content.slice(0, 50)}...`,
        expectedOutputShape: 'text',
      };
    }

    // Calculate confidence based on keyword matches
    let confidence = 0.5; // Base confidence for bureaucracy keywords
    
    if (content.includes('lea') || content.includes('letter of intent')) confidence += 0.3;
    if (content.includes('gewerbeanmeldung') || content.includes('business registration')) confidence += 0.3;
    if (content.includes('generate') || content.includes('create') || content.includes('draft')) confidence += 0.1;
    if (content.includes('german') || content.includes('deutsch') || content.includes('berlin')) confidence += 0.1;
    
    // Check if generate_document tool is available
    if (!this.toolRegistry.has('generate_document')) {
      return { agentName: this.name as any, confidence: 0, proposedAction: 'generate_document tool not available', expectedOutputShape: 'text' };
    }

    return {
      agentName: this.name as any,
      confidence: Math.min(confidence, 1.0),
      proposedAction: `Generate bureaucratic document for: ${content.slice(0, 50)}...`,
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
      // Handle memory commands
      const memoryKeywords = [
        'remember', 'save this', 'note this', 'store this',
        'memorize', 'write down', 'keep in mind', 'don\'t forget',
        'record this', 'make a note', 'log this', 'save to memory',
      ];
      const content = userQuery.toLowerCase();
      const isMemoryCmd = memoryKeywords.some(k => content.includes(k));

      if (isMemoryCmd) {
        return await this.saveToMemory(userQuery);
      }

      // Determine document type for bureaucracy tasks
      const docType = this.determineDocumentType(userQuery);
      const language = userQuery.toLowerCase().includes('german') || userQuery.toLowerCase().includes('deutsch') ? 'de' : 'en';

      // Extract relevant data from user query or use defaults
      const documentData = this.extractDocumentData(userQuery);

      // Call generate_document tool
      const toolCall = {
        id: `call_${Date.now()}`,
        name: 'generate_document',
        arguments: {
          type: docType,
          language,
          data: documentData,
        },
      };

      const result = await this.toolRegistry.execute(toolCall);

      if (result.isError) {
        return {
          event_type: 'execution_error',
          content: `Failed to generate document: ${result.content}`,
        };
      }

      // Parse the result
      const parsedResult = JSON.parse(result.content);
      
      return {
        event_type: 'agent_output',
        content: `✅ **Document Generated Successfully**

**Type:** ${docType}
**Language:** ${language === 'de' ? 'German' : 'English'}
**Output Path:** ${parsedResult.outputPath}

---

${parsedResult.content}

---

**Next Steps:**
${this.getNextSteps(docType)}
`,
        metadata: {
          model_id: 'bureaucracy_agent',
          latency_ms: 0,
          documentType: docType,
          language,
        },
      };
    } catch (err: any) {
      return {
        event_type: 'execution_error',
        content: `BureaucracyAgent error: ${err.message}`,
      };
    }
  }

  private async saveToMemory(query: string): Promise<AgentOutput> {
    try {
      // Extract the fact/note from the query
      const fact = query.replace(/^(remember|save this|note this|store this|memorize|write down|keep in mind|record this|make a note|log this|save to memory)[\s:,-]+/i, '').trim();

      if (!fact) {
        return {
          event_type: 'execution_error',
          content: 'No fact provided to save. Format: "Remember: <fact>" or "Save to memory: <fact>"',
        };
      }

      const result = await this.toolRegistry.execute({
        id: `memory_${Date.now()}`,
        name: 'write_memory',
        arguments: {
          file: 'USER',
          content: `Remembered fact: ${fact}`,
        },
      });

      if (result.isError) {
        return {
          event_type: 'execution_error',
          content: `Failed to save to memory: ${result.content}`,
        };
      }

      // P3: Surface preference update transparency
      const resultText = String(result.content ?? '');
      if (resultText.includes('→')) {
        // Extract the update arrow display
        const updateMatch = resultText.match(/Updated\s+USER\.md:\s*(.+)/);
        const updateDisplay = updateMatch ? updateMatch[1] : resultText;
        return {
          event_type: 'agent_output',
          content: `🔄 **Updated memory:** ${updateDisplay}\n\nThis preference will be used in future sessions.`,
          metadata: {
            model_id: 'bureaucracy_agent',
            latency_ms: 0,
            factLength: fact.length,
            update: true,
          },
        };
      }

      return {
        event_type: 'agent_output',
        content: `✅ **Saved to memory:** "${fact}"\n\nThis will be available in future sessions.`,
        metadata: {
          model_id: 'bureaucracy_agent',
          latency_ms: 0,
          factLength: fact.length,
        },
      };
    } catch (err: any) {
      return {
        event_type: 'execution_error',
        content: `Memory save error: ${err.message}`,
      };
    }
  }

  private determineDocumentType(query: string): string {
    const lower = query.toLowerCase();
    
    if (lower.includes('lea') || lower.includes('letter of intent') || lower.includes('self-employment')) {
      return 'lea_letter';
    }
    if (lower.includes('gewerbe') || lower.includes('business registration') || lower.includes('anmeldung')) {
      return 'gewerbeanmeldung';
    }
    if (lower.includes('business plan')) {
      return 'business_plan';
    }
    if (lower.includes('pitch') || lower.includes('deck')) {
      return 'pitch_deck';
    }
    
    // Default to LEA letter if unclear
    return 'lea_letter';
  }

  private extractDocumentData(query: string): Record<string, unknown> {
    // In a real implementation, this would extract structured data from the query
    // For now, return sensible defaults for AURA project
    return {
      fullName: '[Your Full Name]',
      residenceStatus: 'Student Visa (§ 16b AufenthG)',
      residenceTitle: 'Aufenthaltstitel für Studierende',
      businessConcept: 'AURA Local Sync - AI-powered automation platform for digital services',
      timeCommitment: 'low',
      automationLevel: 'fully_automated',
      studiesPrimary: true,
      businessName: 'AURA Local Sync',
      businessType: 'Einzelunternehmen',
      activityDescription: 'Development and operation of an AI-powered automation platform (AURA Local Sync) for digital services. The platform uses AI agents for automated creation of graphic designs, Etsy listings, and digital content. Operations are largely automated with minimal manual intervention.',
      address: '[Your Berlin Address]',
      taxNumber: '[If available]',
    };
  }

  private getNextSteps(docType: string): string {
    switch (docType) {
      case 'lea_letter':
        return '1. Review the letter carefully\n2. Sign and date the document\n3. Submit via LEA Berlin online portal\n4. Prepare supporting documents (passport, residence title, health insurance, proof of livelihood)';
      case 'gewerbeanmeldung':
        return '1. Review the registration form\n2. Sign and date the document\n3. Submit to Ordnungsamt Berlin\n4. Pay the processing fee (€26-65 depending on processing time)\n5. Wait for confirmation (Gewerbeschein)';
      case 'business_plan':
        return '1. Review and refine the business plan\n2. Prepare financial projections\n3. Gather supporting documents\n4. Submit with funding application (if applicable)';
      case 'pitch_deck':
        return '1. Review and refine the pitch deck\n2. Practice your presentation\n3. Prepare for Q&A session\n4. Submit to investors or funding bodies';
      default:
        return 'Review the document and follow the instructions provided.';
    }
  }
}
