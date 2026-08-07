import {
  getVisionProvider,
  VisionProviderError,
  type VisionImage,
} from "./provider";

/**
 * The mathematical-OCR task: prompt, invocation, and normalisation of the
 * model's answer into clean LaTeX.
 */

/** Sentinel the model returns when an image contains no mathematics. */
const NO_MATH_SENTINEL = "NO_MATH";

const SYSTEM_PROMPT = `You are a mathematical OCR engine.

Analyze the provided image and convert the mathematical content into valid LaTeX.

Rules:

1. Return ONLY the LaTeX expression.
2. Do not use Markdown code fences.
3. Do not provide explanations.
4. Do not add introductory or concluding text.
5. Preserve the mathematical structure of the original image.
6. Correctly interpret fractions, roots, exponents, subscripts, matrices, integrals, sums, limits, derivatives, equations, and handwritten mathematical notation.
7. Use standard LaTeX syntax.
8. Do not wrap the expression in $$ or \\[ \\].
9. If there are multiple equations, preserve their structure using an appropriate LaTeX environment.
10. Never invent mathematical content that is not visible in the image.
11. Use only LaTeX that renders in KaTeX. Avoid packages, custom macros, and \\newcommand.
12. If the image contains no mathematical content at all, return exactly ${NO_MATH_SENTINEL} and nothing else.`;

const INSTRUCTION = "Convert the mathematics in this image to LaTeX.";

/** Covers adaptive thinking plus the expression itself, with room to spare. */
const MAX_TOKENS = 8000;

const TIMEOUT_MS = 60_000;

export async function imageToLatex(image: VisionImage): Promise<string> {
  const provider = getVisionProvider();

  const raw = await provider.analyzeImage({
    system: SYSTEM_PROMPT,
    instruction: INSTRUCTION,
    image,
    maxTokens: MAX_TOKENS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const latex = normalizeLatex(raw);

  if (!latex || latex === NO_MATH_SENTINEL) {
    throw new VisionProviderError(
      "empty_response",
      "No mathematical content was found in that image.",
      422,
    );
  }

  return latex;
}

/**
 * Strips the wrappers models habitually add despite being told not to:
 * Markdown fences and display-math delimiters.
 *
 * Exported for testing and reuse.
 */
export function normalizeLatex(raw: string): string {
  let text = raw.trim();

  // ```latex ... ```  /  ``` ... ```
  const fence = text.match(/^```(?:[a-zA-Z]*)?\r?\n([\s\S]*?)\r?\n?```$/);
  if (fence) text = fence[1]!.trim();

  // Peel display/inline math delimiters, innermost last.
  const delimiters: Array<[string, string]> = [
    ["\\[", "\\]"],
    ["\\(", "\\)"],
    ["$$", "$$"],
    ["$", "$"],
  ];

  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const [open, close] of delimiters) {
      if (
        text.length > open.length + close.length &&
        text.startsWith(open) &&
        text.endsWith(close)
      ) {
        const inner = text.slice(open.length, text.length - close.length);
        // Only unwrap when the delimiters actually enclose the whole
        // expression — `$a$ + $b$` must be left alone.
        if (!inner.includes(close)) {
          text = inner.trim();
          stripped = true;
        }
      }
    }
  }

  return text.trim();
}
