import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import dotenv from "dotenv";
import fs from "fs";
import { AIService } from "./src/services/aiService";

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log("[Server] Starting LexManage backend...");
console.log("[Server] Environment:", process.env.NODE_ENV || "development");
console.log("[Server] PORT:", process.env.PORT || 3000);
console.log("[Server] GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/ai/status", (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    res.json({
      configured: !!apiKey,
      keyPrefix: apiKey ? `${apiKey.substring(0, 4)}...` : 'none',
      nodeEnv: process.env.NODE_ENV,
      provider: 'google-ai-sdk'
    });
  });

  app.post("/api/ai/chat", async (req, res) => {
    const { messages, userName } = req.body;
    try {
      const model = AIService.getModel();
      const result = await streamText({
        model,
        system: AIService.getJurisdictionalInstructions() + `\nUsuario: ${userName || 'Colega'}`,
        messages: messages || [],
      });

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const textPart of result.textStream) {
        res.write(textPart);
      }
      res.end();
    } catch (error) {
      console.error("[AI Chat] Error:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  app.post("/api/sac/sync", async (req, res) => {
    const { username, password } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY no configurada." });
    }

    try {
      console.log(`[SAC Sync] Starting sync for user: ${username}`);
      
      // SIMULACIÓN DE SCRAPING (Debido a restricciones de entorno para Puppeteer)
      // En un entorno real, aquí usaríamos Puppeteer para entrar al SAC.
      // Para esta demo, simulamos la obtención de texto crudo del SAC.
      
      const mockRawData = `
        EXPEDIENTE: 1234567/2024 - GARCIA VS. MUNICIPALIDAD DE CORDOBA
        FECHA: 05/04/2026
        ACTUACIÓN: DECRETO - TRASLADO DE PLANILLA
        TEXTO: Córdoba, 5 de abril de 2026. Téngase por presentada la planilla de liquidación por la parte actora. De la misma, córrase traslado a la contraria por el término de tres (3) días bajo apercibimiento. Notifíquese. Fdo: Dr. Pérez - Juez.
        
        EXPEDIENTE: 9876543/2023 - MARTINEZ S/ SUCESIÓN
        FECHA: 06/04/2026
        ACTUACIÓN: AUTO - DECLARATORIA DE HEREDEROS
        TEXTO: Vistos los autos... Resuelvo: Declarar en cuanto a lugar por derecho que por fallecimiento de Doña María Martínez... le suceden en carácter de universales herederos sus hijos...
      `;

      const google = createGoogleGenerativeAI({ apiKey });
      const model = google('gemini-1.5-flash');

      const prompt = `
        Sos un experto legal en el sistema SAC de Córdoba. 
        Analizá el siguiente texto extraído del SAC y generá una lista de resúmenes estructurados en formato JSON.
        Para cada actuación detectada, incluí:
        - title: Un título breve (ej: "Traslado de Planilla - Garcia vs. Muni")
        - caseNumber: El número de expediente
        - content: Un resumen ejecutivo de lo que dice el decreto o auto.
        - date: La fecha de la actuación (YYYY-MM-DD)
        - type: 'decreto' o 'expediente' o 'novedad'
        - importantDeadlines: Un array de objetos { date: string, description: string } si detectás plazos fatales o términos.
        - rawText: El texto original analizado.

        Texto del SAC:
        ${mockRawData}

        Respondé ÚNICAMENTE con el array JSON, sin texto adicional ni bloques de código.
      `;

      const { text } = await streamText({
        model,
        prompt,
      });

      // Since we are not streaming here for simplicity of the result, we wait for the full text
      // Actually, streamText returns a result that can be awaited for full text
      let fullText = "";
      const result = await streamText({ model, prompt });
      for await (const part of result.textStream) {
        fullText += part;
      }

      // Clean the JSON if Gemini added markdown blocks
      const jsonString = fullText.replace(/```json|```/g, "").trim();
      const summaries = JSON.parse(jsonString);

      // In a real app, we would save these to Firestore here or return them to the frontend to save.
      // For now, we return them.
      
      res.json({ 
        status: "success", 
        message: "Sincronización completada con éxito (Simulada)",
        summaries 
      });

    } catch (error) {
      console.error("[SAC Sync] Error:", error);
      res.status(500).json({ error: "Error en el procesamiento de la IA para el SAC." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    console.log("[Server] Serving static files from:", distPath);
    
    // Check if dist exists
    if (!fs.existsSync(distPath)) {
      console.warn("[Server] Warning: dist folder not found. Static files might not be served correctly.");
    }

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application build not found. Please run 'npm run build' first.");
      }
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`LexManage Server running on http://localhost:${PORT}`);
  });
}

startServer();
