"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

type ImagePreviewProps = {
  file: File;
  previewUrl: string;
  onRemove: () => void;
  /** Disables removal while a conversion is in flight. */
  busy?: boolean;
};

/**
 * Shows the selected image alongside its filename, size, and pixel
 * dimensions. The preview stays mounted during conversion.
 */
export function ImagePreview({
  file,
  previewUrl,
  onRemove,
  busy,
}: ImagePreviewProps) {
  // Tagged with the URL it describes, so a newly selected image never shows
  // the previous one's dimensions while it decodes.
  const [measured, setMeasured] = useState<{
    url: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    const image = new window.Image();
    image.onload = () =>
      setMeasured({
        url: previewUrl,
        label: `${image.naturalWidth} × ${image.naturalHeight}`,
      });
    image.src = previewUrl;

    return () => {
      image.onload = null;
    };
  }, [previewUrl]);

  const dimensions = measured?.url === previewUrl ? measured.label : null;

  return (
    <div className="border-border bg-card animate-rise flex items-start gap-4 rounded-lg border p-3">
      <div className="bg-secondary shrink-0 overflow-hidden rounded-md">
        {/* A blob: URL of user-chosen bytes — not a candidate for the image
            optimizer, so a plain <img> is correct here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt={`Uploaded image: ${file.name}`}
          className="size-20 object-contain"
        />
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {formatBytes(file.size)}
          {dimensions ? ` · ${dimensions} px` : ""}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={busy}
        aria-label="Remove image"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
