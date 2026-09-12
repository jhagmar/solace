/**
 * Thin styled wrappers around Base UI's Combobox primitives, following the
 * shadcn pattern: structure and behavior come from Base UI, looks from
 * Tailwind theme tokens. Used only by LocationSearch.
 */

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";

import { cn } from "@/shared/ui/cn";

const ComboboxRoot = ComboboxPrimitive.Root;

function ComboboxInputGroup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.InputGroup>) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "relative flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] dark:bg-input/30",
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Input>) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-full w-full min-w-0 cursor-text rounded-md bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxClear({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Clear>) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "mr-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxPositioner({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Positioner>) {
  return (
    <ComboboxPrimitive.Positioner
      data-slot="combobox-positioner"
      sideOffset={sideOffset}
      className={cn("z-50", className)}
      {...props}
    />
  );
}

function ComboboxPopup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Popup>) {
  return (
    <ComboboxPrimitive.Popup
      data-slot="combobox-popup"
      className={cn(
        "w-[var(--anchor-width)] rounded-md border bg-popover text-popover-foreground shadow-md",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.List>) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn("flex max-h-60 flex-col gap-0.5 overflow-y-auto p-1", className)}
      {...props}
    />
  );
}

function ComboboxItem({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Item>) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitive.Empty>) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("px-2 py-3 text-center text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

const ComboboxPortal = ComboboxPrimitive.Portal;

export {
  ComboboxClear,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxRoot,
};
