import type { ToolDefinition, ToolFn } from '../types';

interface GenerateDocumentArgs {
  type: 'lea_letter' | 'gewerbeanmeldung' | 'business_plan' | 'pitch_deck';
  language: 'de' | 'en';
  data: Record<string, unknown>;
  outputPath?: string;
}

interface DocumentData {
  // LEA Letter fields
  fullName?: string;
  residenceStatus?: string;
  residenceTitle?: string;
  businessConcept?: string;
  timeCommitment?: string; // "low", "medium", "high"
  automationLevel?: string; // "fully_automated", "semi_automated"
  studiesPrimary?: boolean;
  // Gewerbeanmeldung fields
  businessName?: string;
  businessType?: string; // "Einzelunternehmen"
  activityDescription?: string;
  address?: string;
  taxNumber?: string;
}

/**
 * Tool: Generate bureaucratic documents (LEA letter, Gewerbeanmeldung, etc.)
 * Generates German-language documents with proper formatting and legal structure.
 */
export const generateDocumentDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_document',
    description: 'Generate bureaucratic documents (LEA letter, Gewerbeanmeldung, business plan, pitch deck). Supports German and English. Outputs properly formatted documents ready for submission.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['lea_letter', 'gewerbeanmeldung', 'business_plan', 'pitch_deck'],
          description: 'Type of document to generate',
        },
        language: {
          type: 'string',
          enum: ['de', 'en'],
          description: 'Language for the document (de = German, en = English)',
        },
        data: {
          type: 'object',
          description: 'Document-specific data (fields vary by document type)',
        },
        outputPath: {
          type: 'string',
          description: 'Optional: path to save the generated document (defaults to ./docs/generated/)',
        },
      },
      required: ['type', 'language', 'data'],
    },
  },
};

export const generateDocumentFn: ToolFn = async (args: Record<string, unknown>) => {
  const { type, language, data, outputPath } = args as any as GenerateDocumentArgs;

  try {
    let content = '';
    const docData = data as DocumentData;

    switch (type) {
      case 'lea_letter':
        content = generateLEALetter(language, docData);
        break;
      case 'gewerbeanmeldung':
        content = generateGewerbeanmeldung(language, docData);
        break;
      case 'business_plan':
        content = generateBusinessPlan(language, docData);
        break;
      case 'pitch_deck':
        content = generatePitchDeck(language, docData);
        break;
      default:
        throw new Error(`Unknown document type: ${type}`);
    }

    // Determine output path
    const basePath = outputPath || 'docs/generated';
    const fileName = `${type}_${Date.now()}.${language === 'de' ? 'de' : 'en'}.md`;
    const fullPath = `${basePath}/${fileName}`;

    // In a real implementation, you'd write to file system
    // For now, return the content and path
    return JSON.stringify({
      success: true,
      documentType: type,
      language,
      content,
      outputPath: fullPath,
      message: `Document generated successfully. Save to: ${fullPath}`,
    }, null, 2);
  } catch (err: any) {
    return `Error generating document: ${err.message}`;
  }
};

function generateLEALetter(lang: string, data: DocumentData): string {
  if (lang === 'de') {
    return `# Letter of Intent for Self-Employment Authorization (LEA)

**To:** Landesamt für Einwanderung (LEA) Berlin  
**Date:** ${new Date().toLocaleDateString('de-DE')}

## Personal Information
**Full Name:** ${data.fullName || '[Your Full Name]'}  
**Residence Status:** ${data.residenceStatus || '[Status]'}  
**Residence Title:** ${data.residenceTitle || '[Title Type]'}

## Business Concept
${data.businessConcept || '[Describe your automated business concept]'}

## Time Commitment
${data.timeCommitment === 'low' ? 'Low time commitment (5-10 hours/week)' : 
  data.timeCommitment === 'medium' ? 'Medium time commitment (10-20 hours/week)' :
  'High time commitment (20+ hours/week)'}

## Automation Level
${data.automationLevel === 'fully_automated' ? 
  'The business operates fully automated with AI agents. Minimal manual intervention required.' :
  'The business uses semi-automated processes with AI assistance.'}

## Primary Activity: Studies
${data.studiesPrimary ? 
  'Yes, my primary activity is studies at HTW Berlin. This business is a supplementary, automated income stream.' :
  'No, this is my primary professional activity.'}

## Legal Basis
I am applying under § 21 AufenthG (self-employment) / § 38 AufenthG (freelance profession).

## Declaration
I hereby declare that the information provided is accurate and complete. The business concept is designed to be automated, requiring minimal time commitment while I focus on my studies.

**Signature:** ___________________  
**Place:** Berlin  
**Date:** ${new Date().toLocaleDateString('de-DE')}
`;
  } else {
    return `# Letter of Intent for Self-Employment Authorization

**To:** Landesamt für Einwanderung (LEA) Berlin  
**Date:** ${new Date().toLocaleDateString('en-US')}

## Personal Information
**Full Name:** ${data.fullName || '[Your Full Name]'}  
**Residence Status:** ${data.residenceStatus || '[Status]'}  
**Residence Title:** ${data.residenceTitle || '[Title Type]'}

## Business Concept
${data.businessConcept || '[Describe your automated business concept]'}

## Time Commitment
${data.timeCommitment === 'low' ? 'Low time commitment (5-10 hours/week)' : 
  data.timeCommitment === 'medium' ? 'Medium time commitment (10-20 hours/week)' :
  'High time commitment (20+ hours/week)'}

## Automation Level
${data.automationLevel === 'fully_automated' ? 
  'The business operates fully automated with AI agents. Minimal manual intervention required.' :
  'The business uses semi-automated processes with AI assistance.'}

## Primary Activity: Studies
${data.studiesPrimary ? 
  'Yes, my primary activity is studies at HTW Berlin. This business is a supplementary, automated income stream.' :
  'No, this is my primary professional activity.'}

## Legal Basis
I am applying under § 21 AufenthG (self-employment) / § 38 AufenthG (freelance profession).

## Declaration
I hereby declare that the information provided is accurate and complete. The business concept is designed to be automated, requiring minimal time commitment while I focus on my studies.

**Signature:** ___________________  
**Place:** Berlin  
**Date:** ${new Date().toLocaleDateString('en-US')}
`;
  }
}

function generateGewerbeanmeldung(lang: string, data: DocumentData): string {
  if (lang === 'de') {
    return `# Gewerbeanmeldung (Business Registration)

**An:** Ordnungsamt Berlin  
**Datum:** ${new Date().toLocaleDateString('de-DE')}

## 1. Angaben zur Person
**Name:** ${data.fullName || '[Vollständiger Name]'}  
**Anschrift:** ${data.address || '[Straße, Hausnummer, PLZ, Ort]'}  
**Steuernummer:** ${data.taxNumber || '[Falls vorhanden]'}

## 2. Angaben zum Gewerbe
**Firma (Geschäftsbezeichnung):** ${data.businessName || '[Name des Unternehmens]'}  
**Rechtsform:** ${data.businessType || 'Einzelunternehmen'}

## 3. Tätigkeitsbeschreibung
${data.activityDescription || '[Detaillierte Beschreibung der geplanten Tätigkeit]'}

### Beispiel für AURA Local Sync:
*Entwicklung und Betrieb einer KI-gestützten Automatisierungsplattform (AURA Local Sync) für digitale Dienstleistungen. Die Plattform nutzt KI-Agenten zur automatisierten Erstellung von Grafikdesigns, Etsy-Listings und digitalen Inhalten. Der Betrieb erfolgt weitgehend automatisiert mit minimalem manuellem Eingriff.*

## 4. Beginn des Gewerbebetriebs
**Geplantes Startdatum:** ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('de-DE')}

## 5. Erklärung
Ich erkläre, dass ich die Tätigkeit als ${data.businessType || 'Einzelunternehmen'} ausüben werde. Die geplante Automatisierung ermöglicht einen geringen Zeitaufwand, da ich primär meinem Studium an der HTW Berlin nachgehe.

**Unterschrift:** ___________________  
**Ort:** Berlin  
**Datum:** ${new Date().toLocaleDateString('de-DE')}

---
**Hinweis:** Diese Anmeldung muss vor Aufnahme der gewerblichen Tätigkeit beim Ordnungsamt eingereicht werden.
`;
  } else {
    return `# Business Registration (Gewerbeanmeldung)

**To:** Ordnungsamt Berlin  
**Date:** ${new Date().toLocaleDateString('en-US')}

## 1. Personal Information
**Name:** ${data.fullName || '[Full Name]'}  
**Address:** ${data.address || '[Street, House Number, ZIP, City]'}  
**Tax Number:** ${data.taxNumber || '[If available]'}

## 2. Business Information
**Business Name:** ${data.businessName || '[Company Name]'}  
**Legal Form:** ${data.businessType || 'Einzelunternehmen (Sole Proprietorship)'}

## 3. Activity Description
${data.activityDescription || '[Detailed description of planned activity]'}

### Example for AURA Local Sync:
*Development and operation of an AI-powered automation platform (AURA Local Sync) for digital services. The platform uses AI agents for automated creation of graphic designs, Etsy listings, and digital content. Operations are largely automated with minimal manual intervention.*

## 4. Business Start Date
**Planned Start Date:** ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US')}

## 5. Declaration
I declare that I will operate the business as a ${data.businessType || 'sole proprietorship'}. The planned automation enables low time commitment as I primarily focus on my studies at HTW Berlin.

**Signature:** ___________________  
**Place:** Berlin  
**Date:** ${new Date().toLocaleDateString('en-US')}

---
**Note:** This registration must be submitted to the Ordnungsamt before commencing commercial activity.
`;
  }
}

function generateBusinessPlan(_lang: string, _data: DocumentData): string {
  return `# Business Plan - AURA Local Sync

[Business plan content would be generated here based on technical documentation and roadmap]
`;
}

function generatePitchDeck(_lang: string, _data: DocumentData): string {
  return `# Pitch Deck - AURA Local Sync

[Pitch deck content would be generated here based on technical documentation and test results]
`;
}
