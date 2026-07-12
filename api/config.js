const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];

module.exports = function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const models = (process.env.GEMINI_MODELS || DEFAULT_MODELS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return res.status(200).json({
    models,
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
};

