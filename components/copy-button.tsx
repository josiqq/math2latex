"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  value: string;
};

/** Copies `value`, then confirms for a moment before reverting. */
export function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);

    try {
      await navigator.clipboard.writeText(value);
      setFailed(false);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked by permissions or an insecure origin.
      setCopied(false);
      setFailed(true);
    }

    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied!" : failed ? "Press Ctrl+C" : "Copy"}
      {/* Announce the outcome to screen readers without moving focus. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "LaTeX copied to clipboard" : ""}
      </span>
    </Button>
  );
}
