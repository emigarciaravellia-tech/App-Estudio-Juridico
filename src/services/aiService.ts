import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

export class AIService {
  private static getModel() {
    const apiKey = typeof window !== 'undefined' 
      ? import.meta.env.VITE_API_KEY 
      : process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("AI API Key not configured.");
    }

    const google = createGoogleGenerativeAI({ apiKey });
    return google('gemini-1.5-flash');
  }

  static getJurisdictionalInstructions() {
    return `
      Identidad y rol:
      Sos un asistente jurídico interno del estudio LexManage... (etc)
      Siempre priorizás jurisprudencia y normativa argentina, y preferentemente cordobesa.
    `;
  }

  static async summarizeCase(caseData: any) {
    const model = this.getModel();
    const prompt = `
      Analizá el siguiente expediente legal y proporcioná un resumen ejecutivo estructurado:
      ${JSON.stringify(caseData, null, 2)}
      
      Incluye:
      1. Estado actual del caso.
      2. Hitos principales.
      3. Próximos pasos sugeridos.
    `;

    const { text } = await generateText({
      model,
      system: this.getJurisdictionalInstructions(),
      prompt,
    });

    return text;
  }
}
