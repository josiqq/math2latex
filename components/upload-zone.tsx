"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_LABEL,
  SUPPORTED_FORMATS_LABEL,
  validateImageMeta,
} from "@/lib/validation";

type UploadZoneProps = {
  onSelect: (file: File) => void;
  onError: (message: string) => void;
  disabled?: boolean;
};

/**
 * The drop zone: a sheet of ruled paper you can drop, click, or paste onto.
 * It is a real <button>, so everything here works from the keyboard.
 */
export function UploadZone({ onSelect, onError, disabled }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Nested dragenter/dragleave pairs fire constantly; counting them is the
  // only reliable way to know when the pointer has truly left the zone.
  const dragDepth = useRef(0);

  const accept = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;

      const result = validateImageMeta(file);
      if (!result.ok) {
        onError(result.error);
        return;
      }

      onSelect(file);
    },
    [onError, onSelect],
  );

  // Clipboard paste is document-level: there is nothing sensible to focus
  // first, so the whole page accepts a pasted image.
  useEffect(() => {
    if (disabled) return;

    function handlePaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      );
      if (!item) return;

      event.preventDefault();
      accept(item.getAsFile());
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [accept, disabled]);

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        if (disabled) return;
        accept(event.dataTransfer.files?.[0]);
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby="upload-hint"
        className={cn(
          "border-input bg-card group relative flex w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-16 transition-[border-color,background-color,transform] duration-200 sm:py-20",
          "hover:border-primary/50",
          isDragging && "border-primary bg-accent/40 scale-[1.005]",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "paper-grid pointer-events-none absolute inset-0 rounded-lg transition-opacity duration-200",
            isDragging ? "opacity-100" : "opacity-70",
          )}
        />

        <span
          aria-hidden="true"
          className={cn(
            "bg-secondary text-muted-foreground group-hover:text-primary relative flex size-11 items-center justify-center rounded-full transition-colors",
            isDragging && "bg-primary text-primary-foreground",
          )}
        >
          <ImagePlus className="size-5" />
        </span>

        <span className="relative flex flex-col items-center gap-1.5">
          <span className="text-[0.9375rem] font-medium">
            {isDragging
              ? "Drop to upload"
              : "Drop an image, or click to browse"}
          </span>
          <span id="upload-hint" className="text-muted-foreground text-sm">
            Paste from the clipboard too. {SUPPORTED_FORMATS_LABEL}, up to{" "}
            {MAX_FILE_LABEL}.
          </span>
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Reset so re-picking the same file still fires a change event.
          event.target.value = "";
        }}
      />
    </div>
  );
}
