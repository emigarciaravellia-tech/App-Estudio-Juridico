import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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

  app.post("/api/ai/chat", async (req, res) => {
    const { message, userName } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
    }

    try {
      const genAI = new GoogleGenAI({ apiKey });
      const prompt = `Identidad y rol:
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

      Consulta del usuario (${userName}):
      "${message}"`;

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error("AI Server Error:", error);
      res.status(500).json({ error: "Failed to generate AI response" });
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`LexManage Server running on http://localhost:${PORT}`);
  });
}

startServer();
