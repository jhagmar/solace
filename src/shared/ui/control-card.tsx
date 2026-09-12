import { cn } from "@/shared/ui/cn";

/**
 * Shared chrome for the parameter cards below the location search: one
 * definition of the card container and its header row, so every interaction
 * stop keeps the same radius, padding, and label rhythm.
 */

export const controlCardClass = "rounded-2xl border bg-card shadow-sm";

function ControlCardHeader({ label, aside }: { label: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {aside}
    </div>
  );
}

export function ControlCard({
  label,
  aside,
  children,
  className,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(controlCardClass, "flex flex-col gap-3 p-4", className)}>
      <ControlCardHeader label={label} aside={aside} />
      {children}
    </section>
  );
}
