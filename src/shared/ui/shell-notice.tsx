import type { ReactNode } from "react";
import { cn } from "@/shared/ui/cn";

/**
 * Full-column overlay family: reachability and one-off toasts. Hairline,
 * mute field, no shadow, no corner card. Sit in a fixed stack at the
 * bottom of `#shell`'s width.
 */
export const shellNoticeClass =
  "border-t border-border bg-muted px-4 py-2.5 text-center text-sm font-medium text-muted-foreground";

export function ShellNotice({
  children,
  className,
  live = "polite",
}: {
  children: ReactNode;
  className?: string;
  live?: "polite" | "off";
}) {
  return (
    <div role="status" aria-live={live} className={cn(shellNoticeClass, className)}>
      {children}
    </div>
  );
}
