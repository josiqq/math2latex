"use client";

import { useMemo } from "react";
import katex from "katex";
import { TriangleAlert } from "lucide-react";

type LatexPreviewProps = {
  latex: string;
};

type Render =
  { ok: true; html: string } | { ok: false; reason: string } | { ok: null };

/**
 * Renders LaTeX with KaTeX. A malformed expression shows an inline
 * explanation instead of taking the page down.
 */
export function LatexPreview({ latex }: LatexPreviewProps) {
  const render = useMemo<Render>(() => {
    const source = latex.trim();
    if (!source) return { ok: null };

    try {
      return {
        ok: true,
        html: katex.renderToString(source, {
          displayMode: true,
          throwOnError: true,
          // `trust` stays false so KaTeX never emits raw HTML from the model's
          // output — commands like \href and \htmlClass are inert.
          trust: false,
          strict: false,
        }),
      };
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error
            ? error.message.replace(/^KaTeX parse error:\s*/, "")
            : "The expression could not be rendered.",
      };
    }
  }, [latex]);

  if (render.ok === null) {
    return (
      <p className="text-muted-foreground p-6 text-center text-sm">
        Nothing to render yet.
      </p>
    );
  }

  if (!render.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <TriangleAlert
          className="text-muted-foreground size-5"
          aria-hidden="true"
        />
        <p className="text-sm font-medium">
          This expression can&rsquo;t be rendered
        </p>
        <p className="text-muted-foreground max-w-sm font-mono text-xs break-words">
          {render.reason}
        </p>
        <p className="text-muted-foreground max-w-xs text-xs">
          The LaTeX is still yours to copy — edit it on the left to fix the
          preview.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center overflow-x-auto p-6">
      {/* KaTeX emits its own sanitised markup; `trust: false` above keeps
          model output from becoming HTML. */}
      <div
        className="text-[1.35rem] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: render.html }}
      />
    </div>
  );
}
