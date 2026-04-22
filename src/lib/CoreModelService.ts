import { GoogleGenAI } from "@google/genai";

const PROMPT_TEMPLATE = `
Analyze the following command and provide a structured technical response.
Your response MUST be valid Markdown with the following sections precisely:

# OBJECTIVE
Briefly state the goal of this execution.

# STEPS
- Point 1
- Point 2

# EVIDENCE
State any facts, data points, or logic verified.

# NEXT ACTIONS
- Action A
- Action B

# METADATA
- Model: {{model}}
- Status: COMPLETED

---
COMMAND:
{{prompt}}
`;

export class CoreModelService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  }

  async execute(prompt: string, modelId: string = "gemini-3-flash-preview") {
    const startTime = Date.now();
    
    // 1. Prepare structured prompt
    const finalPrompt = PROMPT_TEMPLATE
      .replace("{{prompt}}", prompt)
      .replace("{{model}}", modelId);

    try {
      const response = await this.ai.models.generateContent({
        model: modelId,
        contents: finalPrompt,
        config: {
            temperature: 0.2, // Consistent results for terminal execution
        }
      });

      const latency = Date.now() - startTime;
      
      return {
        response: response.text || "No response generated.",
        latency,
        tokens_input: 0, // Placeholder
        tokens_output: 0, // Placeholder
        status: 'completed' as const
      };
    } catch (err: any) {
      return {
        response: `Execution Failed: ${err.message}`,
        latency: Date.now() - startTime,
        status: 'failed' as const
      };
    }
  }
}
