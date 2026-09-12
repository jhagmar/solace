import { Monitor, Moon, Sun } from "lucide-react";
import { theme } from "@/app/compose/theme";
import type { ThemePreference } from "@/features/theme/model";
import { useThemeStore } from "@/features/theme/store";
import { cn } from "@/shared/ui/cn";
import { messages } from "@/shared/ui/messages";

/**
 * Three-state theme picker as a segmented icon control: both the current
 * choice and all alternatives are always visible, one tap to change.
 * Auto follows the OS setting and is the default.
 */
export function ThemeControl() {
  const preference = useThemeStore((s) => s.themePreference);

  const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: messages.theme.light, icon: <Sun className="size-4" aria-hidden /> },
    { value: "dark", label: messages.theme.dark, icon: <Moon className="size-4" aria-hidden /> },
    {
      value: "auto",
      label: messages.theme.auto,
      icon: <Monitor className="size-4" aria-hidden />,
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={messages.theme.group}
      className="flex gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map((opt) => {
        const selected = preference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => theme.setPreference(opt.value)}
            className={cn(
              "flex size-9 cursor-pointer items-center justify-center rounded-md transition-all outline-none motion-reduce:transition-none motion-reduce:active:scale-100",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              "active:scale-90",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
