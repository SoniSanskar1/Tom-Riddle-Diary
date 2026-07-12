const CONFIG_ENDPOINT = "/api/config";
const DIARY_ENDPOINT = "/api/diary";
const AUTO_SEND_DELAY_MS = 2200;
const INTRO_DELAY_MS = 1500;
const RESPONSE_REVEAL_MS = 2800;
const RESPONSE_LINE_HOLD_MS = 1500;
const INK_SOAK_MS = 2200;

const canvas = document.getElementById("handwritingCanvas");
const ctx = canvas.getContext("2d");
const storyText = document.getElementById("storyText");
const statusText = document.getElementById("statusText");
const fadeSnapshot = document.getElementById("fadeSnapshot");
const canvasFrame = document.getElementById("canvasFrame");
const pageStorm = document.getElementById("pageStorm");
const memoryScene = document.getElementById("memoryScene");

const state = {
  autoSendTimer: null,
  busy: false,
  chamberStage: 0,
  conversation: [],
  drawing: false,
  hasApiKey: false,
  hasInk: false,
  introduced: false,
  models: [],
  strokeBounds: null,
  userName: "",
};

function setStatus(message) {
  statusText.textContent = message;
}

function resetStrokeBounds() {
  state.strokeBounds = null;
}

function extendStrokeBounds(x, y) {
  if (!state.strokeBounds) {
    state.strokeBounds = { minX: x, minY: y, maxX: x, maxY: y };
    return;
  }

  state.strokeBounds.minX = Math.min(state.strokeBounds.minX, x);
  state.strokeBounds.minY = Math.min(state.strokeBounds.minY, y);
  state.strokeBounds.maxX = Math.max(state.strokeBounds.maxX, x);
  state.strokeBounds.maxY = Math.max(state.strokeBounds.maxY, y);
}

function configurePen() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(42, 21, 13, 0.98)";
  ctx.lineWidth = 3.8;
}

function clearCanvas() {
  const ratio = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
  state.hasInk = false;
  resetStrokeBounds();
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvasFrame.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(320, Math.floor(rect.height));

  const snapshot =
    canvas.width > 0 && canvas.height > 0
      ? ctx.getImageData(0, 0, canvas.width, canvas.height)
      : null;

  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.height = `${height}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(ratio, ratio);
  configurePen();

  if (state.hasInk && snapshot) {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = snapshot.width;
    tempCanvas.height = snapshot.height;
    tempCanvas.getContext("2d").putImageData(snapshot, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  } else {
    clearCanvas();
  }
}

function getPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches ? event.touches[0] : event;
  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top,
  };
}

function cancelAutoSend() {
  if (state.autoSendTimer) {
    window.clearTimeout(state.autoSendTimer);
    state.autoSendTimer = null;
  }
}

function scheduleAutoSend() {
  cancelAutoSend();
  if (!state.hasInk || state.busy) {
    return;
  }

  setStatus("The ink is settling into the page...");
  state.autoSendTimer = window.setTimeout(() => {
    state.autoSendTimer = null;
    handleSend();
  }, AUTO_SEND_DELAY_MS);
}

function clearStoryText() {
  storyText.className = "story-text";
  storyText.textContent = "";
}

function showStoryText(text, className = "visible") {
  storyText.className = `story-text ${className}`.trim();
  storyText.textContent = text;
}

function startStroke(event) {
  event.preventDefault();

  if (state.busy) {
    return;
  }

  cancelAutoSend();
  clearStoryText();
  state.drawing = true;

  const point = getPoint(event);
  extendStrokeBounds(point.x, point.y);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
}

function moveStroke(event) {
  if (!state.drawing) {
    return;
  }

  event.preventDefault();
  const point = getPoint(event);
  extendStrokeBounds(point.x, point.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  state.hasInk = true;
}

function endStroke() {
  if (!state.drawing) {
    return;
  }

  state.drawing = false;
  ctx.closePath();
  scheduleAutoSend();
}

function buildUploadImage() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = state.strokeBounds;
  const cssWidth = canvas.width / ratio;
  const cssHeight = canvas.height / ratio;

  if (!bounds) {
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  }

  const padding = 34;
  const minX = Math.max(0, Math.floor(bounds.minX - padding));
  const minY = Math.max(0, Math.floor(bounds.minY - padding));
  const maxX = Math.min(cssWidth, Math.ceil(bounds.maxX + padding));
  const maxY = Math.min(cssHeight, Math.ceil(bounds.maxY + padding));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = Math.ceil(width * ratio);
  croppedCanvas.height = Math.ceil(height * ratio);
  const croppedCtx = croppedCanvas.getContext("2d");
  croppedCtx.fillStyle = "#d9a66e";
  croppedCtx.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);
  croppedCtx.drawImage(
    canvas,
    minX * ratio,
    minY * ratio,
    width * ratio,
    height * ratio,
    0,
    0,
    width * ratio,
    height * ratio
  );

  return croppedCanvas.toDataURL("image/jpeg", 0.8).split(",")[1];
}

function snapshotAndFadeInk() {
  const dataUrl = canvas.toDataURL("image/png");
  const uploadBase64 = buildUploadImage();
  fadeSnapshot.src = dataUrl;
  fadeSnapshot.classList.remove("active");
  void fadeSnapshot.offsetWidth;
  fadeSnapshot.classList.add("active");
  clearCanvas();
  return uploadBase64;
}

function countRenderedLines(element) {
  if (!element.firstChild) {
    return 1;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  const lineTops = new Set(
    [...range.getClientRects()].map((rect) => Math.round(rect.top))
  );
  return Math.max(1, lineTops.size);
}

async function writeReply(text, centered = false) {
  showStoryText(
    text,
    centered ? "visible centered fade-enter" : "visible fade-enter"
  );
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  const renderedLines = countRenderedLines(storyText);

  await new Promise((resolve) =>
    window.setTimeout(resolve, RESPONSE_REVEAL_MS + renderedLines * RESPONSE_LINE_HOLD_MS)
  );
  storyText.classList.remove("fade-enter");
  storyText.classList.add("ink-soak-out");
  await new Promise((resolve) => window.setTimeout(resolve, INK_SOAK_MS));
  clearStoryText();
}

async function loadServerConfig() {
  const response = await fetch(CONFIG_ENDPOINT);
  if (!response.ok) {
    throw new Error("The diary could not read its server configuration.");
  }

  const config = await response.json();
  state.models = Array.isArray(config.models) ? config.models : [];
  state.hasApiKey = Boolean(config.hasApiKey);
}

async function queryDiary(imageBase64) {
  if (!state.hasApiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env.");
  }

  const response = await fetch(DIARY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imageBase64,
      conversation: state.conversation.slice(-6),
      userName: state.userName,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The diary could not reach Gemini.");
  }

  return data;
}

function extractNameFromTranscript(transcript) {
  const match = transcript.match(/\bmy\s+name\s+is\s+(.+?)\s*$/i);
  return match ? match[1].trim().replace(/[.,!?;:]+$/, "").trim() : "";
}

function formatName(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeTranscript(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getScriptedDiaryBeat(transcript) {
  const text = normalizeTranscript(transcript);
  const asksAboutChamber =
    text.includes("chamber of secrets") ||
    text.includes("secret chamber") ||
    (text.includes("chamber") && text.includes("secret"));
  const asksToContinue = [
    "tell me",
    "show me",
    "can you tell",
    "what happened",
    "what do you know",
    "please explain",
  ].some((phrase) => text.includes(phrase));

  if (asksAboutChamber && state.chamberStage === 0) {
    state.chamberStage = 1;
    return { replies: ["Yes."], opensMemory: false };
  }

  if (state.chamberStage === 1 && (asksToContinue || text.length < 30)) {
    state.chamberStage = 2;
    return {
      replies: [
        "No.",
        "But I can show you.",
        "Let me take you back... fifty years ago.",
      ],
      opensMemory: true,
    };
  }

  return null;
}

function getVerifiedGeneralAnswer(transcript) {
  const text = normalizeTranscript(transcript);
  const asksSpiderManRelease =
    text.includes("spider man") &&
    text.includes("brand new day") &&
    ["release", "releasing", "come out", "date", "when"].some((word) =>
      text.includes(word)
    );

  if (asksSpiderManRelease) {
    return "Spider-Man: Brand New Day releases in theaters on July 31, 2026.\nThe date is written clearly in the ink.";
  }

  return "";
}

function rememberExchange(user, reply) {
  state.conversation.push({ user, reply });
  state.conversation = state.conversation.slice(-6);
}

async function playReplySequence(replies) {
  for (const reply of replies) {
    await writeReply(reply, true);
  }
}

async function playDiaryMemory() {
  setStatus("The diary is opening a memory...");
  pageStorm.classList.remove("active");
  memoryScene.classList.remove("active");
  void pageStorm.offsetWidth;
  pageStorm.classList.add("active");
  await new Promise((resolve) => window.setTimeout(resolve, 900));
  memoryScene.classList.add("active");
  await new Promise((resolve) => window.setTimeout(resolve, 7000));
  pageStorm.classList.remove("active");
  memoryScene.classList.remove("active");
}

async function playIntroSequence(name) {
  const displayName = formatName(name);
  const reply = `Hi ${displayName} !\nMy name is Tom Riddle`;

  state.userName = displayName;
  state.introduced = true;

  await new Promise((resolve) => window.setTimeout(resolve, INTRO_DELAY_MS));
  await writeReply(reply, true);
}

async function handleSend() {
  if (state.busy || !state.hasInk) {
    return;
  }

  state.busy = true;
  cancelAutoSend();
  setStatus("The ink is fading...");

  const imageBase64 = snapshotAndFadeInk();

  try {
    setStatus("Tom Riddle is reading your hand...");
    const result = await queryDiary(imageBase64);
    const detectedName = !state.introduced
      ? extractNameFromTranscript(result.transcript)
      : "";

    if (detectedName) {
      setStatus("The diary recognizes your name.");
      await playIntroSequence(detectedName);
    } else {
      const verifiedGeneralAnswer = getVerifiedGeneralAnswer(result.transcript);
      const scriptedBeat = verifiedGeneralAnswer
        ? null
        : getScriptedDiaryBeat(result.transcript);

      if (verifiedGeneralAnswer) {
        setStatus("The diary finds a clear answer...");
        await writeReply(verifiedGeneralAnswer);
        rememberExchange(result.transcript, verifiedGeneralAnswer);
      } else if (scriptedBeat) {
        setStatus("The diary remembers...");
        await playReplySequence(scriptedBeat.replies);
        rememberExchange(result.transcript, scriptedBeat.replies.join(" "));
        if (scriptedBeat.opensMemory) {
          await playDiaryMemory();
        }
      } else {
        setStatus(`The diary replies with ${result.model}...`);
        await writeReply(result.reply);
        rememberExchange(result.transcript, result.reply);
      }
    }

    setStatus("The diary is listening.");
  } catch (error) {
    showStoryText("The page shudders, but no answer comes.", "visible centered fade-enter");
    setStatus(error.message);
  } finally {
    state.busy = false;
  }
}

canvas.addEventListener("mousedown", startStroke);
canvas.addEventListener("mousemove", moveStroke);
window.addEventListener("mouseup", endStroke);

canvas.addEventListener("touchstart", startStroke, { passive: false });
canvas.addEventListener("touchmove", moveStroke, { passive: false });
window.addEventListener("touchend", endStroke);

window.addEventListener("resize", resizeCanvas);

configurePen();
resizeCanvas();
loadServerConfig()
  .then(() => {
    if (!state.hasApiKey) {
      setStatus("Add GEMINI_API_KEY to .env, then restart node server.js.");
    } else if (state.models.length > 0) {
      setStatus(`The diary is listening with ${state.models.join(" then ")}.`);
    }
  })
  .catch((error) => {
    setStatus(error.message);
  });
