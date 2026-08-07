import type { Metadata } from "next";
import Link from "next/link";

import { MAX_FILE_LABEL, SUPPORTED_FORMATS_LABEL } from "@/lib/validation";

export const metadata: Metadata = {
  title: "About — Math2LaTeX",
  description: "How Math2LaTeX turns images of mathematics into LaTeX.",
};

const facts = [
  {
    term: "What it does",
    detail:
      "Reads an image of a mathematical expression — typeset or handwritten — and returns the LaTeX behind it.",
  },
  {
    term: "How it works",
    detail:
      "The image is sent to a multimodal model with a mathematical-OCR instruction. The model returns only the expression, which is rendered here with KaTeX.",
  },
  {
    term: "What it accepts",
    detail: `${SUPPORTED_FORMATS_LABEL} images up to ${MAX_FILE_LABEL}. Drop a file, pick one, or paste from the clipboard.`,
  },
  {
    term: "What happens to your image",
    detail:
      "It is held in memory for the length of one request and passed to the model. Nothing is written to disk, and no account is required.",
  },
];

export default function About() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-14 pb-20 sm:px-8 sm:pt-20">
      <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
        About
      </h1>

      <dl className="mt-10 space-y-8">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt className="text-muted-foreground font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase">
              {fact.term}
            </dt>
            <dd className="mt-2 leading-relaxed">{fact.detail}</dd>
          </div>
        ))}
      </dl>

      <p className="text-muted-foreground mt-12 text-sm">
        Recognition is not perfect — always check the rendered preview against
        your source before using the output.{" "}
        <Link href="/" className="text-primary underline underline-offset-4">
          Convert an image
        </Link>
        .
      </p>
    </div>
  );
}
