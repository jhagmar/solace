import { cn } from "@/shared/ui/cn";
import { messages } from "@/shared/ui/messages";
import { Button } from "@/shared/ui/primitives/button";
import { DialogClose } from "@/shared/ui/primitives/dialog";

/**
 * Shared sheet footer: text Remove on the left when provided, Done
 * on the right. Escape still closes without commit; this is not Dismiss.
 */
export function SheetActions({ onRemove }: { onRemove?: () => void }) {
  return (
    <div className={cn("flex items-center gap-3", onRemove ? "justify-between" : "justify-end")}>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer text-sm font-medium text-destructive outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {messages.sheet.remove}
        </button>
      ) : null}
      <DialogClose render={<Button />}>{messages.sheet.done}</DialogClose>
    </div>
  );
}
