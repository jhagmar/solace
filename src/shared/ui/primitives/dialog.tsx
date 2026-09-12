/**
 * Thin styled wrappers around Base UI's Dialog primitives, following the
 * shadcn pattern. The popup is responsive: a bottom sheet on mobile, a
 * centered dialog on larger screens.
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "@/shared/ui/cn";

const DialogRoot = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Bottom sheet on mobile, centered dialog on larger screens.
 */
function DialogPopup({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Popup
      data-slot="dialog-popup"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border bg-popover p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none transition-all duration-200 data-ending-style:translate-y-8 data-ending-style:opacity-0 data-starting-style:translate-y-8 data-starting-style:opacity-0",
        "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-6 sm:data-ending-style:translate-y-4 sm:data-ending-style:scale-95 sm:data-starting-style:translate-y-4 sm:data-starting-style:scale-95",
        className,
      )}
      {...props}
    >
      {/* iOS-style grab handle marking the bottom sheet (mobile only) */}
      <div
        className="mx-auto -mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden"
        aria-hidden
      />
      {children}
    </DialogPrimitive.Popup>
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("-mt-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

export {
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
};
