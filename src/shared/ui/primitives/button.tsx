/**
 * The app's single button primitive, wrapping Base UI's Button.
 * Deliberately minimal: two variants and three sizes — enough for every
 * current use. `buttonVariants` is exported so links can take on the
 * button look (see GlobalError).
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button";

import { cn } from "@/shared/ui/cn";

const baseClasses =
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
  outline:
    "border-border bg-background hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
};

const sizeClasses = {
  default: "h-8 gap-1.5 px-2.5",
  sm: "h-8 gap-1 rounded-md px-2.5 text-[0.8rem]",
  icon: "size-8",
};

interface ButtonStyleOptions {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  className?: string;
}

/**
 * Resolves the button classes for a variant and size.
 * Exported so non-button elements (e.g. links) can take on the button look.
 */
function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: ButtonStyleOptions = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & ButtonStyleOptions) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
