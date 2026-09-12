/**
 * Route-level error boundary UI, wired as `errorComponent` on the root route.
 * TanStack Router passes the thrown error and a `reset` that re-renders the
 * crashed route. Same column and type scale as Today; no costume badge.
 */

import { type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { messages } from "@/shared/ui/messages";
import { Button, buttonVariants } from "@/shared/ui/primitives/button";

export function GlobalError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{messages.error.title}</h2>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          {messages.error.tryAgain}
        </Button>
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          {messages.error.backToToday}
        </Link>
      </div>
      {import.meta.env.DEV && stack ? (
        <pre className="overflow-x-auto text-xs text-muted-foreground">{stack}</pre>
      ) : null}
    </div>
  );
}
