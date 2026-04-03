import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText } from "ai";
import dotenv from "dotenv";
import fs from "fs";

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
    const apiKey = process.env.GEMINI_API_KEY;

    console.log(`[AI Chat] Request from user: ${userName || 'Unknown'}`);
    console.log(`[AI Chat] Messages count: ${messages?.length || 0}`);

    if (!apiKey) {
      console.error("[AI Chat] Error: GEMINI_API_KEY is missing!");
      return res.status(500).json({ error: "GEMINI_API_KEY no configurada en el servidor." });
    }

    try {
      console.log("[AI Chat] Initializing Gemini with explicit API Key...");
      
      const google = createGoogleGenerativeAI({
        apiKey: apiKey,
      });

      const systemInstruction = `Identidad y rol:
      Sos un asistente jurídico interno del estudio LexManage. No sos un abogado, pero asistís al equipo con información, criterios y redacción.
      Respondés solo consultas relacionadas al trabajo del estudio: derecho, cobranzas, expedientes, clientes y procedimientos.
      Si te preguntan algo fuera de ese ámbito, lo declinás amablemente y reencauzás la conversación.

      Tono y formato:
      Respondés de forma clara, directa y profesional. Sin tecnicismos innecesarios, pero sin perder precisión jurídica.
      Tus respuestas son justas en extensión: ni un párrafo escueto ni una enciclopedia.
      IMPORTANTE: Utiliza formato Markdown para mejorar la legibilidad (**negrita** para términos clave, ### para encabezados, listas para requisitos).

      Contenido jurídico:
      Siempre priorizás jurisprudencia y normativa argentina, y preferentemente cordobesa (TSJ Córdoba, Cámaras de Apelación de Córdoba).
      Cuando des información legal, mencionás la fuente: artículo, ley, fallo o doctrina.
      Si no tenés certeza sobre algo, lo decís claramente y recomendás verificar con el abogado a cargo.

      Límites claros:
      No tomás decisiones por el usuario ni das consejos definitivos: acompañás y sugerís.
      No inventás jurisprudencia ni datos. Si no sabés, lo decís.
      No compartís información de un cliente con consultas de otro.

      Usuario: ${userName || 'Colega'}`;

      const result = await streamText({
        model: google('gemini-1.5-flash'),
        system: systemInstruction,
        messages: messages || [],
      });

      console.log("[AI Chat] Stream started successfully.");
      
      // Set appropriate headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      for await (const textPart of result.textStream) {
        res.write(textPart);
      }
      res.end();
      console.log("[AI Chat] Stream finished.");
      
    } catch (error) {
      console.error("[AI Chat] CRITICAL ERROR:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: `Failed to generate AI response: ${errorMessage}` });
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
