/**
 * Thin styled wrappers around Base UI's Popover primitives, following the
 * shadcn pattern: structure and behavior come from Base UI, looks from
 * Tailwind theme tokens. Used by the sunscreen sheet's custom Spf chip.
 */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/shared/ui/cn";

const PopoverRoot = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverPortal = PopoverPrimitive.Portal;

function PopoverPositioner({
  className,
  sideOffset = 8,
  ...props
}: PopoverPrimitive.Positioner.Props) {
  return (
    <PopoverPrimitive.Positioner
      data-slot="popover-positioner"
      sideOffset={sideOffset}
      className={cn("z-50", className)}
      {...props}
    />
  );
}

function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-popup"
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg outline-none transition-all duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export { PopoverPopup, PopoverPortal, PopoverPositioner, PopoverRoot, PopoverTrigger };
