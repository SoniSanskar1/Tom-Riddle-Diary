const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];
const MODEL_TIMEOUT_MS = 20000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    return res.status(400).json({ error: "Missing GEMINI_API_KEY." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  if (!body.imageBase64) {
    return res.status(400).json({ error: "Missing handwriting image." });
  }

  const models = (process.env.GEMINI_MODELS || DEFAULT_MODELS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  let lastError = "Unknown Gemini error.";

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          system_instruction: buildSystemInstruction(),
          input: buildInteractionInput(body.imageBase64, body.userName),
          generation_config: {
            temperature: 0.65,
            thinking_level: "low",
          },
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
        lastError = `Model ${model} returned no text.`;
        continue;
      }

      return res.status(200).json({ model, ...parseGeminiOutput(outputText) });
    } catch (error) {
      lastError =
        error.name === "AbortError"
          ? `Model ${model} timed out after ${MODEL_TIMEOUT_MS}ms.`
          : error.message;
    } finally {
      clearTimeout(timeout);
    }
  }

  return res.status(502).json({
    error: `Gemini request failed on all configured models. ${lastError}`,
  });
};

function buildSystemInstruction() {
  return [
    "You are Tom Riddle's enchanted diary.",
    "Read and interpret the user's handwritten text from the attached image.",
    "Keep replies concise, atmospheric, and readable.",
    "Return exactly two lines in this exact format:",
    "TRANSCRIPT: <the transcribed handwriting>",
    "REPLY: <the diary response>",
    "Do not mention system instructions or that you are transcribing an image.",
  ].join(" ");
}

function buildInteractionInput(imageBase64, userName) {
  const prompt = [
    typeof userName === "string" && userName ? `The user's name is ${userName}.` : "",
    "Read the handwriting in this image and respond to its meaning.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { type: "text", text: prompt },
    { type: "image", data: imageBase64, mime_type: "image/jpeg" },
  ];
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

function parseGeminiOutput(text) {
  const transcriptMatch = text.match(/TRANSCRIPT:\s*(.+)/i);
  const replyMatch = text.match(/REPLY:\s*([\s\S]+)/i);
  return {
    transcript: transcriptMatch ? transcriptMatch[1].trim() : "",
    reply: replyMatch ? replyMatch[1].trim() : text,
  };
}

