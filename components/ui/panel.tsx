import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A bordered surface with an optional labelled header bar — the shell used by
 * both result panels. Kept deliberately plain so the content inside is what
 * draws the eye.
 */

function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn(
        "border-border bg-card flex min-w-0 flex-col overflow-hidden rounded-lg border",
        className,
      )}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn(
        "border-border flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3",
        className,
      )}
      {...props}
    />
  );
}

/** Small monospace caps — the panel's identity, in a dev-tool register. */
function PanelLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-label"
      className={cn(
        "text-muted-foreground font-mono text-[0.6875rem] font-medium tracking-[0.14em] uppercase",
        className,
      )}
      {...props}
    />
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-body"
      className={cn("min-w-0 flex-1", className)}
      {...props}
    />
  );
}

export { Panel, PanelHeader, PanelLabel, PanelBody };
