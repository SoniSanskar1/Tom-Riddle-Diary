# Tom Riddle Diary

An interactive enchanted diary inspired by the visual language of the diary scene from *Harry Potter and the Chamber of Secrets*. Visitors write directly on a parchment canvas with a mouse, finger, or stylus. After the ink settles, Gemini reads the handwriting and answers as Tom Riddle on the same page.

## Features

- Freehand canvas input for mouse, touch, and stylus
- Automatic submission after the writer pauses
- Multimodal handwriting recognition through Gemini image understanding
- Fast model with a stronger fallback for difficult handwriting
- Special introduction when the diary recognizes `My name is ...`
- Cinematic parchment, paper fibers, page depth, candlelight, and binding shadows
- Ink emergence and paper-absorption animations
- Response reading time calculated from rendered line count
- Scripted Chamber of Secrets dialogue with paraphrase recognition
- Rapid page-turn storm, central flash, and an original diary-memory sequence
- Session-only conversational context with no database or permanent storage
- Responsive layout for desktop and mobile

## Tech Stack

- HTML5 and semantic markup
- CSS3 animations, SVG turbulence filters, responsive layout, and locally hosted fonts
- Vanilla JavaScript with Pointer/Touch-compatible canvas drawing
- Node.js local development server
- Vercel Functions for production API routes
- Gemini Interactions API for multimodal handwriting transcription and responses

## How Handwriting Recognition Works

1. The visitor writes directly onto an HTML canvas.
2. After a short pause, the app calculates the ink bounds and crops the canvas to the written area.
3. The crop is converted into a compressed JPEG and sent to `/api/diary`.
4. Gemini receives both the image and a transcription instruction.
5. Gemini returns a `TRANSCRIPT` and a concise `REPLY`.
6. The reply forms on the parchment, remains readable according to its line count, and then soaks into the paper.

The production model chain defaults to:

1. `gemini-3.1-flash-lite`
2. `gemini-3.5-flash`

The second model is used as a fallback when the faster model fails or cannot return usable text.

## Local Setup

Create a `.env` file from `.env.example`:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash
```

Start the local server:

```powershell
node server.js
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Vercel Deployment

The repository includes Vercel Functions in `api/` and requires no frontend build step. Add these environment variables to the Vercel project:

- `GEMINI_API_KEY`
- `GEMINI_MODELS`

Then deploy from the repository root:

```powershell
npx vercel --prod
```

## Security and Privacy

- The Gemini API key is read only by the server or Vercel Function and is never exposed to browser JavaScript.
- `.env` files and Vercel project metadata are excluded from Git.
- Questions and responses are kept only in short-lived browser memory for follow-up context and are never persisted by the application.
- The browser sends only the cropped handwriting image required for the current response.

## Fonts and Visual Assets

- **Hurricane** is used for diary handwriting.
- **IM Fell English** supports period-style interface details.
- **Harry P** is bundled as a decorative fallback and is distributed as 100% free by its author.
- The parchment texture is a project-local generated visual asset.

## Disclaimer

This is a fan-made technical and visual experiment. It is not affiliated with or endorsed by Warner Bros., J.K. Rowling, or the official Harry Potter franchise. All referenced trademarks belong to their respective owners.
