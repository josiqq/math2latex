# Math2LaTeX

Upload an image of a mathematical expression — typeset or handwritten — and get
clean, editable LaTeX back in seconds.

The image goes to a multimodal model with a mathematical-OCR instruction. The
model returns only the expression, which is shown as editable source next to a
live KaTeX render.

- No accounts, no database, no uploads kept on disk.
- The AI API key stays on the server and is never shipped to the browser.

---

## Tech stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack), React 19      |
| Language  | TypeScript, `strict` mode                         |
| Styling   | Tailwind CSS v4, shadcn/ui component conventions  |
| Math      | KaTeX                                             |
| AI        | Anthropic or Google Gemini behind a provider port |
| Tooling   | ESLint (flat config), Prettier                    |

Type is IBM Plex Sans/Mono for the interface, with Computer Modern — the
typeface of TeX itself, which ships inside KaTeX — for display headings.

---

## Install

Requires **Node.js 20.9+**.

```bash
pnpm install    # or: npm install
```

## Configure

Copy the example file and add your key:

```bash
cp .env.example .env.local
```

```env
# .env.local
AI_API_KEY=sk-ant-...
```

`.env.local` is gitignored. Never commit it.

| Variable                 | Required | Default              | Purpose                                             |
| ------------------------ | -------- | -------------------- | --------------------------------------------------- |
| `AI_API_KEY`             | **Yes**  | —                    | Server-side credential for the AI provider          |
| `AI_PROVIDER`            | No       | `anthropic`          | `anthropic` or `gemini`                             |
| `AI_MODEL`               | No       | per provider         | Model override                                      |
| `AI_EFFORT`              | No       | `medium`             | Reasoning depth: `low`…`max`. Raise for messy scans |
| `NEXT_PUBLIC_GITHUB_URL` | No       | repo URL             | Repository link in the header                       |

Only `NEXT_PUBLIC_*` variables reach the browser. `AI_API_KEY` is read solely
inside the active provider module, which never runs on the client.

### Choosing a provider

| Provider    | Default model      | Cost                        |
| ----------- | ------------------ | --------------------------- |
| `anthropic` | `claude-opus-5`    | Paid; best on handwriting   |
| `gemini`    | `gemini-2.5-flash` | Free tier; see caveat below |

Gemini is the option to reach for if you don't want a bill: its free tier
covers a real amount of daily traffic, and it handles printed formulae well.
Accuracy drops relative to Opus on handwritten or densely nested notation.

Be aware that Google may use **free-tier** requests to improve its models —
paid Gemini keys are excluded. If users upload private material, that decides
it for you.

Keys: [Anthropic](https://console.anthropic.com/settings/keys) ·
[Gemini](https://aistudio.google.com/apikey)

## Run

```bash
pnpm dev        # http://localhost:3000
pnpm build      # production build
pnpm start      # serve the production build
```

```bash
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm format       # Prettier
```

---

## How the flow works

```
Browser                          Server                        Provider
───────                          ──────                        ────────
pick / drop / paste image
  │  client-side check
  │  (MIME + size)
  ├── POST /api/convert ───────▶ rate limit by IP
      multipart/form-data        validate MIME, size,
                                 and magic-number bytes
                                 buffer in memory
                                 ├── base64 + OCR prompt ────▶ vision model
                                 │                             (adaptive
                                 │                              thinking)
                                 ◀── raw text ─────────────────┘
                                 strip fences and $$ wrappers
  ◀── { "latex": "..." } ────────┘
render with KaTeX
  └── copy, or edit and re-render
```

Responses are always JSON:

```jsonc
{ "latex": "\\frac{x^2 + 1}{2}" }   // 200
{ "error": "Unable to process the image." }  // 4xx / 5xx
```

Status codes: `400` invalid upload · `405` wrong method · `413`/`415` bad body ·
`422` no math found or declined · `429` rate limited · `503` not configured ·
`502`/`504` provider unreachable or slow.

### Security notes

- MIME type, byte size, and file **signature** are all checked server-side; the
  filename is never trusted or used.
- Images live in memory for one request. Nothing is written to disk, and image
  bytes are never logged — only an error classification is.
- Rate limiting is in-memory and per-process (`lib/rate-limit.ts`). It is a
  speed bump, not a guarantee: on serverless each instance counts separately.
  Swap the body of `checkRateLimit` for Redis/Vercel KV to make it global.
- KaTeX runs with `trust: false`, so model output can never become live HTML.

---

## Replacing the AI provider

The app talks to a port, not a vendor. `lib/ai/provider.ts` defines:

```ts
interface VisionProvider {
  readonly id: string;
  analyzeImage(request: VisionRequest): Promise<string>;
}
```

To add one:

1. Create `lib/ai/<provider>.ts` exporting a factory that returns a
   `VisionProvider`. Map vendor errors onto `VisionProviderError` so the route
   keeps returning friendly messages.
2. Register it in the `PROVIDERS` map in `lib/ai/provider.ts`.
3. Set `AI_PROVIDER=<provider>` and `AI_API_KEY`.

Nothing else changes — the prompt lives in `lib/ai/vision.ts` and the route and
components are provider-agnostic.

---

## Deploy to Vercel

1. Push the repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new). The framework is
   detected automatically.
3. Under **Settings → Environment Variables**, add `AI_API_KEY` for Production,
   Preview, and Development. Do **not** prefix it with `NEXT_PUBLIC_`.
4. Deploy.

`/api/convert` is a dynamic Node.js route. Conversions typically finish well
inside the default function timeout, but if you raise `AI_EFFORT` on a plan
with a short limit, increase the function `maxDuration` to match.

---

## Project structure

```
app/
  layout.tsx            fonts, theme provider, header/footer shell
  page.tsx              hero + converter
  about/page.tsx
  api/convert/route.ts  validation, rate limiting, error mapping
components/
  converter.tsx         owns empty → selected → converting → result
  upload-zone.tsx       drag, click, and paste
  image-preview.tsx     filename, size, dimensions, remove
  latex-result.tsx      the two result panels
  latex-preview.tsx     KaTeX render + friendly failure
  copy-button.tsx
  header.tsx  theme-provider.tsx  theme-toggle.tsx
  ui/                   shadcn-style primitives
lib/
  ai/provider.ts        the port + error types + registry
  ai/anthropic.ts       the only file that imports the Anthropic SDK
  ai/gemini.ts          the only file that imports the Gemini SDK
  ai/vision.ts          OCR prompt + output normalisation
  validation.ts         shared by client and server
  rate-limit.ts
  utils.ts  site.ts
```

---

## Limitations

- Recognition is not perfect. Always check the preview against your source —
  especially for handwriting, low-contrast photos, and dense subscripts.
- Output is constrained to what KaTeX can render, so custom macros and
  package-specific commands are avoided by design.
- One image per conversion; there is no batch mode or history.
- Rate limiting is per-process, so it does not hold across serverless instances.
