"use client";

import { useEffect, useRef } from "react";

import { CopyButton } from "@/components/copy-button";
import { LatexPreview } from "@/components/latex-preview";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelLabel,
} from "@/components/ui/panel";

type LatexResultProps = {
  latex: string;
  onChange: (latex: string) => void;
};

/**
 * The result section: editable source on the left, live render on the right.
 * Stacks vertically below `lg`.
 */
export function LatexResult({ latex, onChange }: LatexResultProps) {
  return (
    <div className="animate-rise grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader>
          <PanelLabel>LaTeX</PanelLabel>
          <CopyButton value={latex} />
        </PanelHeader>
        <PanelBody>
          <LatexEditor value={latex} onChange={onChange} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader>
          <PanelLabel>Preview</PanelLabel>
        </PanelHeader>
        <PanelBody className="flex min-h-40 items-center">
          <div className="w-full">
            <LatexPreview latex={latex} />
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

/** A code-editor-like textarea that grows to fit its contents. */
function LatexEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Generated LaTeX source"
      className="text-foreground min-h-40 w-full resize-none bg-transparent p-4 font-mono text-[0.8125rem] leading-6 outline-none"
    />
  );
}
