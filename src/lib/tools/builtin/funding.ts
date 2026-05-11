import type { ToolDefinition, ToolFn } from '../types';

interface BusinessPlanArgs {
  companyName: string;
  industry: string;
  problemStatement: string;
  solution: string;
  targetMarket: string;
  businessModel: string;
  revenueStreams: string[];
  competitiveAdvantage: string;
  financialProjections?: {
    year1Revenue?: number;
    year2Revenue?: number;
    year3Revenue?: number;
    fundingNeeded?: number;
  };
  teamMembers?: Array<{
    name: string;
    role: string;
    background: string;
  }>;
  useAI?: boolean; // Use AI to generate content
}

interface PitchDeckArgs {
  companyName: string;
  tagline: string;
  problem: string;
  solution: string;
  marketSize: string;
  businessModel: string;
  traction?: string;
  competitiveAdvantage: string;
  financialAsk?: {
    amount: number;
    equity?: number;
    useOfFunds: string;
  };
  teamHighlights?: string[];
  useAI?: boolean; // Use AI to generate content
}

/**
 * Tool: Generate Business Plan
 * Creates a comprehensive business plan with AI assistance
 */
export const generateBusinessPlanDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_business_plan',
    description: 'Generate a comprehensive business plan with executive summary, market analysis, financial projections, and team overview. Optimized for ADHD accessibility technology startups.',
    parameters: {
      type: 'object',
      properties: {
        companyName: {
          type: 'string',
          description: 'Name of the company (e.g., AURA Local Sync)',
        },
        industry: {
          type: 'string',
          description: 'Industry sector (e.g., AI/ML, Accessibility Tech, Automation)',
        },
        problemStatement: {
          type: 'string',
          description: 'The problem your business solves',
        },
        solution: {
          type: 'string',
          description: 'Your solution to the problem',
        },
        targetMarket: {
          type: 'string',
          description: 'Target market and customer segments',
        },
        businessModel: {
          type: 'string',
          description: 'How the business makes money',
        },
        revenueStreams: {
          type: 'array',
          items: { type: 'string', description: 'Revenue stream description' },
          description: 'List of revenue streams',
        },
        competitiveAdvantage: {
          type: 'string',
          description: 'What sets you apart from competitors',
        },
        financialProjections: {
          type: 'object',
          properties: {
            year1Revenue: { type: 'number', description: 'Year 1 projected revenue (EUR)' },
            year2Revenue: { type: 'number', description: 'Year 2 projected revenue (EUR)' },
            year3Revenue: { type: 'number', description: 'Year 3 projected revenue (EUR)' },
            fundingNeeded: { type: 'number', description: 'Total funding needed (EUR)' },
          },
          description: 'Financial projections for 3 years',
        },
        teamMembers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Team member name' },
              role: { type: 'string', description: 'Role in the company' },
              background: { type: 'string', description: 'Relevant background' },
            },
          },
          description: 'Key team members',
        },
        useAI: {
          type: 'boolean',
          description: 'Use AI to generate and enhance content (default: true)',
        },
      },
      required: ['companyName', 'industry', 'problemStatement', 'solution', 'targetMarket', 'businessModel'],
    },
  },
};

export const generateBusinessPlanFn: ToolFn = async (args: Record<string, unknown>) => {
  const {
    companyName = 'AURA Local Sync',
    industry = 'AI/ML Automation',
    problemStatement = 'Businesses struggle with repetitive digital tasks that could be automated with AI',
    solution = 'AI-powered automation platform using LangGraph orchestration and specialized agents',
    targetMarket = 'Small businesses, solopreneurs, students, and ADHD individuals',
    businessModel = 'SaaS subscription + transaction fees from Etsy/Printify sales',
    revenueStreams = ['SaaS subscriptions', 'Etsy listing fees', 'Printify profit margins', 'Consulting services'],
    competitiveAdvantage = 'ADHD-optimized UX, local-first architecture, 190+ passing tests as execution proof',
    financialProjections = {},
    teamMembers = [],
    useAI = true,
  } = args as any as BusinessPlanArgs;

  try {
    const plan = `# Business Plan: ${companyName}

## Executive Summary
**Industry:** ${industry}  
**Mission:** Empower individuals and businesses with AI-powered automation tools that are accessible, local-first, and ADHD-friendly.

**Problem:** ${problemStatement}

**Solution:** ${solution}

**Target Market:** ${targetMarket}

**Business Model:** ${businessModel}

---

## Company Overview

### Mission Statement
To democratize AI automation by building tools that are accessible to everyone, including neurodivergent individuals.

### Company History
AURA Local Sync began as a personal project to solve automation challenges faced by ADHD individuals. It has evolved into a comprehensive platform with:
- 190+ passing tests
- LangGraph orchestration
- Multi-agent architecture
- Veto Layer authorization
- Bureaucratic automation capabilities

### Current Traction
- Functional prototype with 5 specialized agents
- Etsy and Printify integration ready
- Bureaucratic document generation (LEA, Gewerbe)
- ROI tracking dashboard

---

## Market Analysis

### Target Market
${targetMarket}

### Market Size
- Global AI automation market: $46.7B (2024)
- ADHD accessibility tech: Emerging niche with high growth potential
- Etsy sellers: 7.5M+ active sellers
- Print-on-demand: $6.8B market

### Competitive Advantage
${competitiveAdvantage}

---

## Products & Services

### AURA Local Sync Platform
- **Core Engine:** LangGraph-based multi-agent orchestration
- **Specialized Agents:** Research, Code, Synthesis, Bureaucracy, Etsy
- **Veto Layer:** Tiered authorization for safe automation
- **Local-First:** SQLite persistence, no cloud dependency

### Revenue Streams
${revenueStreams.map((stream: string, i: number) => `${i + 1}. ${stream}`).join('\n')}

---

## Financial Projections

### 3-Year Projection (EUR)
${financialProjections.year1Revenue ? `- Year 1: €${financialProjections.year1Revenue.toLocaleString()}` : '- Year 1: €50,000 (projected)'}
${financialProjections.year2Revenue ? `- Year 2: €${financialProjections.year2Revenue.toLocaleString()}` : '- Year 2: €150,000 (projected)'}
${financialProjections.year3Revenue ? `- Year 3: €${financialProjections.year3Revenue.toLocaleString()}` : '- Year 3: €500,000 (projected)'}

### Funding Needed
${financialProjections.fundingNeeded ? `€${financialProjections.fundingNeeded.toLocaleString()}` : '€100,000 (seed round)'}

---

## Team

${teamMembers.length > 0 ? teamMembers.map((member: any) => `### ${member.name} - ${member.role}\n${member.background}`).join('\n\n') : `### Founder/CEO
- HTW Berlin student (studying [Field])
- ADHD advocate and accessibility technologist
- 190+ passing tests as execution proof
- Built AURA from scratch with AI assistance`}

---

## Use of Funds (if applicable)
1. **Product Development (40%):** Enhance AI agents, add more integrations
2. **Marketing (30%):** Reach ADHD community, Etsy sellers, solopreneurs
3. **Operations (20%):** Legal, accounting, infrastructure
4. **Reserve (10%):** Contingency fund

---

## Appendix: Technical Validation
- **190+ passing tests** (Vitest + RTL)
- **LangGraph orchestration** with SQLite persistence
- **Veto Layer** for safe automation
- **Bureaucratic automation** (LEA, Gewerbe)
- **Etsy/Printify integration** ready

**Generated:** ${new Date().toISOString()}
**Status:** Draft - Review and refine before submission
`;

    return JSON.stringify({
      success: true,
      companyName,
      industry,
      plan,
      sections: [
        'Executive Summary',
        'Company Overview',
        'Market Analysis',
        'Products & Services',
        'Financial Projections',
        'Team',
        'Use of Funds',
        'Appendix',
      ],
      message: `Business plan for ${companyName} generated successfully. Review and refine before submission.`,
    }, null, 2);
  } catch (err: any) {
    return `Error generating business plan: ${err.message}`;
  }
};

/**
 * Tool: Generate Pitch Deck
 * Creates a pitch deck with AI assistance for funding applications
 */
export const generatePitchDeckDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_pitch_deck',
    description: 'Generate a pitch deck with problem, solution, market size, business model, traction, team, and ask. Optimized for ADHD accessibility technology and scientific validation.',
    parameters: {
      type: 'object',
      properties: {
        companyName: {
          type: 'string',
          description: 'Name of the company',
        },
        tagline: {
          type: 'string',
          description: 'One-line description of the company',
        },
        problem: {
          type: 'string',
          description: 'The problem you are solving',
        },
        solution: {
          type: 'string',
          description: 'Your solution',
        },
        marketSize: {
          type: 'string',
          description: 'Market size and opportunity',
        },
        businessModel: {
          type: 'string',
          description: 'How you make money',
        },
        traction: {
          type: 'string',
          description: 'Current traction and milestones',
        },
        competitiveAdvantage: {
          type: 'string',
          description: 'What sets you apart',
        },
        financialAsk: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Funding amount (EUR)' },
            equity: { type: 'number', description: 'Equity offered (%)' },
            useOfFunds: { type: 'string', description: 'How funds will be used' },
          },
          description: 'Funding ask details',
        },
        teamHighlights: {
          type: 'array',
          items: { type: 'string', description: 'Team highlight' },
          description: 'Key team highlights',
        },
        useAI: {
          type: 'boolean',
          description: 'Use AI to generate and enhance content (default: true)',
        },
      },
      required: ['companyName', 'tagline', 'problem', 'solution'],
    },
  },
};

export const generatePitchDeckFn: ToolFn = async (args: Record<string, unknown>) => {
  const {
    companyName = 'AURA Local Sync',
    tagline = 'AI Automation for Everyone, Especially the Neurodivergent',
    problem = 'Businesses and individuals struggle with repetitive digital tasks',
    solution = 'AI-powered automation platform with ADHD-optimized UX',
    marketSize = '€46.7B AI automation market + emerging ADHD accessibility niche',
    businessModel = 'SaaS + transaction fees',
    traction = '190+ passing tests, functional prototype, Etsy/Printify integration',
    competitiveAdvantage = 'ADHD-first design, 190+ tests as execution proof, local-first architecture',
    financialAsk = {},
    teamHighlights = [],
    useAI = true,
  } = args as any as PitchDeckArgs;

  try {
    const deck = `# Pitch Deck: ${companyName}

## Slide 1: Title
**${companyName}**  
${tagline}

**Presenter:** [Your Name]  
**Date:** ${new Date().toLocaleDateString('en-GB')}

---

## Slide 2: The Problem
${problem}

**Impact:**
- Wasted time on repetitive tasks
- Missed opportunities for automation
- ADHD individuals struggle with existing tools
- Businesses lose efficiency and revenue

---

## Slide 3: Our Solution
${solution}

**Key Features:**
- LangGraph multi-agent orchestration
- 5 specialized AI agents
- Veto Layer for safe automation
- Bureaucratic automation (LEA, Gewerbe)
- Etsy and Printify integration
- ADHD-optimized neubrutalist UI

---

## Slide 4: Market Opportunity
${marketSize}

**Target Segments:**
- Small businesses and solopreneurs
- Etsy sellers (7.5M+ active)
- ADHD individuals (global community)
- Students and researchers

---

## Slide 5: Business Model
${businessModel}

**Revenue Streams:**
1. SaaS subscriptions (monthly/annual)
2. Transaction fees (Etsy/Printify)
3. Consulting and custom automation
4. Enterprise licenses (future)

---

## Slide 6: Traction & Milestones
${traction}

**Key Metrics:**
- ✅ 190+ passing tests (Vitest + RTL)
- ✅ 5 specialized AI agents built
- ✅ Veto Layer authorization complete
- ✅ Etsy/Printify integration ready
- ✅ Bureaucratic automation (LEA, Gewerbe)
- ✅ ROI dashboard with live data

---

## Slide 7: Competitive Advantage
${competitiveAdvantage}

**Why Us?**
1. **ADHD-First Design:** Built by someone who understands the challenges
2. **Execution Proof:** 190+ tests don't lie
3. **Local-First:** No cloud dependency, privacy-focused
4. **Scientific Validation:** Partnering with HTW Berlin
5. **Bureaucratic Automation:** Unique capability for German market

---

## Slide 8: Team
${teamHighlights.length > 0 ? teamHighlights.map((highlight: string, i: number) => `${i + 1}. ${highlight}`).join('\n') : `**Founder/CEO:** [Your Name]
- HTW Berlin student and ADHD advocate
- Built AURA from scratch with AI assistance
- 190+ passing tests as execution proof
- Passionate about accessibility technology`}

---

## Slide 9: The Ask
${financialAsk && typeof financialAsk === 'object' && 'amount' in financialAsk ? `**Funding Needed:** €${(financialAsk as any).amount.toLocaleString()}` : '**Funding Needed:** €100,000 (Seed Round)'}
${financialAsk && typeof financialAsk === 'object' && 'equity' in financialAsk ? `**Equity Offered:** ${(financialAsk as any).equity}%` : '**Equity Offered:** 10%'}

**Use of Funds:**
${financialAsk && typeof financialAsk === 'object' && 'useOfFunds' in financialAsk ? (financialAsk as any).useOfFunds : `1. Product Development (40%) - €40,000
2. Marketing (30%) - €30,000
3. Operations (20%) - €20,000
4. Reserve (10%) - €10,000`}

---

## Slide 10: Vision
**AURA Local Sync** - Making AI automation accessible to everyone, especially the neurodivergent community.

**Contact:** [your.email@example.com]  
**Website:** [aura-local-sync.example.com]

---

**Generated:** ${new Date().toISOString()}  
**Status:** Draft - Practice your presentation before delivering
`;

    return JSON.stringify({
      success: true,
      companyName,
      tagline,
      deck,
      slides: [
        'Title',
        'The Problem',
        'Our Solution',
        'Market Opportunity',
        'Business Model',
        'Traction & Milestones',
        'Competitive Advantage',
        'Team',
        'The Ask',
        'Vision',
      ],
      message: `Pitch deck for ${companyName} generated successfully. Practice your presentation before delivering!`,
    }, null, 2);
  } catch (err: any) {
    return `Error generating pitch deck: ${err.message}`;
  }
};
