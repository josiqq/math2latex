"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, RotateCcw, Sparkles } from "lucide-react";

import { ImagePreview } from "@/components/image-preview";
import { LatexResult } from "@/components/latex-result";
import { UploadZone } from "@/components/upload-zone";
import { Button } from "@/components/ui/button";

type Status = "idle" | "converting" | "done";

type Selection = { file: File; url: string };

/**
 * Owns the whole flow: empty → image selected → converting → result.
 *
 * The image preview is deliberately kept mounted from selection through to
 * the result, so the page never loses context while the model works.
 */
export function Converter() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [latex, setLatex] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Object URLs must be revoked by hand; the ref survives re-renders so the
  // previous URL is always reachable when it needs releasing.
  const objectUrl = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const releaseUrl = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      releaseUrl();
      inFlight.current?.abort();
    },
    [releaseUrl],
  );

  const selectFile = useCallback(
    (file: File) => {
      releaseUrl();
      objectUrl.current = URL.createObjectURL(file);
      setSelection({ file, url: objectUrl.current });
      setStatus("idle");
      setLatex("");
      setError(null);
    },
    [releaseUrl],
  );

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    releaseUrl();
    setSelection(null);
    setStatus("idle");
    setLatex("");
    setError(null);
  }, [releaseUrl]);

  async function convert() {
    if (!selection) return;

    const controller = new AbortController();
    inFlight.current = controller;

    setStatus("converting");
    setError(null);

    const body = new FormData();
    body.append("image", selection.file);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      const payload = await response
        .json()
        .catch(() => null as { latex?: string; error?: string } | null);

      if (!response.ok || !payload?.latex) {
        setError(
          payload?.error ??
            "Something went wrong converting that image. Please try again.",
        );
        setStatus("idle");
        return;
      }

      setLatex(payload.latex);
      setStatus("done");
    } catch (fetchError) {
      // An abort is a deliberate reset, not a failure worth reporting.
      if (controller.signal.aborted) return;

      console.error(fetchError);
      setError(
        "Couldn't reach the server. Check your connection and try again.",
      );
      setStatus("idle");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  const converting = status === "converting";

  return (
    <div className="flex flex-col gap-4">
      {selection ? (
        <ImagePreview
          file={selection.file}
          previewUrl={selection.url}
          onRemove={reset}
          busy={converting}
        />
      ) : (
        <UploadZone onSelect={selectFile} onError={setError} />
      )}

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive animate-rise flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {selection && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={convert}
            disabled={converting}
            className="min-w-52"
          >
            {converting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Analyzing your equation…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden="true" />
                {status === "done" ? "Convert again" : "Convert to LaTeX"}
              </>
            )}
          </Button>

          <Button
            variant="ghost"
            size="lg"
            onClick={reset}
            disabled={converting}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Start over
          </Button>
        </div>
      )}

      {converting && (
        <div
          className="bg-secondary h-0.5 w-full overflow-hidden rounded-full"
          role="presentation"
        >
          <div className="bg-primary animate-sweep h-full w-1/3 rounded-full" />
        </div>
      )}

      {/* Status changes are announced without stealing focus. */}
      <p aria-live="polite" className="sr-only">
        {converting
          ? "Analyzing your equation"
          : status === "done"
            ? "LaTeX ready"
            : ""}
      </p>

      {status === "done" && latex && (
        <LatexResult latex={latex} onChange={setLatex} />
      )}
    </div>
  );
}
