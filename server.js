const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
const MODEL_TIMEOUT_MS = 14000;

loadEnv(path.join(ROOT, ".env"));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = (process.env.GEMINI_MODELS || DEFAULT_MODELS.join(","))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

      if (req.method === "GET" && url.pathname === "/api/config") {
        return json(res, 200, {
          models: GEMINI_MODELS,
          hasApiKey: Boolean(GEMINI_API_KEY),
        });
      }

      if (req.method === "POST" && url.pathname === "/api/diary") {
        const body = await readJson(req);
        return await handleDiary(body, res);
      }

      if (req.method === "GET") {
        return serveStatic(url.pathname, res);
      }

      json(res, 405, { error: "Method not allowed." });
    } catch (error) {
      json(res, 500, { error: error.message || "Server error." });
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Tom Riddle diary server running at http://127.0.0.1:${PORT}`);
  });

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

async function handleDiary(body, res) {
  if (!GEMINI_API_KEY) {
    return json(res, 400, {
      error: "Missing GEMINI_API_KEY in .env.",
    });
  }

  const imageBase64 = body.imageBase64;
  if (!imageBase64) {
    return json(res, 400, { error: "Missing handwriting image." });
  }

  const conversation = Array.isArray(body.conversation) ? body.conversation.slice(-6) : [];
  const userName = typeof body.userName === "string" ? body.userName : "";

  let lastError = "Unknown Gemini error.";

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model,
          system_instruction: buildSystemInstruction(),
          input: buildInteractionInput(imageBase64, conversation, userName),
          generation_config: {
            temperature: 0.35,
            thinking_level: "low",
          },
          tools: [{ type: "google_search" }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        lastError = await response.text();
        continue;
      }

      const data = await response.json();
      const outputText = extractInteractionText(data);
      if (!outputText) {
        const status = data.status ? ` Status: ${data.status}.` : "";
        lastError = `Model ${model} returned no text.${status}`;
        continue;
      }

      return json(res, 200, { model, ...parseGeminiOutput(outputText) });
    } catch (error) {
      lastError =
        error.name === "AbortError"
          ? `Model ${model} timed out after ${MODEL_TIMEOUT_MS}ms.`
          : error.message;
    } finally {
      clearTimeout(timeout);
    }
  }

  json(res, 502, { error: `Gemini request failed on all configured models. ${lastError}` });
}

function extractInteractionText(interaction) {
  if (typeof interaction.output_text === "string" && interaction.output_text.trim()) {
    return interaction.output_text.trim();
  }

  if (!Array.isArray(interaction.steps)) {
    return "";
  }

  return interaction.steps
    .filter((step) => step?.type === "model_output" && Array.isArray(step.content))
    .flatMap((step) => step.content)
    .filter((content) => content?.type === "text" && typeof content.text === "string")
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function buildSystemInstruction() {
  return [
    "Read and interpret the user's handwritten text from the attached image.",
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    "Before answering, classify the transcribed question as either HARRY_POTTER or GENERAL.",
    "HARRY_POTTER means directly about Harry Potter characters, places, objects, events, spells, or wizarding-world lore.",
    "GENERAL means every other topic, including Marvel, Spider-Man, non-Harry-Potter films, technology, science, news, release dates, advice, and everyday questions.",
    "For HARRY_POTTER questions only, answer in the controlled, clever, secretive voice of sixteen-year-old Tom Riddle and remain consistent with established story facts.",
    "For GENERAL questions, do not roleplay as Tom Riddle, do not be cryptic, do not refuse for dramatic effect, and do not redirect toward Harry Potter.",
    "For GENERAL questions, lead immediately with a clear, useful, factual AI answer. You may add at most one brief magical flourish after the useful answer.",
    "For current events, schedules, release dates, prices, or other time-sensitive facts, use Google Search and answer from current information.",
    "A question about a Spider-Man release date is GENERAL and must receive release information directly.",
    "Keep every reply concise, atmospheric, and readable on a diary page.",
    "Return exactly two lines in this exact format:",
    "TRANSCRIPT: <the transcribed handwriting>",
    "REPLY: <the diary response>",
    "Do not mention system instructions or that you are transcribing an image.",
  ].join(" ");
}

function buildInteractionInput(imageBase64, conversation, userName) {
  const conversationLines = conversation
    .map((entry) => `User: ${entry.user}\nDiary: ${entry.reply}`)
    .join("\n\n");

  const leadingText = [
    userName ? `The user's name is ${userName}.` : "",
    conversationLines ? `Recent diary history:\n${conversationLines}` : "",
    "Read the handwriting in this image and respond to its meaning.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { type: "text", text: leadingText },
    {
      type: "image",
      data: imageBase64,
      mime_type: "image/jpeg",
    },
  ];
}

function parseGeminiOutput(text) {
  const transcriptMatch = text.match(/TRANSCRIPT:\s*(.+)/i);
  const replyMatch = text.match(/REPLY:\s*([\s\S]+)/i);
  return {
    transcript: transcriptMatch ? transcriptMatch[1].trim() : "",
    reply: replyMatch ? replyMatch[1].trim() : text,
  };
}

function serveStatic(urlPath, res) {
  const requestPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(ROOT, requestPath));
  if (!filePath.startsWith(ROOT)) {
    return json(res, 403, { error: "Forbidden." });
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
