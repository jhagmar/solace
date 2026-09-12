import { Trash2 } from "lucide-react";
import { cn } from "@/shared/ui/cn";

/**
 * Quiet destructive icon for a card or plot corner. Disabled when there is
 * nothing to clear.
 */
export function ClearButton({
  label,
  disabled,
  onClick,
  className,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none",
        "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-30",
        className,
      )}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}
