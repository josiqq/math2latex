import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL } from "@/lib/site";

export function Header() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="rounded-sm text-[0.9375rem] font-semibold tracking-tight"
        >
          Math2LaTeX
        </Link>

        <nav aria-label="Main" className="flex items-center gap-1">
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground hover:text-foreground rounded-sm px-2.5 py-1.5 text-sm transition-colors"
          >
            GitHub
          </Link>
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground rounded-sm px-2.5 py-1.5 text-sm transition-colors"
          >
            About
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
